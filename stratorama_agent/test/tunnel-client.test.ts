import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type WebSocket } from 'ws';
import { haRestCaller } from '../src/ha-client.js';

/**
 * The client against a real WebSocket server speaking the relay's protocol, and a real
 * HTTP server standing in for Home Assistant. No mocks of the modules under test: what
 * these specs pin is what a relay sees on the wire.
 */

// token-store.js reads this at import time, so it is set before the dynamic import.
const dataDir = mkdtempSync(join(tmpdir(), 'stratorama-agent-test-'));
const tokenFile = join(dataDir, 'agent-token.json');
process.env.AGENT_DATA_DIR = dataDir;

const haCalls: { method: string; url: string; auth: string | undefined; body: string }[] = [];
/** What the fake Home Assistant answers a GET and a POST with; reset before every test. */
const DEFAULT_HA_GET_BODY = '[{"entity_id":"light.kitchen","state":"on"}]';
let haGetBody = DEFAULT_HA_GET_BODY;
let haPostBody = '[]';
const fakeHa = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', () => {
    haCalls.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
    res.setHeader('content-type', 'application/json');
    res.end(req.method === 'GET' ? haGetBody : haPostBody);
  });
});
await new Promise<void>((resolve) => fakeHa.listen(0, '127.0.0.1', resolve));
const callHa = haRestCaller({
  httpUrl: `http://127.0.0.1:${(fakeHa.address() as AddressInfo).port}`,
  token: 'test-supervisor-token',
});

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
  const readiness: boolean[] = [];
  const client = new TunnelClient({
    tunnelUrl: relay.url,
    pairingCode: 'ABCD2345',
    version: '9.9.9-test',
    runtime: 'addon',
    callHa,
    onGiveUp: (why) => gaveUp.push(why),
    onReadyChange: (ready) => readiness.push(ready),
    ...overrides,
  });
  return { client, gaveUp, readiness };
}

beforeEach(() => {
  rmSync(tokenFile, { force: true });
  haCalls.length = 0;
  haGetBody = DEFAULT_HA_GET_BODY;
  haPostBody = '[]';
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
      agentRuntime: 'addon',
      agentCapabilities: ['bound-set'],
    });

    const socket = relay.sockets[0]!;
    send(socket, { type: 'agent:hello-ok', agentToken: 'token-1' });
    // What the plan binds; every request below arrives after it, on the same ordered socket.
    send(socket, { type: 'agent:bound-set', entityIds: ['light.kitchen'] });
    await until(() => existsSync(tokenFile), 'the credential to be stored');
    assert.deepEqual(JSON.parse(readFileSync(tokenFile, 'utf8')), { agentToken: 'token-1' });

    // Outside the allow-list: refused by the add-on, Home Assistant never called.
    send(socket, { type: 'ha:request', requestId: 'r1', method: 'GET', path: '/api/config' });
    await until(() => relay.inbox[0]!.length >= 2, 'the refusal');
    assert.deepEqual(relay.inbox[0]![1], {
      type: 'ha:response',
      requestId: 'r1',
      status: 403,
      body: { error: 'call not relayed by this agent' },
    });
    assert.equal(haCalls.length, 0);

    // Inside it: forwarded with the Supervisor token, answered as the view asks.
    send(socket, {
      type: 'ha:request',
      requestId: 'r2',
      method: 'GET',
      path: '/api/states',
      view: { kind: 'runtime', entityIds: ['light.kitchen'] },
    });
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
    // Its status only: the states the call changed stay home (the relay reads nothing else).
    assert.deepEqual(relay.inbox[0]![3], { type: 'ha:response', requestId: 'r3', status: 200, body: null });
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

/** Registers, names the plan's entities, and waits until that has applied (one request round-trip). */
async function registeredWith(relay: Relay, readiness: boolean[], entityIds: string[]): Promise<WebSocket> {
  await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
  const socket = relay.sockets[0]!;
  send(socket, { type: 'agent:hello-ok', agentToken: 'token-1' });
  send(socket, { type: 'agent:bound-set', entityIds });
  await until(() => readiness.includes(true), 'the registration');
  // Ordered socket: once this is answered, the set before it has applied.
  const before = relay.inbox[0]!.length;
  send(socket, { type: 'ha:request', requestId: 'sync', method: 'GET', path: '/api/states', view: { kind: 'runtime', entityIds: [] } });
  await until(() => relay.inbox[0]!.length > before, 'the set to apply');
  return socket;
}

test('only the domains Stratorama shows leave the home: a camera, a person, a phone are never sent', async () => {
  const light = { entity_id: 'light.kitchen', state: 'on', attributes: { brightness: 255 } };
  const sensor = { entity_id: 'sensor.bedroom_temperature', state: '21.5', attributes: { unit_of_measurement: '°C' } };
  const camera = {
    entity_id: 'camera.porch',
    state: 'idle',
    attributes: { access_token: 'tok-camera', entity_picture: '/api/camera_proxy/camera.porch?token=tok-camera' },
  };
  const person = { entity_id: 'person.alice', state: 'not_home', attributes: { latitude: 45.7612, longitude: 4.8317 } };
  const phone = { entity_id: 'device_tracker.alices_phone', state: 'not_home', attributes: { latitude: 45.7613, longitude: 4.8318 } };
  const all = [light, camera, person, phone, sensor];
  haGetBody = JSON.stringify(all);

  const relay = await startRelay();
  const { client, readiness } = makeClient(relay);
  try {
    client.start();
    // Even a relay that names them all gets none of the other domains.
    const socket = await registeredWith(relay, readiness, all.map((s) => s.entity_id));
    const start = relay.inbox[0]!.length;

    for (const state of [camera, person, phone]) {
      client.pushEvent({ entity_id: state.entity_id, new_state: state, old_state: state });
    }
    client.pushEvent({ entity_id: 'light.kitchen', new_state: light, old_state: { ...light, state: 'off' } });
    send(socket, {
      type: 'ha:request',
      requestId: 's1',
      method: 'GET',
      path: '/api/states',
      view: { kind: 'runtime', entityIds: all.map((s) => s.entity_id) },
    });
    await until(() => relay.inbox[0]!.length >= start + 2, 'the light event and the answer');
    await sleep(100); // and nothing else after them

    const sent = relay.inbox[0]!.slice(start);
    assert.equal(sent.length, 2);
    const events = sent.filter((m) => m['type'] === 'ha:event');
    assert.deepEqual(events.map((m) => (m['data'] as { entity_id: string }).entity_id), ['light.kitchen']);
    assert.deepEqual(sent.find((m) => m['requestId'] === 's1'), { type: 'ha:response', requestId: 's1', status: 200, body: [light, sensor] });
    const wire = JSON.stringify(relay.inbox[0]);
    for (const leak of ['camera.porch', 'tok-camera', 'person.alice', 'alices_phone', '45.761']) {
      assert.equal(wire.includes(leak), false, `${leak} reached the relay`);
    }
  } finally {
    client.stop();
    await relay.close();
  }
});

test('only the entities the plan binds leave: nothing before the relay names them, then those alone', async () => {
  const lamp = { entity_id: 'light.kitchen', state: 'on', attributes: {} };
  const otp = { entity_id: 'sensor.otp_bank', state: '492071', attributes: { friendly_name: 'Bank OTP' } };
  const relay = await startRelay();
  const { client, readiness } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    const socket = relay.sockets[0]!;
    send(socket, { type: 'agent:hello-ok', agentToken: 'token-1' });
    await until(() => readiness.includes(true), 'the registration');

    // Registered, but the plan not named yet: fail closed.
    client.pushEvent({ entity_id: 'light.kitchen', new_state: lamp, old_state: lamp });
    await sleep(100);
    assert.equal(relay.inbox[0]!.some((m) => m['type'] === 'ha:event'), false);

    send(socket, { type: 'agent:bound-set', entityIds: ['light.kitchen'] });
    send(socket, { type: 'ha:request', requestId: 'sync', method: 'GET', path: '/api/states', view: { kind: 'runtime', entityIds: [] } });
    await until(() => relay.inbox[0]!.some((m) => m['requestId'] === 'sync'), 'the set to apply');
    client.pushEvent({ entity_id: 'sensor.otp_bank', new_state: otp, old_state: otp });
    client.pushEvent({ entity_id: 'light.kitchen', new_state: lamp, old_state: lamp });
    await until(() => relay.inbox[0]!.some((m) => m['type'] === 'ha:event'), 'the bound event');
    await sleep(100);
    const events = relay.inbox[0]!.filter((m) => m['type'] === 'ha:event');
    assert.deepEqual(events.map((m) => (m['data'] as { entity_id: string }).entity_id), ['light.kitchen']);
    assert.equal(JSON.stringify(relay.inbox[0]).includes('492071'), false);

    // A malformed set forwards nothing until the next good one.
    send(socket, { type: 'agent:bound-set', entityIds: 'light.kitchen' });
    send(socket, { type: 'ha:request', requestId: 'sync2', method: 'GET', path: '/api/states', view: { kind: 'runtime', entityIds: [] } });
    await until(() => relay.inbox[0]!.some((m) => m['requestId'] === 'sync2'), 'the malformed set to apply');
    client.pushEvent({ entity_id: 'light.kitchen', new_state: lamp, old_state: lamp });
    await sleep(100);
    assert.equal(relay.inbox[0]!.filter((m) => m['type'] === 'ha:event').length, 1);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a new connection starts with no set: the last one\'s names are not reused until the relay sends them again', async () => {
  const lamp = { entity_id: 'light.kitchen', state: 'on', attributes: {} };
  const relay = await startRelay();
  const { client, readiness } = makeClient(relay);
  try {
    client.start();
    await registeredWith(relay, readiness, ['light.kitchen']);
    relay.sockets[0]!.terminate();
    await until(() => (relay.inbox[1]?.length ?? 0) >= 1, 'the second hello', 4_000);
    const socket = relay.sockets[1]!;
    send(socket, { type: 'agent:hello-ok', agentToken: 'token-1' });
    await until(() => readiness.filter(Boolean).length === 2, 'the second registration');

    client.pushEvent({ entity_id: 'light.kitchen', new_state: lamp, old_state: lamp });
    await sleep(100);
    assert.equal(relay.inbox[1]!.some((m) => m['type'] === 'ha:event'), false);

    send(socket, { type: 'agent:bound-set', entityIds: ['light.kitchen'] });
    send(socket, { type: 'ha:request', requestId: 'sync', method: 'GET', path: '/api/states', view: { kind: 'runtime', entityIds: [] } });
    await until(() => relay.inbox[1]!.some((m) => m['requestId'] === 'sync'), 'the set to apply');
    client.pushEvent({ entity_id: 'light.kitchen', new_state: lamp, old_state: lamp });
    await until(() => relay.inbox[1]!.some((m) => m['type'] === 'ha:event'), 'the bound event');
  } finally {
    client.stop();
    await relay.close();
  }
});

test('the snapshot carries what the view asks for: the picker gets names, a value only on request', async () => {
  const lamp = { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } };
  const garage = {
    entity_id: 'sensor.garage_temperature',
    state: '4.0',
    attributes: { friendly_name: 'Garage', device_class: 'temperature', unit_of_measurement: '°C', battery: 80 },
  };
  const otp = { entity_id: 'sensor.otp_bank', state: '492071', attributes: { friendly_name: 'Bank OTP' } };
  haGetBody = JSON.stringify([lamp, garage, otp]);
  const relay = await startRelay();
  const { client, readiness } = makeClient(relay);
  try {
    client.start();
    const socket = await registeredWith(relay, readiness, ['light.kitchen']);
    const answer = async (requestId: string, view: unknown) => {
      send(socket, { type: 'ha:request', requestId, method: 'GET', path: '/api/states', ...(view === undefined ? {} : { view }) });
      await until(() => relay.inbox[0]!.some((m) => m['requestId'] === requestId), requestId);
      return (relay.inbox[0]!.find((m) => m['requestId'] === requestId) as { body: unknown }).body;
    };

    assert.deepEqual(await answer('catalog', { kind: 'catalog', entityIds: ['light.kitchen'] }), [
      lamp,
      { entity_id: 'sensor.garage_temperature', attributes: { friendly_name: 'Garage', device_class: 'temperature', unit_of_measurement: '°C' } },
      { entity_id: 'sensor.otp_bank', attributes: { friendly_name: 'Bank OTP' } },
    ]);
    assert.deepEqual(await answer('value', { kind: 'value', entityId: 'sensor.garage_temperature' }), [garage]);
    // No view at all, as an old relay would send: names only.
    const closed = (await answer('none', undefined)) as Array<Record<string, unknown>>;
    assert.equal(closed.some((s) => 'state' in s), false);
    assert.equal(JSON.stringify(relay.inbox[0]).includes('492071'), false);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a token inside a state that does leave is still cut out: a template sensor holding a camera link', async () => {
  // A "snapshot URL" template sensor: its state is a camera's entity_picture, live token included.
  const snapshotUrl = (token: string) => ({
    entity_id: 'sensor.porch_snapshot_url',
    state: `http://192.168.1.10:8123/api/camera_proxy/camera.porch?token=${token}`,
    attributes: { friendly_name: 'Porch snapshot URL', picture: `/api/camera_proxy/camera.porch?token=${token}` },
  });
  const redacted = {
    entity_id: 'sensor.porch_snapshot_url',
    state: 'http://192.168.1.10:8123/api/camera_proxy/camera.porch',
    attributes: { friendly_name: 'Porch snapshot URL', picture: '/api/camera_proxy/camera.porch' },
  };
  haGetBody = JSON.stringify([snapshotUrl('tok-snapshot')]);

  const relay = await startRelay();
  const { client, readiness } = makeClient(relay);
  try {
    client.start();
    const socket = await registeredWith(relay, readiness, ['sensor.porch_snapshot_url']);

    send(socket, {
      type: 'ha:request',
      requestId: 's1',
      method: 'GET',
      path: '/api/states',
      view: { kind: 'runtime', entityIds: ['sensor.porch_snapshot_url'] },
    });
    client.pushEvent({
      entity_id: 'sensor.porch_snapshot_url',
      new_state: snapshotUrl('tok-new'),
      old_state: snapshotUrl('tok-old'),
    });
    await until(() => relay.inbox[0]!.some((m) => m['requestId'] === 's1'), 'the answer');
    await until(() => relay.inbox[0]!.some((m) => m['type'] === 'ha:event'), 'the event');

    const wire = JSON.stringify(relay.inbox[0]);
    for (const token of ['tok-snapshot', 'tok-new', 'tok-old']) {
      assert.equal(wire.includes(token), false, `${token} reached the relay`);
    }
    assert.deepEqual((relay.inbox[0]!.find((m) => m['requestId'] === 's1') as { body: unknown }).body, [redacted]);
    assert.deepEqual(relay.inbox[0]!.find((m) => m['type'] === 'ha:event'), {
      type: 'ha:event',
      eventType: 'state_changed',
      data: { entity_id: 'sensor.porch_snapshot_url', new_state: redacted, old_state: redacted },
    });
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
      agentRuntime: 'addon',
      agentCapabilities: ['bound-set'],
    });
    send(relay.sockets[0]!, { type: 'agent:hello-error', code: 'invalid_token', message: 'Token agent invalide' });

    await until(() => (relay.inbox[1]?.length ?? 0) >= 1, 'the second hello', 3_000);
    assert.deepEqual(relay.inbox[1]![0], {
      type: 'agent:hello',
      mode: 'pair',
      pairingCode: 'ABCD2345',
      agentVersion: '9.9.9-test',
      agentRuntime: 'addon',
      agentCapabilities: ['bound-set'],
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
    assert.match(gaveUp[0]!, /no longer accepts this agent's credential/);
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

test('the Docker image says so in its hello, and words a refusal for a container', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay, { runtime: 'docker' });
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    assert.deepEqual(relay.inbox[0]![0], {
      type: 'agent:hello',
      mode: 'pair',
      pairingCode: 'ABCD2345',
      agentVersion: '9.9.9-test',
      agentRuntime: 'docker',
      agentCapabilities: ['bound-set'],
    });
    send(relay.sockets[0]!, { type: 'agent:hello-error', code: 'code_used', message: 'Pairing code already used' });

    await until(() => gaveUp.length === 1, 'the give-up');
    assert.match(gaveUp[0]!, /set it as PAIRING_CODE/);
    assert.match(gaveUp[0]!, /recreate the container \(docker compose up -d\)/);
    assert.doesNotMatch(gaveUp[0]!, /add-on/);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a Docker agent with neither credential nor code names PAIRING_CODE', async () => {
  const relay = await startRelay();
  const { client, gaveUp } = makeClient(relay, { runtime: 'docker', pairingCode: null });
  try {
    client.start();
    await until(() => gaveUp.length === 1, 'the give-up');
    assert.match(gaveUp[0]!, /no PAIRING_CODE in the environment/);
    assert.deepEqual(relay.inbox[0] ?? [], []);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('readiness follows the registration: true on hello-ok, false when the socket drops', async () => {
  const relay = await startRelay();
  const { client, readiness } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    assert.deepEqual(readiness, []);

    send(relay.sockets[0]!, { type: 'agent:hello-ok', agentToken: 'token-1' });
    await until(() => readiness.length === 1, 'ready');
    relay.sockets[0]!.terminate();
    await until(() => readiness.length === 2, 'not ready');
    assert.deepEqual(readiness, [true, false]);
  } finally {
    client.stop();
    await relay.close();
  }
});

test('a credential that cannot be stored is reported, and the connection still carries events', async () => {
  // A directory where the credential file should be: every write fails, on every platform.
  mkdirSync(tokenFile);
  const relay = await startRelay();
  const { client, readiness, gaveUp } = makeClient(relay);
  try {
    client.start();
    await until(() => (relay.inbox[0]?.length ?? 0) >= 1, 'the hello');
    assert.equal(relay.inbox[0]![0]!['mode'], 'pair');
    send(relay.sockets[0]!, { type: 'agent:hello-ok', agentToken: 'token-1' });
    send(relay.sockets[0]!, { type: 'agent:bound-set', entityIds: ['light.kitchen'] });
    send(relay.sockets[0]!, { type: 'ha:request', requestId: 'sync', method: 'GET', path: '/api/states', view: { kind: 'runtime', entityIds: [] } });
    await until(() => readiness.length === 1, 'ready');
    await until(() => relay.inbox[0]!.some((m) => m['requestId'] === 'sync'), 'the set to apply');

    client.pushEvent({ entity_id: 'light.kitchen', new_state: { state: 'on' }, old_state: null });
    await until(() => relay.inbox[0]!.some((m) => m['type'] === 'ha:event'), 'the event');
    assert.deepEqual(gaveUp, []);
  } finally {
    client.stop();
    await relay.close();
    rmSync(tokenFile, { recursive: true, force: true });
  }
});
