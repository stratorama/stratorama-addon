import WebSocket from 'ws';
import { log } from './log.js';
import { callHaRest } from './ha-client.js';
import { loadToken, saveToken, clearToken } from './token-store.js';
import { isAllowedHaCall } from './ha-allowlist.js';
import { reactToHelloError } from './hello-errors.js';
import { LIVENESS_CHECK_MS, RELAY_SILENCE_MS, RelayLiveness } from './liveness.js';
import type { AgentToServerMsg, ServerToAgentMsg } from './types.js';

/**
 * Maintains the long-lived WebSocket to the Stratorama relay: authenticates (pair once
 * with a code, then reconnect with the stored credential), answers the relay's
 * `ha:request` messages from the local Home Assistant REST API, and pushes
 * `state_changed` events upstream through `pushEvent()`.
 *
 * Three things it does NOT do, on purpose:
 *  - relay a call outside ALLOWED_HA_CALLS (ha-allowlist.ts): answered 403, Home
 *    Assistant never sees it;
 *  - trust a socket that merely looks open: a socket that has carried nothing from the
 *    relay for RELAY_SILENCE_MS is terminated and reopened (liveness.ts);
 *  - retry a refusal no retry can fix: a used or expired code, or a revoked credential
 *    with nothing to fall back on, stops the client and calls `onGiveUp` once
 *    (hello-errors.ts).
 */

export interface TunnelClientOptions {
  tunnelUrl: string;
  /** Pairing code from the add-on configuration; presented only when no credential is stored. */
  pairingCode: string | null;
  /** This add-on's version, sent in every hello. */
  version: string;
  /** Called once, after the client has stopped, with the line already written to the log. */
  onGiveUp: (reason: string) => void;
  /** Test seams; the defaults are the production values. */
  relaySilenceMs?: number;
  livenessCheckMs?: number;
  maxBackoffMs?: number;
  blockedRetryMs?: number;
}

const DEFAULT_MAX_BACKOFF_MS = 60_000;
/**
 * Wait this long after close code 4029, "too many failed hellos from this address": the
 * relay refuses the address for the rest of a 15-minute window, and asking again sooner
 * only keeps the window busy.
 */
const DEFAULT_BLOCKED_RETRY_MS = 5 * 60_000;

export class TunnelClient {
  readonly #opts: TunnelClientOptions;
  #ws: WebSocket | null = null;
  #attempt = 0;
  #closed = false;
  #ready = false;
  #gaveUp = false;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #livenessTimer: NodeJS.Timeout | null = null;
  /** Set when the next reconnect must not wait for the backoff (a credential just forgotten, with a code to try). */
  #reconnectAtOnce = false;

  constructor(opts: TunnelClientOptions) {
    this.#opts = opts;
  }

  start(): void {
    this.#closed = false;
    this.#connect();
  }

  stop(): void {
    this.#closed = true;
    this.#clearTimers();
    const ws = this.#ws;
    this.#ws = null;
    this.#ready = false;
    ws?.close();
  }

  /** Forward a state_changed event to the relay. No-op while not registered. */
  pushEvent(data: { entity_id: string; new_state: unknown; old_state: unknown }): void {
    if (!this.#ready) return;
    this.#send({ type: 'ha:event', eventType: 'state_changed', data });
  }

  // ---------- internals ----------

  #wsUrl(): string {
    const trimmed = this.#opts.tunnelUrl.replace(/\/+$/, '');
    return trimmed.endsWith('/agent') ? trimmed : trimmed + '/agent';
  }

  #connect(): void {
    if (this.#closed) return;
    const url = this.#wsUrl();
    log.info(`Connecting to the relay at ${url}`);
    const ws = new WebSocket(url);
    this.#ws = ws;
    this.#ready = false;

    // Every listener checks `this.#ws === ws` first: a socket that was replaced
    // (terminated for silence, then reopened) still emits 'close' and 'error' afterwards,
    // and those late events must neither touch the live socket nor schedule a second
    // reconnect.
    const liveness = new RelayLiveness(this.#opts.relaySilenceMs ?? RELAY_SILENCE_MS);
    ws.on('open', () => {
      liveness.touch();
      this.#sayHello(ws).catch((e) => log.error(`Failed to send the hello: ${(e as Error).message}`));
    });
    ws.on('ping', () => liveness.touch());
    ws.on('message', (raw) => {
      liveness.touch();
      // An async listener whose promise rejects is an unhandled rejection, and an
      // unhandled rejection ends the process - which, without the watchdog, leaves the
      // add-on stopped until someone notices. Nothing the relay sends may do that.
      this.#handleMessage(ws, raw.toString()).catch((e) =>
        log.error(`Failed to handle a relay message: ${(e as Error).message}`),
      );
    });
    ws.on('close', (code, reason) => this.#handleClose(ws, code, reason.toString()));
    ws.on('error', (e) => {
      if (this.#ws === ws) log.warn(`Relay WS error: ${e.message}`);
    });

    this.#livenessTimer = setInterval(() => {
      if (this.#ws !== ws || !liveness.isDead()) return;
      log.warn(
        `No frame from the relay for ${Math.round(liveness.silentFor() / 1000)} s: ` +
          'the connection is dead, reconnecting',
      );
      ws.terminate(); // 'close' follows, and #handleClose schedules the reconnect
    }, this.#opts.livenessCheckMs ?? LIVENESS_CHECK_MS);
  }

  async #sayHello(ws: WebSocket): Promise<void> {
    const stored = await loadToken();
    if (this.#ws !== ws) return;
    const agentVersion = this.#opts.version;
    if (stored) {
      log.info('Reconnecting with the stored credential');
      this.#send({ type: 'agent:hello', mode: 'reconnect', agentToken: stored, agentVersion });
      return;
    }
    if (this.#opts.pairingCode) {
      log.info('Pairing with the code from the configuration');
      this.#send({ type: 'agent:hello', mode: 'pair', pairingCode: this.#opts.pairingCode, agentVersion });
      return;
    }
    this.#giveUp(
      'No stored credential and no pairing code in the configuration. Generate a pairing code in ' +
        'Stratorama (Settings > Home Assistant > Connection > Generate pairing code), paste it into ' +
        "the add-on's Pairing code option, save, then start the add-on again.",
    );
  }

  async #handleMessage(ws: WebSocket, raw: string): Promise<void> {
    if (this.#ws !== ws) return;
    let msg: ServerToAgentMsg;
    try {
      msg = JSON.parse(raw) as ServerToAgentMsg;
    } catch {
      log.warn('Ignoring a relay message that is not JSON');
      return;
    }
    if (msg === null || typeof msg !== 'object') {
      log.warn('Ignoring a relay message that is not an object');
      return;
    }

    if (msg.type === 'agent:hello-ok') {
      if (typeof msg.agentToken !== 'string' || msg.agentToken.length === 0) {
        log.warn('Ignoring a hello-ok that carries no credential');
        return;
      }
      log.info('Registered with the relay');
      await saveToken(msg.agentToken);
      this.#ready = true;
      this.#attempt = 0;
      return;
    }

    if (msg.type === 'agent:hello-error') {
      const reaction = reactToHelloError(msg, { pairingCodeConfigured: this.#opts.pairingCode !== null });
      if (reaction.forgetCredential) await clearToken();
      if (reaction.terminal) {
        this.#giveUp(reaction.line);
        return;
      }
      log.warn(reaction.line);
      this.#reconnectAtOnce = reaction.retryNow;
      ws.close();
      return;
    }

    if (msg.type === 'ha:request') {
      // `JSON.parse(...) as ServerToAgentMsg` is a cast, not a check: nothing below
      // trusts the shape.
      if (typeof msg.requestId !== 'string') {
        log.warn('Refusing an ha:request without a requestId');
        return;
      }
      if (!isAllowedHaCall(msg.method, msg.path)) {
        log.warn(
          `Refusing ha:request ${String(msg.method)} ${String(msg.path)}: not one of the calls ` +
            'this add-on relays (a newer Stratorama may need a newer add-on)',
        );
        this.#send({
          type: 'ha:response',
          requestId: msg.requestId,
          status: 403,
          body: { error: 'call not relayed by this add-on' },
        });
        return;
      }
      const result = await callHaRest(msg.method, msg.path, msg.body);
      this.#send({ type: 'ha:response', requestId: msg.requestId, status: result.status, body: result.body });
      return;
    }

    log.warn(`Ignoring a relay message of unknown type ${String((msg as { type?: unknown }).type)}`);
  }

  #handleClose(ws: WebSocket, code: number, reason: string): void {
    if (this.#ws !== ws) return;
    this.#ws = null;
    this.#ready = false;
    this.#clearLiveness();
    if (this.#closed) return;

    this.#attempt += 1;
    let delay = Math.min(this.#opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS, 1000 * 2 ** (this.#attempt - 1));
    if (this.#reconnectAtOnce) {
      this.#reconnectAtOnce = false;
      this.#attempt = 0;
      delay = 0;
    } else if (code === 4029) {
      delay = this.#opts.blockedRetryMs ?? DEFAULT_BLOCKED_RETRY_MS;
      log.warn('The relay says this address has failed too many hellos recently and is refusing it for now');
    }
    log.warn(
      `Relay connection closed (code=${code} reason="${reason}"), reconnecting in ${describeDelay(delay)} ` +
        `(attempt ${this.#attempt})`,
    );
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, delay);
  }

  #giveUp(reason: string): void {
    if (this.#gaveUp) return;
    this.#gaveUp = true;
    log.error(reason);
    this.stop();
    this.#opts.onGiveUp(reason);
  }

  #clearLiveness(): void {
    if (this.#livenessTimer) {
      clearInterval(this.#livenessTimer);
      this.#livenessTimer = null;
    }
  }

  #clearTimers(): void {
    this.#clearLiveness();
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  #send(msg: AgentToServerMsg): void {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      log.warn(`Failed to send to the relay: ${(e as Error).message}`);
    }
  }
}

function describeDelay(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)} s`;
}
