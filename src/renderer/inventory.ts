import type { Inventory } from '../contracts/bridge';

export interface InventoryState {
  inventory: Inventory | undefined;
  selectedId: string | null;
  loading: boolean;
  error: string;
  notice: string;
}

export type InventoryAction =
  | { type: 'request' }
  | { type: 'received'; inventory: Inventory; refreshed?: boolean }
  | { type: 'failed' }
  | { type: 'select'; id: string };

export function createInventoryState(hasBridge: boolean): InventoryState {
  return { inventory: undefined, selectedId: null, loading: hasBridge, error: '', notice: '' };
}

function failed(state: InventoryState): InventoryState {
  return {
    ...state,
    loading: false,
    notice: '',
    error:
      state.inventory && state.inventory.status !== 'unavailable'
        ? 'Inventory could not be refreshed. Showing the previous result. Check the engine in Settings, then retry.'
        : 'Windows inventory could not be loaded. Check the engine in Settings, then retry.',
  };
}

export function inventoryReducer(state: InventoryState, action: InventoryAction): InventoryState {
  switch (action.type) {
    case 'request':
      return { ...state, loading: true, error: '', notice: '' };
    case 'failed':
      return failed(state);
    case 'select':
      return { ...state, selectedId: action.id };
    case 'received': {
      if (action.inventory.status === 'unavailable') {
        const previous = state.inventory && state.inventory.status !== 'unavailable';
        return {
          ...failed(state),
          inventory: previous ? state.inventory : action.inventory,
          error: previous
            ? 'Windows registry sources could not be read. Showing the previous result. Retry the inventory.'
            : 'Windows registry sources could not be read. Review the source warnings and retry.',
        };
      }
      const selectedId = action.inventory.programs.some(
        (program) => program.id === state.selectedId,
      )
        ? state.selectedId
        : null;
      const removed = state.selectedId !== null && selectedId === null;
      return {
        inventory: action.inventory,
        selectedId,
        loading: false,
        error: '',
        notice: removed
          ? 'The selected application is no longer in the available inventory.'
          : action.refreshed
            ? action.inventory.source === 'demo'
              ? 'Sample list refreshed.'
              : 'Windows inventory refreshed.'
            : '',
      };
    }
  }
}
