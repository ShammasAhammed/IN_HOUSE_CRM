import { z } from "zod";
import { ATTENDANCE_LOCATIONS } from "../types";
import { id, isoDate, optionalDate, optionalText } from "./common";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Enter a time like 09:30." });
const optionalTime = z
  .union([z.literal(""), time])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));
/** Degrees → thousandths of a degree (about 100 m): enough to tell office from home, no closer (DPDP minimum). */
const coordinate = (limit: number) =>
  z
    .union([z.literal(""), z.coerce.number().min(-limit).max(limit)])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Math.round(Number(v) * 1000)));

export const checkInSchema = z.object({
  location: z.enum(ATTENDANCE_LOCATIONS, { message: "Where are you working today?" }),
  note: optionalText(200),
  lat: coordinate(90),
  lng: coordinate(180),
});

/** Today: now. An earlier day left open: the time you left. */
export const checkOutSchema = z.object({ workDate: optionalDate, time: optionalTime });

/** HR or the owner recording or correcting someone's day. */
export const recordAttendanceSchema = z
  .object({
    personId: id,
    workDate: isoDate,
    location: z.enum(ATTENDANCE_LOCATIONS, { message: "Pick where they worked." }),
    inTime: time,
    outTime: optionalTime,
    note: optionalText(200),
    reason: z.string().trim().min(3, { message: "Say why, for the record." }).max(300),
  })
  .refine((v) => !v.outTime || v.outTime > v.inTime, { path: ["outTime"], message: "Out must be after in." });

export const removeAttendanceSchema = z.object({
  personId: id,
  workDate: isoDate,
  reason: z.string().trim().min(3, { message: "Say why, for the record." }).max(300),
});
