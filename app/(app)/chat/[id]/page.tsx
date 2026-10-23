// One conversation (Stage 12.1): the last 50 messages, then new ones as they come (checked every few seconds).
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Eye } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { wire } from "../wire";
import { ChannelSettings } from "./channel-settings";
import { ChatRoom } from "./chat-room";

export const metadata: Metadata = { title: "Chat" };

export default function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink fallback="/chat" label="All chats" />
      <Suspense fallback={<LoadingRows rows={8} columns={1} label="Loading messages" />}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: Pick<PageProps<"/chat/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const [r, ai, assistant, cards] = await Promise.all([services.chat.conversation(actor, id), services.chatAi.status(actor), services.myAssistant.status(actor), services.coworker.cards(actor, id)]);
  if (!r.ok) return <ErrorState error={r.error} className="mt-4" />;
  const c = r.value;
  const ch = c.channel;
  const about =
    ch.kind === "client"
      ? `${ch.isSpace ? "Space" : "Client"} chat for the team only. Clients never see it.`
      : ch.kind === "team"
        ? `${c.members.length} ${c.members.length === 1 ? "person" : "people"}: ${c.members.map((m) => m.fullName).join(", ")}`
        : ch.kind === "shared"
          ? "Shared with the client's portal users."
          : "Direct message";
  return (
    <>
      <header className="mt-3 mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{ch.title}</h1>
          <p className="text-xs text-muted-foreground">
            {about}
            {(ch.kind === "client" || ch.kind === "shared") && ch.clientId ? (
              <>
                {" "}
                <Link href={`/clients/${ch.clientId}` as Route} className="text-primary hover:underline">
                  Open {ch.isSpace ? "space" : "client"}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {c.canManage ? <ChannelSettings channelId={ch.id} name={ch.name ?? ""} archived={Boolean(ch.archivedAt)} members={c.members} people={(await getServices().chat.list(actor)).people} /> : null}
      </header>
      {ch.kind === "shared" ? (
        <div role="note" className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <Eye className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Client can see this.</strong> Everything here reaches {ch.clientName}&apos;s portal users. Keep hours, fees and other clients out; @AI answers only you here.
            {services.clientChat.emailReady() ? null : <span className="block text-xs">Client email alerts are off until email is set up.</span>}
          </span>
        </div>
      ) : null}
      <ChatRoom
        key={ch.id}
        channelId={ch.id}
        initial={c.messages.map(wire)}
        hasEarlier={c.hasEarlier}
        serverTime={c.serverTime}
        canPost={c.canPost}
        readOnlyReason={c.readOnlyReason}
        mentionable={c.mentionable}
        appOrigin={new URL(process.env.APP_URL || "http://localhost:3000").origin}
        lastReadAt={c.lastReadAt}
        ai={ai}
        canDraft={assistant.prefs.drafts && !assistant.aiReason}
        cards={cards}
        people={[{ id: actor.personId, name: actor.fullName }, ...c.mentionable]}
        shared={ch.kind === "shared" && ch.clientId ? { otherClients: await services.chat.otherClientNames(actor, ch.clientId) } : null}
      />
    </>
  );
}
