import { istDate, type IsoDate } from "@/lib/dates";

/** Time, injectable so tests can pin "today". */
export type Clock = { now(): Date; today(): IsoDate };

export const systemClock: Clock = {
  now: () => new Date(),
  today: () => istDate(),
};
