// A goal in a list (Stage 14.3): title, health, a progress bar, the numbers (money only for who may see it), the
// last check-in and the work behind it. Used on Goals, the Dashboard and space pages.
import type { Route } from "next";
import Link from "next/link";
import { HealthBadge } from "@/components/health-badge";
import { formatDate, formatRupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GoalView } from "@/services/goals";

export const goalAmount = (g: Pick<GoalView, "unit" | "amountsHidden">, n: number | null) => (n === null ? "—" : g.unit === "money" ? formatRupees(n) : g.unit === "percent" ? `${n}%` : n.toLocaleString("en-IN"));

export function GoalRow({ g, compact = false }: { g: GoalView; compact?: boolean }) {
  const pct = g.health.percent;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/goals/${g.id}` as Route} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
          {g.title}
        </Link>
        <HealthBadge level={g.health.level} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-label={`${g.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.min(100, Math.round(pct))}>
        <div className={cn("h-full rounded-full", g.health.level === "off_track" ? "bg-danger" : g.health.level === "at_risk" ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular">
        {g.amountsHidden ? `${pct === null ? "No number yet" : `${pct}% of the target`}` : `${goalAmount(g, g.current)} of ${goalAmount(g, g.target)}${pct === null ? "" : ` · ${pct}%`}`} · {g.periodName}
        {g.spaceName ? ` · ${g.spaceName}` : g.ownerName ? ` · ${g.ownerName}` : ""}
        {g.supporting ? ` · tasks ${g.supporting.done}/${g.supporting.total}` : ""}
      </p>
      {!compact ? (
        <p className="text-xs text-muted-foreground">
          {g.lastCheckin ? `Last check-in ${formatDate(g.lastCheckin.createdAt.toISOString().slice(0, 10))}, ${g.lastCheckin.personName}${g.lastCheckin.note ? `: “${g.lastCheckin.note}”` : ""}` : "No check-in yet"}
          {g.health.reasons.length && g.health.level !== "on_track" ? ` · ${g.health.reasons.join("; ")}` : ""}
        </p>
      ) : null}
    </div>
  );
}
