import { z } from "zod";
import { parseRupeesToPaise } from "../format";
import { ENGAGEMENT_KINDS, ENGAGEMENT_STATUSES, ROLLOVER_POLICIES } from "../types";
import { id, isoDate, optionalDate, optionalText } from "./common";

/** Hours typed in a form ("40", "12.5") → whole minutes. Empty means 0 (no hours budget). */
const hoursBudget = z
  .union([z.literal(""), z.coerce.number({ message: "Enter hours, like 40." }).min(0, { message: "Can't be negative." }).max(2000, { message: "At most 2,000 hours." })])
  .optional()
  .transform((v) => (v === "" || v === undefined ? 0 : Math.round(Number(v) * 60)));

/** Rupees typed in a form ("1,25,000") → integer paise. */
export const rupees = z
  .string({ message: "Enter an amount in rupees." })
  .trim()
  .min(1, { message: "Enter an amount in rupees." })
  .transform((v, ctx) => {
    const paise = parseRupeesToPaise(v);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter rupees, like 45,000." });
      return z.NEVER;
    }
    return paise;
  });

/** <input type="month"> sends "2026-11"; fees change from the first of a month (D66). */
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Pick a month." })
  .transform((v) => `${v}-01`);

const terms = {
  serviceId: id,
  name: optionalText(120),
  startDate: isoDate,
  endDate: optionalDate,
  renewalDate: optionalDate,
  hoursBudget,
  rolloverPolicy: z.enum(ROLLOVER_POLICIES).optional().default("expire"),
  notes: optionalText(2000),
};

/** Check the dates even when other fields have mistakes, so the form shows every problem at once. */
const datesValid = (payload: { issues: ReadonlyArray<{ path?: ReadonlyArray<PropertyKey> }> }) =>
  !payload.issues.some((i) => ["startDate", "endDate", "renewalDate"].includes(String(i.path?.[0])));

const datesInOrder = <T extends { startDate: string; endDate: string | null; renewalDate: string | null }>(s: z.ZodType<T>) =>
  s
    .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "The end can't be before the start.", when: datesValid })
    .refine((v) => !v.renewalDate || v.renewalDate >= v.startDate, { path: ["renewalDate"], message: "Renewal can't be before the start.", when: datesValid });

export const createEngagementSchema = datesInOrder(
  z.object({ ...terms, clientId: id, kind: z.enum(ENGAGEMENT_KINDS, { message: "Pick retainer or one-off." }), fee: rupees }),
);

export const updateEngagementSchema = datesInOrder(
  z.object({ ...terms, engagementId: id, status: z.enum(ENGAGEMENT_STATUSES, { message: "Pick a status." }) }),
);

/** Retainers send a month; one-off jobs have one total fee, corrected from today. */
export const changeFeeSchema = z.object({ engagementId: id, amount: rupees, effectiveMonth: month.optional() });

export const deliverableSchema = z.object({
  name: z.string().trim().min(2, { message: "Name what is promised, like Reels." }).max(80),
  targetCount: z.coerce.number({ message: "Enter a count." }).int({ message: "A whole number." }).min(1, { message: "At least 1." }).max(500, { message: "At most 500." }),
});
export const addDeliverableSchema = deliverableSchema.extend({ engagementId: id });
export const updateDeliverableSchema = deliverableSchema.extend({ deliverableId: id });
export const removeDeliverableSchema = z.object({ deliverableId: id });
