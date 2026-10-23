// Results per client on the client page (Stage 11.1): this month against target, and the last six months.
import type { Route } from "next";
import Link from "next/link";
import { FileText, Pencil, Target } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatCount, formatMonth, formatRupees } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { MonthView } from "@/services/results";

const count = (n: number | null) => (n === null ? "—" : formatCount(n));
const rupees = (p: number | null) => (p === null ? "—" : formatRupees(p));
const percent = (n: number | null) => (n === null ? "—" : `${n}%`);
/** Oppllo's own space (14.5) counts Sales leads, demos and colleges won, in the same columns. */
const WORDS = { client: { leads: "Leads", calls: "Calls", won: "Admissions", perWon: "Per admission", rate: "Lead → admission" }, self: { leads: "Sales leads", calls: "Demos", won: "Colleges won", perWon: "Per college won", rate: "Lead → won" } };
type Words = (typeof WORDS)["client"];

export async function ResultsCard({ clientId }: { clientId: string }) {
  const actor = await requireActor();
  const r = await getServices().results.forClient(actor, clientId);
  if (!r.ok) return r.error.code === "forbidden" ? null : <ErrorState error={r.error} />;
  const { months, health, canEdit, thisMonth, self } = r.value;
  const w = self ? WORDS.self : WORDS.client;
  const now = months[0]!.result;
  const tiles = [
    { label: w.leads, value: count(now?.leads ?? null), target: now?.targetLeads },
    { label: w.won, value: count(now?.admissions ?? null), target: now?.targetAdmissions },
    { label: "Cost per lead", value: rupees(now?.costPerLeadPaise ?? null) },
    { label: `Cost ${w.perWon.toLowerCase()}`, value: rupees(now?.costPerAdmissionPaise ?? null) },
  ];
  const entered = months.filter((m) => m.result);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="Results">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4 text-muted-foreground" /> Results
        </h2>
        <HealthBadge level={health.level} />
        <Button size="sm" variant="ghost" className="ml-auto" asChild>
          <Link href={`/clients/${clientId}/report` as Route}>
            <FileText /> Monthly report
          </Link>
        </Button>
        {canEdit ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/clients/${clientId}/results` as Route}>
              <Pencil /> Enter results
            </Link>
          </Button>
        ) : null}
      </div>
      {health.reasons.length ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {health.reasons.map((x) => (
            <li key={x}>
              {health.month === thisMonth ? x : `${formatMonth(health.month)}: ${x}`}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">{formatMonth(thisMonth)}</p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md bg-subtle px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className="tabular text-base font-semibold">
                {t.value}
                {t.target ? <span className="text-xs font-normal text-muted-foreground"> of {formatCount(t.target)}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {entered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No results entered yet.{canEdit ? " Enter this month's leads, spend, calls and admissions to track them here." : ""}</p>
      ) : (
        <>
          {/* A table from tablets up; one small card per month on phones. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1.5 font-normal">Month</th>
                  <th className="pb-1.5 text-right font-normal">{w.leads}</th>
                  <th className="pb-1.5 text-right font-normal">Spend</th>
                  <th className="pb-1.5 text-right font-normal">{w.calls}</th>
                  <th className="pb-1.5 text-right font-normal">{w.won}</th>
                  <th className="pb-1.5 text-right font-normal">Per lead</th>
                  <th className="pb-1.5 text-right font-normal">{w.perWon}</th>
                  <th className="pb-1.5 text-right font-normal">{w.rate}</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {months.map(({ month, result: m }) => (
                  <tr key={month} className="border-t">
                    <td className="py-2.5 pr-2">
                      <MonthLink clientId={clientId} month={month} canEdit={canEdit} />
                    </td>
                    <td className="py-2.5 text-right">{count(m?.leads ?? null)}</td>
                    <td className="py-2.5 text-right">{rupees(m?.spendPaise ?? null)}</td>
                    <td className="py-2.5 text-right">{count(m?.callsBooked ?? null)}</td>
                    <td className="py-2.5 text-right">{count(m?.admissions ?? null)}</td>
                    <td className="py-2.5 text-right">{rupees(m?.costPerLeadPaise ?? null)}</td>
                    <td className="py-2.5 text-right">{rupees(m?.costPerAdmissionPaise ?? null)}</td>
                    <td className="py-2.5 text-right">{percent(m?.leadToAdmissionPercent ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden">
            {entered.map(({ month, result }) => (
              <MonthItem key={month} clientId={clientId} month={month} m={result!} canEdit={canEdit} w={w} />
            ))}
          </ul>
        </>
      )}
      {self ? (
        <p className="text-xs text-muted-foreground">
          Sales leads, demos (leads moved to “audit booked”) and colleges won are read live from Sales; anything typed in wins.
          {self.byChannel.length ? ` This month by channel: ${self.byChannel.map((c) => `${c.channel} ${c.leads}`).join(", ")}.` : ""}
        </p>
      ) : null}
      {now && (now.leadsSource === "meta" || now.spendSource === "meta") ? <p className="text-xs text-muted-foreground">This month&apos;s {now.leadsSource === "meta" && now.spendSource === "meta" ? "leads and spend" : now.leadsSource === "meta" ? "leads" : "spend"} as Meta reported them.</p> : null}
    </section>
  );
}

function MonthLink({ clientId, month, canEdit }: { clientId: string; month: string; canEdit: boolean }) {
  if (!canEdit) return <>{formatMonth(month)}</>;
  return (
    <Link href={`/clients/${clientId}/results?month=${month.slice(0, 7)}` as Route} className="hover:underline">
      {formatMonth(month)}
    </Link>
  );
}

function MonthItem({ clientId, month, m, canEdit, w }: { clientId: string; month: string; m: MonthView; canEdit: boolean; w: Words }) {
  const pairs = [
    [w.leads, count(m.leads)],
    ["Spend", rupees(m.spendPaise)],
    [w.calls, count(m.callsBooked)],
    [w.won, count(m.admissions)],
    ["Per lead", rupees(m.costPerLeadPaise)],
    [w.perWon, rupees(m.costPerAdmissionPaise)],
  ];
  return (
    <li className="py-2.5">
      <p className="text-sm font-medium">
        <MonthLink clientId={clientId} month={month} canEdit={canEdit} />
      </p>
      <dl className="tabular mt-1 grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
        {pairs.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
