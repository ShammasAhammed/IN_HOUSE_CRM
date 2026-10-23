// The bell and the email digest (Stage 8.1, D82). Notifications are made by services/notify.ts.
import { isId } from "@/lib/id";
import { ok, type Result } from "@/lib/result";
import type { DataStore, Mailer, NotificationRecord } from "@/repositories";
import type { Clock } from "./clock";
import type { Actor } from "./permissions";

export function createNotificationService(deps: { store: DataStore; mailer: Mailer; clock: Clock; appUrl: string }) {
  const { store, mailer, clock } = deps;
  return {
    async list(actor: Actor): Promise<Result<NotificationRecord[]>> {
      return ok(await store.notifications.list(actor.personId, 50));
    },
    unreadCount: (actor: Actor) => store.notifications.countUnread(actor.personId),
    /** Your own only: the repository filters by the person. */
    async markRead(actor: Actor, ids: readonly string[] | "all"): Promise<Result<null>> {
      await store.notifications.markRead(actor.personId, ids === "all" ? ids : ids.filter(isId), clock.now());
      return ok(null);
    },
    /** The daily job: one email per person with what they haven't read yet. */
    async emailDigest(): Promise<{ sent: number; errors: unknown[] }> {
      const pending = await store.notifications.pendingEmail(2000);
      const byPerson = new Map<string, typeof pending>();
      for (const n of pending) byPerson.set(n.personId, [...(byPerson.get(n.personId) ?? []), n]);
      let sent = 0;
      const errors: unknown[] = [];
      for (const items of byPerson.values()) {
        const first = items[0]!;
        const lines = items.map((n) => `• ${n.title}${n.body ? ` — ${n.body}` : ""}${n.link ? `\n  ${deps.appUrl}${n.link}` : ""}`);
        try {
          await mailer.send({
            to: first.email,
            subject: items.length === 1 ? first.title : `${items.length} things waiting for you in Oppllo One`,
            text: `Hi ${first.fullName.split(" ")[0]},\n\n${lines.join("\n")}\n\nOpen Oppllo One: ${deps.appUrl}\n`,
          });
          await store.notifications.markEmailed(items.map((n) => n.id), clock.now());
          sent++;
        } catch (err) {
          errors.push(err);
        }
      }
      return { sent, errors };
    },
  };
}
