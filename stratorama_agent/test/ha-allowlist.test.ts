import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_HA_CALLS, isAllowedHaCall } from '../src/ha-allowlist.js';

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
