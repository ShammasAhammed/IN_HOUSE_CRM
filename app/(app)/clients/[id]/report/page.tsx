import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReportNumbers, ReportWords } from "@/components/report-body";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addMonths } from "@/lib/dates";
import { formatDateTime, formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import { internalNote } from "@/services/rules/reports";
import { MakeFinal, RefreshNumbers, ReportTextForm, StartReport, WriteWithAi } from "./report-forms";

export const metadata: Metadata = { title: "Monthly report" };

export default function ReportPage({ params, searchParams }: PageProps<"/clients/[id]/report">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the report" />}>
      <Report params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: Pick<PageProps<"/clients/[id]/report">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const r = await getServices().reports.page(actor, id, typeof query.month === "string" ? query.month : undefined);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { clientId, clientName, self, month, thisMonth, report, others, canEdit, aiBlocked } = r.value;
  const ym = month.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, -i));
  const statusOf = new Map(others.map((o) => [o.month, o.status]));
  const k = { clientId, month: ym, version: report?.version ?? 0 };
  const draft = report?.status === "draft";
  return (
    <div className="space-y-5">
      <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {clientName}
      </Link>
      <PageHeader
        title={self ? `Oppllo – ${formatMonth(month)}` : `Report for ${formatMonth(month)}`}
        description={
          report
            ? report.status === "final"
              ? `Final${report.finalizedByName ? `, by ${report.finalizedByName}` : ""}${report.finalizedAt ? ` on ${formatDateTime(report.finalizedAt)}` : ""}. It can't be changed.`
              : `Draft. Numbers read ${formatDateTime(new Date(report.facts.gatheredAt))}.`
            : `${clientName}'s month in numbers, with a few words around them.`
        }
      />
      <nav aria-label="Month" className="flex flex-wrap gap-1">
        {months.map((m) => (
          <Link
            key={m}
            href={`/clients/${clientId}/report?month=${m.slice(0, 7)}` as Route}
            aria-current={m === month ? "page" : undefined}
            className={cn("rounded-md px-2.5 py-1 text-xs", m === month ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-hover")}
          >
            {formatMonth(m)}
            {statusOf.get(m) ? ` · ${statusOf.get(m) === "final" ? "final" : "draft"}` : ""}
          </Link>
        ))}
      </nav>
      {!report ? (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              No report for {formatMonth(month)} yet.
              {canEdit ? " Starting it gathers the month's results, ads, deliverables, tasks, creatives and posts. The words come next: from the AI, or written by you." : ""}
            </p>
            {canEdit ? <StartReport k={k} /> : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>The report</CardTitle>
              <Badge tone={draft ? "warning" : "success"}>{draft ? "Draft" : "Final"}</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              <ReportNumbers facts={report.facts} />
              {draft && canEdit ? <ReportTextForm key={report.version} k={{ ...k, version: report.version }} initial={{ summary: report.summary, wentWell: report.wentWell, nextSteps: report.nextSteps }} /> : <ReportWords {...report} />}
            </CardContent>
          </Card>
          <aside className="space-y-4">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/reports/${clientId}/${ym}` as Route} target="_blank">
                <Printer /> Print or save as PDF
              </Link>
            </Button>
            {draft && canEdit ? (
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <WriteWithAi k={{ ...k, version: report.version }} disabled={Boolean(aiBlocked)} />
                    <p className="text-xs text-muted-foreground">
                      {aiBlocked ? `${aiBlocked} Until then, write the words yourself; the numbers are already in.` : "Replaces the three boxes with the AI's draft. It only writes words around these numbers."}
                    </p>
                  </div>
                  <RefreshNumbers k={{ ...k, version: report.version }} />
                  <div className="space-y-1 border-t pt-3">
                    <MakeFinal k={{ ...k, version: report.version }} />
                    <p className="text-xs text-muted-foreground">Save your edits first. A final report can&apos;t be changed.</p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {canEdit ? <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted-foreground">For Oppllo only, not in the report: {internalNote(report.facts)}.</p> : null}
          </aside>
        </div>
      )}
    </div>
  );
}
