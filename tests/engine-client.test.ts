import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { EngineClient } from '../src/main/engine-client';

const peer = path.resolve('tests/helpers/protocol-peer.cjs');

for (const mode of ['ready', 'fragmented']) {
  test(`connects to a ${mode} peer and restarts without an orphan`, async () => {
    const client = new EngineClient(process.execPath, [peer, mode]);
    try {
      const status = await client.getStatus();
      assert.equal(status.state, 'ready');
      const [first, second] = await Promise.all([client.restart(), client.restart()]);
      assert.equal(first.state, 'ready');
      assert.deepEqual(second, first);
    } finally {
      await client.stop();
    }
  });
}

for (const [mode, code] of [
  ['mismatch', 'PROTOCOL_MISMATCH'],
  ['wrong-id', 'INVALID_RESPONSE'],
  ['invalid', 'INVALID_RESPONSE'],
  ['oversized', 'INVALID_RESPONSE'],
  ['exit', 'ENGINE_EXITED'],
  ['timeout', 'TIMEOUT'],
] as const) {
  test(`reports ${mode} without losing the original failure`, async () => {
    const client = new EngineClient(process.execPath, [peer, mode], 500);
    try {
      const status = await client.getStatus();
      assert.equal(status.state, 'error');
      if (status.state === 'error') assert.equal(status.code, code);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.deepEqual(await client.getStatus(), status);
    } finally {
      await client.stop();
    }
  });
}

test('reports a missing executable with installation guidance', async () => {
  const client = new EngineClient(path.resolve('.cache/missing-helper.exe'));
  try {
    assert.deepEqual(await client.getStatus(), {
      state: 'error',
      code: 'MISSING_HELPER',
      message: 'The Windows helper is missing. Build or reinstall LEU.',
    });
  } finally {
    await client.stop();
  }
});

test('invalidates ready status when the helper crashes', async () => {
  const statuses: string[] = [];
  const client = new EngineClient(process.execPath, [peer, 'crash-later'], 5000, (status) =>
    statuses.push(status.state),
  );
  try {
    assert.equal((await client.getStatus()).state, 'ready');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const status = await client.getStatus();
    assert.equal(status.state, 'error');
    if (status.state === 'error') assert.equal(status.code, 'ENGINE_EXITED');
    assert.deepEqual(statuses, ['ready', 'error']);
  } finally {
    await client.stop();
  }
});
