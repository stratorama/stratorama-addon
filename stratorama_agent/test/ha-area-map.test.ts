import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaMap, readAreaMap } from '../src/ha-area-map.js';
import { AREA_MAP_READS, type AreaMapRead } from '../src/ha-allowlist.js';

/** The four lists as Home Assistant 2026.11 answers them (shapes read on a real instance), trimmed. */
const floors = [
  { floor_id: 'ground_floor', name: 'Ground floor', level: 0, aliases: [], icon: null, created_at: 1, modified_at: 1 },
  { floor_id: 'first_floor', name: 'First floor', level: 1, aliases: ['Upstairs'], icon: 'mdi:home-floor-1' },
];
const areas = [
  {
    area_id: 'living_room', name: 'Living Room', floor_id: 'ground_floor', aliases: ['Séjour'],
    picture: '/api/image/serve/0123abcd/512x512', icon: 'mdi:sofa', labels: ['cosy'], humidity_entity_id: null,
  },
  { area_id: 'bureau', name: 'Bureau', floor_id: 'first_floor', aliases: [] },
  { area_id: 'garage', name: 'Garage', floor_id: null, aliases: [] },
];
const devices = [
  {
    id: 'dev-lamp', area_id: 'living_room', name: 'Hue color lamp', name_by_user: 'Lampe du canapé',
    manufacturer: 'Signify', model: 'LCT015', serial_number: 'SN-4242', sw_version: '1.93.11',
    connections: [['mac', 'aa:bb:cc:dd:ee:ff']], configuration_url: 'http://192.168.1.20/', identifiers: [['hue', 'x']],
  },
  { id: 'dev-multi', area_id: 'bureau', name: 'Thermomètre', name_by_user: null },
  { id: 'dev-plug', area_id: null, name: 'Prise' },
];
const display = {
  entity_categories: { 0: 'config', 1: 'diagnostic' },
  entities: [
    { ei: 'light.sofa', di: 'dev-lamp', pl: 'hue', lb: [] },
    { ei: 'sensor.bureau_temperature', di: 'dev-multi', en: 'Temperature' },
    // An area of its own wins over its device's.
    { ei: 'sensor.bureau_humidity', di: 'dev-multi', en: 'Humidity', ai: 'living_room' },
    // A diagnostic and a configuration entity: nobody places a battery level or an LED setting.
    { ei: 'sensor.bureau_battery', di: 'dev-multi', ec: 1 },
    { ei: 'switch.sofa_indicator', di: 'dev-lamp', ec: 0 },
    // Hidden by its owner.
    { ei: 'light.sofa_group_member', di: 'dev-lamp', hb: true },
    // In no area at all, its device in none either.
    { ei: 'switch.plug', di: 'dev-plug' },
    // An area of its own and no device.
    { ei: 'cover.garage_door', ai: 'garage' },
    // Domains Stratorama does not show, in an area or not.
    { ei: 'camera.porch', di: 'dev-lamp' },
    { ei: 'person.julien', ai: 'living_room' },
    // An area that no longer exists.
    { ei: 'light.ghost', ai: 'deleted_area' },
  ],
};

test('the map: floors, areas, and the area of each light, switch, cover and sensor a person would place', () => {
  assert.deepEqual(buildAreaMap(floors, areas, devices, display), {
    floors: [
      { id: 'ground_floor', name: 'Ground floor', level: 0 },
      { id: 'first_floor', name: 'First floor', level: 1 },
    ],
    areas: [
      { id: 'living_room', name: 'Living Room', floorId: 'ground_floor', aliases: ['Séjour'] },
      { id: 'bureau', name: 'Bureau', floorId: 'first_floor', aliases: [] },
      { id: 'garage', name: 'Garage', floorId: null, aliases: [] },
    ],
    entities: [
      { entityId: 'light.sofa', areaId: 'living_room', deviceId: 'dev-lamp', deviceName: 'Lampe du canapé' },
      { entityId: 'sensor.bureau_temperature', areaId: 'bureau', deviceId: 'dev-multi', deviceName: 'Thermomètre' },
      { entityId: 'sensor.bureau_humidity', areaId: 'living_room', deviceId: 'dev-multi', deviceName: 'Thermomètre' },
      { entityId: 'cover.garage_door', areaId: 'garage', deviceId: null, deviceName: null },
    ],
  });
});

test('nothing else of the registries leaves: no manufacturer, model, serial, network address, picture or icon', () => {
  const wire = JSON.stringify(buildAreaMap(floors, areas, devices, display));
  for (const secret of ['Signify', 'LCT015', 'SN-4242', '1.93.11', 'aa:bb:cc', '192.168.1.20', '/api/image', 'mdi:', 'cosy', 'Hue color lamp', 'camera.porch', 'person.julien', 'Upstairs']) {
    assert.equal(wire.includes(secret), false, secret);
  }
});

test('anything malformed is skipped, never thrown on', () => {
  assert.deepEqual(buildAreaMap(null, 'areas', 42, { entities: 'none' }), { floors: [], areas: [], entities: [] });
  assert.deepEqual(buildAreaMap(undefined, undefined, undefined, undefined), { floors: [], areas: [], entities: [] });
  const map = buildAreaMap(
    [{ floor_id: 'f', name: 'F', level: 1.5 }, { floor_id: 7, name: 'Bad' }, 'floor', { floor_id: 'g', name: 'G', level: '2' }],
    [{ area_id: 'a', name: 'A', floor_id: 'f', aliases: ['x', 3, '', 'y'] }, { area_id: 'b' }, { area_id: 'c', name: 'C', floor_id: 12 }],
    [{ id: 9, area_id: 'a' }, { id: 'd', area_id: 'a', name: 'D' }],
    { entities: [{ ei: 'light.ok', di: 'd' }, { ei: 42, ai: 'a' }, { ai: 'a' }, null, { ei: 'light.no_area' }] },
  );
  assert.deepEqual(map, {
    floors: [{ id: 'f', name: 'F', level: null }, { id: 'g', name: 'G', level: null }],
    areas: [{ id: 'a', name: 'A', floorId: 'f', aliases: ['x', 'y'] }, { id: 'c', name: 'C', floorId: null, aliases: [] }],
    entities: [{ entityId: 'light.ok', areaId: 'a', deviceId: 'd', deviceName: 'D' }],
  });
});

test('bounded: aliases, and text longer than Home Assistant ever writes', () => {
  const aliases = Array.from({ length: 30 }, (_, i) => `alias ${i}`);
  const long = 'x'.repeat(256);
  const map = buildAreaMap([], [{ area_id: 'a', name: 'A', aliases }, { area_id: long, name: 'Long' }], [], { entities: [] });
  assert.equal(map.areas.length, 1);
  assert.equal(map.areas[0]!.aliases.length, 20);
});

test('read now: the four lists in turn, then the map; a list that fails answers 502, never throws', async () => {
  const asked: AreaMapRead[] = [];
  const lists: Record<AreaMapRead, unknown> = {
    'config/floor_registry/list': floors,
    'config/area_registry/list': areas,
    'config/device_registry/list': devices,
    'config/entity_registry/list_for_display': display,
  };
  const ok = await readAreaMap(async (command) => {
    asked.push(command);
    return lists[command];
  });
  assert.deepEqual(asked, [...AREA_MAP_READS]);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, buildAreaMap(floors, areas, devices, display));

  const failed = await readAreaMap(async (command) => {
    if (command === 'config/device_registry/list') throw new Error('not connected to Home Assistant');
    return lists[command];
  });
  assert.equal(failed.status, 502);
  assert.match(String((failed.body as { error?: unknown }).error), /not connected to Home Assistant/);
});
