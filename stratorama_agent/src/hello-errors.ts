import type { AgentRuntime } from './config.js';
import type { HelloErrorCode } from './types.js';

/**
 * What the agent does about a refused hello, decided from the relay's `code` and not from
 * the wording of its message. Until 1.0.0 the decision was `message.includes('token')`
 * against a French string owned by another repository.
 */
export interface HelloErrorReaction {
  /**
   * Nothing this agent can do on its own will make the next attempt succeed: stop and say
   * so, rather than knock on the relay once a minute until someone notices.
   */
  terminal: boolean;
  /** The stored credential is no good; delete it so the next start does not present it again. */
  forgetCredential: boolean;
  /** Reconnect at once instead of after the backoff (a credential just forgotten, with a code to try). */
  retryNow: boolean;
  /** The line for the log: what happened and what the owner should do. */
  line: string;
}

const GENERATE =
  'in Stratorama (Settings > Home Assistant > Connection > Generate pairing code)';

/**
 * Where a pairing code goes, which is the one thing that differs between the two ways this
 * agent runs: the add-on's Configuration tab, or the container's environment. A container
 * reads its environment once, at creation, so the Docker wording says RECREATE - a plain
 * `docker restart` would present the old code again.
 */
export function newCodeInstruction(runtime: AgentRuntime): string {
  return runtime === 'docker'
    ? `Generate a new pairing code ${GENERATE}, set it as PAIRING_CODE in the container's ` +
        'environment, then recreate the container (docker compose up -d).'
    : `Generate a new pairing code ${GENERATE}, paste it into the app's Pairing code option, ` +
        'save, then start the app again.';
}

/** First start with neither a stored credential nor a code. */
export function noCredentialLine(runtime: AgentRuntime): string {
  return runtime === 'docker'
    ? `No stored credential and no PAIRING_CODE in the environment. Generate a pairing code ${GENERATE}, ` +
        'set it as PAIRING_CODE, then recreate the container (docker compose up -d).'
    : `No stored credential and no pairing code in the configuration. Generate a pairing code ${GENERATE}, ` +
        "paste it into the app's Pairing code option, save, then start the app again.";
}

const CREDENTIAL_REFUSED =
  "The relay no longer accepts this agent's credential (Disconnect was pressed in " +
  'Stratorama, or another Home Assistant was paired to this home).';

export function reactToHelloError(
  refusal: { code?: string; message?: unknown },
  ctx: { pairingCodeConfigured: boolean; runtime: AgentRuntime },
): HelloErrorReaction {
  const message = typeof refusal.message === 'string' && refusal.message ? refusal.message : 'no reason given';
  const newCode = newCodeInstruction(ctx.runtime);
  switch (refusal.code as HelloErrorCode | undefined) {
    case 'invalid_code':
      return {
        terminal: true,
        forgetCredential: false,
        retryNow: false,
        line:
          'Pairing refused: the relay does not know this pairing code (mistyped, or refused ' +
          `after too many attempts). ${newCode}`,
      };
    case 'code_used':
      return {
        terminal: true,
        forgetCredential: false,
        retryNow: false,
        line: `Pairing refused: this pairing code has already been used, and a code works once. ${newCode}`,
      };
    case 'code_expired':
      return {
        terminal: true,
        forgetCredential: false,
        retryNow: false,
        line: `Pairing refused: this pairing code has expired (a code is valid for 10 minutes). ${newCode}`,
      };
    case 'invalid_token':
      if (ctx.pairingCodeConfigured) {
        // The owner may already have set a fresh code and restarted: the stored
        // credential was presented first because it existed. Forget it and let the
        // next connection pair, so re-pairing costs one restart, not two. If that
        // code is stale too, its own refusal is terminal.
        return {
          terminal: false,
          forgetCredential: true,
          retryNow: true,
          line:
            `${CREDENTIAL_REFUSED} Forgetting it and trying the pairing code from ` +
            `${ctx.runtime === 'docker' ? 'PAIRING_CODE' : 'the configuration'}.`,
        };
      }
      return {
        terminal: true,
        forgetCredential: true,
        retryNow: false,
        line: `${CREDENTIAL_REFUSED} ${newCode}`,
      };
    default:
      // A relay older than this agent sends no code. Keep the 1.0.0 behaviour for it:
      // forget the credential when the text mentions a token, retry with backoff.
      return {
        terminal: false,
        forgetCredential: /token/i.test(message),
        retryNow: false,
        line: `The relay refused this agent: ${message}. Retrying.`,
      };
  }
}
