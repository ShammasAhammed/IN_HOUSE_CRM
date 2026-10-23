// The owner's morning summary (ops extra): the dashboard's numbers as short plain facts for the AI to write up.
import type { OwnerDashboard } from "../dashboard";

const list = <T,>(items: readonly T[], show: (t: T) => string, max = 8) => (items.length ? items.slice(0, max).map(show).join("; ") + (items.length > max ? `; and ${items.length - max} more` : "") : "none");

export function summaryFacts(d: OwnerDashboard): string {
  return [
    `Date: ${d.today}`,
    `Active clients: ${d.counts.activeClients}. Overdue tasks: ${d.counts.overdueTasks}. Creatives in internal review: ${d.counts.creativesInReview}. With clients for approval: ${d.counts.withClients}.`,
    `Projects past their date: ${list(d.lateProjects, (p) => `${p.name} (${p.clientName}, due ${p.dueDate ?? "no date"})`)}.`,
    `Retainer hours vs month (used % / month gone %): ${list(d.burn, (b) => `${b.clientName} ${b.name} ${b.usedPercent}% / ${b.monthPercent}%`)}.`,
    `Overloaded this week: ${list(d.capacity.over, (w) => `${w.personName} ${w.loadPercent ?? "?"}%`)}. Light this week: ${list(d.capacity.light, (w) => `${w.personName} ${w.loadPercent ?? "?"}%`)}.`,
    `Away in the next 7 days: ${list(d.away, (a) => `${a.personName} ${a.startDate}${a.endDate !== a.startDate ? ` to ${a.endDate}` : ""}`)}.`,
    `Renewals coming: ${list(d.renewals, (r) => `${r.clientName} ${r.name} on ${r.renewalDate}`)}.`,
  ].join("\n");
}

export const SUMMARY_SYSTEM =
  "You write the morning summary for the owner of Oppllo Digital, an admissions-growth agency in Kerala. From the facts given, write at most 6 short bullet points in plain English: what needs the owner today first (late work, overload, retainers running hot, renewals), then anything good. Use only the facts given; never invent numbers or names. No greeting, no sign-off.";
