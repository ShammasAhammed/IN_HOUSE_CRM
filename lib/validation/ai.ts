import { z } from "zod";
import { rupees } from "./engagements";

/** ₹0 switches the AI off for the month; more than ₹1,00,000 is almost certainly a typo. */
export const aiLimitSchema = z.object({ monthly: rupees.refine((p) => p <= 10_000_000, { message: "Keep it at ₹1,00,000 or less." }) });
