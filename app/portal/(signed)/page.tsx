import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HealthBadge } from "@/components/health-badge";
import { LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, formatMonth, formatRupees, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requirePortalUser } from "@/lib/server/session";
import { CONTENT_CHANNEL_LABELS, type ContentChannel } from "@/lib/types";

export const metadata: Metadata = { title: "Your work with Oppllo", robots: { index: false, follow: false } };

const count = (n: number | null) => (n === null ? "—" : formatCount(n));

async function Home() {
  const user = await requirePortalUser();
  const h = await getServices().portal.home(user);
  const r = h.results;
  return (
    <>
      {h.waiting ? (
        <Link href={"/portal/creatives" as Route} className="block rounded-lg border border-primary bg-card px-4 py-3 text-sm font-medium text-primary shadow-card">
          {h.waiting === 1 ? "1 creative is" : `${h.waiting} creatives are`} waiting for your approval →
        </Link>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{formatMonth(h.month)} so far</CardTitle>
          <HealthBadge level={h.health.level} />
        </CardHeader>
        <CardContent className="space-y-3">
          {r ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Leads", count(r.leads), r.targetLeads],
                ["Admissions", count(r.admissions), r.targetAdmissions],
                ["Counselling calls", count(r.callsBooked), null],
                ["Cost per lead", r.costPerLeadPaise === null ? "—" : formatRupees(r.costPerLeadPaise), null],
              ].map(([label, value, target]) => (
                <div key={String(label)} className="rounded-md bg-subtle px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="tabular text-base font-semibold">
                    {value}
                    {target ? <span className="text-xs font-normal text-muted-foreground"> of {formatCount(Number(target))}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">This month&apos;s numbers will show here once your Oppllo team adds them.</p>
          )}
          {h.health.reasons.length ? (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {h.health.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Delivered this month</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {h.delivered.deliverables.map((d) => (
                <li key={d.name}>
                  {d.name}: <span className="tabular">{d.delivered} of {d.target}</span>
                </li>
              ))}
              <li>
                Posts published: <span className="tabular">{h.delivered.postsPublished}</span>
              </li>
              <li>
                Creatives approved: <span className="tabular">{h.delivered.creativesApproved}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {h.next.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {h.next.map((n) => (
                  <li key={`${n.publishOn}-${n.title}`} className="flex gap-3 py-1.5">
                    <span className="tabular w-16 shrink-0 text-muted-foreground">{formatShortDate(n.publishOn)}</span>
                    <span className="min-w-0 flex-1 truncate">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{CONTENT_CHANNEL_LABELS[n.channel as ContentChannel] ?? n.channel}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-sm">
        Need something?{" "}
        <Link href={"/portal/requests" as Route} className="text-primary hover:underline">
          Send a request
        </Link>
      </p>
    </>
  );
}

export default function PortalHomePage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading" />}>
      <Home />
    </Suspense>
  );
}
