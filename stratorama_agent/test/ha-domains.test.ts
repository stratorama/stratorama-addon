import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORWARDED_DOMAINS, isForwardedEntity, keepForwardedStates } from '../src/ha-domains.js';

/**
 * Which states leave the home. The relay's twin (stratorama-tunnel, src/ha-domains.spec.ts) runs
 * the same cases.
 */

test('the five domains Stratorama shows, and only those', () => {
  assert.deepEqual([...FORWARDED_DOMAINS].sort(), ['binary_sensor', 'cover', 'light', 'sensor', 'switch']);
  for (const id of ['light.kitchen', 'switch.garden_valve', 'cover.living_room', 'sensor.bedroom_temperature', 'binary_sensor.front_door']) {
    assert.equal(isForwardedEntity(id), true, id);
  }
});

test('who is home, where everyone is, cameras and the rest stay home', () => {
  const kept = [
    'camera.porch',
    'image.doorbell_snapshot',
    'person.alice',
    'device_tracker.alices_phone',
    'zone.home',
    'media_player.living_room',
    'alarm_control_panel.house',
    'lock.front_door',
    'calendar.family',
    'climate.living_room',
    'valve.garden',
    'input_boolean.guest_mode',
    'sun.sun',
    'weather.home',
  ];
  for (const id of kept) assert.equal(isForwardedEntity(id), false, id);
});

test('what is not an entity id of a forwarded domain is not one', () => {
  for (const id of ['light', 'light.', '.light', 'lights.kitchen', 'Light.kitchen', 'sensor_x.y', '', ' light.x']) {
    assert.equal(isForwardedEntity(id), false, JSON.stringify(id));
  }
  for (const id of [undefined, null, 42, ['light.kitchen'], { entity_id: 'light.kitchen' }]) {
    assert.equal(isForwardedEntity(id), false, JSON.stringify(id));
  }
});

test('the snapshot keeps the forwarded states only, in order', () => {
  const light = { entity_id: 'light.kitchen', state: 'on', attributes: {} };
  const sensor = { entity_id: 'sensor.bedroom_temperature', state: '21.5', attributes: {} };
  const snapshot = [
    { entity_id: 'person.alice', state: 'home', attributes: { latitude: 48.85, longitude: 2.35 } },
    light,
    { entity_id: 'camera.porch', state: 'idle', attributes: { access_token: 'secret' } },
    { entity_id: 'device_tracker.alices_phone', state: 'not_home', attributes: { latitude: 45.76, longitude: 4.83 } },
    sensor,
    { state: 'no entity id' },
    null,
  ];
  assert.deepEqual(keepForwardedStates(snapshot), [light, sensor]);
});

test('a service answer is filtered in both of its shapes; any other body passes through', () => {
  const light = { entity_id: 'light.kitchen', state: 'on', attributes: {} };
  const camera = { entity_id: 'camera.porch', state: 'idle', attributes: {} };
  assert.deepEqual(keepForwardedStates([light, camera]), [light]);
  assert.deepEqual(keepForwardedStates({ changed_states: [camera, light], service_response: null }), {
    changed_states: [light],
    service_response: null,
  });

  const error = { error: 'Agent not connected' };
  assert.equal(keepForwardedStates(error), error);
  assert.equal(keepForwardedStates(''), '');
  assert.equal(keepForwardedStates(undefined), undefined);
});
