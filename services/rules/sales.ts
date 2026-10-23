// The sales dashboard's numbers (Stage 10a, D88), the same as the old CRM's dashboard.
import { addDays, istDate, type IsoDate } from "@/lib/dates";
import { LEAD_STAGES, type LeadStage } from "@/lib/types";
import type { LeadRow } from "@/repositories";

export const SALES_PERIODS = [7, 30, 90, 0] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];

/** The CRM's rule for a lead's channel. */
/** Closed leads (won + lost) in the period needed before a win rate is shown (QA S6-B2, the spec). */
export const MIN_CLOSED_FOR_WIN_RATE = 5;

/** Timeline text copied from the CRM can carry raw stage codes ("→ audit_booked"): show their names (test report L17). */
export function readableLeadText(text: string): string {
  return text.replace(/\baudit_booked\b/g, "Audit call booked");
}

export function channelOf(l: Pick<LeadRow, "channel" | "origin">): string {
  if (l.channel) return l.channel;
  if (l.origin === "meta_form") return "Meta lead form";
  if (l.origin === "google_form") return "Google lead form";
  return l.origin === "landing" ? "Landing page" : "Other";
}

export type SalesGroup = { key: string; leads: number; won: number; open: number; hot: number };
export type SalesSummary = {
  total: number;
  open: number;
  won: number;
  hot: number;
  unassigned: number;
  /** Won out of won + lost in the period, in percent; null until MIN_CLOSED_FOR_WIN_RATE leads have closed. */
  winRate: number | null;
  /** Won + lost in the period: under MIN_CLOSED_FOR_WIN_RATE the screen says how many more are needed. */
  closed: number;
  stages: Array<{ stage: LeadStage; count: number }>;
  perDay: Array<{ date: IsoDate; count: number }>;
  channels: SalesGroup[];
  campaigns: SalesGroup[];
  pages: SalesGroup[];
  owners: SalesGroup[];
  lostReasons: Array<{ reason: string; count: number }>;
};

const isOpen = (l: LeadRow) => l.stage !== "won" && l.stage !== "lost";

/** `days` 0 = all time. Leads per day covers the last 30 days at most. */
export function summarise(all: readonly LeadRow[], today: IsoDate, days: SalesPeriod): SalesSummary {
  const since = days ? addDays(today, -(days - 1)) : null;
  const list = since ? all.filter((l) => istDate(l.createdAt) >= since) : [...all];
  const won = list.filter((l) => l.stage === "won").length;
  const lost = list.filter((l) => l.stage === "lost");

  const group = (keyOf: (l: LeadRow) => string | null, dropNone = false) => {
    const m = new Map<string, SalesGroup>();
    for (const l of list) {
      const key = keyOf(l) || "(none)";
      if (dropNone && key === "(none)") continue;
      const g = m.get(key) ?? { key, leads: 0, won: 0, open: 0, hot: 0 };
      g.leads++;
      if (l.stage === "won") g.won++;
      if (isOpen(l)) g.open++;
      if (l.score === "hot") g.hot++;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key));
  };

  const span = Math.min(days || 30, 30);
  const perDay = Array.from({ length: span }, (_, i) => addDays(today, i - span + 1)).map((date) => ({ date, count: all.filter((l) => istDate(l.createdAt) === date).length }));
  const reasons = new Map<string, number>();
  for (const l of lost) reasons.set(l.lostReason || "Other", (reasons.get(l.lostReason || "Other") ?? 0) + 1);

  return {
    total: list.length,
    open: list.filter(isOpen).length,
    won,
    hot: list.filter((l) => l.score === "hot").length,
    unassigned: list.filter((l) => isOpen(l) && !l.ownerId && !l.ownerName).length,
    // Won ÷ (won + lost) in the period, once at least five leads have closed (QA S6-B2 restores the spec over S9-07).
    winRate: won + lost.length >= MIN_CLOSED_FOR_WIN_RATE ? Math.round((won / (won + lost.length)) * 100) : null,
    closed: won + lost.length,
    stages: LEAD_STAGES.map((stage) => ({ stage, count: list.filter((l) => l.stage === stage).length })),
    perDay,
    channels: group(channelOf),
    campaigns: group((l) => l.campaign, true),
    pages: group((l) => l.landing ?? (l.origin === "landing" ? "admissions.oppllo.com" : null), true),
    owners: group((l) => l.ownerName ?? "Unassigned"),
    lostReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
