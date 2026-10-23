// A monthly client report, ready to print or save as PDF (Stage 11.4). Outside the app frame so it prints as a page.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { ReportNumbers, ReportWords } from "@/components/report-body";
import { formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Monthly report", robots: { index: false, follow: false } };

export default function PrintReportPage({ params }: PageProps<"/reports/[clientId]/[month]">) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-6 py-10 print:max-w-none print:p-0">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the report…</p>}>
        <PrintReport params={params} />
      </Suspense>
    </main>
  );
}

async function PrintReport({ params }: Pick<PageProps<"/reports/[clientId]/[month]">, "params">) {
  const actor = await requireActor();
  const { clientId, month } = await params;
  const r = await getServices().reports.page(actor, clientId, month);
  const report = r.ok ? r.value.report : null;
  if (!r.ok || !report) return <p className="text-sm text-muted-foreground">This report isn&apos;t available.</p>;
  return (
    <article className="space-y-6 text-sm leading-relaxed">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/clients/${clientId}/report?month=${month}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <PrintButton />
      </div>
      {report.status === "draft" ? <p className="rounded-md bg-warning-soft px-3 py-2 text-center text-xs font-medium text-warning">DRAFT: not final yet</p> : null}
      <header className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <Image src="/oppllo-icon.png" alt="" width={28} height={28} className="rounded-md" />
          <span className="text-base font-semibold">Oppllo Digital</span>
        </div>
        <p className="text-right text-xs text-muted-foreground">Monthly report</p>
      </header>
      <h1 className="text-lg font-semibold">
        {r.value.clientName}: {formatMonth(report.month)}
      </h1>
      <ReportWords summary={report.summary} wentWell="" nextSteps="" />
      <ReportNumbers facts={report.facts} />
      <ReportWords summary="" wentWell={report.wentWell} nextSteps={report.nextSteps} />
    </article>
  );
}
