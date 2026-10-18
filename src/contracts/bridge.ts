export type EngineErrorCode =
  | 'MISSING_HELPER'
  | 'PROTOCOL_MISMATCH'
  | 'INVALID_RESPONSE'
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

export interface Program {
  id: string;
  name: string;
  publisher: string;
  version: string;
  scope: 'user' | 'machine';
  reportedSizeBytes: number | null;
  installedOn: string | null;
  installLocation: string;
  initials: string;
  color: string;
}

export interface Inventory {
  source: 'demo';
  programs: Program[];
}

export interface LeuBridge {
  getAppInfo(): Promise<AppInfo>;
  getEngineStatus(): Promise<EngineStatus>;
  onEngineStatus(callback: (status: EngineStatus) => void): () => void;
  restartEngine(): Promise<EngineStatus>;
  listPrograms(): Promise<Inventory>;
}
