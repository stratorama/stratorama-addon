import type { HelloErrorCode } from './types.js';

/**
 * What the add-on does about a refused hello, decided from the relay's `code` and not
 * from the wording of its message. Until 1.0.0 the decision was
 * `message.includes('token')` against a French string owned by another repository.
 */
export interface HelloErrorReaction {
  /**
   * Nothing this add-on can do on its own will make the next attempt succeed: stop and
   * say so, rather than knock on the relay once a minute until someone notices.
   */
  terminal: boolean;
  /** The stored credential is no good; delete it so the next start does not present it again. */
  forgetCredential: boolean;
  /** Reconnect at once instead of after the backoff (a credential just forgotten, with a code to try). */
  retryNow: boolean;
  /** The line for the add-on log: what happened and what the owner should do. */
  line: string;
}

const NEW_CODE =
  'Generate a new pairing code in Stratorama (Settings > Home Assistant > Connection > ' +
  "Generate pairing code), paste it into the add-on's Pairing code option, save, then start " +
  'the add-on again.';

const CREDENTIAL_REFUSED =
  "The relay no longer accepts this add-on's credential (Disconnect was pressed in " +
  'Stratorama, or another Home Assistant was paired to this home).';

export function reactToHelloError(
  refusal: { code?: string; message?: unknown },
  ctx: { pairingCodeConfigured: boolean },
): HelloErrorReaction {
  const message = typeof refusal.message === 'string' && refusal.message ? refusal.message : 'no reason given';
  switch (refusal.code as HelloErrorCode | undefined) {
    case 'invalid_code':
      return {
        terminal: true,
        forgetCredential: false,
        retryNow: false,
        line:
          'Pairing refused: the relay does not know this pairing code (mistyped, or refused ' +
          `after too many attempts). ${NEW_CODE}`,
      };
    case 'code_used':
      return {
        terminal: true,
        forgetCredential: false,
        retryNow: false,
        line: `Pairing refused: this pairing code has already been used, and a code works once. ${NEW_CODE}`,
      };
    case 'code_expired':
      return {
        terminal: true,
        forgetCredential: false,
        retryNow: false,
        line: `Pairing refused: this pairing code has expired (a code is valid for 10 minutes). ${NEW_CODE}`,
      };
    case 'invalid_token':
      if (ctx.pairingCodeConfigured) {
        // The owner may already have pasted a fresh code and restarted: the stored
        // credential was presented first because it existed. Forget it and let the
        // next connection pair, so re-pairing costs one restart, not two. If that
        // code is stale too, its own refusal is terminal.
        return {
          terminal: false,
          forgetCredential: true,
          retryNow: true,
          line: `${CREDENTIAL_REFUSED} Forgetting it and trying the pairing code from the configuration.`,
        };
      }
      return {
        terminal: true,
        forgetCredential: true,
        retryNow: false,
        line: `${CREDENTIAL_REFUSED} ${NEW_CODE}`,
      };
    default:
      // A relay older than this add-on sends no code. Keep the 1.0.0 behaviour for it:
      // forget the credential when the text mentions a token, retry with backoff.
      return {
        terminal: false,
        forgetCredential: /token/i.test(message),
        retryNow: false,
        line: `The relay refused this add-on: ${message}. Retrying.`,
      };
  }
}
