import { writeFileSync } from 'node:fs';
import { log } from './log.js';

/**
 * The agent's health, as one word in a file, for Docker's HEALTHCHECK
 * (Dockerfile.standalone: `grep -qx ok`). `docker ps` then says "healthy" or "unhealthy"
 * next to a container that is up either way - the only signal an owner has without reading
 * the logs, because a Docker agent that must not retry stays up rather than exit (index.ts).
 *
 * Healthy means BOTH halves are live: registered with the relay AND subscribed to Home
 * Assistant. Either one alone is an agent that carries nothing useful.
 *
 * Written on every change of state and never in between, so it costs nothing per event.
 * Harmless under Home Assistant OS, where nobody reads it.
 */
export const HEALTH_FILE = '/tmp/stratorama-agent.health';

export class Health {
  #relay = false;
  #ha = false;
  #stopped = false;
  #written: string | null = null;
  #warned = false;

  constructor(
    readonly file: string = HEALTH_FILE,
    readonly write: (path: string, data: string) => void = (path, data) => writeFileSync(path, data),
  ) {
    this.#flush();
  }

  get ok(): boolean {
    return !this.#stopped && this.#relay && this.#ha;
  }

  relay(ready: boolean): void {
    this.#relay = ready;
    this.#flush();
  }

  ha(ready: boolean): void {
    this.#ha = ready;
    this.#flush();
  }

  /** Gave up: unhealthy for good, whatever the halves say afterwards. */
  stopped(): void {
    this.#stopped = true;
    this.#flush();
  }

  #flush(): void {
    const word = this.ok ? 'ok\n' : 'down\n';
    if (word === this.#written) return;
    try {
      this.write(this.file, word);
      this.#written = word;
    } catch (e) {
      if (!this.#warned) {
        this.#warned = true;
        log.warn(`Could not write the health file ${this.file}: ${(e as Error).message}`);
      }
    }
  }
}
