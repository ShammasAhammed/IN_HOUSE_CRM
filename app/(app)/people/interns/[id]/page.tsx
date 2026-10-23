// One intern (HR slice 3): record, what they actually produced (from Projects), training library, review, letters.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countOf, formatDate, formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LETTER_KIND_LABELS } from "@/lib/types";
import { InternRecordForm, InternReviewForm } from "../../talent-forms";

export const metadata: Metadata = { title: "Intern" };

export default function InternPage({ params }: PageProps<"/people/interns/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading" />}>
      <Intern params={params} />
    </Suspense>
  );
}

async function Intern({ params }: Pick<PageProps<"/people/interns/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const r = await services.talent.intern(actor, id);
  if (!r.ok) return <ErrorState error={r.error} />;
  const v = r.value;
  const [training, directory] = await Promise.all([services.docs.training(actor, v.person.departmentId), services.people.directory(actor)]);
  const people = directory.ok ? directory.value.filter((p) => p.status === "active" && p.id !== v.person.id).map((p) => ({ id: p.id, name: p.fullName })) : [];
  const onTime = v.work.withDue ? Math.round((v.work.onTime / v.work.withDue) * 100) : null;
  return (
    <div className="space-y-5">
      <BackLink fallback="/people/interns" />
      <PageHeader
        title={v.person.fullName}
        description={`${v.person.jobTitle} · ${v.person.departmentName ?? "No department"} · joined ${formatDate(v.person.joinDate)}${v.daysLeft !== null ? ` · ${countOf(v.daysLeft, "day")} left` : ""}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/people/${v.person.id}` as Route}>Profile</Link>
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Internship</CardTitle>
          </CardHeader>
          <CardContent>
            {v.canManage ? (
              <InternRecordForm personId={v.person.id} record={v.record ? { batch: v.record.batch, mentorId: v.record.mentorId, plannedEndDate: v.record.plannedEndDate, focus: v.record.focus } : null} people={people} />
            ) : v.record ? (
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="inline text-muted-foreground">Batch </dt>
                  <dd className="inline">{v.record.batch}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Mentor </dt>
                  <dd className="inline">{v.record.mentorName ?? "Not set"}</dd>
                </div>
                {v.record.focus ? <p className="text-muted-foreground">{v.record.focus}</p> : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">HR hasn&apos;t started this record yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What they produced</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-subtle p-2">
                <dd className="tabular text-lg font-semibold">{v.work.tasksDone}</dd>
                <dt className="text-xs text-muted-foreground">tasks done</dt>
              </div>
              <div className="rounded-md bg-subtle p-2">
                <dd className="tabular text-lg font-semibold">{onTime === null ? "—" : `${onTime}%`}</dd>
                <dt className="text-xs text-muted-foreground">on time</dt>
              </div>
              <div className="rounded-md bg-subtle p-2">
                <dd className="tabular text-lg font-semibold">{v.work.hoursLogged}</dd>
                <dt className="text-xs text-muted-foreground">hours logged</dt>
              </div>
            </dl>
            {v.work.recent.length ? (
              <ul className="space-y-1 text-sm">
                {v.work.recent.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <Link href={`/tasks/${t.id}` as Route} className="min-w-0 truncate hover:underline">
                      {t.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.clientName}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing finished yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Training library</CardTitle>
          </CardHeader>
          <CardContent>
            {training.length ? (
              <ul className="space-y-1 text-sm">
                {training.map((d) => (
                  <li key={d.id}>
                    <Link href={`/docs/${d.id}` as Route} className="hover:underline">
                      {d.title}
                    </Link>
                    {d.departmentId ? null : <span className="text-xs text-muted-foreground"> · everyone</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No training pages yet. Open a team page in Docs and mark it as training.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>End review</CardTitle>
            {v.record?.reviewedAt ? <span className="text-xs text-muted-foreground">by {v.record.reviewedByName} · {formatDateTime(new Date(v.record.reviewedAt))}</span> : null}
          </CardHeader>
          <CardContent>
            {v.record && v.canReview ? (
              <InternReviewForm personId={v.person.id} record={v.record} />
            ) : v.record?.reviewedAt ? (
              <div className="space-y-2 text-sm">
                <p>{v.record.workedOn}</p>
                <p className="text-muted-foreground">{v.record.strengths}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Written by the mentor or HR near the end.</p>
            )}
          </CardContent>
        </Card>
      </div>
      {v.canManage || v.letters.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Letters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.letters.length ? (
              <ul className="space-y-1 text-sm">
                {v.letters.map((l) => (
                  <li key={l.id}>
                    <Link href={`/letters/${l.id}` as Route} className="hover:underline">
                      {LETTER_KIND_LABELS[l.kind]} · {l.refNo}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">{formatDate(l.issuedOn)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {v.canManage ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/people/${v.person.id}/letter?kind=internship_certificate` as Route}>Issue internship certificate</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
