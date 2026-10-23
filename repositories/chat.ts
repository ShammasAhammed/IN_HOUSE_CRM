// Chat (Stage 12.1). Visibility is decided by the service: it passes the client and space ids the person may see.
import type { ChatKind, StorageProvider } from "@/lib/types";

export type ChannelRecord = {
  id: string;
  kind: ChatKind;
  clientId: string | null;
  clientName: string | null;
  /** The client is one of Oppllo's spaces (Stage 14.1). */
  isSpace: boolean;
  name: string | null;
  createdById: string | null;
  archivedAt: Date | null;
  lastMessageAt: Date | null;
  /** Team and direct channels: who is in it, by name. */
  memberNames: string[];
  /** Messages by others after this person's last read (lists only). */
  unread: number;
};

export type ChatFile = { provider: StorageProvider; location: string; fileId: string; name: string; type: string | null; size: number | null };

export type MessageRecord = {
  id: string;
  channelId: string;
  /** A person at Oppllo; null when the client's portal user wrote it (12.6). */
  authorId: string | null;
  portalUserId: string | null;
  authorName: string;
  body: string;
  mentions: string[];
  file: ChatFile | null;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  /** An AI answer (Stage 12.2): the question it answers; the author is who asked. */
  aiReplyTo: string | null;
  /** A co-worker card (Stage 12.5): the suggestion it shows. */
  coworkerId: string | null;
};

export interface ChatRepository {
  /** Channels this person may see: client channels of `clientIds`, plus team and direct channels they're in. */
  channels(personId: string, clientIds: readonly string[]): Promise<ChannelRecord[]>;
  find(id: string): Promise<ChannelRecord | null>;
  /** A client's staff channel, or (kind "shared", 12.6) the chat shared with the client. */
  clientChannel(clientId: string, kind?: "client" | "shared"): Promise<string | null>;
  markPortalRead(channelId: string, portalUserId: string, at: Date): Promise<void>;
  /** When the client first wrote in their shared chat (the move-over checklist, 12.6). */
  firstClientMessage(clientId: string): Promise<Date | null>;
  /** Staff messages the portal user hasn't read. */
  portalUnread(channelId: string, portalUserId: string): Promise<number>;
  /** True (and stamps it) when this portal user wasn't emailed about the chat in the last `gapMinutes`. */
  claimAlert(channelId: string, portalUserId: string, at: Date, gapMinutes: number): Promise<boolean>;
  /** Shared chats whose client wrote last, and since when (their first message after the last staff one). Oldest first. */
  waiting(channelIds: readonly string[]): Promise<Array<{ channelId: string; clientId: string; clientName: string; since: Date }>>;
  createChannel(row: { id: string; kind: ChatKind; clientId: string | null; name: string | null; createdById: string }): Promise<boolean>;
  updateChannel(id: string, patch: { name?: string; archivedAt?: Date | null }): Promise<void>;
  members(channelId: string): Promise<Array<{ personId: string; fullName: string }>>;
  addMember(channelId: string, personId: string, addedById: string): Promise<void>;
  removeMember(channelId: string, personId: string, at: Date): Promise<boolean>;
  /** The direct-message channel with exactly these people, if there is one. */
  directWith(personIds: readonly string[]): Promise<string | null>;
  /** Newest first, `limit` at most, before a message (for "Load earlier"). */
  messages(channelId: string, opts: { before?: { createdAt: Date; id: string }; limit: number }): Promise<MessageRecord[]>;
  /** Messages new, edited or removed after `since`, oldest first (the conversation's regular check). */
  changes(channelId: string, since: Date, limit: number): Promise<MessageRecord[]>;
  findMessage(id: string): Promise<MessageRecord | null>;
  /** False when an AI answer for that question already exists (one answer per question). */
  addMessage(row: { id: string; channelId: string; authorId: string | null; portalUserId?: string | null; body: string; mentions: string[]; file: ChatFile | null; aiReplyTo?: string | null; coworkerId?: string | null }, at: Date): Promise<boolean>;
  /** The AI answer already posted for this question, if any. */
  aiAnswerFor(questionId: string): Promise<string | null>;
  /** When this person last read the channel, before this visit marks it read. */
  lastRead(channelId: string, personId: string): Promise<Date | null>;
  updateMessage(id: string, patch: { body?: string; editedAt?: Date; deletedAt?: Date }, at: Date): Promise<void>;
  markRead(channelId: string, personId: string, at: Date): Promise<void>;
  /** Messages matching all words, in these channels, newest first. */
  search(channelIds: readonly string[], query: string, limit: number): Promise<Array<MessageRecord & { channelName: string }>>;
}
