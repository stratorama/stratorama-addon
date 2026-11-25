import { AREA_MAP_READS, type AreaMapRead } from './ha-allowlist.js';
import type { HaRestResult } from './ha-client.js';
import { isForwardedEntity } from './ha-domains.js';

/**
 * THE AREA MAP (1.6.0): which area, and so which floor, each light, switch, cover and sensor of the
 * home is in, so that a room drawn in Stratorama can offer the devices of its Home Assistant area,
 * placed and linked in one go.
 *
 * Read by the agent itself from Home Assistant's registries (AREA_MAP_READS, ha-allowlist.ts) when
 * the relay asks `ha:area-map`, and CUT DOWN HERE, before anything leaves. The device registry in
 * particular holds what Stratorama has no business knowing: manufacturers, models, serial numbers,
 * network (MAC) addresses, the local address of a device's own configuration page, firmware
 * versions. None of it leaves: of a device, only its id and its name do, to tell which sensors
 * share one box. What leaves:
 *
 *   floors    id, name, level
 *   areas     id, name, floor, aliases (the other names Assist answers to: a way to say that
 *             "Séjour" is the "Living Room")
 *   entities  of the five domains Stratorama shows (ha-domains.ts), neither hidden nor of a
 *             category (configuration, diagnostic: a battery level, a signal strength), and in an
 *             area: the entity id, its area, its device's id and name.
 *
 * An entity's area is its own when it has one, else its device's - Home Assistant's own rule
 * (2026.11 refuses an area of its own to an entity without a name of its own: such an entity is
 * where its device is). An entity in no area, or in one that does not exist, is not in the map.
 * No state and no attribute: those come, as before, through `GET /api/states` and its views.
 *
 * Pure apart from `readAreaMap`, which is handed the read: a test can give it any registry.
 */

export interface AreaMapFloor {
  id: string;
  name: string;
  /** Home Assistant's level: 0 the ground floor, negative below it; null when none was given. */
  level: number | null;
}

export interface AreaMapArea {
  id: string;
  name: string;
  floorId: string | null;
  aliases: string[];
}

export interface AreaMapEntity {
  entityId: string;
  areaId: string;
  deviceId: string | null;
  deviceName: string | null;
}

export interface AreaMap {
  floors: AreaMapFloor[];
  areas: AreaMapArea[];
  entities: AreaMapEntity[];
}

/** Far beyond any home, far short of a memory problem. */
const MAX_FLOORS = 200;
const MAX_AREAS = 2_000;
const MAX_ENTITIES = 20_000;
const MAX_ALIASES = 20;
/** Home Assistant caps an id and a name at 255; anything longer is not one of its own. */
const MAX_TEXT = 255;

/** The map from the four registry lists, as Home Assistant answered them. Never throws. */
export function buildAreaMap(
  floorsRaw: unknown,
  areasRaw: unknown,
  devicesRaw: unknown,
  displayRaw: unknown,
): AreaMap {
  const floors: AreaMapFloor[] = [];
  for (const raw of records(floorsRaw).slice(0, MAX_FLOORS)) {
    const id = text(raw['floor_id']);
    const name = text(raw['name']);
    if (!id || name === null) continue;
    const level = raw['level'];
    floors.push({ id, name, level: typeof level === 'number' && Number.isInteger(level) ? level : null });
  }

  const areas: AreaMapArea[] = [];
  for (const raw of records(areasRaw).slice(0, MAX_AREAS)) {
    const id = text(raw['area_id']);
    const name = text(raw['name']);
    if (!id || name === null) continue;
    const aliases = Array.isArray(raw['aliases'])
      ? raw['aliases'].map(text).filter((a): a is string => !!a).slice(0, MAX_ALIASES)
      : [];
    areas.push({ id, name, floorId: text(raw['floor_id']) || null, aliases });
  }
  const areaIds = new Set(areas.map((a) => a.id));

  const devices = new Map<string, { areaId: string | null; name: string | null }>();
  for (const raw of records(devicesRaw)) {
    const id = text(raw['id']);
    if (!id) continue;
    devices.set(id, {
      areaId: text(raw['area_id']) || null,
      name: text(raw['name_by_user']) || text(raw['name']) || null,
    });
  }

  const entities: AreaMapEntity[] = [];
  const display = isRecord(displayRaw) ? displayRaw['entities'] : undefined;
  for (const raw of records(display)) {
    if (entities.length >= MAX_ENTITIES) break;
    const entityId = text(raw['ei']);
    if (!entityId || !isForwardedEntity(entityId)) continue;
    // Hidden by its owner, or a configuration or diagnostic entity: not a device anyone places.
    if (raw['hb'] === true || (raw['ec'] !== undefined && raw['ec'] !== null)) continue;
    const deviceId = text(raw['di']) || null;
    const device = deviceId ? devices.get(deviceId) : undefined;
    const areaId = text(raw['ai']) || device?.areaId || null;
    if (!areaId || !areaIds.has(areaId)) continue;
    entities.push({ entityId, areaId, deviceId, deviceName: device?.name ?? null });
  }

  return { floors, areas, entities };
}

/**
 * The map, read now: the four lists in turn over the agent's own connection to Home Assistant,
 * then cut down. Answers like a relayed call - 200 and the map, or 502 and why - and never rejects.
 */
export async function readAreaMap(read: (command: AreaMapRead) => Promise<unknown>): Promise<HaRestResult> {
  try {
    const answers: unknown[] = [];
    for (const command of AREA_MAP_READS) answers.push(await read(command));
    const [floors, areas, devices, display] = answers;
    return { status: 200, body: buildAreaMap(floors, areas, devices, display) };
  } catch (e) {
    return { status: 502, body: { error: `Home Assistant did not answer the area map: ${(e as Error).message}` } };
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** A string Home Assistant could have written as an id or a name, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_TEXT ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
