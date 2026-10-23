// A person's growth page (plan/5): what they grow towards first, then the score with its workings and the trend.
import { WriteUp } from "../../me/my-assistant-forms";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatDate, formatMinutes, formatRupees } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LEARNING_KIND_LABELS, LEARNING_STATUS_LABELS, SKILL_LEVEL_LABELS } from "@/lib/types";
import { CloseGoal, GoalForm, LearningForm, LearningStatusSelect, LevelForm } from "../forms";

export const metadata: Metadata = { title: "Growth" };

export default function PersonGrowthPage({ params }: PageProps<"/growth/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading" />}>
      <Growth params={params} />
    </Suspense>
  );
}

const PART_LABELS = { delivery: "Delivery", skill: "Skills", growth: "Growth", people: "People (360)" } as const;
const TREND = { rising: { tone: "success", text: "Rising" }, falling: { tone: "danger", text: "Falling" }, steady: { tone: "neutral", text: "Steady" } } as const;

async function Growth({ params }: Pick<PageProps<"/growth/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const [r, assistant] = await Promise.all([getServices().growth.page(actor, id), getServices().myAssistant.status(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const v = r.value;
  const active = v.goals.filter((g) => g.status === "active");
  const closed = v.goals.filter((g) => g.status !== "active");
  const today = istDate();
  return (
    <div className="space-y-5">
      <BackLink fallback="/growth" />
      <PageHeader title={v.isSelf ? "My growth" : v.person.fullName} description={`${v.person.jobTitle}${v.person.departmentName ? ` · ${v.person.departmentName}` : ""}`} />
      {v.isSelf && assistant.prefs.reports && !assistant.aiReason ? (
        <Card>
          <CardHeader>
            <CardTitle>Monthly self-review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">A first draft from your finished tasks, time, skills and goals this month. Only you see it; nothing is saved or submitted.</p>
            <WriteUp kind="review" />
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Skills for the role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.skills.length ? (
              <ul className="divide-y text-sm">
                {v.skills.map((l) => (
                  <li key={l.skill.id} className="space-y-0.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{l.skill.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular">
                          {l.current}
                          {l.required ? ` / ${l.required}` : ""}
                        </span>
                        {l.gap ? <Badge tone="warning">{l.gap} to go</Badge> : l.required ? <Badge tone="success">At level</Badge> : null}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {SKILL_LEVEL_LABELS[l.current]}
                      {l.evidence ? ` · ${l.evidence}` : ""}
                      {l.setByName && l.setAt ? ` · ${l.setByName}, ${formatDate(istDate(l.setAt))}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No skills set for this role yet. HR adds them in the skills matrix.</p>
            )}
            {v.canCoach && v.skills.length ? (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Set a level</summary>
                <div className="pt-3">
                  <LevelForm personId={v.person.id} skills={v.skills.map((l) => ({ id: l.skill.id, name: l.skill.name, current: l.current }))} />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {active.length ? (
              <ul className="space-y-2 text-sm">
                {active.map((g) => (
                  <li key={g.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{g.title}</span>
                      {g.dueDate ? <Badge tone={g.dueDate < today ? "danger" : "neutral"}>{formatDate(g.dueDate)}</Badge> : null}
                    </div>
                    {g.skillName ? (
                      <p className="text-xs text-muted-foreground">
                        {g.skillName}
                        {g.targetLevel ? ` to level ${g.targetLevel}` : ""}
                      </p>
                    ) : null}
                    {g.plan ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{g.plan}</p> : null}
                    {g.proof ? <p className="mt-1 text-xs">Proof: {g.proof}</p> : null}
                    <div className="mt-2">
                      <CloseGoal goalId={g.id} canMarkDone={v.canCoach} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No live goal. Pick one thing to get better at.</p>
            )}
            {active.length < 3 ? (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Set a goal</summary>
                <div className="pt-3">
                  <GoalForm personId={v.person.id} skills={v.skills.map((l) => ({ id: l.skill.id, name: l.skill.name }))} />
                </div>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">Three goals at a time. Close one to add another.</p>
            )}
            {closed.length ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {closed.slice(0, 5).map((g) => (
                  <li key={g.id}>
                    {g.status === "done" ? "Done" : "Dropped"}: {g.title}
                    {g.closedAt ? `, ${formatDate(istDate(g.closedAt))}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Learning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.learning.length ? (
              <ul className="divide-y text-sm">
                {v.learning.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                          {l.title}
                        </a>
                      ) : l.docId ? (
                        <Link href={`/docs/${l.docId}` as Route} className="font-medium hover:underline">
                          {l.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.title}</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {LEARNING_KIND_LABELS[l.kind]}
                        {l.minutes ? ` · ${formatMinutes(l.minutes)} of work time` : ""}
                        {l.costPaise ? ` · ${formatRupees(l.costPaise)}` : ""}
                        {l.assignedByName ? ` · from ${l.assignedByName}` : ""}
                      </p>
                    </div>
                    {v.isSelf || v.canCoach ? <LearningStatusSelect learningId={l.id} status={l.status} canCoach={v.canCoach} /> : <Badge>{LEARNING_STATUS_LABELS[l.status]}</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing assigned yet.</p>
            )}
            {v.canCoach ? (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Assign learning</summary>
                <div className="pt-3">
                  <LearningForm personId={v.person.id} goals={active.map((g) => ({ id: g.id, name: g.title }))} />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="tabular text-3xl font-semibold text-primary">{v.score.score ?? "—"}</span>
              <span className="text-sm text-muted-foreground">of 100</span>
              {v.trend ? <Badge tone={TREND[v.trend].tone}>{TREND[v.trend].text}</Badge> : null}
            </div>
            <ul className="space-y-2 text-sm">
              {(Object.keys(PART_LABELS) as Array<keyof typeof PART_LABELS>).map((k) => (
                <li key={k}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{PART_LABELS[k]}</span>
                    <span className="tabular text-muted-foreground">
                      {v.score.parts[k] ?? "—"}
                      {v.score.parts[k] !== null ? ` · weight ${v.score.weights[k]}%` : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{v.score.workings[k]}</p>
                </li>
              ))}
            </ul>
            {v.history.length ? (
              <p className="tabular text-xs text-muted-foreground">Past months: {v.history.map((h) => `${formatDate(h.month)} ${h.score}`).join(" · ")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
