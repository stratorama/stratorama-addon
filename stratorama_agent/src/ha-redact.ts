/**
 * Home Assistant puts credentials of its own inside some entity states. The domains that carry
 * them natively (camera, image, media_player) never leave the home at all (ha-domains.ts), so
 * this is DEFENSE IN DEPTH for the states that do: a template sensor whose state is a camera's
 * picture link carries that camera's live token, and the pattern is common (a "snapshot URL"
 * sensor for a notification or a dashboard). Every state this agent sends - in a `state_changed`
 * event, in the `GET /api/states` snapshot, in a service call's answer - goes through here.
 * Stratorama reads none of these values.
 *
 * Where Home Assistant mints them (home-assistant/core, read on 2026-10-02):
 *
 *  - camera.*        an `access_token` attribute, and an `entity_picture` of
 *                    `/api/camera_proxy/<entity_id>?token=<the same token>`. The token opens that
 *                    camera's still (`/api/camera_proxy/`) and its live MJPEG stream
 *                    (`/api/camera_proxy_stream/`) WITHOUT signing in, to anyone who can reach
 *                    Home Assistant. A new one every 5 minutes, the last two valid - and every
 *                    rotation is itself a `state_changed` event.
 *  - image.*         the same pair, for `/api/image_proxy/`.
 *  - media_player.*  no `access_token` attribute, but `entity_picture` (or, when the artwork is
 *                    remotely reachable, `entity_picture_local`) is
 *                    `/api/media_player_proxy/<entity_id>?token=<t>&cache=<hash>`. That token is
 *                    minted once per entity and never rotated.
 *  - a camera played on a media player (`camera.play_stream`, or from the media browser) puts
 *    `<hass>/api/hls/<stream token>/master_playlist.m3u8` in that player's `media_content_id`;
 *    a spoken message, `/api/tts_proxy/<token>.mp3`. There the path segment IS the credential:
 *    both views are served without authentication.
 *  - signed paths (`async_sign_path`) carry an `authSig` query parameter.
 *
 * And in the forwarded domains themselves (a sweep of core's integrations, same day): a
 * garage-door cover (garadget) carries the `access_token` of its maker's cloud, which opens the
 * door from anywhere; a lock's operator sensor (august, yale) puts a photo of whoever last
 * unlocked it, reachable from the internet, in `entity_picture`; a monitored address (uptimerobot,
 * uptime_kuma) can carry the `user:password@` typed into it.
 *
 * Rules, applied to the whole state - its `state` string as much as its attributes, at any
 * depth, because a template sensor can hold a camera's picture link as its state:
 *  - a key named `access_token`, `entity_picture` or `entity_picture_local` is dropped. Stratorama
 *    shows no entity picture, and a picture link is where Home Assistant puts its proxy tokens;
 *  - in a string, the query parameters `token`, `access_token` and `authSig` are cut out, and the
 *    rest of the URL is kept: `?token=t&cache=h` becomes `?cache=h`, a link with nothing else
 *    becomes the bare path. A run of them goes at once, in ONE pass: no loop that a hostile
 *    string could make quadratic;
 *  - the segment after `/api/hls/` or `/api/tts_proxy/` is replaced by `redacted`;
 *  - the `user:password@` of a URL is cut out.
 *
 * What it does NOT catch, so that nobody claims more: a token copied on its own (a template
 * sensor whose state is `state_attr('camera.x', 'access_token')`), under a key of another name,
 * or percent-encoded into another URL. Those are forms a person writes, not forms Home Assistant
 * writes. A value that only looks similar - `?tokens=`, `?mytoken=`, a key named `token` - is
 * left alone. Nothing is mutated: Home Assistant's object is copied, not edited. Nesting deeper
 * than MAX_DEPTH is replaced by null rather than walked: no Home Assistant state comes near it,
 * and a walk without a bound is a stack overflow waiting for a hostile or broken payload.
 *
 * The relay applies a twin of this module to everything an agent sends (stratorama-tunnel,
 * src/ha-redact.ts), for the agents that predate it. Change both, with the same cases in both
 * suites.
 */

/** Keys whose value is a credential, or a picture link Stratorama never shows, wherever they appear. */
const DROPPED_KEYS: ReadonlySet<string> = new Set(['access_token', 'entity_picture', 'entity_picture_local']);

/**
 * A run of credential-bearing query parameters: the separator before the first (`?`, `&`, or an
 * HTML-escaped `&amp;`), each parameter's value up to the first character that cannot belong to
 * one, and the separator that follows the run, if any. Linear: a separator cannot occur inside a
 * value, so nothing backtracks.
 */
const TOKEN_PARAMS =
  /(\?|&amp;|&)(?:token|access_token|authSig)=[^&#;?\s"'<>,()[\]{}|\\`]*(?:(?:&amp;|&)(?:token|access_token|authSig)=[^&#;?\s"'<>,()[\]{}|\\`]*)*(&amp;|&)?/g;
const TOKEN_PARAM_HINT = /[?&;](?:token|access_token|authSig)=/;

/** A path whose next segment is the credential itself. */
const TOKEN_PATH = /(\/api\/(?:hls|tts_proxy)\/)[^/?#\s"'<>,()[\]{}|\\`]+/g;
const TOKEN_PATH_HINT = /\/api\/(?:hls|tts_proxy)\//;

/** The `user:password@` after a scheme. The class excludes `/`, so a scan stops at the next `://`. */
const URL_USERINFO = /:\/\/[^\s/?#@"'<>]+@/g;

/** Far deeper than any Home Assistant state, far shallower than the call stack. */
const MAX_DEPTH = 32;

/**
 * Anything Home Assistant answered or emitted - a state, a list of states, a service call's
 * answer, an error body - without the credentials in it. A value with nothing to remove comes
 * back equal to what went in.
 */
export function redactTokens(value: unknown): unknown {
  return redactValue(value, 0);
}

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.map((inner) => redactValue(inner, depth + 1));
  // Object.fromEntries defines own properties, so a `__proto__` key from JSON.parse stays a
  // plain key instead of becoming the copy's prototype.
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !DROPPED_KEYS.has(key))
      .map(([key, inner]) => [key, redactValue(inner, depth + 1)]),
  );
}

function redactString(value: string): string {
  let out = value;
  if (TOKEN_PATH_HINT.test(out)) out = out.replace(TOKEN_PATH, '$1redacted');
  if (out.includes('://') && out.includes('@')) out = out.replace(URL_USERINFO, '://');
  if (!TOKEN_PARAM_HINT.test(out)) return out;
  // `?token=t&next` keeps `?next`, `&token=t&next` keeps `&next`, a run at the end goes with
  // its separator.
  return out.replace(TOKEN_PARAMS, (_match, separator: string, following: string | undefined) =>
    following ? separator : '',
  );
}
