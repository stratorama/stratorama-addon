import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reactToHelloError } from '../src/hello-errors.js';

const withCode = { pairingCodeConfigured: true };
const withoutCode = { pairingCodeConfigured: false };

test('a refused pairing code is terminal and says to generate a new one', () => {
  for (const code of ['invalid_code', 'code_used', 'code_expired']) {
    for (const ctx of [withCode, withoutCode]) {
      const reaction = reactToHelloError({ code, message: 'whatever the relay said' }, ctx);
      assert.equal(reaction.terminal, true, code);
      assert.equal(reaction.forgetCredential, false, code);
      assert.equal(reaction.retryNow, false, code);
      assert.match(reaction.line, /^Pairing refused: /, code);
      assert.match(reaction.line, /Generate a new pairing code in Stratorama/, code);
    }
  }
});

test('each pairing refusal names its own cause', () => {
  assert.match(reactToHelloError({ code: 'invalid_code', message: '' }, withCode).line, /does not know this pairing code/);
  assert.match(reactToHelloError({ code: 'code_used', message: '' }, withCode).line, /already been used/);
  assert.match(reactToHelloError({ code: 'code_expired', message: '' }, withCode).line, /expired/);
});

test('a revoked credential with no code to fall back on is forgotten, and terminal', () => {
  const reaction = reactToHelloError({ code: 'invalid_token', message: 'Token agent invalide' }, withoutCode);
  assert.equal(reaction.terminal, true);
  assert.equal(reaction.forgetCredential, true);
  assert.equal(reaction.retryNow, false);
  assert.match(reaction.line, /no longer accepts this add-on's credential/);
  assert.match(reaction.line, /Generate a new pairing code in Stratorama/);
});

test('a revoked credential with a code in the configuration is forgotten, and the code tried at once', () => {
  const reaction = reactToHelloError({ code: 'invalid_token', message: 'Token agent invalide' }, withCode);
  assert.equal(reaction.terminal, false);
  assert.equal(reaction.forgetCredential, true);
  assert.equal(reaction.retryNow, true);
  assert.match(reaction.line, /trying the pairing code from the configuration/);
});

test('a relay that sends no code gets the 1.0.0 behaviour: retry, forget the credential only when the text says token', () => {
  const token = reactToHelloError({ message: 'Token agent invalide' }, withoutCode);
  assert.deepEqual([token.terminal, token.forgetCredential, token.retryNow], [false, true, false]);
  assert.match(token.line, /Retrying/);

  const other = reactToHelloError({ message: 'Code expiré' }, withCode);
  assert.deepEqual([other.terminal, other.forgetCredential, other.retryNow], [false, false, false]);
  assert.match(other.line, /Code expiré/);
});

test('an unknown code is treated like no code, and a missing message does not print undefined', () => {
  const reaction = reactToHelloError({ code: 'something_new' }, withCode);
  assert.equal(reaction.terminal, false);
  assert.equal(reaction.forgetCredential, false);
  assert.match(reaction.line, /no reason given/);
  assert.doesNotMatch(reaction.line, /undefined/);
});
