// Meta ad results on the client page (Stage 10.1, D92).
import type { Route } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { ErrorState } from "@/components/states";
import { countOf, formatCount, formatDateTime, formatMoneyMinor, formatPercent, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { AdInsights, AdRange } from "@/repositories";
import { LinkAdAccountForm, RefreshAds, UnlinkAdAccount } from "./ad-forms";

const RANGES: Array<{ id: AdRange; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_7d", label: "7 days" },
  { id: "last_30d", label: "30 days" },
  { id: "last_month", label: "Last month" },
];

export async function AdResults({ clientId, range }: { clientId: string; range: string | undefined }) {
  const actor = await requireActor();
  const r = await getServices().ads.forClient(actor, clientId, range);
  if (!r.ok) return r.error.code === "forbidden" ? null : <ErrorState error={r.error} />;
  const a = r.value;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="Meta ads">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Megaphone className="size-4 text-muted-foreground" /> Meta ads
      </h2>
      {a.state === "not_connected" ? (
        <p className="text-sm text-muted-foreground">Not set up yet. The owner adds a Meta token to switch this on.</p>
      ) : a.state === "not_linked" ? (
        <>
          <p className="text-sm text-muted-foreground">Link this client&apos;s ad account to see spend, leads and cost per lead here.</p>
          <LinkAdAccountForm clientId={clientId} />
        </>
      ) : (
        <>
          <nav aria-label="Period" className="flex flex-wrap gap-1">
            {RANGES.map((x) => (
              <Link
                key={x.id}
                href={`/clients/${clientId}?ads=${x.id}` as Route}
                scroll={false}
                aria-current={a.range === x.id ? "page" : undefined}
                className={cn("rounded-md px-2.5 py-1 text-xs", a.range === x.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-hover")}
              >
                {x.label}
              </Link>
            ))}
          </nav>
          {a.state === "error" ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              Meta didn&apos;t answer: {a.message}
            </p>
          ) : (
            <Numbers insights={a.insights} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              act_{a.accountId}
              {a.state === "ok" ? ` · ${formatShortDate(a.insights.since)} – ${formatShortDate(a.insights.until)} · ${a.insights.timeZone} · from Meta ${formatDateTime(a.fetchedAt)}` : ""}
            </span>
            <span className="flex items-center gap-1">
              <RefreshAds clientId={clientId} range={a.range} />
              <UnlinkAdAccount clientId={clientId} />
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Numbers({ insights: i }: { insights: AdInsights }) {
  const money = (m: number) => formatMoneyMinor(m, i.currency);
  const t = i.totals;
  const tiles = [
    { label: "Spend", value: money(t.spendMinor) },
    { label: "Leads", value: formatCount(t.leads) },
    { label: "Cost per lead", value: t.leads ? money(Math.round(t.spendMinor / t.leads)) : "—" },
    { label: "Click rate", value: formatPercent(t.clicks, t.impressions) },
  ];
  const max = Math.max(1, ...i.daily.map((d) => d.spendMinor));
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-md bg-subtle px-3 py-2">
            <dt className="text-xs text-muted-foreground">{x.label}</dt>
            <dd className="tabular text-base font-semibold">{x.value}</dd>
          </div>
        ))}
      </dl>
      {i.daily.length > 1 ? (
        <div className="flex h-12 items-end gap-0.5" role="img" aria-label="Spend per day">
          {i.daily.map((d) => (
            <div key={d.date} title={`${formatShortDate(d.date)}: ${money(d.spendMinor)}, ${countOf(d.leads, "lead")}`} className="flex-1 rounded-t-sm bg-primary/70" style={{ height: `${Math.max(3, (d.spendMinor / max) * 100)}%` }} />
          ))}
        </div>
      ) : null}
      {i.campaigns.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-1.5 font-normal">Campaign</th>
                <th className="pb-1.5 text-right font-normal">Spend</th>
                <th className="pb-1.5 text-right font-normal">Leads</th>
                <th className="pb-1.5 text-right font-normal">Per lead</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {i.campaigns.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="max-w-0 truncate py-1.5 pr-2">{c.name}</td>
                  <td className="py-1.5 text-right">{money(c.spendMinor)}</td>
                  <td className="py-1.5 text-right">{c.leads}</td>
                  <td className="py-1.5 text-right">{c.leads ? money(Math.round(c.spendMinor / c.leads)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No ads ran in this period.</p>
      )}
      <p className="text-xs text-muted-foreground">Reach {formatCount(i.reach)} people · leads as Meta counts them (its default attribution).</p>
    </div>
  );
}
