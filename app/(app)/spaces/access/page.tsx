import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ACCESS_LEVEL_LABELS } from "@/lib/types";
import { RemoveMember } from "../space-forms";
import { AskAccessForm, DecideForm, MarkReviewed } from "./access-forms";

export const metadata: Metadata = { title: "Space access" };

export default function AccessPage({ searchParams }: PageProps<"/spaces/access">) {
  return (
    <>
      <Link href="/spaces" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Spaces
      </Link>
      <PageHeader title="Space access" description="Access is asked by the owner or HR, approved by the other one, and opens only when the person confirms they understand it." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading access" />}>
        <Access searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATUS_TONE = { confirmed: "success", refused: "danger", cancelled: "neutral" } as const;

async function Access({ searchParams }: Pick<PageProps<"/spaces/access">, "searchParams">) {
  const actor = await requireActor();
  const services = getServices();
  const [query, list, admin] = await Promise.all([searchParams, services.spaces.list(actor), services.spaceAccess.admin(actor)]);
  if (!list.ok) return <ErrorState error={list.error} />;
  const askable = list.value.spaces.filter((s) => s.canAsk && !s.archived).map((s) => ({ id: s.id, name: s.name, isPrivate: s.isPrivate, sensitive: s.isPrivate || s.isSensitive }));
  if (!askable.length && !admin.ok) return <ErrorState error={admin.error} />;
  const a = admin.ok ? admin.value : null;
  return (
    <div className="space-y-5">
      {askable.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Ask for someone&apos;s access</CardTitle>
          </CardHeader>
          <CardContent>
            <AskAccessForm spaces={askable} people={list.value.people} spaceId={typeof query.space === "string" ? query.space : ""} />
          </CardContent>
        </Card>
      ) : null}
      {a ? (
        <>
          {!a.hrExists ? <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">There is no HR person, so the owner approves alone; each approval says so.</p> : null}
          <Card>
            <CardHeader>
              <CardTitle>Waiting for approval</CardTitle>
            </CardHeader>
            <CardContent>
              {a.pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing waiting.</p>
              ) : (
                <ul className="space-y-3">
                  {a.pending.map((r) => (
                    <li key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {r.personName} · {r.spaceName}
                        </span>
                        <Badge tone="brand">{ACCESS_LEVEL_LABELS[r.level]}</Badge>
                        {r.isPrivate || r.isSensitive ? <Badge tone="warning">Sensitive</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Asked by {r.requestedByName}, {formatDateTime(r.createdAt)} · Why: {r.reason}
                        {r.twoStep ? ` · Google 2-step: ${r.twoStep === "yes" ? "yes" : "not sure"}` : ""}
                      </p>
                      <p className="rounded-md bg-subtle px-3 py-2">{r.preview}</p>
                      {r.canDecide ? <DecideForm requestId={r.id} /> : <p className="text-xs text-muted-foreground">{r.whyNot}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>Approved, waiting for &quot;I understand&quot;</CardTitle>
              </CardHeader>
              <CardContent>
                {a.awaitingMember.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {a.awaitingMember.map((r) => (
                      <li key={r.id} className="py-2">
                        {r.personName} · {r.spaceName} · {ACCESS_LEVEL_LABELS[r.level]}
                        <span className="block text-xs text-muted-foreground">
                          Approved by {r.decidedByName}
                          {r.ownerAlone ? " alone" : ""}
                          {r.decidedAt ? `, ${formatDateTime(r.decidedAt)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Ending in the next 7 days</CardTitle>
              </CardHeader>
              <CardContent>
                {a.ending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing ending soon.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {a.ending.map((e) => (
                      <li key={`${e.spaceName}-${e.fullName}`} className="py-2">
                        {e.fullName} · {e.spaceName} · ends {formatDate(e.expiresOn)}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Members review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Every 90 days the owner goes through each space: remove whoever no longer needs it, then mark it reviewed.</p>
              {a.review.length === 0 ? (
                <EmptyState title="No members yet" description="Spaces with members show here." className="py-6" />
              ) : (
                a.review.map((s) => (
                  <section key={s.spaceId} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{s.name}</h3>
                      {s.isPrivate ? <Badge tone="warning">Private</Badge> : null}
                      <Badge tone={s.due ? "danger" : "success"}>{s.reviewedAt ? `Reviewed ${formatDateTime(s.reviewedAt)}` : "Never reviewed"}</Badge>
                    </div>
                    <ul className="divide-y text-sm">
                      {s.members.map((m) => (
                        <li key={m.personId} className="flex flex-wrap items-center gap-2 py-1.5">
                          <span className="min-w-0 flex-1">
                            {m.fullName} · {ACCESS_LEVEL_LABELS[m.level]}
                            {m.expiresOn ? ` · until ${formatDate(m.expiresOn)}` : ""}
                          </span>
                          <RemoveMember spaceId={s.spaceId} personId={m.personId} name={m.fullName} />
                        </li>
                      ))}
                    </ul>
                    {a.isOwner ? <MarkReviewed spaceId={s.spaceId} name={s.name} /> : null}
                  </section>
                ))
              )}
            </CardContent>
          </Card>
          {a.recent.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Recently decided</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {a.recent.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        {r.personName} · {r.spaceName} · {ACCESS_LEVEL_LABELS[r.level]}
                        {r.decisionNote ? <span className="block text-xs text-muted-foreground">{r.decisionNote}</span> : null}
                      </span>
                      <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
      <p className="text-sm">
        <Link href={"/me/access" as Route} className="text-primary hover:underline">
          Your own access
        </Link>
      </p>
    </div>
  );
}
