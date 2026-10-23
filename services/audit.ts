// The audit log (Stage 11.7): every recorded change, who made it and when, in plain words. Owner only (audit.read).
// It reads the events table that every change already writes (commit()), so nothing new has to remember to log.
import { addDays, isIsoDate, istInstant, type IsoDate } from "@/lib/dates";
import { eventText } from "@/lib/event-text";
import { isId } from "@/lib/id";
import { forbidden, ok, type Result } from "@/lib/result";
import { ENTITY_TYPES, type EntityType } from "@/lib/types";
import type { AuditRow, DataStore } from "@/repositories";
import { can, type Actor } from "./permissions";

const PAGE = 50;

export type AuditQuery = { person: string; type: EntityType | ""; client: string; from: IsoDate | ""; to: IsoDate | ""; page: number };
export type AuditPage = {
  rows: Array<AuditRow & { text: string }>;
  query: AuditQuery;
  hasMore: boolean;
  options: { people: Array<{ id: string; name: string }>; clients: Array<{ id: string; name: string }>; types: readonly EntityType[] };
};

/** Address-bar values → a clean query; anything malformed is simply not used. */
export function auditQuery(raw: Record<string, unknown>): AuditQuery {
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const page = Math.floor(Number(str("page")));
  return {
    person: isId(str("person")) ? str("person") : "",
    type: (ENTITY_TYPES as readonly string[]).includes(str("type")) ? (str("type") as EntityType) : "",
    client: isId(str("client")) ? str("client") : "",
    from: isIsoDate(str("from")) ? str("from") : "",
    to: isIsoDate(str("to")) ? str("to") : "",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

export function createAuditService(deps: { store: DataStore }) {
  const { store } = deps;
  return {
    async list(actor: Actor, raw: Record<string, unknown>): Promise<Result<AuditPage>> {
      if (!can(actor, "audit.read")) return forbidden("The audit log is for the owner.");
      const q = auditQuery(raw);
      const [rows, people, clients] = await Promise.all([
        store.events.search({
          actorId: q.person || undefined,
          entityType: q.type || undefined,
          clientId: q.client || undefined,
          // Calendar days are India days: "to" includes the whole of that day.
          from: q.from ? istInstant(q.from, "00:00") : undefined,
          to: q.to ? istInstant(addDays(q.to, 1), "00:00") : undefined,
          offset: (q.page - 1) * PAGE,
          limit: PAGE + 1,
        }),
        store.people.listAll(),
        store.clients.list({ kind: "all" }),
      ]);
      return ok({
        rows: rows.slice(0, PAGE).map((r) => ({ ...r, text: eventText(r) })),
        query: q,
        hasMore: rows.length > PAGE,
        options: { people: people.map((p) => ({ id: p.id, name: p.fullName })), clients: clients.map((c) => ({ id: c.id, name: c.name })), types: ENTITY_TYPES },
      });
    },
  };
}
export type AuditService = ReturnType<typeof createAuditService>;
