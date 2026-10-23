// Growth (plan/5): your own page, the team grid for heads and HR, and HR's view of the whole agency.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes, formatRupees } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Growth" };

export default function GrowthPage({ searchParams }: PageProps<"/growth">) {
  return (
    <div className="space-y-5">
      <Suspense fallback={<LoadingRows rows={2} columns={2} label="Loading" />}>
        <Header />
      </Suspense>
      <Suspense fallback={<LoadingRows rows={5} columns={4} label="Loading the team" />}>
        <Team searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Header() {
  const actor = await requireActor();
  return (
    <PageHeader
      title="Growth"
      description="Skills each role needs, where people are, and what they are growing towards."
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href={`/growth/${actor.personId}` as Route}>My growth</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={"/growth/skills" as Route}>Skills matrix</Link>
          </Button>
        </div>
      }
    />
  );
}

async function Team({ searchParams }: { searchParams: PageProps<"/growth">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const dept = typeof sp.department === "string" ? sp.department : undefined;
  const r = await getServices().growth.team(actor, dept);
  if (!r.ok) return r.error.code === "forbidden" ? null : <ErrorState error={r.error} />;
  const v = r.value;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Team grid</CardTitle>
        {v.departments.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {v.departments.map((d) => (
              <Button key={d.id} asChild size="sm" variant={d.id === v.departmentId ? "default" : "outline"}>
                <Link href={`/growth?department=${d.id}` as Route}>{d.name}</Link>
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {!v.people.length || !v.skills.length ? (
          <EmptyState title={v.people.length ? "No skills for this team yet" : "Nobody in this team"} description="Add skills and what each role needs in the skills matrix." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Person</th>
                  {v.skills.map((s) => (
                    <th key={s.id} className="px-2 py-2 text-center font-medium">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {v.people.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3">
                      <Link href={`/growth/${p.id}` as Route} className="font-medium hover:underline">
                        {p.fullName}
                      </Link>
                      {p.overdueGoals ? (
                        <Badge tone="danger" className="ml-2">
                          {p.overdueGoals} overdue
                        </Badge>
                      ) : null}
                    </td>
                    {v.skills.map((s) => {
                      const c = v.cells[`${p.id}:${s.id}`];
                      const short = c && c.required !== null && c.level < c.required;
                      return (
                        <td key={s.id} className={`tabular px-2 py-2.5 text-center ${short ? "bg-warning-soft text-warning" : ""}`}>
                          {c?.level ?? 0}
                          {c?.required ? <span className="text-xs text-muted-foreground">/{c.required}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function Overview() {
  const actor = await requireActor();
  const r = await getServices().growth.overview(actor);
  if (!r.ok) return r.error.code === "forbidden" ? null : <ErrorState error={r.error} />;
  const v = r.value;
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle>Needs support now</CardTitle>
        </CardHeader>
        <CardContent>
          {v.support.length ? (
            <ul className="divide-y text-sm">
              {v.support.map((s) => (
                <li key={s.personId} className="py-2">
                  <Link href={`/growth/${s.personId}` as Route} className="font-medium hover:underline">
                    {s.fullName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{s.reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody right now.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ready for more</CardTitle>
        </CardHeader>
        <CardContent>
          {v.ready.length ? (
            <ul className="divide-y text-sm">
              {v.ready.map((s) => (
                <li key={s.personId} className="flex justify-between py-2">
                  <Link href={`/growth/${s.personId}` as Route} className="font-medium hover:underline">
                    {s.fullName}
                  </Link>
                  <span className="tabular text-primary">{s.score}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody at every required level with a score of 80 or more yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Thin skills</CardTitle>
        </CardHeader>
        <CardContent>
          {v.risks.length ? (
            <ul className="divide-y text-sm">
              {v.risks.map((s) => (
                <li key={s.id} className="flex justify-between py-2">
                  <span>{s.name}</span>
                  <Badge tone={s.people ? "warning" : "danger"}>{s.people ? `only ${s.people} at level 3+` : "nobody at level 3+"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{v.skillCount ? "Every skill has at least two people who can do it alone." : "No skills set up yet. Add them in the Skills matrix."}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Learning given</CardTitle>
        </CardHeader>
        <CardContent>
          {v.given.length ? (
            <ul className="divide-y text-sm">
              {v.given.map((g) => (
                <li key={g.personId} className="flex justify-between gap-2 py-2">
                  <span>{g.fullName}</span>
                  <span className="tabular text-muted-foreground">
                    {formatMinutes(g.minutes)} · {formatRupees(g.costPaise)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No learning time or money given yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
