// Notifications and email (Stage 8.1, D82).
import type { EntityType } from "@/lib/types";

export type NotificationRecord = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationWrite = {
  personId: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: EntityType | null;
  entityId?: string | null;
  dedupeKey?: string | null;
};

export interface NotificationsRepository {
  /** Rows whose (person, dedupe key) already exist are skipped. */
  create(rows: Array<NotificationWrite & { id: string }>): Promise<void>;
  list(personId: string, limit: number): Promise<NotificationRecord[]>;
  /** Unread for this person; with `kinds`, only those kinds (mentions on My Day). */
  countUnread(personId: string, kinds?: readonly string[]): Promise<number>;
  markRead(personId: string, ids: readonly string[] | "all", at: Date): Promise<void>;
  /** Unread, not yet emailed, with the person's work email. */
  pendingEmail(limit: number): Promise<Array<NotificationRecord & { personId: string; email: string; fullName: string }>>;
  markEmailed(ids: readonly string[], at: Date): Promise<void>;
}

/** Sends email. Adapters: Resend, or a log for development. */
export interface Mailer {
  send(mail: { to: string; subject: string; text: string }): Promise<void>;
}
