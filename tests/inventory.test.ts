import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Inventory } from '../src/contracts/bridge';
import { getDemoInventory } from '../src/main/fixtures';
import { createInventoryState, inventoryReducer } from '../src/renderer/inventory';

test('starts loading without selecting a registration and retains selection across refresh', () => {
  let state = createInventoryState(true);
  assert.equal(state.loading, true);
  assert.equal(state.selectedId, null);
  const inventory = getDemoInventory();
  state = inventoryReducer(state, { type: 'received', inventory });
  state = inventoryReducer(state, { type: 'select', id: inventory.programs[0]!.id });
  state = inventoryReducer(state, { type: 'request' });
  assert.equal(state.inventory, inventory);
  state = inventoryReducer(state, {
    type: 'received',
    inventory: structuredClone(inventory),
    refreshed: true,
  });
  assert.equal(state.selectedId, inventory.programs[0]!.id);
  assert.equal(state.loading, false);
  assert.equal(state.notice, 'Sample list refreshed.');
  state = inventoryReducer(state, { type: 'received', inventory: { ...inventory, programs: [] } });
  assert.equal(state.selectedId, null);
  assert.match(state.notice, /no longer/);
});

test('retains previous data on transport and source failures without fabricating a demo fallback', () => {
  const inventory: Inventory = { ...getDemoInventory(), source: 'windows' };
  const ready = inventoryReducer(createInventoryState(true), { type: 'received', inventory });
  const failed = inventoryReducer(ready, { type: 'failed' });
  assert.equal(failed.inventory, inventory);
  assert.match(failed.error, /previous result/);
  const unavailable = inventoryReducer(ready, {
    type: 'received',
    inventory: { ...inventory, status: 'unavailable', programs: [] },
  });
  assert.equal(unavailable.inventory, inventory);
  assert.notEqual(unavailable.error, '');
  const initialFailure = inventoryReducer(createInventoryState(true), { type: 'failed' });
  assert.equal(initialFailure.inventory, undefined);
  assert.equal(initialFailure.loading, false);
});

test('accepts partial inventory, shows live refresh status, and clears stale errors after retry', () => {
  const source = getDemoInventory();
  const inventory: Inventory = {
    ...source,
    source: 'windows',
    status: 'partial',
    issues: [
      { code: 'ACCESS_DENIED', message: 'Fixture only.', source: source.programs[0]!.source },
    ],
  };
  const failed = inventoryReducer(createInventoryState(true), { type: 'failed' });
  const received = inventoryReducer(failed, { type: 'received', inventory, refreshed: true });
  assert.equal(received.inventory, inventory);
  assert.equal(received.error, '');
  assert.equal(received.notice, 'Windows inventory refreshed.');
  assert.equal(received.loading, false);
});
