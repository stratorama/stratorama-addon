import WebSocket from 'ws';
import { log } from './log.js';

/**
 * Communicates with the local Home Assistant instance via the
 * supervisor proxy. Two channels:
 *  - REST  → for proxied requests from the tunnel (states, services, …)
 *  - WS    → to subscribe to `state_changed` and forward events upstream
 *
 * URLs assume `homeassistant_api: true` in config.yaml, which makes
 * `http://supervisor/core` (and ws variant) reachable from inside the add-on.
 * Auth uses SUPERVISOR_TOKEN, auto-injected by HA.
 */

const HA_HTTP = 'http://supervisor/core';
const HA_WS = 'ws://supervisor/core/api/websocket';

const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;

if (!SUPERVISOR_TOKEN) {
  throw new Error(
    'SUPERVISOR_TOKEN missing. Make sure homeassistant_api: true is set in config.yaml',
  );
}

// ---------- REST proxy ----------

export interface HaRestResult {
  status: number;
  body: unknown;
}

/** Forward a request from the tunnel to local HA over HTTP. */
export async function callHaRest(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<HaRestResult> {
  try {
    const res = await fetch(`${HA_HTTP}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // HA may return a non-JSON empty body on success — guard against parse error.
    const text = await res.text();
    let parsed: unknown = text;
    if (text) {
      try { parsed = JSON.parse(text); } catch { /* keep as text */ }
    }
    return { status: res.status, body: parsed };
  } catch (e) {
    return { status: 502, body: { error: (e as Error).message } };
  }
}

// ---------- WebSocket subscription to state_changed ----------

export type StateChangedHandler = (data: {
  entity_id: string;
  new_state: unknown;
  old_state: unknown;
}) => void;

/**
 * Maintains a long-lived WS connection to HA, authenticates, and subscribes
 * to `state_changed`. Reconnects automatically with exponential backoff.
 *
 * The `onEvent` callback fires for each state change — wire it to forward
 * to the tunnel.
 */
export class HaWsSubscriber {
  #ws: WebSocket | null = null;
  #attempt = 0;
  #closed = false;
  #onEvent: StateChangedHandler;
  #nextId = 1;

  constructor(onEvent: StateChangedHandler) {
    this.#onEvent = onEvent;
  }

  start(): void {
    this.#closed = false;
    this.#connect();
  }

  stop(): void {
    this.#closed = true;
    this.#ws?.close();
    this.#ws = null;
  }

  #connect(): void {
    log.info(`Connecting to HA WS at ${HA_WS}`);
    const ws = new WebSocket(HA_WS);
    this.#ws = ws;

    ws.on('message', (raw) => this.#handleMessage(ws, raw.toString()));
    ws.on('close', () => this.#handleClose());
    ws.on('error', (e) => log.warn(`HA WS error: ${e.message}`));
  }

  #handleMessage(ws: WebSocket, raw: string): void {
    let msg: { type: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'auth_required') {
      ws.send(JSON.stringify({ type: 'auth', access_token: SUPERVISOR_TOKEN }));
      return;
    }

    if (msg.type === 'auth_ok') {
      log.info('HA WS authenticated, subscribing to state_changed');
      ws.send(
        JSON.stringify({
          id: this.#nextId++,
          type: 'subscribe_events',
          event_type: 'state_changed',
        }),
      );
      this.#attempt = 0;
      return;
    }

    if (msg.type === 'auth_invalid') {
      log.error('HA WS auth invalid — check SUPERVISOR_TOKEN');
      ws.close();
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
        this.#onEvent({
          entity_id: event.data.entity_id,
          new_state: event.data.new_state ?? null,
          old_state: event.data.old_state ?? null,
        });
      }
    }
  }

  #handleClose(): void {
    this.#ws = null;
    if (this.#closed) return;
    this.#attempt += 1;
    const delay = Math.min(30_000, 1000 * 2 ** (this.#attempt - 1));
    log.warn(`HA WS closed, reconnecting in ${delay}ms (attempt ${this.#attempt})`);
    setTimeout(() => {
      if (!this.#closed) this.#connect();
    }, delay);
  }
}
