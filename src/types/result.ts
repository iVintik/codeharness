/**
 * Discriminated union Result type for consistent error handling.
 * All module functions return Result<T> instead of throwing exceptions.
 */

/** Successful result carrying data of type T */
export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

/** Failed result carrying an error message and optional context */
export interface Fail {
  readonly success: false;
  readonly error: string;
  readonly context?: Record<string, unknown>;
}

/** Discriminated union: success field is the discriminant */
export type Result<T> = Ok<T> | Fail;

/** Construct a successful Result */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/** Construct a failed Result, assignable to any Result<T> */
export function fail(error: string, context?: Record<string, unknown>): Result<never> {
  if (context !== undefined) {
    return { success: false, error, context };
  }
  return { success: false, error };
}

/** Type guard: narrows Result<T> to Ok<T> */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.success === true;
}

/** Type guard: narrows Result<T> to Fail */
export function isFail<T>(result: Result<T>): result is Fail {
  return result.success === false;
}
