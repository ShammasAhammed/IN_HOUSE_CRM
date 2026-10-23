import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { ReportNumbers, ReportWords } from "@/components/report-body";
import { ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requirePortalUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Monthly report", robots: { index: false, follow: false } };

async function Report({ params }: { params: PageProps<"/portal/reports/[month]">["params"] }) {
  const user = await requirePortalUser();
  const { month } = await params;
  const r = await getServices().portal.report(user, month);
  if (!r.ok) return <ErrorState error={r.error} />;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{formatMonth(r.value.month)}</h1>
        <PrintButton />
      </div>
      <Card>
        <CardContent className="space-y-6 pt-4">
          <ReportWords summary={r.value.summary} wentWell="" nextSteps="" />
          <ReportNumbers facts={r.value.facts} />
          <ReportWords summary="" wentWell={r.value.wentWell} nextSteps={r.value.nextSteps} />
        </CardContent>
      </Card>
    </>
  );
}

export default function PortalReportPage({ params }: PageProps<"/portal/reports/[month]">) {
  return (
    <>
      <Link href="/portal/reports" className="text-sm text-muted-foreground hover:text-foreground">
        ← Reports
      </Link>
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading the report" />}>
        <Report params={params} />
      </Suspense>
    </>
  );
}
