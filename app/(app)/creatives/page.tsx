import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, Image as ImageIcon, Link2, Palette, Video } from "lucide-react";
import { ApprovalBadge } from "@/components/approval-badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { formatShortDate } from "@/lib/format";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { APPROVAL_STATE_LABELS, APPROVAL_STATES, type ApprovalState, type AssetKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Creatives" };

const ICON: Record<AssetKind, typeof ImageIcon> = { image: ImageIcon, video: Video, document: FileText, link: Link2, other: FileText };

export default function CreativesPage({ searchParams }: PageProps<"/creatives">) {
  return (
    <>
      <PageHeader title="Creatives" description="Every version kept; reviewed by a strategist, then the client. Add creatives from their task." />
      <Suspense fallback={<LoadingRows rows={8} columns={3} label="Loading creatives" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: Pick<PageProps<"/creatives">, "searchParams">) {
  const actor = await requireActor();
  const { state, client } = await searchParams;
  const s = typeof state === "string" && ([...APPROVAL_STATES, "all"] as string[]).includes(state) ? state : undefined;
  const clientId = typeof client === "string" ? client : undefined;
  const r = await getServices().assets.list(actor, { ...(s ? { state: s } : {}), ...(clientId ? { clientId } : {}) });
  if (!r.ok) return <ErrorState error={r.error} />;
  const { assets, counts } = r.value;
  const inProgress = (["draft", "internal_review", "client_review", "changes_requested"] as const).reduce((n, k) => n + (counts[k] ?? 0), 0);
  const href = (st?: string) => {
    const q = new URLSearchParams({ ...(st ? { state: st } : {}), ...(clientId ? { client: clientId } : {}) }).toString();
    return (q ? `/creatives?${q}` : "/creatives") as Route;
  };
  const chips: Array<{ key?: string; label: string; n?: number }> = [
    { key: "draft", label: APPROVAL_STATE_LABELS.draft, n: counts.draft ?? 0 },
    { label: "In progress", n: inProgress },
    ...(["internal_review", "client_review", "changes_requested", "approved"] as ApprovalState[]).map((k) => ({ key: k, label: APPROVAL_STATE_LABELS[k], n: counts[k] ?? 0 })),
    { key: "all", label: "All" },
  ];
  const today = istDate();

  return (
    <div className="space-y-4">
      <nav aria-label="Filter by state" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1.5">
          {chips.map((c) => {
            const active = (c.key ?? undefined) === s;
            return (
              <li key={c.label}>
                <Link
                  href={href(c.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                    active && "border-primary bg-accent text-accent-foreground",
                  )}
                >
                  {c.label}
                  {c.n !== undefined ? <span className="tabular text-xs">{c.n}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {clientId && assets[0] ? (
        <p className="text-sm text-muted-foreground">
          {assets[0].clientName} only ·{" "}
          <Link href={(s ? `/creatives?state=${s}` : "/creatives") as Route} className="text-primary hover:underline">
            all clients
          </Link>
        </p>
      ) : null}
      {assets.length === 0 ? (
        <EmptyState icon={Palette} title="Nothing here" description={s === "internal_review" ? "No creatives wait for review." : "Creatives appear here once they're added on a task."} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          {assets.map((a) => {
            const Icon = ICON[a.kind];
            return (
              <li key={a.id}>
                <Link href={`/creatives/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.clientName}
                      {a.projectName ? ` · ${a.projectName}` : ""} · v{a.currentVersion} · {istDate(a.updatedAt) === today ? "today" : formatShortDate(istDate(a.updatedAt))}
                    </span>
                  </span>
                  <ApprovalBadge state={a.approvalState} className="shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
