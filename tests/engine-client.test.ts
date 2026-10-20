import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { EngineClient, EngineError } from '../src/main/engine-client';

const peer = path.resolve('tests/helpers/protocol-peer.cjs');

function rejectsWith(promise: Promise<unknown>, code: string) {
  return assert.rejects(promise, (error) => error instanceof EngineError && error.code === code);
}

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
      await rejectsWith(client.request('engine.version', {}), code);
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

test('matches concurrent responses that arrive out of order in one chunk', async () => {
  const client = new EngineClient(process.execPath, [peer, 'reverse']);
  try {
    const results = await Promise.all([
      client.request('engine.version', {}),
      client.request('engine.version', {}),
      client.request('engine.version', {}),
    ]);
    for (const result of results) assert.equal(result.engineVersion, '0.1.0');
    assert.equal((await client.getStatus()).state, 'ready');
  } finally {
    await client.stop();
  }
});

test('serves sequential requests on one connection', async () => {
  const client = new EngineClient(process.execPath, [peer, 'ready']);
  try {
    for (let index = 0; index < 5; index += 1)
      assert.equal((await client.request('engine.version', {})).arch, 'x86_64');
  } finally {
    await client.stop();
  }
});

test('rejects only the request that received an error response', async () => {
  const client = new EngineClient(process.execPath, [peer, 'reject-second']);
  try {
    await rejectsWith(client.request('engine.version', {}), 'UNKNOWN_METHOD');
    assert.equal((await client.getStatus()).state, 'ready');
    assert.equal((await client.request('engine.version', {})).platform, 'windows');
  } finally {
    await client.stop();
  }
});

test('ends the connection when a request misses its deadline', async () => {
  const client = new EngineClient(process.execPath, [peer, 'stall-second']);
  try {
    assert.equal((await client.getStatus()).state, 'ready');
    await rejectsWith(client.request('engine.version', {}, 100), 'TIMEOUT');
    const status = await client.getStatus();
    assert.equal(status.state === 'error' && status.code, 'TIMEOUT');
  } finally {
    await client.stop();
  }
});

test('rejects pending requests when the helper exits', async () => {
  const client = new EngineClient(process.execPath, [peer, 'exit-second']);
  try {
    assert.equal((await client.getStatus()).state, 'ready');
    await rejectsWith(client.request('engine.version', {}), 'ENGINE_EXITED');
  } finally {
    await client.stop();
  }
});

test('rejects pending requests when the client stops', async () => {
  const client = new EngineClient(process.execPath, [peer, 'stall-second']);
  assert.equal((await client.getStatus()).state, 'ready');
  const pending = rejectsWith(client.request('engine.version', {}), 'ENGINE_EXITED');
  // Let the request reach the helper so it is in flight, not merely queued behind the handshake.
  await new Promise((resolve) => setTimeout(resolve, 30));
  await client.stop();
  await pending;
});

for (const [mode, description] of [
  ['bad-result', 'a result outside the method contract'],
  ['unsolicited', 'a response to a request it never received'],
] as const) {
  test(`ends the connection on ${description}`, async () => {
    const client = new EngineClient(process.execPath, [peer, mode]);
    try {
      assert.equal((await client.getStatus()).state, 'ready');
      if (mode === 'bad-result')
        await rejectsWith(client.request('engine.version', {}), 'INVALID_RESPONSE');
      else await new Promise((resolve) => setTimeout(resolve, 100));
      const status = await client.getStatus();
      assert.equal(status.state === 'error' && status.code, 'INVALID_RESPONSE');
    } finally {
      await client.stop();
    }
  });
}
