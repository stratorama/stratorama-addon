import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCodeInstruction, noCredentialLine, reactToHelloError } from '../src/hello-errors.js';

const withCode = { pairingCodeConfigured: true, runtime: 'addon' as const };
const withoutCode = { pairingCodeConfigured: false, runtime: 'addon' as const };

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
  assert.match(reaction.line, /no longer accepts this agent's credential/);
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

test('the Docker wording says where the code goes in a container, and never says add-on', () => {
  const docker = { pairingCodeConfigured: false, runtime: 'docker' as const };
  for (const code of ['invalid_code', 'code_used', 'code_expired', 'invalid_token']) {
    const line = reactToHelloError({ code, message: '' }, docker).line;
    assert.match(line, /Generate a new pairing code in Stratorama/, code);
    assert.match(line, /set it as PAIRING_CODE in the container's environment/, code);
    assert.match(line, /recreate the container \(docker compose up -d\)/, code);
    assert.doesNotMatch(line, /add-on/, code);
  }
  const revoked = reactToHelloError({ code: 'invalid_token', message: '' }, { ...docker, pairingCodeConfigured: true });
  assert.match(revoked.line, /no longer accepts this agent's credential/);
  assert.match(revoked.line, /trying the pairing code from PAIRING_CODE/);
});

test('the first-start line names the setting for each runtime', () => {
  assert.match(noCredentialLine('addon'), /paste it into the app's Pairing code option/);
  assert.match(noCredentialLine('docker'), /no PAIRING_CODE in the environment/);
  assert.match(noCredentialLine('docker'), /docker compose up -d/);
  assert.match(newCodeInstruction('addon'), /start the app again/);
});
