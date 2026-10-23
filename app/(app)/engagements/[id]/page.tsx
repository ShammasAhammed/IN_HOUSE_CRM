import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, Pencil } from "lucide-react";
import { BurnMeter } from "@/components/burn-meter";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatDate, formatDateTime, formatDays, formatHours, formatMinutes, formatRupees, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { EngagementStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { EngagementPage } from "@/services/engagements";
import { DeliverablesEditor, FeeForm } from "./engagement-forms";

export const metadata: Metadata = { title: "Engagement" };

const STATUS: Record<EngagementStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  ended: { label: "Ended", tone: "neutral" },
};

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export default function EngagementRoute({ params, searchParams }: PageProps<"/engagements/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={3} label="Loading the engagement" />}>
      <EngagementScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EngagementScreen({ params, searchParams }: Pick<PageProps<"/engagements/[id]">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getServices().engagements.page(actor, id);
  if (!result.ok) return <ErrorState error={result.error} />;
  const page = result.value;
  const { engagement: e, visible } = page;
  const retainer = e.kind === "retainer";

  return (
    <div className="space-y-5">
      <Link href={`/clients/${e.clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {e.clientName}
      </Link>
      <PageHeader
        title={e.name}
        description={
          <>
            <Badge tone={STATUS[e.status].tone} className="mr-2 align-middle">
              {STATUS[e.status].label}
            </Badge>
            {e.serviceName} · {retainer ? "monthly retainer" : "one-off job"} from {formatShortDate(e.startDate)}
            {e.endDate ? ` to ${formatShortDate(e.endDate)}` : ""}
            {e.renewalDate ? ` · renews ${formatDate(e.renewalDate)}` : ""}
          </>
        }
        actions={
          visible.write ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/engagements/${e.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null
        }
      />
      {query.done === "created" ? <SuccessNotice>Engagement started. Add what&apos;s promised each month below, then start a project from the client page.</SuccessNotice> : null}
      {query.done === "updated" ? <SuccessNotice>Saved.</SuccessNotice> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {page.burn !== undefined ? <BurnCard page={page} /> : null}
          {retainer && page.periods.length ? <Months page={page} /> : null}
          <Card>
            <CardHeader>
              <CardTitle>Deliverables</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {visible.write ? (
                <DeliverablesEditor engagementId={e.id} deliverables={page.deliverables} perMonth={retainer} />
              ) : page.deliverables.length ? (
                <ul className="divide-y">
                  {page.deliverables.map((d) => (
                    <li key={d.id} className="flex justify-between py-2 text-sm">
                      <span>{d.name}</span>
                      <span className="tabular text-muted-foreground">
                        {d.targetCount}
                        {retainer ? " a month" : " in all"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing counted yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          {visible.money ? <Fees page={page} /> : null}
          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <dl className="space-y-2 text-sm">
                {e.hoursBudgetMinutes !== undefined ? (
                  <Row label={retainer ? "Hours a month" : "Hours for the job"} value={e.hoursBudgetMinutes ? formatHours(e.hoursBudgetMinutes) : "Not sold in hours"} />
                ) : null}
                {retainer ? <Row label="Unused hours" value={e.rolloverPolicy === "rollover" ? "Roll over one month" : "Expire at month end"} /> : null}
                <Row label="Service" value={e.serviceName} />
              </dl>
              {e.notes ? <p className="mt-3 whitespace-pre-line border-t pt-3 text-sm text-foreground-2">{e.notes}</p> : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function BurnCard({ page }: { page: EngagementPage }) {
  const b = page.burn;
  const retainer = page.engagement.kind === "retainer";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{retainer ? "This month" : "The whole job"}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {b ? (
          <>
            <BurnMeter {...b} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {formatMinutes(Math.max(0, b.remainingMinutes))} left · {formatDays(b.daysLeft)} to go
              {b.nonBillableMinutes ? ` · ${formatMinutes(b.nonBillableMinutes)} non-billable` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{retainer ? "No month is open for this retainer right now." : "This job isn't sold in hours."}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Months({ page }: { page: EngagementPage }) {
  const { visible } = page;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Month by month</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-0">
        <table className="w-full text-sm">
          <thead className="bg-subtle">
            <tr className="border-y text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Month</th>
              {visible.budget ? (
                <>
                  <th className="px-4 py-2 text-right font-medium">Hours</th>
                  <th className="px-4 py-2 text-right font-medium">Used</th>
                </>
              ) : null}
              {visible.money ? <th className="px-4 py-2 text-right font-medium">Fee</th> : null}
            </tr>
          </thead>
          <tbody>
            {page.periods.map((p) => (
              <tr key={p.periodStart} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  {monthName.format(new Date(`${p.periodStart}T00:00:00Z`))}
                  {p.status === "open" ? <span className="text-xs text-muted-foreground"> · open</span> : null}
                </td>
                {p.hours ? (
                  <>
                    <td className="tabular px-4 py-2.5 text-right">
                      {formatHours(p.hours.baseBudgetMinutes + p.hours.rolloverInMinutes)}
                      {p.hours.rolloverInMinutes ? <span className="block text-xs text-muted-foreground">incl. {formatHours(p.hours.rolloverInMinutes)} rolled in</span> : null}
                    </td>
                    <td className={cn("tabular px-4 py-2.5 text-right", p.hours.usedPercent >= 100 ? "text-danger" : p.hours.usedPercent >= 80 ? "text-warning" : undefined)}>
                      {formatHours(p.hours.usedMinutes)} · {p.hours.usedPercent}%
                    </td>
                  </>
                ) : null}
                {p.feePaise !== undefined ? <td className="tabular px-4 py-2.5 text-right">{formatRupees(p.feePaise)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Fees({ page }: { page: EngagementPage }) {
  const e = page.engagement;
  const retainer = e.kind === "retainer";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <p className="tabular text-2xl font-semibold">
          {e.feePaise !== undefined && e.feePaise !== null ? formatRupees(e.feePaise) : "—"}
          {" "}
          <span className="text-xs font-normal text-muted-foreground">{retainer ? "a month" : "in all"}, before GST</span>
        </p>
        {page.fees && page.fees.length > 1 ? (
          <ol className="space-y-1.5 text-sm">
            {page.fees.map((f) => (
              <li key={f.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">from {formatShortDate(f.effectiveFrom)}</span>
                <span className="tabular" title={`Set by ${f.createdByName ?? "someone"} on ${formatDateTime(new Date(f.createdAt))}`}>
                  {formatRupees(f.amountPaise)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {page.visible.write ? <FeeForm engagementId={e.id} kind={e.kind} thisMonth={istDate().slice(0, 7)} /> : null}
      </CardContent>
    </Card>
  );
}
