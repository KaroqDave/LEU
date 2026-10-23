import type { EngineMethods } from './generated';

export type EngineErrorCode =
  | 'MISSING_HELPER'
  | 'PROTOCOL_MISMATCH'
  | 'INVALID_RESPONSE'
  | 'INVALID_LOCAL_REQUEST'
  | 'ENGINE_EXITED'
  | 'TIMEOUT'
  | 'START_FAILED';

export type EngineStatus =
  | {
      state: 'ready';
      engineVersion: string;
      protocolVersion: number;
      platform: string;
      arch: string;
    }
  | { state: 'error'; code: EngineErrorCode; message: string };

export interface AppInfo {
  version: string;
  electronVersion: string;
  platform: string;
  packaged: boolean;
}

export type NativeInventory = EngineMethods['inventory.list']['result'];
export type Program = NativeInventory['programs'][number];
export type Inventory = NativeInventory & { source: 'windows' | 'demo' };

export interface LeuBridge {
  getAppInfo(): Promise<AppInfo>;
  getEngineStatus(): Promise<EngineStatus>;
  onEngineStatus(callback: (status: EngineStatus) => void): () => void;
  restartEngine(): Promise<EngineStatus>;
  listPrograms(): Promise<Inventory>;
}
