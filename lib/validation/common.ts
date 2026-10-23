import { z } from "zod";
import { isIsoDate } from "../dates";
import { invalid, type Failure } from "../result";

export const isoDate = z.string().refine(isIsoDate, { message: "Enter a valid date." });
export const id = z.uuid({ message: "Pick an option." });
/** Empty form fields become null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Keep it under ${max} characters.` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** HTML forms send "" for "nothing chosen": these turn it into null. */
export const optionalId = z
  .union([z.literal(""), z.uuid({ message: "Pick an option." })])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const optionalDate = z
  .union([z.literal(""), isoDate])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.literal(""), z.enum(values)])
    .nullable()
    .optional()
    .transform((v) => (v ? (v as T[number]) : null));
}

export const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,18}$/, { message: "Enter a phone number like +91 94470 11223." });
export const optionalPhone = z
  .union([z.literal(""), phone])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/** "Keep it under 120 characters." for Zod's default too-long / too-short / too-many messages; null for anything else. */
function limitMessage(issue: z.core.$ZodIssue): string | null {
  // "Empty, or a number up to 60" fails as a union: the useful reason is inside one of its branches.
  if (issue.code === "invalid_union") {
    for (const branch of issue.errors) for (const inner of branch) {
      const m = limitMessage(inner) ?? (/^(Invalid|Expected|Too (small|big)|Required)\b/.test(inner.message) ? null : inner.message);
      if (m) return m;
    }
    return null;
  }
  if (issue.code !== "too_big" && issue.code !== "too_small") return null;
  const n = Number(issue.code === "too_big" ? issue.maximum : issue.minimum);
  if (!Number.isFinite(n)) return null;
  const big = issue.code === "too_big";
  if (issue.origin === "string") return big ? `Keep it to ${n} characters or fewer.` : n <= 1 ? "Please fill this in." : `Write at least ${n} characters.`;
  if (issue.origin === "array" || issue.origin === "set") return big ? `Pick at most ${n}.` : `Pick at least ${n}.`;
  if (issue.origin === "number" || issue.origin === "int" || issue.origin === "bigint") return big ? `Must be ${n} or less.` : `Must be ${n} or more.`;
  return null;
}

/** Parse with a schema; on failure return a typed Failure with per-field messages for the form. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): { ok: true; value: z.infer<T> } | Failure {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    // Zod's own wording ("Invalid input", "Expected number, received nan") means nothing to people; a length or size
    // limit says the limit (QA S9-06).
    const message = /^(Invalid|Expected|Too (small|big)|Required)\b/.test(issue.message) ? (limitMessage(issue) ?? "Check this one: it isn't filled in the way it needs to be.") : issue.message;
    (fieldErrors[key] ??= []).push(message);
  }
  // Say what's wrong in the message too, for forms where the field itself can't be highlighted (test report BUG-10).
  const messages = [...new Set(Object.values(fieldErrors).flat())];
  return invalid(messages.length === 1 ? messages[0]! : `Please check these: ${messages.slice(0, 3).join(" · ")}`, fieldErrors);
}
