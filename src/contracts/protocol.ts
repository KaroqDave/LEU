import Ajv, { type ValidateFunction } from 'ajv';
import contract from './contract.json';
import type {
  EngineMethods,
  EngineRemoteErrorCode,
  EngineRequest,
  EngineResponse,
} from './generated';

// The contract and its types are generated from the Rust engine by `pnpm contracts`.
export { MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, PROTOCOL_VERSION } from './generated';
export type { EngineMethods, EngineRemoteErrorCode, EngineRequest, EngineResponse };
export type EngineMethod = keyof EngineMethods;
export type EngineParams<M extends EngineMethod> = EngineMethods[M]['params'];
export type EngineResult<M extends EngineMethod> = EngineMethods[M]['result'];

const ajv = new Ajv({ strict: true });
const isRequestEnvelope = ajv.compile<EngineRequest>(contract.request);
export const isEngineResponse = ajv.compile<EngineResponse>(contract.response);

type MethodValidators = {
  [M in EngineMethod]: {
    params: ValidateFunction<EngineParams<M>>;
    result: ValidateFunction<EngineResult<M>>;
  };
};
const validators = Object.fromEntries(
  Object.entries(contract.methods).map(([method, schemas]) => [
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
