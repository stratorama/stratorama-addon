import { readFileSync } from 'node:fs';

/**
 * Where this agent runs, and therefore how it reaches Home Assistant and what it tells its
 * owner when something needs doing.
 *
 *   addon   inside Home Assistant OS, as an add-on: the Supervisor injects SUPERVISOR_TOKEN
 *           and proxies `http://supervisor/core`; the owner configures it in the add-on's
 *           Configuration tab.
 *   docker  a plain container next to Home Assistant Container, which has no Supervisor and
 *           so cannot run add-ons: the owner gives HA_URL and a long-lived access token, and
 *           configures everything through environment variables.
 *
 * DECLARED BY THE IMAGE (Dockerfile.standalone sets AGENT_RUNTIME=docker), never guessed from
 * which variables happen to be set. A guess would turn a typo in HA_URL into an agent calling
 * `http://supervisor/core`, and failing in a way that names neither.
 */
export type AgentRuntime = 'addon' | 'docker';

export interface HaEndpoints {
  /** Base of the REST API, no trailing slash: `/api/states` is appended to it. */
  httpUrl: string;
  wsUrl: string;
  token: string;
}

export interface AgentConfig {
  runtime: AgentRuntime;
  tunnelUrl: string;
  /** Presented only while no credential is stored. */
  pairingCode: string | null;
  ha: HaEndpoints;
}

export type ConfigResult = { ok: true; config: AgentConfig } | { ok: false; error: string };

export const DEFAULT_TUNNEL_URL = 'wss://stratorama.app/agent';

const SUPERVISOR_HTTP = 'http://supervisor/core';
const SUPERVISOR_WS = 'ws://supervisor/core/api/websocket';

/**
 * Read the configuration from the environment. Pure apart from `readFile` (for HA_TOKEN_FILE),
 * so the whole matrix is testable without touching the process.
 *
 * Every refusal is one sentence the owner can act on: it is the only line they will see, in
 * the add-on's Log tab or in `docker logs`.
 */
export function resolveConfig(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): ConfigResult {
  const runtimeRaw = env['AGENT_RUNTIME']?.trim() || 'addon';
  if (runtimeRaw !== 'addon' && runtimeRaw !== 'docker') {
    return { ok: false, error: `AGENT_RUNTIME must be "addon" or "docker", not "${runtimeRaw}".` };
  }
  const runtime: AgentRuntime = runtimeRaw;

  const tunnelUrl = env['TUNNEL_URL']?.trim() || DEFAULT_TUNNEL_URL;
  if (!isUrlWithProtocol(tunnelUrl, ['ws:', 'wss:', 'http:', 'https:'])) {
    return { ok: false, error: `TUNNEL_URL is not a WebSocket address: "${tunnelUrl}". Leave it unset to use ${DEFAULT_TUNNEL_URL}.` };
  }

  const pairingCode = env['PAIRING_CODE']?.trim() || null;

  const token = readToken(env, readFile);
  if (!token.ok) return token;

  const haUrl = env['HA_URL']?.trim();
  let httpUrl: string;
  let wsUrl: string;
  if (haUrl) {
    const origin = parseHaUrl(haUrl);
    if (!origin) {
      return {
        ok: false,
        error:
          `HA_URL must be the address of Home Assistant itself, like http://192.168.1.10:8123 ` +
          `(http or https, no path), not "${haUrl}".`,
      };
    }
    httpUrl = origin;
    wsUrl = `${origin.replace(/^http/, 'ws')}/api/websocket`;
  } else if (runtime === 'docker') {
    return {
      ok: false,
      error:
        'HA_URL is not set. Give the address you open Home Assistant with on your network, ' +
        'like http://192.168.1.10:8123.',
    };
  } else {
    // The add-on: the Supervisor's proxy, unless a developer points the agent elsewhere.
    httpUrl = (env['HA_HTTP_URL']?.trim() || SUPERVISOR_HTTP).replace(/\/+$/, '');
    wsUrl = env['HA_WS_URL']?.trim() || SUPERVISOR_WS;
  }

  // SUPERVISOR_TOKEN only counts inside Home Assistant OS: a Docker agent that silently
  // picked one up from somewhere would be sending a token that means nothing to HA_URL.
  const accessToken = token.value ?? (runtime === 'addon' ? env['SUPERVISOR_TOKEN']?.trim() || null : null);
  if (!accessToken) {
    return {
      ok: false,
      error:
        runtime === 'docker'
          ? 'HA_TOKEN is not set. Create a long-lived access token in Home Assistant (your profile, ' +
            'Security tab, "Long-lived access tokens") and pass it as HA_TOKEN, or as a file named ' +
            'by HA_TOKEN_FILE.'
          : 'SUPERVISOR_TOKEN missing. Make sure homeassistant_api: true is set in config.yaml.',
    };
  }

  return { ok: true, config: { runtime, tunnelUrl, pairingCode, ha: { httpUrl, wsUrl, token: accessToken } } };
}

/** HA_TOKEN, else the contents of HA_TOKEN_FILE (a Docker secret, typically), else nothing. */
function readToken(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const inline = env['HA_TOKEN']?.trim();
  if (inline) return { ok: true, value: inline };
  const file = env['HA_TOKEN_FILE']?.trim();
  if (!file) return { ok: true, value: null };
  let contents: string;
  try {
    contents = readFile(file);
  } catch (e) {
    return { ok: false, error: `HA_TOKEN_FILE could not be read (${file}): ${(e as Error).message}.` };
  }
  const value = contents.trim();
  if (!value) return { ok: false, error: `HA_TOKEN_FILE is empty (${file}).` };
  return { ok: true, value };
}

/** `http(s)://host[:port]` with nothing after it but an optional slash; the origin, or null. */
function parseHaUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
  return url.origin;
}

function isUrlWithProtocol(raw: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(raw).protocol);
  } catch {
    return false;
  }
}
