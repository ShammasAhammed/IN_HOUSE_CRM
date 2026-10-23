// The AI co-worker's data (Stage 12.5): a once-a-day read of the board (one query per list), and its suggestions.
import type { IsoDate } from "@/lib/dates";
import type { CoworkerStatus } from "@/lib/types";

/** One change a card proposes. Every action runs through an ordinary service as the person who approves it. */
export type CardAction =
  | { type: "reassign"; taskId: string; taskTitle: string; personId: string; personName: string }
  | { type: "move_date"; taskId: string; taskTitle: string; date: IsoDate }
  | { type: "create_task"; projectId: string; title: string; dueDate: IsoDate | null }
  | { type: "ping"; text: string }
  | { type: "flag_owner"; text: string };

export type BoardClient = { id: string; name: string; isPrivate: boolean; isInternal: boolean; leadStrategistId: string | null; lastActivityAt: Date | null };
export type BoardTask = { id: string; title: string; clientId: string; projectId: string; ownerId: string | null; ownerName: string | null; status: string; dueDate: IsoDate | null; blockedSince: Date | null };
export type BoardSetup = { clientId: string; hasTarget: boolean; hasKnowledge: boolean; hasAdAccount: boolean; activeProjectId: string | null };

export type SuggestionRecord = {
  id: string;
  clientId: string;
  channelId: string;
  kind: string;
  keys: string[];
  title: string;
  why: string[];
  actions: CardAction[];
  wording: string | null;
  status: CoworkerStatus;
  results: Array<{ ok: boolean; message: string }> | null;
  snoozedUntil: IsoDate | null;
  wakeOnClientReply: boolean;
  snoozedAt: Date | null;
  decidedById: string | null;
  decidedAt: Date | null;
  day: IsoDate;
  createdAt: Date;
};

export interface CoworkerRepository {
  /** Active clients and spaces, with when anything last happened on each. */
  clients(): Promise<BoardClient[]>;
  /** Open tasks everywhere (the run reads as the system; who sees a card is the chat's business). */
  openTasks(): Promise<BoardTask[]>;
  /** Creatives waiting on a client's approval, and since when. */
  inClientReview(): Promise<Array<{ id: string; title: string; clientId: string; since: Date }>>;
  /** Posts planned per client in [from, to]. */
  postsBetween(from: IsoDate, to: IsoDate): Promise<Map<string, number>>;
  setup(month: IsoDate): Promise<BoardSetup[]>;
  /** Client comments (in the portal) since a moment, per client, with their words for the digest's mood. */
  clientComments(since: Date): Promise<Array<{ clientId: string; body: string; at: Date }>>;

  add(row: Omit<SuggestionRecord, "results" | "snoozedUntil" | "wakeOnClientReply" | "snoozedAt" | "decidedById" | "decidedAt" | "createdAt" | "status">, at: Date): Promise<void>;
  find(id: string): Promise<SuggestionRecord | null>;
  forChannel(channelId: string): Promise<SuggestionRecord[]>;
  /** Only while open (or snoozed, for a wake-up): false when someone already answered. */
  update(id: string, from: readonly CoworkerStatus[], patch: Partial<Pick<SuggestionRecord, "status" | "actions" | "results" | "snoozedUntil" | "wakeOnClientReply" | "snoozedAt" | "decidedById" | "decidedAt">>): Promise<boolean>;
  /** Keys still open or snoozed, and keys dismissed since `since`: not suggested again. */
  blockedKeys(since: Date): Promise<Set<string>>;
  /** Cards posted in a chat on a day. */
  postedOn(channelId: string, day: IsoDate): Promise<number>;
  /** The latest answers for a client and kind, newest first. */
  answers(clientId: string, kind: string, limit: number): Promise<Array<"approved" | "dismissed">>;
  /** Approved and dismissed counts per kind (Settings → AI). */
  rates(): Promise<Array<{ kind: string; approved: number; dismissed: number }>>;
  /** Snoozed cards to wake: their day has come, or (when asked) the client has replied since. */
  dueSnoozes(today: IsoDate): Promise<SuggestionRecord[]>;
  /** Clients who wrote last in their shared chat (12.6), and since when. */
  clientWaiting(): Promise<Array<{ clientId: string; since: Date }>>;
  saveDigest(day: IsoDate, lines: Array<{ clientId: string; clientName: string; light: string; text: string }>): Promise<void>;
  digest(day: IsoDate): Promise<Array<{ clientId: string; clientName: string; light: string; text: string }> | null>;
}
