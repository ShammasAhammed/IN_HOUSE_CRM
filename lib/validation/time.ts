import { z } from "zod";
import { parseHoursToMinutes } from "../format";
import { id, isoDate } from "./common";

/** The Friday screen: the hours someone spent on one task on one day, as a total (empty = none). */
export const dayTotalSchema = z.object({
  taskId: id,
  workDate: isoDate,
  hours: z.union([z.string(), z.number()]).transform((raw, ctx) => {
    const v = String(raw).trim();
    if (v === "") return 0;
    const minutes = v.startsWith("-") ? null : parseHoursToMinutes(v);
    if (minutes === null) {
      ctx.addIssue({ code: "custom", message: v.startsWith("-") ? "Hours can't be negative." : "Write hours like 1.5, 1:30 or 1h30." });
      return z.NEVER;
    }
    if (minutes > 16 * 60) {
      ctx.addIssue({ code: "custom", message: "Hours must be between 0 and 16 for one day." });
      return z.NEVER;
    }
    return minutes;
  }),
});
