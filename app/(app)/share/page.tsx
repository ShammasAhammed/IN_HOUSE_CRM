// "Share to Oppllo" (Stage 13.2). Android: the share menu sends the link or picture to /api/share, which brings you
// here (?id=) to pick the client or space and, if you like, a board. iPhone (no web share menu): paste the link here,
// or use the one-time Shortcut, which opens /share?url=… (docs/share-to-oppllo.md).
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { AddLink } from "../swipe/swipe-forms";
import { UseShare } from "./use-share";

export const metadata: Metadata = { title: "Share to Oppllo" };

export default function SharePage({ searchParams }: PageProps<"/share">) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Share to Oppllo</h1>
        <p className="text-sm text-muted-foreground">Save an ad, reel or page to a client&apos;s swipe file, and put it on a board if you like.</p>
      </div>
      <Suspense fallback={<LoadingRows rows={3} columns={1} label="Loading" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/share">, "searchParams">) {
  const [actor, sp] = await Promise.all([requireActor(), searchParams]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 2000) : "");
  const services = getServices();
  const [places, lib] = await Promise.all([services.swipe.places(actor), services.boards.library(actor)]);
  const boards = lib.ok ? lib.value.boards.filter((b) => b.level === "edit" || b.level === "manage").map((b) => ({ id: b.id, title: b.title, clientName: b.clientName })) : [];
  const share = one("id") ? await services.swipe.share(actor, one("id")) : null;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      {one("error") ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {one("error") === "empty" ? "Nothing came through from the share menu. Paste the link instead." : one("error")}
        </p>
      ) : null}
      {one("id") && !share ? <p className="text-sm text-muted-foreground">That shared item was already filed, or isn&apos;t yours. Paste a link below.</p> : null}
      {share ? (
        <UseShare share={{ id: share.id, url: share.url, title: share.title, text: share.text, fileName: share.fileName }} places={places} boards={boards} />
      ) : (
        <>
          <AddLink places={places} url={one("url") || (one("text").match(/https?:\/\/\S+/)?.[0] ?? "")} boards={boards} then="board" />
          <p className="text-xs text-muted-foreground">On Android, install Oppllo One (Add to Home screen) and it appears in the share menu. On iPhone, paste the link here, or set up the “Share to Oppllo” Shortcut once (ask the owner for the guide).</p>
        </>
      )}
    </section>
  );
}
