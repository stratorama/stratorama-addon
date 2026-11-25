import WebSocket from 'ws';
import type { HaEndpoints } from './config.js';
import { log } from './log.js';

/**
 * Communicates with the local Home Assistant instance. Two channels:
 *  - REST: for the calls the relay forwards (the entity snapshot, service calls)
 *  - WS:   to subscribe to `state_changed` and push the events upstream, and since 1.6.0 for the
 *          four registry reads the area map is made of (`request`, ha-area-map.ts)
 *
 * Where it points is config.ts's business: the Supervisor's proxy under Home Assistant OS
 * (`http://supervisor/core`, SUPERVISOR_TOKEN), HA_URL and a long-lived access token in the
 * Docker image. Nothing here reads the environment, so a test can hand it any instance.
 */

// ---------- REST proxy ----------

export interface HaRestResult {
  status: number;
  body: unknown;
}

export type HaRestCall = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<HaRestResult>;

/** Forward a request from the relay to Home Assistant over HTTP. Never rejects. */
export function haRestCaller(endpoints: Pick<HaEndpoints, 'httpUrl' | 'token'>): HaRestCall {
  return async (method, path, body) => {
    try {
      const res = await fetch(`${endpoints.httpUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${endpoints.token}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      // HA may return a non-JSON empty body on success - guard against a parse error.
      const text = await res.text();
      let parsed: unknown = text;
      if (text) {
        try { parsed = JSON.parse(text); } catch { /* keep as text */ }
      }
      return { status: res.status, body: parsed };
    } catch (e) {
      return { status: 502, body: { error: (e as Error).message } };
    }
  };
}

// ---------- WebSocket subscription to state_changed ----------

export type StateChangedHandler = (data: {
  entity_id: string;
  new_state: unknown;
  old_state: unknown;
}) => void;

export interface HaWsSubscriberOptions {
  endpoints: Pick<HaEndpoints, 'wsUrl' | 'token'>;
  /** Fires for each state change - wire it to forward to the relay. */
  onEvent: StateChangedHandler;
  /** True once subscribed to `state_changed`, false whenever the socket drops. */
  onReadyChange?: (ready: boolean) => void;
  /**
   * Home Assistant refused the token. Called once, after the subscriber has stopped for
   * good: retrying a token HA has rejected cannot succeed, and every attempt is a failed
   * login in HA's eyes - a notification for the owner each time, and an IP ban where
   * `login_attempts_threshold` is set.
   */
  onAuthRejected?: () => void;
  /** Test seam; the production ceiling is 30 s. */
  maxBackoffMs?: number;
}

/** After this many attempts that never reached `auth_ok`, say where the agent is knocking. */
const UNREACHABLE_HINT_AFTER = 3;

/** How long a read (`request`) may wait for Home Assistant's answer. */
const REQUEST_TIMEOUT_MS = 10_000;

interface PendingRead {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Maintains a long-lived WS connection to HA, authenticates, and subscribes to
 * `state_changed`. Reconnects automatically with exponential backoff, except after an
 * `auth_invalid`, which no retry can fix.
 */
export class HaWsSubscriber {
  readonly #opts: HaWsSubscriberOptions;
  #ws: WebSocket | null = null;
  #attempt = 0;
  #closed = false;
  #ready = false;
  #nextId = 1;
  #subscribeId: number | null = null;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #hintedUnreachable = false;
  /** Reads sent with `request`, by message id, until Home Assistant answers them. */
  readonly #pending = new Map<number, PendingRead>();

  constructor(opts: HaWsSubscriberOptions) {
    this.#opts = opts;
  }

  /**
   * One command over the open connection, resolved with its `result` (1.6.0, for the area map's
   * registry reads: ha-area-map.ts). Rejects when the connection is not up and subscribed, when Home
   * Assistant refuses the command, when the connection drops first, or after REQUEST_TIMEOUT_MS.
   * Which commands may be sent is the caller's to restrict (AREA_MAP_READS, ha-allowlist.ts).
   */
  request(type: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const ws = this.#ws;
    if (!this.#ready || !ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected to Home Assistant'));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`no answer to ${type} within ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ id, type }));
      } catch (e) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(e as Error);
      }
    });
  }

  start(): void {
    this.#closed = false;
    this.#connect();
  }

  stop(): void {
    this.#closed = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    const ws = this.#ws;
    this.#ws = null;
    this.#setReady(false);
    this.#failPending('the agent is stopping');
    ws?.close();
  }

  #failPending(why: string): void {
    for (const [id, read] of this.#pending) {
      clearTimeout(read.timer);
      this.#pending.delete(id);
      read.reject(new Error(why));
    }
  }

  #connect(): void {
    if (this.#closed) return;
    log.info(`Connecting to HA WS at ${this.#opts.endpoints.wsUrl}`);
    const ws = new WebSocket(this.#opts.endpoints.wsUrl);
    this.#ws = ws;

    ws.on('message', (raw) => this.#handleMessage(ws, raw.toString()));
    ws.on('close', () => this.#handleClose(ws));
    ws.on('error', (e) => {
      if (this.#ws === ws) log.warn(`HA WS error: ${e.message}`);
    });
  }

  #handleMessage(ws: WebSocket, raw: string): void {
    // A throw inside an event listener is an uncaught exception, and an uncaught
    // exception ends the process. Nothing Home Assistant sends may do that.
    try {
      if (this.#ws === ws) this.#dispatch(ws, raw);
    } catch (e) {
      log.warn(`Failed to handle a Home Assistant message: ${(e as Error).message}`);
    }
  }

  #dispatch(ws: WebSocket, raw: string): void {
    let msg: { type: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'auth_required') {
      ws.send(JSON.stringify({ type: 'auth', access_token: this.#opts.endpoints.token }));
      return;
    }

    if (msg.type === 'auth_ok') {
      log.info('HA WS authenticated, subscribing to state_changed');
      this.#subscribeId = this.#nextId++;
      ws.send(
        JSON.stringify({
          id: this.#subscribeId,
          type: 'subscribe_events',
          event_type: 'state_changed',
        }),
      );
      this.#attempt = 0;
      this.#hintedUnreachable = false;
      return;
    }

    if (msg.type === 'auth_invalid') {
      log.error(`Home Assistant rejected the access token: ${typeof msg['message'] === 'string' ? msg['message'] : 'no reason given'}`);
      this.stop();
      this.#opts.onAuthRejected?.();
      return;
    }

    const read = msg.type === 'result' && typeof msg['id'] === 'number' ? this.#pending.get(msg['id']) : undefined;
    if (read) {
      this.#pending.delete(msg['id'] as number);
      clearTimeout(read.timer);
      if (msg['success'] === true) {
        read.resolve(msg['result']);
      } else {
        const error = msg['error'] as { code?: unknown; message?: unknown } | undefined;
        read.reject(new Error(`Home Assistant refused it (${String(error?.code ?? 'no code')}: ${String(error?.message ?? 'no reason given')})`));
      }
      return;
    }

    if (msg.type === 'result' && msg['id'] === this.#subscribeId) {
      if (msg['success'] === true) {
        this.#setReady(true);
      } else {
        const error = msg['error'] as { message?: unknown } | undefined;
        log.warn(`Home Assistant refused the state_changed subscription: ${String(error?.message ?? 'no reason given')}`);
      }
      return;
    }

    if (msg.type === 'event') {
      const event = msg['event'] as
        | { event_type?: string; data?: { entity_id?: string; new_state?: unknown; old_state?: unknown } }
        | undefined;
      if (
        event?.event_type === 'state_changed' &&
        typeof event.data?.entity_id === 'string'
      ) {
        this.#opts.onEvent({
          entity_id: event.data.entity_id,
          new_state: event.data.new_state ?? null,
          old_state: event.data.old_state ?? null,
        });
      }
    }
  }

  #handleClose(ws: WebSocket): void {
    if (this.#ws !== ws) return;
    this.#ws = null;
    this.#subscribeId = null;
    this.#setReady(false);
    this.#failPending('the connection to Home Assistant dropped');
    if (this.#closed) return;
    this.#attempt += 1;
    if (this.#attempt >= UNREACHABLE_HINT_AFTER && !this.#hintedUnreachable) {
      this.#hintedUnreachable = true;
      log.warn(
        `Home Assistant has not answered at ${this.#opts.endpoints.wsUrl} after ${this.#attempt} attempts: ` +
          'check that this address is right and reachable from where the agent runs. Still retrying.',
      );
    }
    const delay = Math.min(this.#opts.maxBackoffMs ?? 30_000, 1000 * 2 ** (this.#attempt - 1));
    log.warn(`HA WS closed, reconnecting in ${delay}ms (attempt ${this.#attempt})`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, delay);
  }

  #setReady(ready: boolean): void {
    if (this.#ready === ready) return;
    this.#ready = ready;
    this.#opts.onReadyChange?.(ready);
  }
}
