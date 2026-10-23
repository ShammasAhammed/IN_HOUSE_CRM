import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { addMonths, istDate } from "@/lib/dates";
import { formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Content calendar" };

export default function ContentCalendarPage({ params, searchParams }: PageProps<"/clients/[id]/calendar">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} columns={4} label="Loading the calendar" />}>
      <Calendar params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({ params, searchParams }: PageProps<"/clients/[id]/calendar">) {
  const actor = await requireActor();
  const [{ id }, { month }] = await Promise.all([params, searchParams]);
  const r = await getServices().content.month(actor, id, typeof month === "string" ? month : undefined);
  if (!r.ok) return <ErrorState error={r.error} />;
  const m = r.value;
  const first = `${m.month}-01`;
  return (
    <div className="space-y-4">
      <BackLink fallback={`/clients/${m.client.id}` as Route} label={m.client.name} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Content calendar</h1>
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Previous month">
            <Link href={`/clients/${m.client.id}/calendar?month=${addMonths(first, -1).slice(0, 7)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-36 text-center font-semibold">{formatMonth(m.month)}</h2>
          <Button asChild size="icon" variant="ghost" aria-label="Next month">
            <Link href={`/clients/${m.client.id}/calendar?month=${addMonths(first, 1).slice(0, 7)}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
      <CalendarView data={m} today={istDate()} />
      {m.items.length === 0 ? <EmptyState icon={CalendarDays} title="Nothing planned this month" description={m.canEdit ? "Plan posts and ads here; attach the creative when it's made." : "The social media lead plans posts here."} className="md:hidden" /> : null}
    </div>
  );
}
