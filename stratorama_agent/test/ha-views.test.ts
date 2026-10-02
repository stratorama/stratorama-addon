import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyView, metadataOf, parseView } from '../src/ha-views.js';

/**
 * What an answer to GET /api/states carries, per view. The relay's twin (stratorama-tunnel,
 * src/ha-views.spec.ts) runs the same cases.
 */

const LAMP = { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen', brightness: 200 } };
const OTP = {
  entity_id: 'sensor.otp_bank',
  state: '492071',
  attributes: { friendly_name: 'Bank OTP', icon: 'mdi:update' },
};
const GARAGE = {
  entity_id: 'sensor.garage_temperature',
  state: '4.0',
  attributes: { friendly_name: 'Garage', device_class: 'temperature', unit_of_measurement: '°C', battery: 80 },
};
const SNAPSHOT = [LAMP, OTP, GARAGE];

test('runtime: only the listed entities, each in full', () => {
  assert.deepEqual(applyView(SNAPSHOT, { kind: 'runtime', entityIds: ['light.kitchen'] }), [LAMP]);
  assert.deepEqual(applyView(SNAPSHOT, { kind: 'runtime', entityIds: [] }), []);
});

test('catalog: the listed entities in full, every other one as name, class and unit only', () => {
  assert.deepEqual(applyView(SNAPSHOT, { kind: 'catalog', entityIds: ['light.kitchen'] }), [
    LAMP,
    { entity_id: 'sensor.otp_bank', attributes: { friendly_name: 'Bank OTP' } },
    {
      entity_id: 'sensor.garage_temperature',
      attributes: { friendly_name: 'Garage', device_class: 'temperature', unit_of_measurement: '°C' },
    },
  ]);
  // The code itself is nowhere in it.
  assert.equal(JSON.stringify(applyView(SNAPSHOT, { kind: 'catalog', entityIds: [] })).includes('492071'), false);
});

test('value: that one entity in full, and nothing else', () => {
  assert.deepEqual(applyView(SNAPSHOT, { kind: 'value', entityId: 'sensor.garage_temperature' }), [GARAGE]);
  assert.deepEqual(applyView(SNAPSHOT, { kind: 'value', entityId: 'sensor.nowhere' }), []);
});

test('no view, or a malformed one, fails closed: every entity as metadata only', () => {
  const closed = applyView(SNAPSHOT, null) as Array<{ entity_id: string; state?: unknown }>;
  assert.deepEqual(closed.map((s) => s.entity_id), ['light.kitchen', 'sensor.otp_bank', 'sensor.garage_temperature']);
  assert.equal(closed.some((s) => 'state' in s), false);
  for (const bad of [
    undefined,
    null,
    'runtime',
    { kind: 'everything' },
    { kind: 'runtime' },
    { kind: 'runtime', entityIds: 'light.kitchen' },
    { kind: 'value' },
    { kind: 'value', entityId: 'x'.repeat(256) },
  ]) {
    assert.equal(parseView(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseView({ kind: 'runtime', entityIds: new Array(20_001).fill('light.x') }), null);
});

test('a malformed id costs that id only, never the whole view', () => {
  // An empty door sensor, a number, an id longer than Home Assistant allows: dropped one by one,
  // so the rest of the plan still comes back in full.
  assert.deepEqual(parseView({ kind: 'runtime', entityIds: ['light.kitchen', '', 42, 'x'.repeat(256)] }), {
    kind: 'runtime',
    entityIds: ['light.kitchen'],
  });
  assert.deepEqual(parseView({ kind: 'catalog', entityIds: [''] }), { kind: 'catalog', entityIds: [] });
});

test('a well-formed view is kept as it is', () => {
  assert.deepEqual(parseView({ kind: 'runtime', entityIds: ['light.kitchen'] }), { kind: 'runtime', entityIds: ['light.kitchen'] });
  assert.deepEqual(parseView({ kind: 'catalog', entityIds: [] }), { kind: 'catalog', entityIds: [] });
  assert.deepEqual(parseView({ kind: 'value', entityId: 'sensor.garage_temperature' }), {
    kind: 'value',
    entityId: 'sensor.garage_temperature',
  });
});

test('metadata keeps only string name, class and unit', () => {
  assert.deepEqual(
    metadataOf({ entity_id: 'sensor.x', state: '1', attributes: { friendly_name: 'X', device_class: 3, token: 'y' } }),
    { entity_id: 'sensor.x', attributes: { friendly_name: 'X' } },
  );
  assert.deepEqual(metadataOf({ entity_id: 'sensor.y', state: '1' }), { entity_id: 'sensor.y', attributes: {} });
});

test('what is not a list of states passes through, and an entry with no id is dropped', () => {
  const error = { error: 'Agent not connected' };
  assert.equal(applyView(error, { kind: 'runtime', entityIds: [] }), error);
  assert.equal(applyView('', null), '');
  assert.deepEqual(applyView([{ state: 'on' }, null, LAMP], { kind: 'runtime', entityIds: ['light.kitchen'] }), [LAMP]);
});
