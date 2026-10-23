// HR seed: leave types and quotas (D39), the working week (D32), holidays (D49) and a realistic year of leave.
// Movable festival dates are approximate: HR publishes the real list in the app.
import type { IsoDate } from "@/lib/dates";
import type { EmploymentType } from "@/lib/types";

export const LEAVE_TYPES: Array<{
  key: string;
  name: string;
  usesBalance: boolean;
  grantedOnly: boolean;
  grantExpiryDays: number | null;
  allowHalfDay: boolean;
  maxBackdateDays: number;
  quotasDays: Partial<Record<EmploymentType, number>>;
}> = [
  { key: "casual", name: "Casual leave", usesBalance: true, grantedOnly: false, grantExpiryDays: null, allowHalfDay: true, maxBackdateDays: 0, quotasDays: { full_time: 12, part_time: 12, intern: 6 } },
  { key: "sick", name: "Sick leave", usesBalance: true, grantedOnly: false, grantExpiryDays: null, allowHalfDay: true, maxBackdateDays: 7, quotasDays: { full_time: 12, part_time: 12, intern: 6 } },
  { key: "comp_off", name: "Comp-off", usesBalance: true, grantedOnly: true, grantExpiryDays: 60, allowHalfDay: true, maxBackdateDays: 0, quotasDays: {} },
  { key: "unpaid", name: "Unpaid leave", usesBalance: false, grantedOnly: false, grantExpiryDays: null, allowHalfDay: true, maxBackdateDays: 0, quotasDays: {} },
];

export const HOLIDAYS: Array<[IsoDate, string]> = [
  ["2026-01-26", "Republic Day"],
  ["2026-03-20", "Eid al-Fitr"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-15", "Vishu"],
  ["2026-05-01", "May Day"],
  ["2026-05-27", "Bakrid"],
  ["2026-08-15", "Independence Day"],
  ["2026-08-25", "First Onam (Uthradom)"],
  ["2026-08-26", "Thiruvonam"],
  ["2026-10-02", "Gandhi Jayanti"],
  ["2026-10-20", "Vijayadashami"],
  ["2026-12-25", "Christmas"],
  ["2027-01-26", "Republic Day"],
  ["2027-03-10", "Eid al-Fitr"],
  ["2027-03-26", "Good Friday"],
  ["2027-04-14", "Vishu"],
  ["2027-05-01", "May Day"],
  ["2027-05-17", "Bakrid"],
  ["2027-08-15", "Independence Day"],
  ["2027-09-13", "First Onam (Uthradom)"],
  ["2027-09-14", "Thiruvonam"],
  ["2027-10-02", "Gandhi Jayanti"],
  ["2027-10-09", "Vijayadashami"],
  ["2027-12-25", "Christmas"],
];

/** Leave on record, by person key. Offsets are working-day-agnostic calendar days from today. */
export type SeedLeave = {
  person: string;
  type: string;
  fromDaysAgo: number;
  days: number;
  status: "approved" | "pending" | "rejected" | "cancelled";
  reason: string;
  halfDay?: "first_half" | "second_half";
};

export const LEAVES: SeedLeave[] = [
  // Earlier this year
  { person: "rahul", type: "casual", fromDaysAgo: 190, days: 2, status: "approved", reason: "Cousin's wedding in Thrissur" },
  { person: "rahul", type: "sick", fromDaysAgo: 120, days: 1, status: "approved", reason: "Fever" },
  { person: "anjali", type: "casual", fromDaysAgo: 160, days: 3, status: "approved", reason: "Family trip" },
  { person: "fathima", type: "casual", fromDaysAgo: 98, days: 2, status: "approved", reason: "Personal" },
  { person: "fathima", type: "sick", fromDaysAgo: 40, days: 1, status: "approved", reason: "Migraine", halfDay: "second_half" },
  { person: "vishnu", type: "casual", fromDaysAgo: 75, days: 4, status: "approved", reason: "Onam at home" },
  { person: "aswathy", type: "sick", fromDaysAgo: 55, days: 2, status: "approved", reason: "Viral fever" },
  { person: "nikhil", type: "casual", fromDaysAgo: 130, days: 1, status: "rejected", reason: "Personal work" },
  { person: "nikhil", type: "comp_off", fromDaysAgo: 9, days: 1, status: "approved", reason: "Comp-off for the Sunday shoot" },
  { person: "ajmal", type: "casual", fromDaysAgo: 60, days: 2, status: "approved", reason: "Sister's engagement" },
  { person: "divya", type: "sick", fromDaysAgo: 30, days: 1, status: "approved", reason: "Not well" },
  { person: "hiba", type: "sick", fromDaysAgo: 20, days: 1, status: "approved", reason: "Dentist", halfDay: "first_half" },
  { person: "sneha", type: "casual", fromDaysAgo: 45, days: 1, status: "cancelled", reason: "College exam (rescheduled)" },
  // On leave right now
  { person: "joseph", type: "casual", fromDaysAgo: 1, days: 3, status: "approved", reason: "Travelling to Bengaluru" },
  // Coming up
  { person: "rahul", type: "casual", fromDaysAgo: -8, days: 2, status: "pending", reason: "Friend's wedding in Kannur" },
  { person: "vishnu", type: "casual", fromDaysAgo: -9, days: 1, status: "approved", reason: "Passport appointment" },
  { person: "aswathy", type: "casual", fromDaysAgo: -9, days: 2, status: "pending", reason: "Going home to Palakkad" },
  { person: "arun", type: "casual", fromDaysAgo: -14, days: 1, status: "pending", reason: "University exam" },
  { person: "faisal", type: "casual", fromDaysAgo: -22, days: 3, status: "approved", reason: "Family holiday" },
];

/** Comp-off granted for weekend work: person, days ago granted, days, reason. */
export const GRANTS: Array<[string, number, number, string]> = [
  ["nikhil", 17, 2, "Sunday campus shoot for CodeLeap (2 days)"],
  ["arun", 17, 1, "Assisted the Sunday CodeLeap shoot"],
];
