import type { EngineStatus } from '../contracts/bridge';

export type Connection = EngineStatus | { state: 'connecting' };
