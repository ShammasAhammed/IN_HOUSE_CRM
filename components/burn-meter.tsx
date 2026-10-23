import { formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BurnMeterProps = {
  usedMinutes: number;
  budgetMinutes: number;
  usedPercent: number;
  elapsedPercent: number;
  level: "ok" | "warning" | "over";
  compact?: boolean;
};

/**
 * Retainer burn: hours used against the month's budget, with a tick showing how far through the month we are.
 * Bar ahead of the tick = burning faster than the month is passing.
 */
export function BurnMeter({ usedMinutes, budgetMinutes, usedPercent, elapsedPercent, level, compact }: BurnMeterProps) {
  const width = Math.min(100, usedPercent);
  return (
    <div className={cn("min-w-28", compact ? "w-32" : "w-full")}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span
          className={cn(
            "tabular font-medium",
            level === "ok" && "text-foreground",
            level === "warning" && "text-warning",
            level === "over" && "text-danger",
          )}
        >
          {usedPercent}%
        </span>
        <span className="tabular text-muted-foreground">
          {formatHours(usedMinutes)} / {formatHours(budgetMinutes)}
        </span>
      </div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-neutral-soft"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usedPercent}
        aria-label={`${usedPercent}% of this month's hours used, ${elapsedPercent}% of the month gone`}
      >
        <div
          className={cn(
            "h-full rounded-full",
            level === "ok" && "bg-primary",
            level === "warning" && "bg-warning",
            level === "over" && "bg-danger",
          )}
          style={{ width: `${width}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${Math.min(100, elapsedPercent)}%` }} />
      </div>
    </div>
  );
}
