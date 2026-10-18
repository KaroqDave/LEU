import Ajv from 'ajv';
import requestSchema from './request.schema.json';
import responseSchema from './response.schema.json';

export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 16 * 1024;
export interface EngineRequest {
  protocolVersion: number;
  id: string;
  method: string;
  params: Record<string, never>;
}
export interface EngineVersion {
  engineVersion: string;
  platform: string;
  arch: string;
}
export type EngineResponse =
  | { protocolVersion: number; id: string; ok: true; result: EngineVersion }
  | {
      protocolVersion: number;
      id: string | null;
      ok: false;
      error: { code: string; message: string };
    };

const ajv = new Ajv({ strict: true });
export const isEngineRequest = ajv.compile<EngineRequest>(requestSchema);
export const isEngineResponse = ajv.compile<EngineResponse>(responseSchema);
