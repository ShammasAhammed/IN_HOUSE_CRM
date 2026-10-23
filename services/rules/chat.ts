// Chat (Stage 12.1): small rules about messages. Pure: no I/O, unit-tested.
import type { ChannelRecord, MessageRecord } from "@/repositories";

/** Own messages can be corrected for a short while; after that they stay as written (removing is always possible). */
export const EDIT_MINUTES = 15;
export const PAGE_SIZE = 50;
export const MAX_DIRECT_PEOPLE = 8;
export const MAX_BODY = 4000;

/** An AI answer is never edited (that would put words in the AI's mouth); who asked may still remove it. */
export function mayEdit(m: Pick<MessageRecord, "authorId" | "createdAt" | "deletedAt"> & { aiReplyTo?: string | null; coworkerId?: string | null }, personId: string, now: Date): boolean {
  return m.authorId === personId && !m.deletedAt && !m.aiReplyTo && !m.coworkerId && now.getTime() - m.createdAt.getTime() <= EDIT_MINUTES * 60_000;
}

export const unreadLabel = (n: number) => (n > 99 ? "99+" : String(n));

/** What a channel is called for this person: the team name, the client's, or the other people in a direct message. */
export function channelTitle(c: Pick<ChannelRecord, "kind" | "name" | "clientName" | "memberNames">, myName: string): string {
  if (c.kind === "team") return c.name ?? "Team";
  if (c.kind === "client") return c.clientName ?? "Client";
  if (c.kind === "shared") return `${c.clientName ?? "Client"} – with client`;
  const others = c.memberNames.filter((n) => n !== myName);
  return others.length ? others.join(", ") : "Just you";
}

export type MessagePart = { kind: "text"; text: string } | { kind: "mention"; text: string } | { kind: "link"; href: string; text: string } | { kind: "chip"; href: string; label: string };

const CHIP_LABELS: Record<string, string> = { tasks: "Task", clients: "Client", docs: "Doc", projects: "Project" };
const LINK = /(https?:\/\/[^\s<>]*[^\s<>.,;:!?)\]'"])|(?<![\w/])(\/(?:tasks|clients|docs|projects)\/[0-9a-f-]{36})/gi;
const APP_PATH = /^\/(tasks|clients|docs|projects)\/([0-9a-f-]{36})$/i;

/**
 * A message as text, @mentions, links and chips. Links into Oppllo One (this app's own origin, or a bare path)
 * become chips saying what they open; the title isn't looked up, so a chip never shows what the reader couldn't open.
 */
export function messageParts(body: string, appOrigin: string, names: readonly string[]): MessagePart[] {
  const parts: MessagePart[] = [];
  const longestFirst = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  const mentionRe = longestFirst.length ? new RegExp(`@(?:${longestFirst.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g") : null;
  const pushText = (text: string) => {
    if (!text) return;
    let last = 0;
    for (const m of mentionRe ? text.matchAll(mentionRe) : []) {
      if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
      parts.push({ kind: "mention", text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  };
  let last = 0;
  for (const m of body.matchAll(LINK)) {
    pushText(body.slice(last, m.index));
    last = m.index + m[0].length;
    let path = m[2] ?? null;
    if (m[1]) {
      try {
        const u = new URL(m[1]);
        if (u.origin === appOrigin) path = u.pathname;
      } catch {
        // Not a real URL: show it as written.
      }
    }
    const app = path ? APP_PATH.exec(path) : null;
    if (app) parts.push({ kind: "chip", href: `/${app[1]!.toLowerCase()}/${app[2]}`, label: CHIP_LABELS[app[1]!.toLowerCase()]! });
    else if (m[1]) parts.push({ kind: "link", href: m[1], text: m[1] });
    else pushText(m[0]);
  }
  pushText(body.slice(last));
  return parts;
}
