// Chat (Stage 12.1): every conversation this person may see, with unread counts. Client and space chats are for
// the team only; they never show in the client portal.
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Eye, Hash, LayoutGrid, ListChecks, MessagesSquare, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatShortDate, formatTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { ChannelView } from "@/services/chat";
import { unreadLabel } from "@/services/rules/chat";
import { NewChat } from "./new-chat";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading chats" />}>
        <ChatList />
      </Suspense>
    </div>
  );
}

/** "3 h", "2 d": how long a client has waited for a reply. */
function waitedFor(since: Date): string {
  const hours = Math.max(0, Math.floor((Date.now() - since.getTime()) / 3_600_000));
  return hours < 1 ? "under an hour" : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

const when = (d: Date | null) => (!d ? "" : istDate(d) === istDate() ? formatTime(d) : formatShortDate(istDate(d)));

function Rows({ channels, empty }: { channels: ChannelView[]; empty: string }) {
  if (!channels.length) return <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {channels.map((c) => {
        const Icon = c.kind === "shared" ? Eye : c.kind === "client" ? (c.isSpace ? LayoutGrid : Building2) : c.kind === "team" ? Hash : UserRound;
        return (
          <li key={c.id}>
            <Link href={`/chat/${c.id}` as Route} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className={c.unread ? "min-w-0 flex-1 truncate text-sm font-semibold" : "min-w-0 flex-1 truncate text-sm"}>{c.title}</span>
              {c.kind === "shared" ? <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">Client sees</span> : null}
              <span className="text-xs text-muted-foreground tabular">{when(c.lastMessageAt)}</span>
              {c.unread ? (
                <span className="tabular rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground">
                  {unreadLabel(c.unread)}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function ChatList() {
  const actor = await requireActor();
  const list = await getServices().chat.list(actor);
  const live = list.channels.filter((c) => !c.archivedAt);
  const archived = list.channels.filter((c) => c.archivedAt);
  const clients = live.filter((c) => c.kind === "client" || c.kind === "shared");
  const teams = live.filter((c) => c.kind === "team");
  const direct = live.filter((c) => c.kind === "direct");
  return (
    <>
      <PageHeader title="Chat" description="Talk where the work is. Client chats are for the team only, except the ones marked &quot;Client sees&quot;, which the client's portal users read too." actions={<NewChat people={list.people} canCreateTeam={list.canCreateTeam} />} />
      {list.channels.length === 0 && list.taskChats.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No chats yet" description="Start a direct message, or open a client's chat from its page." />
      ) : (
        <div className="space-y-4">
          {list.waiting.length ? (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle>Clients waiting for a reply</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {list.waiting.map((w) => (
                    <li key={w.channelId}>
                      <Link href={`/chat/${w.channelId}` as Route} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-hover">
                        <Eye className="size-4 shrink-0 text-warning" />
                        <span className="min-w-0 flex-1 truncate font-medium">{w.clientName}</span>
                        <span className="tabular text-xs text-warning">waiting {waitedFor(w.since)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Direct messages</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Rows channels={direct} empty="None yet. Use New message to write to someone." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Clients and spaces</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Rows channels={clients} empty="Open a client's or space's chat from its page; it shows here after that." />
            </CardContent>
          </Card>
          {teams.length || list.canCreateTeam ? (
            <Card>
              <CardHeader>
                <CardTitle>Team channels</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Rows channels={teams} empty="None yet. Use New channel for a group like Design or Ads." />
              </CardContent>
            </Card>
          ) : null}
          {list.taskChats.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Your tasks with comments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {list.taskChats.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}#comments` as Route} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                        <ListChecks className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{t.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{t.clientName}</span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular">{t.comments}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {archived.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Archived</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Rows channels={archived} empty="" />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
