import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_VERSION } from '../src/version.js';

// From dist-test/test/, two levels up is the add-on folder.
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const config = readFileSync(new URL('../../config.yaml', import.meta.url), 'utf8');
const configVersion = /^version:\s*"?([^"\s]+)"?\s*$/m.exec(config)?.[1];

test('the agent reports the version package.json carries', () => {
  assert.match(AGENT_VERSION, /^\d+\.\d+\.\d+/);
  assert.equal(AGENT_VERSION, pkg.version);
});

test('config.yaml, the version Home Assistant shows, carries the same version', () => {
  assert.equal(configVersion, pkg.version);
});
