/**
 * The only calls this add-on relays to Home Assistant: exactly the ones the Stratorama
 * relay makes (stratorama-tunnel: routes/ha.ts reads the entity snapshot,
 * element-commands.ts builds the service calls). Anything else, from the relay or from
 * whatever might one day impersonate it, is answered 403 and Home Assistant never sees it.
 *
 * A closed list rather than a shape ("POST under /api/services/") on purpose: the shape
 * would also let through `lock/unlock`, `alarm_control_panel/alarm_disarm` or
 * `homeassistant/restart`, none of which Stratorama has any business sending. Growing
 * the product means growing this list, in a release the owner installs knowingly.
 *
 * Matched as exact strings, so a query string, a trailing slash, a different case or a
 * `..` segment all fall outside.
 */
export const ALLOWED_HA_CALLS: ReadonlyArray<readonly ['GET' | 'POST', string]> = [
  ['GET', '/api/states'],
  ['POST', '/api/services/light/turn_on'],
  ['POST', '/api/services/light/turn_off'],
  ['POST', '/api/services/switch/turn_on'],
  ['POST', '/api/services/switch/turn_off'],
  ['POST', '/api/services/cover/open_cover'],
  ['POST', '/api/services/cover/close_cover'],
  ['POST', '/api/services/cover/stop_cover'],
  ['POST', '/api/services/cover/set_cover_position'],
];

/**
 * The only WebSocket commands this agent sends Home Assistant besides its `state_changed`
 * subscription (1.6.0): four READS of Home Assistant's registries, made by the agent itself to
 * answer one question from the relay, `ha:area-map` - which area and floor each light, switch,
 * cover and sensor is in (ha-area-map.ts). The relay never names a command, a path or an entity
 * there: it asks for the map, and these four lists are what the agent reads it from, then cuts down
 * at home before anything leaves. Each is a read any Home Assistant user may make, administrator or
 * not (measured on Home Assistant 2026.11); nothing here writes.
 */
export const AREA_MAP_READS = [
  'config/floor_registry/list',
  'config/area_registry/list',
  'config/device_registry/list',
  'config/entity_registry/list_for_display',
] as const;

export type AreaMapRead = (typeof AREA_MAP_READS)[number];

const allowed = new Set(ALLOWED_HA_CALLS.map(([method, path]) => `${method} ${path}`));

export function isAllowedHaCall(method: unknown, path: unknown): boolean {
  return typeof method === 'string' && typeof path === 'string' && allowed.has(`${method} ${path}`);
}
