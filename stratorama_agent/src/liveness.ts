/**
 * The relay pings every connected add-on every 30 s (stratorama-tunnel server.ts,
 * HEARTBEAT_MS) and terminates one that does not pong. This is the mirror image: a
 * socket that has carried NOTHING from the relay for three of those intervals is dead,
 * however open it still looks from here. Without it, a NAT that silently dropped the
 * mapping left the add-on "connected" indefinitely while nothing reached Home Assistant,
 * because a TCP connection nobody writes to never learns it is gone.
 */
export const RELAY_SILENCE_MS = 90_000;
export const LIVENESS_CHECK_MS = 15_000;

export class RelayLiveness {
  #lastFrameAt: number;

  constructor(
    readonly limitMs: number,
    readonly now: () => number = Date.now,
  ) {
    this.#lastFrameAt = now();
  }

  /** Any frame from the relay counts: a ping, a request, a hello answer. */
  touch(): void {
    this.#lastFrameAt = this.now();
  }

  silentFor(): number {
    return this.now() - this.#lastFrameAt;
  }

  isDead(): boolean {
    return this.silentFor() > this.limitMs;
  }
}
