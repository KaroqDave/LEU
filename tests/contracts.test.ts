import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from './fixtures/version-request.json';
import { isEngineRequest, isEngineResponse } from '../src/contracts/protocol';

test('accepts the request fixture shared with the Rust engine', () => {
  assert.equal(isEngineRequest(fixture), true);
});
test('rejects extra request fields and command parameters', () => {
  assert.equal(isEngineRequest({ ...fixture, executable: 'whoami' }), false);
  assert.equal(isEngineRequest({ ...fixture, params: { command: 'whoami' } }), false);
  assert.equal(isEngineRequest({ ...fixture, id: '' }), false);
});
test('rejects malformed or oversized response metadata', () => {
  const response = {
    protocolVersion: 1,
    id: fixture.id,
    ok: true,
    result: { engineVersion: '0.1.0', platform: 'windows', arch: 'x86_64' },
  };
  assert.equal(isEngineResponse(response), true);
  assert.equal(isEngineResponse({ ...response, result: { ...response.result, arch: 64 } }), false);
  assert.equal(
    isEngineResponse({
      ...response,
      result: { ...response.result, engineVersion: 'a'.repeat(65) },
    }),
    false,
  );
});
