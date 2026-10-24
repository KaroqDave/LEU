import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EngineResult } from '../src/contracts/protocol';
import { IconLoader } from '../src/main/icons';

type Result = EngineResult<'inventory.icon'>;
const found = (png: string): Result => ({ status: 'found', png });
const missing: Result = { status: 'missing', reason: 'NO_ICON' };

test('loads icons one at a time and returns PNG data URLs', async () => {
  let active = 0;
  let peak = 0;
  const order: string[] = [];
  const loader = new IconLoader(async (programId) => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(programId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return programId === 'none' ? missing : found(programId);
  });
  const icons = await Promise.all(['a', 'none', 'b'].map((id) => loader.get(id)));
  assert.deepEqual(icons, ['data:image/png;base64,a', null, 'data:image/png;base64,b']);
  assert.deepEqual(order, ['a', 'none', 'b']);
  assert.equal(peak, 1);
});

test('waits for an inventory read before sending icon requests', async () => {
  const events: string[] = [];
  let finishInventory = () => undefined as void;
  const inventory = new Promise<void>((resolve) => {
    finishInventory = () => {
      events.push('inventory');
      resolve();
    };
  });
  const loader = new IconLoader(
    async (programId) => {
      events.push(programId);
      return found(programId);
    },
    () => inventory,
  );
  const icon = loader.get('a');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, []);
  finishInventory();
  assert.equal(await icon, 'data:image/png;base64,a');
  assert.deepEqual(events, ['inventory', 'a']);
});

test('caches results, retries helper failures, and forgets icons on clear', async () => {
  const calls: string[] = [];
  let fail = true;
  const loader = new IconLoader(async (programId) => {
    calls.push(programId);
    if (programId === 'flaky' && fail) throw new Error('Helper stopped.');
    return programId === 'none' ? missing : found(programId);
  });
  assert.equal(await loader.get('a'), 'data:image/png;base64,a');
  assert.equal(await loader.get('none'), null);
  assert.equal(await loader.get('flaky'), null);
  assert.deepEqual(calls, ['a', 'none', 'flaky']);
  await loader.get('a');
  await loader.get('none');
  fail = false;
  assert.equal(await loader.get('flaky'), 'data:image/png;base64,flaky');
  assert.deepEqual(calls, ['a', 'none', 'flaky', 'flaky']);
  loader.clear();
  await loader.get('a');
  assert.deepEqual(calls.at(-1), 'a');
  assert.equal(calls.length, 5);
});

test('bounds the cache by evicting the least recently requested icon', async () => {
  const calls: string[] = [];
  const loader = new IconLoader(async (programId) => {
    calls.push(programId);
    return found(programId);
  });
  await loader.get('first');
  await loader.get('second');
  for (let index = 0; index < 510; index++) await loader.get(`program-${index}`);
  // The cache is full. Requesting "first" again keeps it, so "second" is evicted next.
  await loader.get('first');
  assert.equal(calls.length, 512);
  await loader.get('one-more');
  calls.length = 0;
  await loader.get('first');
  await loader.get('second');
  assert.deepEqual(calls, ['second']);
});
