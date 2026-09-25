import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Health } from '../src/health.js';

function recorder() {
  const writes: string[] = [];
  const health = new Health('/tmp/test.health', (_path, data) => writes.push(data));
  return { health, writes };
}

test('down from the start, ok only while both halves are live', () => {
  const { health, writes } = recorder();
  assert.deepEqual(writes, ['down\n']);
  health.relay(true);
  assert.equal(health.ok, false);
  health.ha(true);
  assert.equal(health.ok, true);
  health.ha(false);
  assert.equal(health.ok, false);
  assert.deepEqual(writes, ['down\n', 'ok\n', 'down\n']);
});

test('the file is written on a change of state only, not on every report', () => {
  const { health, writes } = recorder();
  health.relay(true);
  health.relay(true);
  health.ha(true);
  health.ha(true);
  health.relay(true);
  assert.deepEqual(writes, ['down\n', 'ok\n']);
});

test('after a give-up it stays down, whatever the halves report', () => {
  const { health, writes } = recorder();
  health.relay(true);
  health.ha(true);
  health.stopped();
  health.relay(true);
  health.ha(true);
  assert.equal(health.ok, false);
  assert.deepEqual(writes, ['down\n', 'ok\n', 'down\n']);
});

test('a file that cannot be written is survived, and retried at the next change', () => {
  let fail = true;
  const writes: string[] = [];
  const health = new Health('/nowhere/test.health', (_path, data) => {
    if (fail) throw new Error('EROFS: read-only file system');
    writes.push(data);
  });
  health.relay(true);
  fail = false;
  health.ha(true);
  assert.deepEqual(writes, ['ok\n']);
});
