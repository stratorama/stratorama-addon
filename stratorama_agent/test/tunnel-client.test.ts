import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type WebSocket } from 'ws';

/**
 * The client against a real WebSocket server speaking the relay's protocol, and a real
 * HTTP server standing in for Home Assistant. No mocks of the modules under test: what
 * these specs pin is what a relay sees on the wire.
 */

// ha-client.js reads these at import time, so they are set before the dynamic import.
const dataDir = mkdtempSync(join(tmpdir(), 'stratorama-agent-test-'));
const tokenFile = join(dataDir, 'agent-token.json');
process.env.AGENT_DATA_DIR = dataDir;
process.env.SUPERVISOR_TOKEN = 'test-supervisor-token';

const haCalls: { method: string; url: string; auth: string | undefined; body: string }[] = [];
const fakeHa = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', () => {
    haCalls.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
    res.setHeader('content-type', 'application/json');
    res.end(req.method === 'GET' ? '[{"entity_id":"light.kitchen","state":"on"}]' : '[]');
  });
});
await new Promise<void>((resolve) => fakeHa.listen(0, '127.0.0.1', resolve));
process.env.HA_HTTP_URL = `http://127.0.0.1:${(fakeHa.address() as AddressInfo).port}`;

const { TunnelClient } = await import('../src/tunnel-client.js');
type Options = ConstructorParameters<typeof TunnelClient>[0];

interface Relay {
  url: string;
  sockets: WebSocket[];
  inbox: Record<string, unknown>[][];
  closes: { code: number }[];
  close(): Promise<void>;
}

async function startRelay(): Promise<Relay> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/agent' });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const relay: Relay = {
    url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`,
    sockets: [],
    inbox: [],
    closes: [],
    close: () =>
      new Promise((resolve) => {
        for (const socket of relay.sockets) socket.terminate();
        wss.close(() => resolve());
      }),
  };
  wss.on('connection', (socket) => {
    const box: Record<string, unknown>[] = [];
    relay.sockets.push(socket);
    relay.inbox.push(box);
    socket.on('message', (raw) => box.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    socket.on('close', (code) => relay.closes.push({ code }));
  });
  return relay;
}

function send(socket: WebSocket, msg: unknown): void {
  socket.send(JSON.stringify(msg));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(cond: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!cond()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
}

function makeClient(relay: Relay, overrides: Partial<Options> = {}) {
  const gaveUp: string[] = [];
  const client = new TunnelClient({
    tunnelUrl: relay.url,
    pairingCode: 'ABCD2345',
    version: '9.9.9-test',
    onGiveUp: (why) => gaveUp.push(why),
    ...overrides,
  });
  return { client, gaveUp };
}

beforeEach(() => {
  rmSync(tokenFile, { force: true });
  haCalls.length = 0;
});

after(() => {
  fakeHa.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('pairs with its version, stores the credential, relays the allowed calls and only those', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    assert.deepEqual(relay.inbox[0]![0], {
      type: 'agent:hello',
      mode: 'pair',
      pairingCode: 'ABCD2345',
      agentVersion: '9.9.9-test',
    });

    const socket = relay.sockets[0]!;
    send(socket, { type: 'agent:hello-ok', agentToken: 'token-1' });
    await until(() => existsSync(tokenFile), 'the credential to be stored');
    assert.deepEqual(JSON.parse(readFileSync(tokenFile, 'utf8')), { agentToken: 'token-1' });

    // Outside the allow-list: refused by the add-on, Home Assistant never called.
    send(socket, { type: 'ha:request', requestId: 'r1', method: 'GET', path: '/api/config' });
    await until(() => relay.inbox[0]!.length >= 2, 'the refusal');
    assert.deepEqual(relay.inbox[0]![1], {
      type: 'ha:response',
      requestId: 'r1',
      status: 403,
      body: { error: 'call not relayed by this add-on' },
    });
    assert.equal(haCalls.length, 0);

    // Inside it: forwarded with the Supervisor token, answer relayed as is.
    send(socket, { type: 'ha:request', requestId: 'r2', method: 'GET', path: '/api/states' });
    await until(() => relay.inbox[0]!.length >= 3, 'the states answer');
    assert.deepEqual(relay.inbox[0]![2], {
      type: 'ha:response',
      requestId: 'r2',
      status: 200,
      body: [{ entity_id: 'light.kitchen', state: 'on' }],
    });
    assert.deepEqual(haCalls[0], {
      method: 'GET',
      url: '/api/states',
      auth: 'Bearer test-supervisor-token',
      body: '',
    });

    send(socket, {
      type: 'ha:request',
      requestId: 'r3',
      method: 'POST',
      path: '/api/services/light/turn_on',
      body: { entity_id: 'light.kitchen', brightness_pct: 40 },
    });
    await until(() => relay.inbox[0]!.length >= 4, 'the service answer');
    assert.equal((relay.inbox[0]![3] as { status: number }).status, 200);
    assert.deepEqual(haCalls[1], {
      method: 'POST',
      url: '/api/services/light/turn_on',
      auth: 'Bearer test-supervisor-token',
      body: '{"entity_id":"light.kitchen","brightness_pct":40}',
    });

    // Garbage from the relay is ignored, and the connection kept.
    socket.send('not json at all');
    send(socket, { type: 'something:new', payload: 1 });
    send(socket, { type: 'ha:request', method: 'GET', path: '/api/states' }); // no requestId
    send(socket, { type: 'agent:hello-ok' }); // no credential
    send(socket, { type: 'ha:request', requestId: 'r4', method: 'GET', path: '/api/states' });
    await until(() => relay.inbox[0]!.length >= 5, 'the answer after garbage');
    assert.equal((relay.inbox[0]![4] as { requestId: string }).requestId, 'r4');

    // Events flow up once registered.
    client.pushEvent({ entity_id: 'light.kitchen', new_state: { state: 'off' }, old_state: { state: 'on' } });
    await until(() => relay.inbox[0]!.length >= 6, 'the event');
    assert.deepEqual(relay.inbox[0]![5], {
      type: 'ha:event',
      eventType: 'state_changed',
      data: { entity_id: 'light.kitchen', new_state: { state: 'off' }, old_state: { state: 'on' } },
    });

    assert.equal(relay.sockets.length, 1);
    assert.deepEqual(gaveUp, []);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('an expired code stops the client: one give-up, no credential, no second connection', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    send(relay.sockets[0]!, { type: 'agent:hello-error', code: 'code_expired', message: 'Code expiré' });

    await until(() => gaveUp.length === 1, 'the give-up');
    assert.match(gaveUp[0]!, /expired/);
    assert.match(gaveUp[0]!, /Generate a new pairing code in Stratorama/);
    await sleep(1_500); // the 1.0.0 client would have been back by now (1 s backoff)
    assert.equal(relay.sockets.length, 1);
    assert.equal(existsSync(tokenFile), false);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a revoked credential is forgotten and the configured code tried at once', async () => {
  writeFileSync(tokenFile, JSON.stringify({ agentToken: 'stale-token' }));
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the first hello');
    assert.deepEqual(relay.inbox[0]![0], {
      type: 'agent:hello',
      mode: 'reconnect',
      agentToken: 'stale-token',
      agentVersion: '9.9.9-test',
    });
    send(relay.sockets[0]!, { type: 'agent:hello-error', code: 'invalid_token', message: 'Token agent invalide' });

    await until(() => (relay.inbox[1]?.length ?? 0) >= 1, 'the second hello', 3_000);
    assert.deepEqual(relay.inbox[1]![0], {
      type: 'agent:hello',
      mode: 'pair',
      pairingCode: 'ABCD2345',
      agentVersion: '9.9.9-test',
    });
    assert.equal(existsSync(tokenFile), false);
    assert.deepEqual(gaveUp, []);

    send(relay.sockets[1]!, { type: 'agent:hello-ok', agentToken: 'fresh-token' });
    await until(() => existsSync(tokenFile), 'the fresh credential');
    assert.deepEqual(JSON.parse(readFileSync(tokenFile, 'utf8')), { agentToken: 'fresh-token' });
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a revoked credential with no code to fall back on gives up', async () => {
  writeFileSync(tokenFile, JSON.stringify({ agentToken: 'stale-token' }));
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay, { pairingCode: null });
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    send(relay.sockets[0]!, { type: 'agent:hello-error', code: 'invalid_token', message: 'Token agent invalide' });

    await until(() => gaveUp.length === 1, 'the give-up');
    assert.match(gaveUp[0]!, /no longer accepts this add-on's credential/);
    assert.equal(existsSync(tokenFile), false);
    await sleep(1_500);
    assert.equal(relay.sockets.length, 1);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('no credential and no code gives up without a hello', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay, { pairingCode: null });
  try {
    client.start();
    await until(() => gaveUp.length === 1, 'the give-up');
    assert.match(gaveUp[0]!, /No stored credential and no pairing code/);
    await until(() => relay.closes.length === 1, 'the socket to close');
    assert.deepEqual(relay.inbox[0], []);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a relay that sends no code keeps the 1.0.0 behaviour: retry with backoff', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    send(relay.sockets[0]!, { type: 'agent:hello-error', message: 'Something transient' });

    await until(() => relay.sockets.length === 2, 'the reconnection', 3_000);
    assert.deepEqual(gaveUp, []);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a relay gone silent is abandoned and reopened; one that pings is kept', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay, { relaySilenceMs: 300, livenessCheckMs: 50 });
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    send(relay.sockets[0]!, { type: 'agent:hello-ok', agentToken: 'token-1' });

    // Nothing more from the relay: dead after 300 ms, back after the 1 s backoff.
    await until(() => relay.sockets.length === 2, 'the reconnection after silence', 4_000);
    assert.equal(relay.closes.length, 1);
    await until(() => (relay.inbox[1]?.length ?? 0) >= 1, 'the second hello');
    assert.equal(relay.inbox[1]![0]!['mode'], 'reconnect');
    send(relay.sockets[1]!, { type: 'agent:hello-ok', agentToken: 'token-1' });

    // Pings alone keep it alive.
    const pinger = setInterval(() => relay.sockets[1]!.ping(), 100);
    await sleep(900);
    clearInterval(pinger);
    assert.equal(relay.sockets.length, 2);
    assert.equal(relay.closes.length, 1);
    assert.deepEqual(gaveUp, []);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('close code 4029 is respected: the next attempt waits the blocked delay, not the backoff', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay, { blockedRetryMs: 600 });
  try {
    client.start();
    await until(() => relay.sockets.length === 1, 'the first connection');
    relay.sockets[0]!.close(4029, 'too many failed hellos');

    await sleep(300);
    assert.equal(relay.sockets.length, 1); // a 1 s backoff would not be back yet either, so also check later
    await until(() => relay.sockets.length === 2, 'the retry after the blocked delay', 2_000);
    assert.deepEqual(gaveUp, []);
  } finally {
    client.stop();
    await relay.close();
  }
});
