import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { addMonths } from "@/lib/dates";
import { formatDateTime, formatMonth, paiseToRupeesInput } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { MetaPrefill } from "@/services/results";
import { ResultsForm } from "./results-form";

export const metadata: Metadata = { title: "Enter results" };

export default function ResultsPage({ params, searchParams }: PageProps<"/clients/[id]/results">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the form" />}>
      <Results params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const META_HINT: Record<MetaPrefill["state"], string | null> = {
  used: "Leads and spend are filled in from Meta where they were empty. Change them if your own count differs.",
  not_linked: null,
  not_connected: null,
  other_month: null,
  not_inr: "Meta's numbers aren't used: the ad account isn't in rupees.",
  error: "Meta didn't answer, so leads and spend weren't filled in.",
};

async function Results({ params, searchParams }: Pick<PageProps<"/clients/[id]/results">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const r = await getServices().results.form(actor, id, typeof query.month === "string" ? query.month : undefined);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { clientId, clientName, month, thisMonth, values: v, saved, meta } = r.value;
  const text = (n: number | null) => (n === null ? "" : String(n));
  // The months the card shows, so an earlier one can be corrected.
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, -i));
  return (
    <div className="space-y-5">
      <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {clientName}
      </Link>
      <PageHeader
        title={`Results for ${formatMonth(month)}`}
        description={saved ? `Last saved ${formatDateTime(saved.at)}${saved.byName ? ` by ${saved.byName}` : ""}.` : `${clientName}'s leads, spend, counselling calls and admissions for the month.`}
      />
      <nav aria-label="Month" className="flex flex-wrap gap-1">
        {months.map((m) => (
          <Link
            key={m}
            href={`/clients/${clientId}/results?month=${m.slice(0, 7)}` as Route}
            aria-current={m === month ? "page" : undefined}
            className={cn("rounded-md px-2.5 py-1 text-xs", m === month ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-hover")}
          >
            {formatMonth(m)}
          </Link>
        ))}
      </nav>
      <ResultsForm
        key={month}
        clientId={clientId}
        month={month.slice(0, 7)}
        metaHint={META_HINT[meta.state]}
        initial={{
          leads: text(v.leads),
          spend: v.spendPaise === null ? "" : paiseToRupeesInput(v.spendPaise),
          callsBooked: text(v.callsBooked),
          admissions: text(v.admissions),
          targetLeads: text(v.targetLeads),
          targetAdmissions: text(v.targetAdmissions),
        }}
      />
    </div>
  );
}
