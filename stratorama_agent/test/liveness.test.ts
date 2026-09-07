import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVENESS_CHECK_MS, RELAY_SILENCE_MS, RelayLiveness } from '../src/liveness.js';

test('the limit is three relay heartbeats, checked more often than one', () => {
  assert.equal(RELAY_SILENCE_MS, 3 * 30_000);
  assert.ok(LIVENESS_CHECK_MS < 30_000);
});

test('a socket is dead once nothing has arrived for longer than the limit', () => {
  let now = 1_000;
  const liveness = new RelayLiveness(90_000, () => now);

  now += 89_999;
  assert.equal(liveness.isDead(), false);
  now += 2;
  assert.equal(liveness.isDead(), true);
  assert.equal(liveness.silentFor(), 90_001);
});

test('any frame resets the clock', () => {
  let now = 0;
  const liveness = new RelayLiveness(1_000, () => now);

  now = 900;
  liveness.touch();
  now = 1_800;
  assert.equal(liveness.isDead(), false);
  now = 1_901;
  assert.equal(liveness.isDead(), true);
});
