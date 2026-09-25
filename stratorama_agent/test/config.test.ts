import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TUNNEL_URL, resolveConfig, type AgentConfig } from '../src/config.js';

const noFile = (path: string): string => {
  throw new Error(`ENOENT: no such file, open '${path}'`);
};

function ok(env: Record<string, string>, readFile = noFile): AgentConfig {
  const result = resolveConfig(env, readFile);
  if (!result.ok) throw new Error(`expected a configuration, got: ${result.error}`);
  return result.config;
}

function refusal(env: Record<string, string>, readFile = noFile): string {
  const result = resolveConfig(env, readFile);
  if (result.ok) throw new Error('expected a refusal, got a configuration');
  return result.error;
}

test('the add-on: the Supervisor proxy and its token, the default relay', () => {
  assert.deepEqual(ok({ SUPERVISOR_TOKEN: 'sup', PAIRING_CODE: ' ABCD2345 ' }), {
    runtime: 'addon',
    tunnelUrl: DEFAULT_TUNNEL_URL,
    pairingCode: 'ABCD2345',
    ha: { httpUrl: 'http://supervisor/core', wsUrl: 'ws://supervisor/core/api/websocket', token: 'sup' },
  });
});

test('the add-on keeps its development overrides and its old error', () => {
  const config = ok({
    SUPERVISOR_TOKEN: 'sup',
    HA_HTTP_URL: 'http://ha.local:8123/',
    HA_WS_URL: 'ws://ha.local:8123/api/websocket',
    TUNNEL_URL: 'ws://localhost:3000/agent',
  });
  assert.equal(config.ha.httpUrl, 'http://ha.local:8123');
  assert.equal(config.ha.wsUrl, 'ws://ha.local:8123/api/websocket');
  assert.equal(config.tunnelUrl, 'ws://localhost:3000/agent');
  assert.equal(config.pairingCode, null);
  assert.match(refusal({}), /SUPERVISOR_TOKEN missing/);
});

test('Docker: HA_URL gives both addresses, HA_TOKEN the token', () => {
  assert.deepEqual(
    ok({ AGENT_RUNTIME: 'docker', HA_URL: 'http://192.168.1.10:8123/', HA_TOKEN: 'llat', PAIRING_CODE: 'ABCD2345' }),
    {
      runtime: 'docker',
      tunnelUrl: DEFAULT_TUNNEL_URL,
      pairingCode: 'ABCD2345',
      ha: { httpUrl: 'http://192.168.1.10:8123', wsUrl: 'ws://192.168.1.10:8123/api/websocket', token: 'llat' },
    },
  );
  const tls = ok({ AGENT_RUNTIME: 'docker', HA_URL: 'https://ha.example.net', HA_TOKEN: 'llat' });
  assert.equal(tls.ha.httpUrl, 'https://ha.example.net');
  assert.equal(tls.ha.wsUrl, 'wss://ha.example.net/api/websocket');
});

test('Docker: the token can come from a file, a Docker secret typically', () => {
  const config = ok(
    { AGENT_RUNTIME: 'docker', HA_URL: 'http://ha:8123', HA_TOKEN_FILE: '/run/secrets/ha_token' },
    (path) => (path === '/run/secrets/ha_token' ? 'from-file\n' : noFile(path)),
  );
  assert.equal(config.ha.token, 'from-file');
  // HA_TOKEN, when both are set, wins: it is the one written where the owner is looking.
  assert.equal(
    ok({ AGENT_RUNTIME: 'docker', HA_URL: 'http://ha:8123', HA_TOKEN: 'inline', HA_TOKEN_FILE: '/x' }).ha.token,
    'inline',
  );
  assert.match(
    refusal({ AGENT_RUNTIME: 'docker', HA_URL: 'http://ha:8123', HA_TOKEN_FILE: '/run/secrets/missing' }),
    /HA_TOKEN_FILE could not be read \(\/run\/secrets\/missing\)/,
  );
  assert.match(
    refusal({ AGENT_RUNTIME: 'docker', HA_URL: 'http://ha:8123', HA_TOKEN_FILE: '/empty' }, () => '  \n'),
    /HA_TOKEN_FILE is empty/,
  );
});

test('Docker refuses to start without HA_URL or a token, and says what each one is', () => {
  assert.match(refusal({ AGENT_RUNTIME: 'docker', HA_TOKEN: 'llat' }), /HA_URL is not set/);
  assert.match(refusal({ AGENT_RUNTIME: 'docker', HA_URL: 'http://ha:8123' }), /HA_TOKEN is not set/);
  // A SUPERVISOR_TOKEN means nothing to the Home Assistant at HA_URL: it is not a fallback.
  assert.match(
    refusal({ AGENT_RUNTIME: 'docker', HA_URL: 'http://ha:8123', SUPERVISOR_TOKEN: 'sup' }),
    /HA_TOKEN is not set/,
  );
});

test('HA_URL must be Home Assistant itself: http or https, no path', () => {
  for (const bad of ['ha.local:8123', 'ftp://ha.local', 'http://ha.local:8123/api', 'http://ha.local:8123/?x=1', 'not a url']) {
    assert.match(refusal({ AGENT_RUNTIME: 'docker', HA_URL: bad, HA_TOKEN: 'llat' }), /HA_URL must be the address of Home Assistant itself/, bad);
  }
});

test('a runtime nobody declared, or a relay address that is not one, is refused', () => {
  assert.match(refusal({ AGENT_RUNTIME: 'kubernetes', SUPERVISOR_TOKEN: 'sup' }), /AGENT_RUNTIME must be "addon" or "docker"/);
  assert.match(refusal({ SUPERVISOR_TOKEN: 'sup', TUNNEL_URL: 'stratorama.app' }), /TUNNEL_URL is not a WebSocket address/);
  assert.match(refusal({ SUPERVISOR_TOKEN: 'sup', TUNNEL_URL: 'ftp://stratorama.app' }), /TUNNEL_URL is not a WebSocket address/);
});
