import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_HA_CALLS, AREA_MAP_READS, isAllowedHaCall } from '../src/ha-allowlist.js';
import { FORWARDED_DOMAINS } from '../src/ha-domains.js';

test('every domain the agent can act on is one whose states it forwards', () => {
  // A device Stratorama can switch but never hear back from would look dead on the plan.
  for (const [, path] of ALLOWED_HA_CALLS) {
    const domain = /^\/api\/services\/([a-z_]+)\//.exec(path)?.[1];
    if (domain) assert.equal(FORWARDED_DOMAINS.has(domain), true, path);
  }
});

test('every call the relay makes is allowed, and there are nine of them', () => {
  assert.equal(ALLOWED_HA_CALLS.length, 9);
  for (const [method, path] of ALLOWED_HA_CALLS) {
    assert.equal(isAllowedHaCall(method, path), true, `${method} ${path}`);
  }
});

test('anything else is refused, however close it comes', () => {
  const refused: Array<[string, string]> = [
    ['GET', '/api/states/light.kitchen'],
    ['GET', '/api/config'],
    ['GET', '/api/history/period'],
    ['GET', '/api/services/light/turn_on'],
    ['POST', '/api/states'],
    ['POST', '/api/states/light.kitchen'],
    ['POST', '/api/services/light/toggle'],
    ['POST', '/api/services/lock/unlock'],
    ['POST', '/api/services/alarm_control_panel/alarm_disarm'],
    ['POST', '/api/services/homeassistant/restart'],
    ['POST', '/api/services/light/turn_on/'],
    ['POST', '/api/services/light/turn_on?x=1'],
    ['POST', '/api/../api/services/light/turn_on'],
    ['POST', '/API/SERVICES/LIGHT/TURN_ON'],
    ['DELETE', '/api/states'],
    ['PUT', '/api/services/light/turn_on'],
  ];
  for (const [method, path] of refused) {
    assert.equal(isAllowedHaCall(method, path), false, `${method} ${path}`);
  }
});

test('a method or path that is not a string is refused', () => {
  assert.equal(isAllowedHaCall(undefined, '/api/states'), false);
  assert.equal(isAllowedHaCall('GET', undefined), false);
  assert.equal(isAllowedHaCall(['GET'], '/api/states'), false);
  assert.equal(isAllowedHaCall('GET', { path: '/api/states' }), false);
});

test('the area map is read from four registry lists, and nothing it reads writes', () => {
  // The relay asks for the map; it never names a command. These are the only ones the agent sends
  // for it, each a list any Home Assistant user may read (measured on 2026.11).
  assert.deepEqual([...AREA_MAP_READS], [
    'config/floor_registry/list',
    'config/area_registry/list',
    'config/device_registry/list',
    'config/entity_registry/list_for_display',
  ]);
  for (const command of AREA_MAP_READS) assert.match(command, /^config\/[a-z_]+_registry\/list(_for_display)?$/);
});
