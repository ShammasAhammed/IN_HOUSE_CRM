import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requirePortalUser } from "@/lib/server/session";
import { CommentCreative, DecideCreative } from "../portal-forms";

export const metadata: Metadata = { title: "Creatives", robots: { index: false, follow: false } };

async function Creatives() {
  const user = await requirePortalUser();
  const list = await getServices().portal.creatives(user);
  if (list.length === 0) return <EmptyState title="Nothing waiting for you" description="When Oppllo sends a creative for your approval, it shows here." />;
  return (
    <>
      {list.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle className="truncate">{c.title}</CardTitle>
            <span className="text-xs text-muted-foreground">Version {c.version}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived, per-person link; the image optimiser can't fetch it
              <img src={c.url} alt={c.title} className="max-h-96 w-full rounded-md border object-contain" />
            ) : null}
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm break-all text-primary hover:underline">
              Open {c.fileName}
            </a>
            {c.comments.length ? (
              <ul className="space-y-2 text-sm">
                {c.comments.map((m) => (
                  <li key={m.id} className="rounded-md bg-subtle px-3 py-2">
                    <span className="block text-xs text-muted-foreground">
                      {m.by} · {formatDateTime(m.createdAt)}
                    </span>
                    {m.body}
                  </li>
                ))}
              </ul>
            ) : null}
            <CommentCreative assetId={c.id} versionId={c.versionId} />
            <div className="border-t pt-3">
              <DecideCreative assetId={c.id} versionId={c.versionId} />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export default function PortalCreativesPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Creatives for your approval</h1>
      <Suspense fallback={<LoadingRows rows={3} columns={1} label="Loading creatives" />}>
        <Creatives />
      </Suspense>
    </>
  );
}
