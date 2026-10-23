import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PartyPopper } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { istDate } from "@/lib/dates";
import { formatWeekdayDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import { can } from "@/services/permissions";
import { removeHolidayAction } from "../actions";
import { AddHolidayForm } from "./add-holiday-form";

export const metadata: Metadata = { title: "Holidays" };

export default function HolidaysPage({ searchParams }: PageProps<"/leave/holidays">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} columns={2} label="Loading holidays" />}>
      <Holidays searchParams={searchParams} />
    </Suspense>
  );
}

async function Holidays({ searchParams }: { searchParams: PageProps<"/leave/holidays">["searchParams"] }) {
  const actor = await requireActor();
  const today = istDate();
  const { year: raw } = await searchParams;
  const thisYear = Number(today.slice(0, 4));
  const year = typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : thisYear;
  const result = await getServices().leave.holidays(actor, year);
  if (!result.ok) return <ErrorState error={result.error} />;
  const manage = can(actor, "leave.manage");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
            <Button key={y} asChild size="sm" variant={y === year ? "secondary" : "ghost"}>
              <Link href={`/leave/holidays?year=${y}`}>{y}</Link>
            </Button>
          ))}
        </div>
        {result.value.length === 0 ? (
          <EmptyState icon={PartyPopper} title={`No holidays published for ${year}`} description={manage ? "Add them on the right; everyone sees the list." : "HR publishes the list once a year."} />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {result.value.map((h) => (
              <li key={h.id} className={cn("flex items-center gap-3 px-4 py-2.5", h.date < today && "text-muted-foreground")}>
                <span className="tabular w-32 text-sm">{formatWeekdayDate(h.date)}</span>
                <span className="flex-1 font-medium">{h.name}</span>
                {manage && h.date >= today ? (
                  <ConfirmForm action={removeHolidayAction} fields={{ holidayId: h.id }} confirm={`Remove ${h.name}?`} label="Remove" variant="ghost" showSuccess={false} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {result.value.length} {result.value.length === 1 ? "holiday" : "holidays"}. Leave on a holiday doesn&apos;t count against anyone&apos;s balance.
        </p>
      </div>
      {manage ? <AddHolidayForm year={year} /> : null}
    </div>
  );
}
