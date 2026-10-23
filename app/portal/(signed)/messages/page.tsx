// Messages (Stage 12.6): the client's chat with the Oppllo team, phone first. What waits for them elsewhere in the
// portal sits on top as cards.
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, Inbox, Palette } from "lucide-react";
import { LoadingRows } from "@/components/states";
import { formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requirePortalUser } from "@/lib/server/session";
import { PortalChat } from "./portal-chat";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

async function Messages() {
  const user = await requirePortalUser();
  const view = await getServices().clientChat.view(user);
  const card = "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-card hover:bg-hover";
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        {view.cards.creatives ? (
          <Link href={"/portal/creatives" as Route} className={card}>
            <Palette className="size-4 text-primary" /> {view.cards.creatives === 1 ? "1 creative waits" : `${view.cards.creatives} creatives wait`} for you
          </Link>
        ) : null}
        {view.cards.latestReport ? (
          <Link href={`/portal/reports/${view.cards.latestReport}` as Route} className={card}>
            <FileText className="size-4 text-primary" /> {formatMonth(`${view.cards.latestReport}-01`)} report
          </Link>
        ) : null}
        {view.cards.openRequests ? (
          <Link href={"/portal/requests" as Route} className={card}>
            <Inbox className="size-4 text-primary" /> {view.cards.openRequests === 1 ? "1 request" : `${view.cards.openRequests} requests`} in progress
          </Link>
        ) : null}
      </div>
      <PortalChat initial={JSON.parse(JSON.stringify(view.messages))} serverTime={view.serverTime} />
    </>
  );
}

export default function MessagesPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Messages</h1>
        <p className="text-sm text-muted-foreground">Write to the Oppllo team here instead of WhatsApp. They usually reply within a working day.</p>
      </div>
      <Suspense fallback={<LoadingRows rows={5} columns={1} label="Loading messages" />}>
        <Messages />
      </Suspense>
    </>
  );
}
