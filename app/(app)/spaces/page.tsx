import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { ACCESS_LEVEL_LABELS } from "@/lib/types";
import { requireActor } from "@/lib/server/session";
import { AddSuggested, EditSpaceForm, NewSpaceForm, RemoveMember } from "./space-forms";

export const metadata: Metadata = { title: "Spaces" };

export default function SpacesPage() {
  return (
    <>
      <PageHeader title="Spaces" description="Oppllo's own work: founder office, finance, HR, sales, marketing, operations. Private spaces are seen only by their members and the owner." />
      <nav className="-mt-2 mb-4 flex gap-4 text-sm">
        <Link href={"/spaces/access" as Route} className="text-primary hover:underline">
          Access and approvals
        </Link>
        <Link href={"/me/access" as Route} className="text-primary hover:underline">
          My access
        </Link>
      </nav>
      <Suspense fallback={<LoadingRows rows={5} columns={2} label="Loading spaces" />}>
        <Spaces />
      </Suspense>
    </>
  );
}

async function Spaces() {
  const actor = await requireActor();
  const r = await getServices().spaces.list(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { spaces, canManage, canManageMembers, missingSuggested } = r.value;
  const kits = canManage || actor.roles.includes("hr") ? await getServices().spaceKits.list(actor) : [];
  return (
    <div className="space-y-5">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a space</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <NewSpaceForm kits={kits.map((k) => ({ key: k.key, name: k.name, private: k.private }))} />
            {missingSuggested.length ? <AddSuggested names={missingSuggested} /> : null}
          </CardContent>
        </Card>
      ) : null}
      {kits.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Space kits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">A kit fills a space with a starter project, recurring tasks, pages, goals and a board, unowned until you pick people. Applying one again adds only what&apos;s missing.</p>
            <ul className="flex flex-wrap gap-2">
              {kits.map((k) => (
                <li key={k.key}>
                  <Link href={`/spaces/kits/${k.key}` as Route} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm hover:bg-hover">
                    {k.name}
                    {k.private ? <span className="text-xs text-muted-foreground">· private</span> : null}
                    {k.appliedTo.length ? <span className="text-xs text-success">· in {k.appliedTo.map((x) => x.name).join(", ")}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {spaces.length === 0 ? (
        <EmptyState title="No spaces yet" description={canManage ? "Add the suggested spaces above, or your own." : "Spaces you're a member of show here."} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          {spaces.map((s) => {
            return (
              <Card key={s.id}>
                <CardHeader>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <CardTitle className="truncate">
                      {s.canOpen ? (
                        <Link href={`/clients/${s.id}` as Route} className="hover:underline">
                          {s.name}
                        </Link>
                      ) : (
                        s.name
                      )}
                    </CardTitle>
                    {s.isPrivate ? <Badge tone="warning">Private</Badge> : s.isSensitive ? <Badge tone="warning">Sensitive</Badge> : null}
                    {s.archived ? <Badge>Archived</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!s.canOpen ? <p className="text-xs text-muted-foreground">You manage its members; its work is only for them and the owner.</p> : null}
                  {s.members.length ? (
                    <ul className="space-y-1.5">
                      {s.members.map((m) => (
                        <li key={m.personId} className="flex items-center gap-2 text-sm">
                          <Avatar name={m.fullName} size="sm" />
                          <span className="min-w-0 flex-1 truncate">
                            {m.fullName}
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · {ACCESS_LEVEL_LABELS[m.level]}
                              {m.expiresOn ? ` until ${formatDate(m.expiresOn)}` : ""}
                            </span>
                          </span>
                          {canManageMembers ? <RemoveMember spaceId={s.id} personId={m.personId} name={m.fullName} /> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{s.isPrivate ? "No members yet: only the owner sees it." : "No members yet."}</p>
                  )}
                  {s.canAsk ? (
                    <Link href={`/spaces/access?space=${s.id}` as Route} className="inline-block text-sm text-primary hover:underline">
                      Ask for someone&apos;s access
                    </Link>
                  ) : null}
                  {s.canEdit ? (
                    <details className="rounded-md border p-3">
                      <summary className="cursor-pointer text-sm font-medium">{canManage ? "Rename, privacy, archive" : "Rename or archive"}</summary>
                      <div className="mt-3">
                        <EditSpaceForm space={s} owner={canManage} />
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
