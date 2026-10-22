import type { EngineVersionParams } from '../src/contracts/generated';

type Assert<T extends true> = T;
type Rejects<T> = T extends EngineVersionParams ? false : true;

// Compiled by pnpm typecheck, including values that TypeScript's {} type used to accept.
export type EmptyMethodParams = [
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Covers the old permissive {} type.
  Assert<{} extends EngineVersionParams ? true : false>,
  Assert<Rejects<number>>,
  Assert<Rejects<string>>,
  Assert<Rejects<boolean>>,
  Assert<Rejects<unknown[]>>,
  Assert<Rejects<() => void>>,
  Assert<Rejects<{ unexpected: true }>>,
];
