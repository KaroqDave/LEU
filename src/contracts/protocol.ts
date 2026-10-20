import Ajv, { type ValidateFunction } from 'ajv';
import methodSchemas from './methods.json';
import requestSchema from './request.schema.json';
import responseSchema from './response.schema.json';

export const PROTOCOL_VERSION = 1;
/** Largest request line, including its newline. Requests carry identifiers, never bulk data. */
export const MAX_REQUEST_BYTES = 16 * 1024;
/** Largest response line, including its newline. Inventory results need far more than a request. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export interface EngineVersion {
  engineVersion: string;
  platform: string;
  arch: string;
}

/** Each engine method's parameters and result. Keep in sync with methods.json and the Rust enum. */
export interface EngineMethods {
  'engine.version': { params: Record<string, never>; result: EngineVersion };
}
export type EngineMethod = keyof EngineMethods;
export type EngineParams<M extends EngineMethod> = EngineMethods[M]['params'];
export type EngineResult<M extends EngineMethod> = EngineMethods[M]['result'];

export type EngineRemoteErrorCode =
  | 'INVALID_REQUEST'
  | 'PROTOCOL_MISMATCH'
  | 'UNKNOWN_METHOD'
  | 'FRAME_TOO_LARGE'
  | 'RESPONSE_TOO_LARGE';

export interface EngineRequest {
  protocolVersion: number;
  id: string;
  method: string;
  params: Record<string, unknown>;
}
export type EngineResponse =
  | { protocolVersion: number; id: string; ok: true; result: Record<string, unknown> }
  | {
      protocolVersion: number;
      id: string | null;
      ok: false;
      error: { code: EngineRemoteErrorCode; message: string };
    };

const ajv = new Ajv({ strict: true });
const isRequestEnvelope = ajv.compile<EngineRequest>(requestSchema);
export const isEngineResponse = ajv.compile<EngineResponse>(responseSchema);

type MethodValidators = {
  [M in EngineMethod]: {
    params: ValidateFunction<EngineParams<M>>;
    result: ValidateFunction<EngineResult<M>>;
  };
};
const validators = Object.fromEntries(
  Object.entries(methodSchemas).map(([method, schemas]) => [
    method,
    { params: ajv.compile(schemas.params), result: ajv.compile(schemas.result) },
  ]),
) as MethodValidators;

export function isEngineMethod(method: unknown): method is EngineMethod {
  return typeof method === 'string' && Object.hasOwn(validators, method);
}

/** Validates the envelope and the parameters of a known method. */
export function isEngineRequest(value: unknown): value is EngineRequest {
  return (
    isRequestEnvelope(value) &&
    isEngineMethod(value.method) &&
    validators[value.method].params(value.params)
  );
}

export function isEngineResult<M extends EngineMethod>(
  method: M,
  result: unknown,
): result is EngineResult<M> {
  return validators[method].result(result);
}
