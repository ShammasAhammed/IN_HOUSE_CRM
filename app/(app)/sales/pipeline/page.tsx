import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ScoreBadge } from "@/components/lead-bits";
import { ErrorState, LoadingRows } from "@/components/states";
import { formatShortDate } from "@/lib/format";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LEAD_STAGE_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={4} label="Loading the pipeline" />}>
      <Pipeline />
    </Suspense>
  );
}

async function Pipeline() {
  const actor = await requireActor();
  const r = await getServices().leads.board(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="flex gap-3">
        {r.value.map((col) => (
          <section key={col.stage} aria-label={LEAD_STAGE_LABELS[col.stage]} className="w-64 shrink-0 rounded-lg bg-subtle p-2">
            <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
              {LEAD_STAGE_LABELS[col.stage]}
              <span className="tabular text-xs font-normal text-muted-foreground">{col.leads.length}</span>
            </h2>
            {col.stage === "won" || col.stage === "lost" ? <p className="mb-2 px-1 text-xs text-muted-foreground">Last 30 days</p> : null}
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
              {col.leads.map((l) => (
                <li key={l.id}>
                  <Link href={`/sales/leads/${l.id}`} className="block rounded-md border bg-card p-2.5 text-sm shadow-card hover:border-border-strong">
                    <span className="block truncate font-medium">{l.institution ?? l.name}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{l.ownerName ?? "Nobody yet"}</span>
                      <ScoreBadge score={l.score} />
                    </span>
                    {l.nextFollowUpAt ? <span className="mt-1 block text-xs text-muted-foreground">Next: {formatShortDate(istDate(l.nextFollowUpAt))}</span> : null}
                  </Link>
                </li>
              ))}
              {col.leads.length === 0 ? <li className="px-1 text-xs text-muted-foreground">None</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
