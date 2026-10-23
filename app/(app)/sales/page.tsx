import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadItem } from "@/components/lead-bits";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { LeadRow } from "@/repositories";

export const metadata: Metadata = { title: "Sales today" };

export default function SalesTodayPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading today's follow-ups" />}>
      <Today />
    </Suspense>
  );
}

function Section({ title, leads, empty, hint, tone, now }: { title: string; leads: LeadRow[]; empty: string; hint?: string; tone?: "danger" | "warning"; now: Date }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-sm font-semibold">
        <span className={tone === "danger" && leads.length ? "text-danger" : tone === "warning" && leads.length ? "text-warning" : ""}>{title}</span>
        <span className="tabular ml-1.5 text-muted-foreground">{leads.length}</span>
      </h2>
      {hint && leads.length ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {leads.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          {leads.map((l) => (
            <LeadItem key={l.id} lead={l} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function Today() {
  const actor = await requireActor();
  const r = await getServices().leads.today(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  const t = r.value;
  const now = new Date();
  return (
    <div className="max-w-4xl space-y-6">
      <Section title="Waiting for a first call" tone="danger" leads={t.waiting} now={now} empty="Every new lead from the last two weeks has been picked up." hint="New for over 2 hours. The first institution to call back usually wins the admission season." />
      <Section title="Overdue" tone="danger" leads={t.overdue} now={now} empty="Nothing overdue." />
      <Section title="Due today" leads={t.dueToday} now={now} empty="No more follow-ups for today." />
      <Section title="New and unassigned" tone="warning" leads={t.unassigned} now={now} empty="Every lead has an owner." hint="Someone should take these first." />
      {t.ownerWithoutLogin.length ? (
        <Section title="Owner has no Oppllo login" tone="warning" leads={t.ownerWithoutLogin} now={now} empty="" hint="These people own leads in the CRM but aren't in Oppllo One yet. Add them in People with the same email as in the CRM, then copy from the CRM again, or give the leads to someone here." />
      ) : null}
      <Section title="Your leads going cold" tone="warning" leads={t.goingCold} now={now} empty="Nothing untouched for a week." hint="Open leads with nothing done for 7 days." />
      <Section title="Your leads with no next step" leads={t.noNextStep} now={now} empty="All your open leads have a follow-up date." hint="Every open lead needs a follow-up date, so nothing is forgotten." />
    </div>
  );
}
