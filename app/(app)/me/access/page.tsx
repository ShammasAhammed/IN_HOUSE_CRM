import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { confirmAccessAction } from "./actions";

export const metadata: Metadata = { title: "My access" };

export default function MyAccessPage() {
  return (
    <>
      <Link href="/me" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> My page
      </Link>
      <PageHeader title="My access" description="Every space you're in, what you can and can't do there, and until when." />
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading your access" />}>
        <Mine />
      </Suspense>
    </>
  );
}

async function Mine() {
  const actor = await requireActor();
  const m = await getServices().spaceAccess.mine(actor);
  return (
    <div className="space-y-5">
      {m.toConfirm.map((c) => (
        <Card key={c.requestId} className="border-primary">
          <CardHeader>
            <CardTitle>New access: {c.spaceName}</CardTitle>
            <Badge tone="warning">Waiting for you</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{c.message}</p>
            <ConfirmForm action={confirmAccessAction} fields={{ requestId: c.requestId }} label="I understand" pendingLabel="Opening…" variant="default" />
          </CardContent>
        </Card>
      ))}
      {m.spaces.length === 0 && m.toConfirm.length === 0 ? (
        <EmptyState title="No space access" description="You work in client spaces through your role. Access to Oppllo's own spaces is given by the owner and HR." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          {m.spaces.map((s) => (
            <Card key={s.spaceId}>
              <CardHeader>
                <CardTitle className="truncate">
                  <Link href={`/clients/${s.spaceId}` as Route} className="hover:underline">
                    {s.name}
                  </Link>
                </CardTitle>
                <Badge tone="brand">{s.levelLabel}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  Since {formatDateTime(s.since)} · {s.expiresOn ? `until ${formatDate(s.expiresOn)}` : "no end date"}
                  {s.isPrivate ? " · private" : ""}
                </p>
                <p>
                  <span className="font-medium">You can:</span> {s.can.join("; ")}.
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">You can&apos;t:</span> {s.cannot.join("; ")}.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
