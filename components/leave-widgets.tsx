// Leave widgets shared by My leave and My page.
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { ErrorState } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, istDate } from "@/lib/dates";
import { formatDate, formatShortDate, formatWeekdayDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { BalanceView } from "@/services/leave";
import { daysLabel } from "@/services/rules/leave";

export function BalanceCard({ balance: b }: { balance: BalanceView }) {
  const available = b.availableHalfDays;
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{b.name}</p>
      {available === null ? (
        <>
          <p className="tabular mt-1 text-xl font-semibold">{daysLabel(b.usedHalfDays)}</p>
          <p className="text-xs text-muted-foreground">taken · no limit, needs approval</p>
        </>
      ) : (
        <>
          <p className={cn("tabular mt-1 text-xl font-semibold", available <= 0 && "text-muted-foreground")}>
            {(available / 2).toLocaleString("en-IN")}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {b.grantedOnly ? "days" : `of ${((b.entitledHalfDays + b.grantedHalfDays) / 2).toLocaleString("en-IN")} left`}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {b.pendingHalfDays > 0 ? `${daysLabel(b.pendingHalfDays)} waiting · ` : ""}
            {b.expiring ? `${daysLabel(b.expiring.halfDays)} expires ${formatShortDate(b.expiring.on)}` : `${daysLabel(b.usedHalfDays)} taken`}
          </p>
        </>
      )}
    </Card>
  );
}

export async function OffThisWeek() {
  const actor = await requireActor();
  const today = istDate();
  const result = await getServices().leave.offOn(actor, today, addDays(today, 6));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Away this week</CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        {!result.ok ? (
          <p className="text-sm text-muted-foreground">{result.error.message}</p>
        ) : result.value.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone&apos;s in this week.</p>
        ) : (
          <ul className="space-y-2.5">
            {result.value.map((o, i) => (
              <li key={`${o.personId}-${i}`} className="flex items-center gap-2.5">
                <Avatar name={o.personName} size="sm" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-medium">{o.personName}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.startDate <= today && o.endDate >= today ? "Today" : formatWeekdayDate(o.startDate)}
                    {o.endDate !== o.startDate ? ` → ${formatShortDate(o.endDate)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function UpcomingHolidays() {
  const actor = await requireActor();
  const today = istDate();
  const year = Number(today.slice(0, 4));
  const [thisYear, nextYear] = await Promise.all([getServices().leave.holidays(actor, year), getServices().leave.holidays(actor, year + 1)]);
  if (!thisYear.ok || !nextYear.ok) {
    const error = !thisYear.ok ? thisYear.error : !nextYear.ok ? nextYear.error : null;
    return error ? <ErrorState error={error} className="py-8" /> : null;
  }
  const upcoming = [...thisYear.value, ...nextYear.value].filter((h) => h.date >= today).slice(0, 4);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next holidays</CardTitle>
        <Link href="/leave/holidays" className="text-xs text-primary hover:underline">
          All
        </Link>
      </CardHeader>
      <CardContent className="pt-3">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holidays published yet.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((h) => (
              <li key={h.id} className="flex items-center gap-2.5 text-sm">
                <PartyPopper className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{h.name}</span>
                <span className="tabular text-xs text-muted-foreground">{formatDate(h.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
