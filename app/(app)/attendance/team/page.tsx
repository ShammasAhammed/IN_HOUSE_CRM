import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addMonths } from "@/lib/dates";
import { formatDays, formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team attendance" };

export default function TeamAttendancePage({ searchParams }: PageProps<"/attendance/team">) {
  return (
    <Suspense fallback={<LoadingRows rows={10} columns={7} label="Loading the team's month" />}>
      <Team searchParams={searchParams} />
    </Suspense>
  );
}

async function Team({ searchParams }: Pick<PageProps<"/attendance/team">, "searchParams">) {
  const actor = await requireActor();
  const { month } = await searchParams;
  const result = await getServices().attendance.team(actor, typeof month === "string" ? month : undefined);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { rows } = result.value;
  const first = `${result.value.month}-01`;
  const th = "px-3 py-2 text-right text-xs font-medium text-muted-foreground";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label="Previous month">
          <Link href={`/attendance/team?month=${addMonths(first, -1).slice(0, 7)}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="min-w-40 text-center font-semibold">{formatMonth(result.value.month)}</h2>
        <Button asChild size="icon" variant="ghost" aria-label="Next month">
          <Link href={`/attendance/team?month=${addMonths(first, 1).slice(0, 7)}`}>
            <ChevronRight />
          </Link>
        </Button>
        {/* A plain link (never prefetched): the file is made when someone asks for it. */}
        <a href={`/api/hr/payroll?month=${result.value.month}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-hover">
          <Download className="size-4" /> Payroll CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nobody keeps attendance yet" description="Everyone except freelancers checks in." />
      ) : (
        <>
          {/* Phones: one card per person. */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.personId} className="rounded-lg border bg-card p-3 shadow-card">
                <Link href={`/attendance/month?month=${result.value.month}&person=${r.personId}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <Avatar name={r.fullName} size="sm" /> {r.fullName}
                </Link>
                <p className="tabular mt-1.5 text-xs text-muted-foreground">
                  {r.counts.present.office} office · {r.counts.present.home} home · {r.counts.present.client_site} client site · {formatDays(r.counts.leaveDays)} leave
                </p>
                <p className="tabular mt-0.5 text-xs">
                  <span className={cn(r.counts.absent ? "font-medium text-warning" : "text-muted-foreground")}>{r.counts.absent} no record</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {r.counts.late} late · {r.counts.short} short · {r.counts.open} not closed
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-subtle">
              <tr className="border-b">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Person</th>
                <th className={th}>Office</th>
                <th className={th}>Home</th>
                <th className={th}>Client site</th>
                <th className={th}>Leave</th>
                <th className={th}>No record</th>
                <th className={th}>Late</th>
                <th className={th}>Short</th>
                <th className={th}>Not closed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.personId} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/attendance/month?month=${result.value.month}&person=${r.personId}`} className="flex items-center gap-2 font-medium hover:underline">
                      <Avatar name={r.fullName} size="sm" /> {r.fullName}
                    </Link>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{r.counts.present.office}</td>
                  <td className="tabular px-3 py-2 text-right">{r.counts.present.home}</td>
                  <td className="tabular px-3 py-2 text-right">{r.counts.present.client_site}</td>
                  <td className="tabular px-3 py-2 text-right">{formatDays(r.counts.leaveDays)}</td>
                  <td className={cn("tabular px-3 py-2 text-right", r.counts.absent ? "font-medium text-warning" : undefined)}>{r.counts.absent}</td>
                  <td className="tabular px-3 py-2 text-right">{r.counts.late}</td>
                  <td className="tabular px-3 py-2 text-right">{r.counts.short}</td>
                  <td className="tabular px-3 py-2 text-right">{r.counts.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        &quot;No record&quot; is a past working day with no check-in and no leave: ask before assuming. For Zoho Payroll, use Payroll CSV at the top of this page.
      </p>
    </div>
  );
}
