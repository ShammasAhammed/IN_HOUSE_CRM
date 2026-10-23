// What a server action hands back to its form: idle, done (with a message), or an error to show.
import type { Result } from "./result";

export type ActionState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]>; values?: Record<string, unknown> };

export const idle: ActionState = { status: "idle" };

/**
 * `values`: what was submitted. React resets a form after its action runs, so forms use these as their
 * defaults after an error — nobody loses what they typed.
 */
export function toActionState(result: Result<unknown>, success: string, values?: Record<string, unknown>): ActionState {
  return result.ok
    ? { status: "ok", message: success }
    : {
        status: "error",
        message: result.error.message,
        ...(result.error.fieldErrors ? { fieldErrors: result.error.fieldErrors } : {}),
        ...(values ? { values } : {}),
      };
}

/** The value to show in a field: what was just submitted after an error, otherwise the starting value. */
export function fieldDefault(state: ActionState, name: string, initial: string): string {
  if (state.status !== "error" || !state.values || !(name in state.values)) return initial;
  const v = state.values[name];
  return typeof v === "string" ? v : initial;
}

/** FormData → plain object. Repeated keys (checkbox groups) become arrays; listed keys are always arrays. */
export function formToObject(form: FormData, arrays: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = form.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = arrays.includes(key) || all.length > 1 ? all : (all[0] ?? "");
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}
