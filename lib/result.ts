// Typed results: services return these instead of throwing for expected failures.
// Every error carries a human message that a screen can show as-is.

export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "unexpected";

export type AppError = {
  code: AppErrorCode;
  message: string;
  /** Per-field messages for forms (keys match the Zod schema). */
  fieldErrors?: Record<string, string[]>;
};

export type Success<T> = { ok: true; value: T };
export type Failure = { ok: false; error: AppError };
export type Result<T> = Success<T> | Failure;

export const ok = <T>(value: T): Success<T> => ({ ok: true, value });

export const fail = (
  code: AppErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Failure => ({ ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } });

export const forbidden = (message = "You don't have access to this.") => fail("forbidden", message);
export const notFound = (thing = "That item") => fail("not_found", `${thing} was not found. It may have been removed.`);
export const invalid = (message: string, fieldErrors?: Record<string, string[]>) =>
  fail("invalid", message, fieldErrors);
export const conflict = (message: string) => fail("conflict", message);
