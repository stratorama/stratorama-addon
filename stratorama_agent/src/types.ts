/**
 * Wire protocol — must stay in sync with tunnel-server/src/types.ts.
 * (One day this should be a shared package; for now we duplicate.)
 */

// Server → Agent

export interface ServerHelloOk {
  type: 'agent:hello-ok';
  agentToken: string;
}

export interface ServerHelloError {
  type: 'agent:hello-error';
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

// Agent → Server

export interface AgentHelloPair {
  type: 'agent:hello';
  mode: 'pair';
  pairingCode: string;
}

export interface AgentHelloReconnect {
  type: 'agent:hello';
  mode: 'reconnect';
  agentToken: string;
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
