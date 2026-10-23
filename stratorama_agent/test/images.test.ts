import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// From dist-test/test/, two levels up is the add-on folder.
const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const addon = read('Dockerfile');
const standalone = read('Dockerfile.standalone');
const buildYaml = read('build.yaml');

const nodeImage = (dockerfile: string) => /^ARG NODE_IMAGE=(\S+)\s*$/m.exec(dockerfile)?.[1];
const pinned = /^node:(\d+)\.(\d+)\.(\d+)-alpine(\d+\.\d+)$/;

test('both images pin the same Node release, on a named Alpine branch', () => {
  assert.match(nodeImage(addon) ?? '', pinned);
  assert.equal(nodeImage(standalone), nodeImage(addon));
});

test('the pinned Node is not older than the 2026-10-20 security release', () => {
  const [major = 0, minor = 0, patch = 0] = (pinned.exec(nodeImage(addon) ?? '') ?? []).slice(1, 4).map(Number);
  assert.ok(major * 1e6 + minor * 1e3 + patch >= 22_023_004, `${nodeImage(addon)} is below 22.23.4`);
});

test("the add-on's Home Assistant base is the Alpine branch its Node binary was built for", () => {
  const alpine = pinned.exec(nodeImage(addon) ?? '')?.[4];
  const bases = [
    ...buildYaml.matchAll(/^\s+\w+:\s*ghcr\.io\/home-assistant\/\w+-base:(\S+)\s*$/gm),
    ...addon.matchAll(/^ARG BUILD_FROM=ghcr\.io\/home-assistant\/\w+-base:(\S+)\s*$/gm),
  ].map((m) => m[1]);
  assert.equal(bases.length, 3);
  for (const base of bases) assert.equal(base, alpine);
});

test("neither image takes Node from Alpine's packages", () => {
  // Instructions only: comments dropped, continuation lines joined.
  const instructions = (dockerfile: string) => dockerfile.replace(/^\s*#.*$/gm, '').replace(/\\\r?\n/g, ' ');
  for (const dockerfile of [addon, standalone]) {
    assert.doesNotMatch(instructions(dockerfile), /apk add[^\n]*\bnodejs\b/);
  }
});
