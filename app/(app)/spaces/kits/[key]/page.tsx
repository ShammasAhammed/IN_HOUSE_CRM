// One space kit (Stage 14.4): what it makes, where it's been applied, apply it (preview first), and the owner's
// changes to it.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ACCESS_LEVEL_LABELS } from "@/lib/types";
import { can } from "@/services/permissions";
import { describeItem } from "@/services/rules/space-kits";
import { appliesKits } from "@/services/space-kits";
import { ApplyKit, EditKit } from "../kit-forms";

export const metadata: Metadata = { title: "Space kit" };

export default function KitRoute({ params }: PageProps<"/spaces/kits/[key]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={1} label="Loading the kit" />}>
      <Kit params={params} />
    </Suspense>
  );
}

async function Kit({ params }: Pick<PageProps<"/spaces/kits/[key]">, "params">) {
  const actor = await requireActor();
  const services = getServices();
  const r = await services.spaceKits.get((await params).key);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { kit, base, overrides } = r.value;
  const [list, spaces] = await Promise.all([services.spaceKits.list(actor), services.spaces.list(actor)]);
  const appliedTo = list.find((k) => k.key === kit.key)?.appliedTo ?? [];
  const isOwner = can(actor, "spaces.manage");
  return (
    <div className="space-y-4">
      <BackLink fallback="/spaces" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{kit.name} kit</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="success">Approved</Badge>
          {kit.private ? <Badge tone="warning">Makes the space private and sensitive</Badge> : null}
          <Badge tone="neutral">Members: {ACCESS_LEVEL_LABELS[kit.memberLevel]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{kit.description}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>What it makes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-disc space-y-1 pl-5">
                {kit.items.map((i) => (
                  <li key={i.key}>{describeItem(i)}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Everything starts unowned: pick people for tasks and goals once they&apos;re members of the space.</p>
              {appliedTo.length ? <p className="text-xs">Applied in: {appliedTo.map((a) => a.name).join(", ")}.</p> : null}
            </CardContent>
          </Card>
          {isOwner ? (
            <Card>
              <CardHeader>
                <CardTitle>Change the kit</CardTitle>
              </CardHeader>
              <CardContent>
                <EditKit
                  kit={kit.key}
                  items={base.items.map((i) => ({
                    key: i.key,
                    label: describeItem(i),
                    off: (overrides.off ?? []).includes(i.key),
                    ...(i.kind === "recurring" ? { day: { value: overrides.days?.[i.key] ?? (i.frequency === "weekly" ? (i.weekday ?? 1) : (i.dayOfMonth ?? 1)), weekly: i.frequency === "weekly" } } : {}),
                    ...(i.kind === "goal" ? { target: overrides.targets?.[i.key] ?? i.target } : {}),
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
        {appliesKits(actor) ? (
          <aside>
            <Card>
              <CardHeader>
                <CardTitle>Apply it</CardTitle>
              </CardHeader>
              <CardContent>
                <ApplyKit kit={kit.key} spaces={spaces.ok ? spaces.value.spaces.filter((s) => !s.archived && (s.canOpen || !s.isPrivate || s.members.some((m) => m.personId === actor.personId))).map((s) => ({ id: s.id, name: s.name })) : []} canAddSpace={isOwner} defaultName={kit.name} />
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
