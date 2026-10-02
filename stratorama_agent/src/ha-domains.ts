/**
 * The Home Assistant domains Stratorama shows, and so the only ones whose states this agent sends
 * to the relay - in a `state_changed` event, in the `GET /api/states` snapshot, in a service
 * call's answer. Everything else Home Assistant knows stays home: who is in and where they are
 * (person, device_tracker), cameras and their access tokens, media players, calendars, every
 * entity Stratorama has no use for.
 *
 *   light          lights and LED strips
 *   switch         power outlets and electro-valves
 *   cover          roller shutters
 *   sensor         sensor readouts, and the device library's sensors
 *   binary_sensor  readouts, and the door or window sensor that drives an opening
 *
 * Read on 2026-10-02 from the app (HA_DOMAIN_BY_ELEMENT_TYPE in src/app/types/home-assistant.ts,
 * READING_DOMAINS in the element config drawer, the opening's sensor picker, ADD_DOMAINS in the
 * device library), and checked against every binding in production: none outside these five.
 * The device picker therefore lists exactly what it listed before; it never offered anything else.
 *
 * Every domain the agent can act on (ALLOWED_HA_CALLS, ha-allowlist.ts) is one of these, which the
 * test suite pins. Like that list, this one grows in a release the owner installs knowingly: a
 * device type Stratorama starts supporting needs a new agent before its states can arrive.
 *
 * The relay applies a twin of this module to everything an agent sends (stratorama-tunnel,
 * src/ha-domains.ts), so that a browser never receives another domain from an agent that
 * predates it. Change both, with the same cases in both suites.
 */

export const FORWARDED_DOMAINS: ReadonlySet<string> = new Set(['light', 'switch', 'cover', 'sensor', 'binary_sensor']);

/** Is this entity id one of a domain Stratorama shows? Anything that is not an entity id is not. */
export function isForwardedEntity(entityId: unknown): boolean {
  if (typeof entityId !== 'string') return false;
  const dot = entityId.indexOf('.');
  return dot > 0 && dot < entityId.length - 1 && FORWARDED_DOMAINS.has(entityId.slice(0, dot));
}

/**
 * A body Home Assistant answered a relayed call with, keeping only the states of forwarded
 * domains. `GET /api/states` is an array of states; a service call answers the states it changed,
 * as an array, or under `changed_states` when the response was asked for. An entry with no entity
 * id cannot be checked, so it is dropped. Any other body (an error, an empty text) is returned as
 * it is: filtering an error into an empty list would report a house with no devices.
 */
export function keepForwardedStates(body: unknown): unknown {
  if (Array.isArray(body)) return body.filter(isForwardedState);
  if (isRecord(body) && Array.isArray(body['changed_states'])) {
    return { ...body, changed_states: body['changed_states'].filter(isForwardedState) };
  }
  return body;
}

function isForwardedState(state: unknown): boolean {
  return isRecord(state) && isForwardedEntity(state['entity_id']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
