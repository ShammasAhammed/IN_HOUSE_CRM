import { z } from "zod";
import { parseRupeesToPaise } from "../format";
import { id } from "./common";

/** A count typed in a form; empty means "not entered" (null), which is different from 0. */
const count = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "Enter a whole number, like 120." });
      return z.NEVER;
    }
    return n;
  });

const optionalRupees = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const paise = parseRupeesToPaise(v);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter rupees, like 45,000." });
      return z.NEVER;
    }
    return paise;
  });

export const resultsSchema = z.object({
  clientId: id,
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Pick a month." })
    .transform((v) => `${v}-01`),
  leads: count,
  spend: optionalRupees,
  callsBooked: count,
  admissions: count,
  targetLeads: count,
  targetAdmissions: count,
});
