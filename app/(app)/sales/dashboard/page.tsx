import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { formatCount, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LEAD_STAGE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SalesGroup } from "@/services/rules/sales";
import { MIN_CLOSED_FOR_WIN_RATE } from "@/services/rules/sales";

export const metadata: Metadata = { title: "Sales dashboard" };

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
];

export default function SalesDashboardPage({ searchParams }: PageProps<"/sales/dashboard">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={4} label="Loading the sales dashboard" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/sales/dashboard">["searchParams"] }) {
  const actor = await requireActor();
  const { days } = await searchParams;
  const r = await getServices().leads.dashboard(actor, Number(typeof days === "string" ? days : 30));
  if (!r.ok) return <ErrorState error={r.error} />;
  const d = r.value;
  const maxDay = Math.max(1, ...d.perDay.map((p) => p.count));
  const maxStage = Math.max(1, ...d.stages.map((s) => s.count));
  const kpis = [
    { label: "Leads", value: formatCount(d.total) },
    { label: "Open", value: formatCount(d.open) },
    { label: "Hot", value: formatCount(d.hot) },
    { label: "Won", value: formatCount(d.won) },
    { label: "Win rate", value: d.winRate === null ? "—" : `${d.winRate}%`, note: d.winRate === null ? `Needs ${MIN_CLOSED_FOR_WIN_RATE} closed leads (${d.closed} so far)` : null },
    { label: "Open, nobody owns", value: formatCount(d.unassigned), warn: d.unassigned > 0 },
  ];
  return (
    <div className="space-y-5">
      <nav aria-label="Period" className="flex flex-wrap gap-1">
        {PERIODS.map((p) => (
          <Link
            key={p.days}
            href={`/sales/dashboard?days=${p.days}`}
            aria-current={d.days === p.days ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-sm", d.days === p.days ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-hover")}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-3 shadow-card">
            <dt className="text-xs text-muted-foreground">{k.label}</dt>
            <dd className={cn("tabular mt-0.5 text-xl font-semibold", "warn" in k && k.warn && "text-warning")}>{k.value}</dd>
            {"note" in k && k.note ? <dd className="text-xs text-muted-foreground">{k.note}</dd> : null}
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="rounded-lg border bg-card p-4 shadow-card" aria-label="New leads per day">
          <h2 className="mb-3 text-sm font-semibold">New leads per day</h2>
          <div className="flex h-32 items-end gap-0.5" role="img" aria-label={`New leads per day, ${formatShortDate(d.perDay[0]!.date)} to ${formatShortDate(d.perDay.at(-1)!.date)}`}>
            {d.perDay.map((p) => (
              <div key={p.date} title={`${formatShortDate(p.date)}: ${p.count}`} className="flex-1 rounded-t-sm bg-primary/80" style={{ height: `${Math.max(2, (p.count / maxDay) * 100)}%`, opacity: p.count ? 1 : 0.25 }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{formatShortDate(d.perDay[0]!.date)}</span>
            <span>Most in a day: {maxDay}</span>
            <span>{formatShortDate(d.perDay.at(-1)!.date)}</span>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 shadow-card" aria-label="By stage">
          <h2 className="mb-3 text-sm font-semibold">By stage</h2>
          <ul className="space-y-2 text-sm">
            {d.stages.map((s) => (
              <li key={s.stage} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2">
                <span className="truncate">{LEAD_STAGE_LABELS[s.stage]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                </span>
                <span className="tabular text-right">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <GroupTable title="By channel" rows={d.channels} />
        <GroupTable title="By campaign" rows={d.campaigns} empty="No campaign data yet. Lead-form leads include it; for landing pages, add ?utm_campaign=… to the ad links." />
        <GroupTable title="By landing page" rows={d.pages} empty="No landing-page leads yet." />
        <GroupTable title="By owner" rows={d.owners} />

        {d.lostReasons.length ? (
          <section className="rounded-lg border bg-card p-4 shadow-card" aria-label="Why leads were lost">
            <h2 className="mb-3 text-sm font-semibold">Why leads were lost</h2>
            <ul className="space-y-1.5 text-sm">
              {d.lostReasons.map((l) => (
                <li key={l.reason} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{l.reason}</span>
                  <span className="tabular">{l.count}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function GroupTable({ title, rows, empty = "Nothing yet." }: { title: string; rows: SalesGroup[]; empty?: string }) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-card" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1.5 font-normal">Name</th>
              <th className="pb-1.5 text-right font-normal">Leads</th>
              <th className="pb-1.5 text-right font-normal">Open</th>
              <th className="pb-1.5 text-right font-normal">Hot</th>
              <th className="pb-1.5 text-right font-normal">Won</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.slice(0, 12).map((g) => (
              <tr key={g.key} className="border-t">
                <td className="max-w-0 truncate py-1.5 pr-2">{g.key}</td>
                <td className="w-12 py-1.5 text-right">{g.leads}</td>
                <td className="w-12 py-1.5 text-right">{g.open}</td>
                <td className="w-12 py-1.5 text-right">{g.hot}</td>
                <td className="w-12 py-1.5 text-right">{g.won}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
