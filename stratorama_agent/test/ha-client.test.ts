import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type WebSocket } from 'ws';
import { HaWsSubscriber, haRestCaller } from '../src/ha-client.js';

/**
 * The subscriber against a real WebSocket server speaking Home Assistant's auth and
 * subscription protocol: what these specs pin is what Home Assistant sees on the wire.
 */

interface FakeHa {
  wsUrl: string;
  connections: number;
  received: Record<string, unknown>[];
  sockets: WebSocket[];
  close(): Promise<void>;
}

async function startFakeHa(goodToken: string): Promise<FakeHa> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/api/websocket' });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const ha: FakeHa = {
    wsUrl: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/api/websocket`,
    connections: 0,
    received: [],
    sockets: [],
    close: () =>
      new Promise((resolve) => {
        for (const socket of ha.sockets) socket.terminate();
        wss.close(() => resolve());
      }),
  };
  wss.on('connection', (socket) => {
    ha.connections += 1;
    ha.sockets.push(socket);
    socket.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.9.0' }));
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      ha.received.push(msg);
      if (msg['type'] === 'auth') {
        if (msg['access_token'] === goodToken) {
          socket.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.9.0' }));
        } else {
          socket.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token or password' }));
          socket.close();
        }
      }
      if (msg['type'] === 'subscribe_events') {
        socket.send(JSON.stringify({ id: msg['id'], type: 'result', success: true, result: null }));
        socket.send(
          JSON.stringify({
            id: msg['id'],
            type: 'event',
            event: {
              event_type: 'state_changed',
              data: { entity_id: 'light.kitchen', new_state: { state: 'on' }, old_state: { state: 'off' } },
            },
          }),
        );
      }
    });
  });
  return ha;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(cond: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!cond()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
}

test('authenticates with its token, is ready once subscribed, forwards events, and comes back after a drop', async () => {
  const ha = await startFakeHa('good-token');
  const events: unknown[] = [];
  const readiness: boolean[] = [];
  let rejected = 0;
  const subscriber = new HaWsSubscriber({
    endpoints: { wsUrl: ha.wsUrl, token: 'good-token' },
    onEvent: (data) => events.push(data),
    onReadyChange: (ready) => readiness.push(ready),
    onAuthRejected: () => { rejected += 1; },
    maxBackoffMs: 50,
  });
  try {
    subscriber.start();
    await until(() => events.length === 1, 'the event');
    assert.deepEqual(ha.received.slice(0, 2), [
      { type: 'auth', access_token: 'good-token' },
      { id: 1, type: 'subscribe_events', event_type: 'state_changed' },
    ]);
    assert.deepEqual(events[0], { entity_id: 'light.kitchen', new_state: { state: 'on' }, old_state: { state: 'off' } });
    assert.deepEqual(readiness, [true]);

    ha.sockets[0]!.terminate();
    await until(() => readiness.length === 3, 'not ready, then ready again');
    assert.deepEqual(readiness, [true, false, true]);
    assert.equal(ha.connections, 2);
    assert.equal(rejected, 0);
  } finally {
    subscriber.stop();
    await ha.close();
  }
});

test('a token Home Assistant rejects is reported once, and never presented again', async () => {
  const ha = await startFakeHa('good-token');
  const readiness: boolean[] = [];
  let rejected = 0;
  const subscriber = new HaWsSubscriber({
    endpoints: { wsUrl: ha.wsUrl, token: 'revoked-token' },
    onEvent: () => undefined,
    onReadyChange: (ready) => readiness.push(ready),
    onAuthRejected: () => { rejected += 1; },
    maxBackoffMs: 20,
  });
  try {
    subscriber.start();
    await until(() => rejected === 1, 'the rejection');
    await sleep(300); // fifteen backoffs' worth: a retrying subscriber would be back by now
    assert.equal(ha.connections, 1);
    assert.equal(rejected, 1);
    assert.deepEqual(readiness, []);
  } finally {
    subscriber.stop();
    await ha.close();
  }
});

test('an address nobody answers is named in the log after three attempts, and still retried', async () => {
  // A port that was just free: connections are refused at once.
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (line: string) => { warnings.push(line); };
  const subscriber = new HaWsSubscriber({
    endpoints: { wsUrl: `ws://127.0.0.1:${port}/api/websocket`, token: 't' },
    onEvent: () => undefined,
    maxBackoffMs: 10,
  });
  try {
    subscriber.start();
    await until(() => warnings.filter((w) => w.includes('HA WS closed')).length >= 4, 'four closes');
    const hints = warnings.filter((w) => w.includes('has not answered at'));
    assert.equal(hints.length, 1);
    assert.match(hints[0]!, new RegExp(`ws://127\\.0\\.0\\.1:${port}/api/websocket after 3 attempts`));
  } finally {
    subscriber.stop();
    console.warn = original;
  }
});

test('the REST caller relays status and body, and answers 502 when Home Assistant is unreachable', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/states') {
      res.setHeader('content-type', 'application/json');
      res.end('[{"entity_id":"light.kitchen","state":"on"}]');
      return;
    }
    res.statusCode = 401;
    res.end('401: Unauthorized');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const call = haRestCaller({ httpUrl: base, token: 't' });
    assert.deepEqual(await call('GET', '/api/states'), { status: 200, body: [{ entity_id: 'light.kitchen', state: 'on' }] });
    // Not JSON: passed through as text rather than thrown on.
    assert.deepEqual(await call('POST', '/api/services/light/turn_on', {}), { status: 401, body: '401: Unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const gone = await haRestCaller({ httpUrl: base, token: 't' })('GET', '/api/states');
  assert.equal(gone.status, 502);
});
