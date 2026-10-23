// The intern engine (HR slice 3): current interns with batch, mentor and days left; past interns and the talent pool.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GraduationCap } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { countOf, formatDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { HIRE_AGAIN_LABELS } from "@/lib/types";
import type { InternView } from "@/services/talent";

export const metadata: Metadata = { title: "Interns" };

export default function InternsPage() {
  return (
    <>
      <BackLink fallback="/people" />
      <PageHeader title="Interns" description="Each batch: who mentors them, what they produced, and the review that writes their certificate." />
      <Suspense fallback={<LoadingRows rows={5} columns={3} label="Loading interns" />}>
        <Interns />
      </Suspense>
    </>
  );
}

function Rows({ items, past }: { items: InternView[]; past?: boolean }) {
  return (
    <ul className="divide-y rounded-lg border bg-card shadow-card">
      {items.map((v) => (
        <li key={v.person.id}>
          <Link href={`/people/interns/${v.person.id}` as Route} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-hover">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{v.person.fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {v.person.departmentName ?? "No department"} · {v.record ? `${v.record.batch} · mentor ${v.record.mentorName ?? "not set"}` : "No intern record yet"}
              </span>
            </span>
            {past ? (
              <span className="text-xs text-muted-foreground">left {v.person.endDate ? formatDate(v.person.endDate) : "—"}</span>
            ) : v.daysLeft !== null ? (
              <Badge tone={v.daysLeft < 0 ? "danger" : v.daysLeft <= 14 ? "warning" : "neutral"}>{v.daysLeft < 0 ? `${countOf(-v.daysLeft, "day")} past end` : `${countOf(v.daysLeft, "day")} left`}</Badge>
            ) : null}
            {v.record?.hireAgain ? <Badge tone={v.record.hireAgain === "yes" ? "success" : v.record.hireAgain === "no" ? "danger" : "neutral"}>Hire again: {HIRE_AGAIN_LABELS[v.record.hireAgain]}</Badge> : !past ? null : <Badge tone="warning">Not reviewed</Badge>}
            {v.record?.inTalentPool ? <Badge tone="brand">Talent pool</Badge> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Interns() {
  const actor = await requireActor();
  const r = await getServices().talent.interns(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { current, past } = r.value;
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Now</h2>
        {current.length ? <Rows items={current} /> : <EmptyState icon={GraduationCap} title="No interns right now" description="Add a person with the Intern type, then start their record here." />}
      </section>
      {past.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Before (the talent pool is marked)</h2>
          <Rows items={past} past />
        </section>
      ) : null}
    </div>
  );
}
