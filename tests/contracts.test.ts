import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from './fixtures/version-request.json';
import { getDemoInventory } from '../src/main/fixtures';
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

test('validates inventory records, null metadata, partial issues, and closed read-only parameters', () => {
  const { source: _source, ...inventory } = getDemoInventory();
  assert.equal(isEngineRequest({ ...fixture, method: 'inventory.list', params: {} }), true);
  assert.equal(
    isEngineRequest({ ...fixture, method: 'inventory.list', params: { path: 'C:\\' } }),
    false,
  );
  assert.equal(isEngineResult('inventory.list', inventory), true);
  const program = inventory.programs[0]!;
  const nullable = {
    ...program,
    publisher: null,
    version: null,
    installLocation: null,
    reportedInstallDate: null,
    reportedSizeBytes: null,
  };
  assert.equal(isEngineResult('inventory.list', { ...inventory, programs: [nullable] }), true);
  assert.equal(
    isEngineResult('inventory.list', {
      ...inventory,
      status: 'partial',
      issues: [{ source: program.source, code: 'ACCESS_DENIED', message: 'Fixture.' }],
    }),
    true,
  );
  assert.equal(
    isEngineResult('inventory.list', {
      ...inventory,
      programs: [{ ...program, scope: 'administrator' }],
    }),
    false,
  );
  assert.equal(
    isEngineResult('inventory.list', {
      ...inventory,
      programs: [{ ...program, reportedSizeBytes: -1 }],
    }),
    false,
  );
  assert.equal(
    isEngineResult('inventory.list', {
      ...inventory,
      programs: [{ ...program, reportedSizeBytes: 2 ** 53 }],
    }),
    false,
  );
  assert.equal(
    isEngineResult('inventory.list', {
      ...inventory,
      programs: [{ ...program, source: { ...program.source, view: 'arm' } }],
    }),
    false,
  );
});

test('accepts icon requests by program id only and engine-sized PNG results', () => {
  const request = { ...fixture, method: 'inventory.icon', params: { programId: 'registry:x' } };
  assert.equal(isEngineRequest(request), true);
  for (const params of [{}, { programId: '' }, { programId: 'x', path: 'C:\\app.exe' }])
    assert.equal(isEngineRequest({ ...request, params }), false, JSON.stringify(params));
  const png = 'A'.repeat(22_024);
  assert.equal(isEngineResult('inventory.icon', { status: 'found', png }), true);
  for (const result of [
    { status: 'found', png: png.slice(1) },
    { status: 'found', png: `${png.slice(1)}"` },
    { status: 'found', png, reason: 'NO_ICON' },
    { status: 'missing', reason: 'NOT_A_REASON' },
    { status: 'missing' },
  ])
    assert.equal(isEngineResult('inventory.icon', result), false, JSON.stringify(result));
  for (const reason of ['UNKNOWN_PROGRAM', 'NO_ICON', 'UNSUPPORTED_LOCATION', 'READ_FAILED'])
    assert.equal(isEngineResult('inventory.icon', { status: 'missing', reason }), true, reason);
});
