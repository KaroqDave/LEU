import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from './fixtures/version-request.json';
import {
  isEngineMethod,
  isEngineRequest,
  isEngineResponse,
  isEngineResult,
} from '../src/contracts/protocol';

test('accepts the request fixture shared with the Rust engine', () => {
  assert.equal(isEngineRequest(fixture), true);
});
test('rejects extra request fields, command parameters, and unknown methods', () => {
  assert.equal(isEngineRequest({ ...fixture, executable: 'whoami' }), false);
  assert.equal(isEngineRequest({ ...fixture, params: { command: 'whoami' } }), false);
  assert.equal(isEngineRequest({ ...fixture, params: [] }), false);
  assert.equal(isEngineRequest({ ...fixture, id: '' }), false);
  assert.equal(isEngineRequest({ ...fixture, method: 'delete.everything' }), false);
  assert.equal(isEngineMethod('toString'), false);
});
test('validates the response envelope separately from method results', () => {
  const result = { engineVersion: '0.1.0', platform: 'windows', arch: 'x86_64' };
  const response = { protocolVersion: 1, id: fixture.id, ok: true, result };
  assert.equal(isEngineResponse(response), true);
  assert.equal(isEngineResponse({ ...response, result: [] }), false);
  assert.equal(isEngineResponse({ ...response, extra: true }), false);
  assert.equal(isEngineResult('engine.version', result), true);
  assert.equal(isEngineResult('engine.version', { ...result, arch: 64 }), false);
  assert.equal(
    isEngineResult('engine.version', { ...result, engineVersion: 'a'.repeat(65) }),
    false,
  );
});
test('accepts each engine error code and rejects unknown ones', () => {
  const failure = (code: string) => ({
    protocolVersion: 1,
    id: null,
    ok: false,
    error: { code, message: 'Failure.' },
  });
  for (const code of [
    'INVALID_REQUEST',
    'PROTOCOL_MISMATCH',
    'UNKNOWN_METHOD',
    'FRAME_TOO_LARGE',
    'RESPONSE_TOO_LARGE',
  ])
    assert.equal(isEngineResponse(failure(code)), true, code);
  assert.equal(isEngineResponse(failure('SOMETHING_ELSE')), false);
});

test('keeps response IDs required and nullable only on failures', () => {
  const failure = {
    protocolVersion: 1,
    id: null,
    ok: false,
    error: { code: 'INVALID_REQUEST', message: 'Invalid request.' },
  };
  assert.equal(isEngineResponse(failure), true);
  assert.equal(isEngineResponse({ ...failure, id: fixture.id }), true);
  const { id: _id, ...withoutId } = failure;
  assert.equal(isEngineResponse(withoutId), false);
  assert.equal(isEngineResponse({ ...failure, extra: true }), false);
  assert.equal(isEngineResponse({ ...failure, ok: true }), false);
  assert.equal(isEngineResponse({ ...failure, error: { ...failure.error, extra: true } }), false);
  assert.equal(isEngineResponse({ protocolVersion: 1, id: null, ok: true, result: {} }), false);
});
