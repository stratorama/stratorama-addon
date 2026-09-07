import { readFileSync } from 'node:fs';

/**
 * The add-on's version, read from package.json at start-up: the first log line and every
 * hello carry it. package.json and config.yaml (the version Home Assistant shows) are
 * pinned equal by the test suite, so there is one version, not two.
 *
 * Two candidate locations, because the compiled file sits one level deeper under the
 * test build (dist-test/src/) than in the image (dist/).
 */
export const AGENT_VERSION: string = readVersion();

function readVersion(): string {
  for (const candidate of ['../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(new URL(candidate, import.meta.url), 'utf8')) as {
        name?: unknown;
        version?: unknown;
      };
      if (pkg.name === 'stratorama-agent' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      /* try the next location */
    }
  }
  return 'unknown';
}
