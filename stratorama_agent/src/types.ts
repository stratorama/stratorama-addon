/**
 * Wire protocol - must stay in step with stratorama-tunnel/src/types.ts.
 * (One day this should be a shared package; for now it is duplicated by hand.)
 */

// Server -> Agent

export interface ServerHelloOk {
  type: 'agent:hello-ok';
  agentToken: string;
}

/**
 * Why the relay refused a hello. `message` is for a human reading the log; `code` is
 * what this add-on ACTS on (hello-errors.ts). Optional because a relay older than
 * September 2026 sends only the message.
 *
 *   invalid_code   no such pairing code, or one refused after too many attempts
 *   code_used      the code was already redeemed (a code works once)
 *   code_expired   the code is older than its 10-minute validity
 *   invalid_token  the stored credential is unknown or revoked
 */
export type HelloErrorCode = 'invalid_code' | 'code_used' | 'code_expired' | 'invalid_token';

export interface ServerHelloError {
  type: 'agent:hello-error';
  code?: HelloErrorCode;
  message: string;
}

export interface ServerHaRequest {
  type: 'ha:request';
  requestId: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

export type ServerToAgentMsg = ServerHelloOk | ServerHelloError | ServerHaRequest;

// Agent -> Server

export interface AgentHelloPair {
  type: 'agent:hello';
  mode: 'pair';
  pairingCode: string;
  /** This add-on's version (package.json), so the relay's journal can answer "which version?". */
  agentVersion: string;
}

export interface AgentHelloReconnect {
  type: 'agent:hello';
  mode: 'reconnect';
  agentToken: string;
  agentVersion: string;
}

export interface AgentHaResponse {
  type: 'ha:response';
  requestId: string;
  status: number;
  body: unknown;
}

export interface AgentHaEvent {
  type: 'ha:event';
  eventType: 'state_changed';
  data: {
    entity_id: string;
    new_state: unknown;
    old_state: unknown;
  };
}

export type AgentToServerMsg =
  | AgentHelloPair
  | AgentHelloReconnect
  | AgentHaResponse
  | AgentHaEvent;
