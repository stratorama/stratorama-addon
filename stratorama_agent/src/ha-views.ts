/**
 * How much of Home Assistant an answer to `GET /api/states` carries (bound-only, agent 1.4.0).
 *
 * The relay names, in every request for the entity snapshot, which entities it may receive in
 * full - so an answer never depends on a set pushed earlier arriving first, and the one call the
 * agent makes to Home Assistant stays the same (`GET /api/states`, ha-allowlist.ts unchanged):
 *
 *  - `runtime`  the plan's live picture: ONLY the listed entities (the requester's readable ones),
 *               each with its full state;
 *  - `catalog`  the device picker: every entity, the listed ones (bound to the plan) in full and
 *               all the others as metadata only - their id, name, class and unit, no state - so
 *               a TOTP code, a HomeKit setup code or a notification's text never leaves the home
 *               just because an editor opened a list;
 *  - `value`    the picker's "Show value": that ONE entity, in full, at an editor's request.
 *
 * No view, or a malformed one, is a catalog with nothing listed: every entity as metadata only.
 * Failing closed costs at most a value on screen; failing open would cost the whole house.
 *
 * The relay applies a twin of this module to every answer it receives (stratorama-tunnel,
 * src/ha-views.ts, in forwardToAgent), for the agents that predate it. Change both, with the same
 * cases in both suites.
 */

export type HaView =
  | { kind: 'runtime'; entityIds: string[] }
  | { kind: 'catalog'; entityIds: string[] }
  | { kind: 'value'; entityId: string };

/** Bounds on what a view may name: far beyond any home, far short of a memory problem. */
const MAX_VIEW_IDS = 20_000;
const MAX_ID_LENGTH = 255;

/** What an entity not on the plan is listed with: what the picker needs to name it, filter it
 *  by class and seed a comfort range from its unit - nothing else. */
const METADATA_ATTRIBUTES = ['friendly_name', 'device_class', 'unit_of_measurement'] as const;

/**
 * A view as the relay sent it, checked. A malformed view is null, and null fails closed. A
 * malformed ID inside a well-formed list is dropped on its own: one bad binding (an empty sensor
 * id, an overlong one) must cost that one entity, not blank the whole home's plan.
 */
export function parseView(raw: unknown): HaView | null {
  if (!isRecord(raw)) return null;
  if (raw['kind'] === 'value') {
    return isEntityId(raw['entityId']) ? { kind: 'value', entityId: raw['entityId'] } : null;
  }
  if (raw['kind'] !== 'runtime' && raw['kind'] !== 'catalog') return null;
  const ids = raw['entityIds'];
  if (!Array.isArray(ids) || ids.length > MAX_VIEW_IDS) return null;
  return { kind: raw['kind'], entityIds: ids.filter(isEntityId) };
}

/** An entity's metadata: its id and, of its attributes, only name, class and unit. */
export function metadataOf(state: Record<string, unknown>): { entity_id: unknown; attributes: Record<string, unknown> } {
  const source = isRecord(state['attributes']) ? state['attributes'] : {};
  const attributes: Record<string, unknown> = {};
  for (const key of METADATA_ATTRIBUTES) {
    if (typeof source[key] === 'string') attributes[key] = source[key];
  }
  return { entity_id: state['entity_id'], attributes };
}

/**
 * A list of states cut down to a view. Anything that is not a list (an error body, a service
 * call's answer) is returned as it is; an entry with no string entity id is dropped.
 */
export function applyView(body: unknown, view: HaView | null): unknown {
  if (!Array.isArray(body)) return body;
  const states = body.filter((s): s is Record<string, unknown> => isRecord(s) && typeof s['entity_id'] === 'string');
  if (view?.kind === 'value') return states.filter((s) => s['entity_id'] === view.entityId);
  const full = new Set(view?.entityIds ?? []);
  if (view?.kind === 'runtime') return states.filter((s) => full.has(s['entity_id'] as string));
  return states.map((s) => (full.has(s['entity_id'] as string) ? s : metadataOf(s)));
}

function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
