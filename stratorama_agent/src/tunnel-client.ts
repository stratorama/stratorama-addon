import WebSocket from 'ws';
import { log } from './log.js';
import { callHaRest } from './ha-client.js';
import { loadToken, saveToken, clearToken } from './token-store.js';
import type {
  AgentToServerMsg,
  ServerToAgentMsg,
} from './types.js';

/**
 * Maintains a long-lived WebSocket connection to the tunnel-server,
 * authenticates (pair → token, then reconnect), and routes incoming
 * `ha:request` messages to the local HA REST API.
 *
 * `state_changed` events are pushed back via `pushEvent()`, called
 * from the HA WS subscriber.
 */

interface Options {
  tunnelUrl: string;
  /** Pairing code from add-on config — only used the very first time. */
  pairingCode: string | null;
}

export class TunnelClient {
  #opts: Options;
  #ws: WebSocket | null = null;
  #attempt = 0;
  #closed = false;
  #ready = false;

  constructor(opts: Options) {
    this.#opts = opts;
  }

  async start(): Promise<void> {
    this.#closed = false;
    await this.#connect();
  }

  stop(): void {
    this.#closed = true;
    this.#ws?.close();
    this.#ws = null;
  }

  /** Forward a state_changed event to the tunnel. No-op if not connected. */
  pushEvent(data: { entity_id: string; new_state: unknown; old_state: unknown }): void {
    if (!this.#ready || !this.#ws) return;
    this.#send({ type: 'ha:event', eventType: 'state_changed', data });
  }

  // ---------- internals ----------

  #wsUrl(): string {
    const trimmed = this.#opts.tunnelUrl.replace(/\/+$/, '');
    return trimmed.endsWith('/agent') ? trimmed : trimmed + '/agent';
  }

  async #connect(): Promise<void> {
    const url = this.#wsUrl();
    log.info(`Connecting to tunnel at ${url}`);
    const ws = new WebSocket(url);
    this.#ws = ws;
    this.#ready = false;

    ws.on('open', async () => {
      const stored = await loadToken();
      if (stored) {
        log.info('Reconnecting with stored agent token');
        this.#send({ type: 'agent:hello', mode: 'reconnect', agentToken: stored });
      } else if (this.#opts.pairingCode) {
        log.info('Pairing with pairing code');
        this.#send({
          type: 'agent:hello',
          mode: 'pair',
          pairingCode: this.#opts.pairingCode,
        });
      } else {
        log.error(
          'No stored token and no pairing_code in config — cannot register. ' +
            'Set the pairing_code in the add-on configuration.',
        );
        ws.close();
      }
    });

    ws.on('message', (raw) => this.#handleMessage(raw.toString()));
    ws.on('close', (code, reason) => this.#handleClose(code, reason.toString()));
    ws.on('error', (e) => log.warn(`Tunnel WS error: ${e.message}`));
  }

  async #handleMessage(raw: string): Promise<void> {
    let msg: ServerToAgentMsg;
    try {
      msg = JSON.parse(raw) as ServerToAgentMsg;
    } catch {
      log.warn('Invalid message from tunnel (not JSON), ignoring');
      return;
    }

    if (msg.type === 'agent:hello-ok') {
      log.info('✅ Registered with tunnel');
      await saveToken(msg.agentToken);
      this.#ready = true;
      this.#attempt = 0;
      return;
    }

    if (msg.type === 'agent:hello-error') {
      log.error(`Tunnel rejected hello: ${msg.message}`);
      // If the token is stale (e.g., user re-paired from another device),
      // wipe it so the next start uses pairing_code instead.
      if (msg.message.toLowerCase().includes('token')) {
        await clearToken();
      }
      // Don't trigger an immediate reconnect — the close handler will.
      this.#ws?.close();
      return;
    }

    if (msg.type === 'ha:request') {
      // Defense in depth: `JSON.parse(...) as ServerToAgentMsg` above is a TS
      // cast, not runtime validation. Refuse anything outside the narrow
      // contract before forwarding to the local HA API.
      if (typeof msg.requestId !== 'string') {
        log.warn('Refusing ha:request without valid requestId');
        return;
      }
      if (msg.method !== 'GET' && msg.method !== 'POST') {
        log.warn(`Refusing ha:request with method=${String(msg.method)}`);
        this.#send({
          type: 'ha:response',
          requestId: msg.requestId,
          status: 405,
          body: { error: 'method not allowed' },
        });
        return;
      }
      if (
        typeof msg.path !== 'string' ||
        !msg.path.startsWith('/api/') ||
        msg.path.includes('..')
      ) {
        log.warn('Refusing ha:request with invalid path');
        this.#send({
          type: 'ha:response',
          requestId: msg.requestId,
          status: 403,
          body: { error: 'path not allowed' },
        });
        return;
      }
      const result = await callHaRest(msg.method, msg.path, msg.body);
      this.#send({
        type: 'ha:response',
        requestId: msg.requestId,
        status: result.status,
        body: result.body,
      });
      return;
    }
  }

  #handleClose(code: number, reason: string): void {
    this.#ws = null;
    this.#ready = false;
    if (this.#closed) return;
    this.#attempt += 1;
    const delay = Math.min(60_000, 1000 * 2 ** (this.#attempt - 1));
    log.warn(
      `Tunnel WS closed (code=${code} reason="${reason}"), reconnecting in ${delay}ms ` +
        `(attempt ${this.#attempt})`,
    );
    setTimeout(() => {
      if (!this.#closed) void this.#connect();
    }, delay);
  }

  #send(msg: AgentToServerMsg): void {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return;
    this.#ws.send(JSON.stringify(msg));
  }
}
