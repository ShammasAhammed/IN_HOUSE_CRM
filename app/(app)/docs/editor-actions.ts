"use server";

// The block editor's server actions (Stage 13.4).
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Done<T> = { ok: true; value: T } | { ok: false; message: string; conflict?: boolean };

/** Saves the page (Markdown) only if it is still at `version`: someone else's newer save is never overwritten. */
export async function saveDocJsonAction(input: { docId: string; version: number; title: string; body: string }): Promise<Done<{ version: number }>> {
  const r = await getServices().docs.update(await requireActor(), input);
  return r.ok ? { ok: true, value: { version: r.value.version } } : { ok: false, message: r.error.message, conflict: r.error.code === "conflict" };
}

/** People, tasks and clients to @mention, each limited to what the writer can see. */
export async function mentionOptionsAction(query: string): Promise<Array<{ kind: "person" | "task" | "client"; id: string; label: string }>> {
  const actor = await requireActor();
  const s = getServices();
  const q = query.trim().toLowerCase().slice(0, 60);
  const [people, tasks, clients] = await Promise.all([s.people.directory(actor), q.length >= 2 ? s.tasks.table(actor, { q }) : Promise.resolve(null), s.clients.list(actor)]);
  const out: Array<{ kind: "person" | "task" | "client"; id: string; label: string }> = [];
  if (people.ok) for (const p of people.value.filter((x) => x.status === "active" && x.fullName.toLowerCase().includes(q)).slice(0, 5)) out.push({ kind: "person", id: p.id, label: p.fullName });
  if (clients.ok) for (const c of clients.value.clients.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 3)) out.push({ kind: "client", id: c.id, label: c.name });
  if (tasks?.ok) for (const t of tasks.value.tasks.slice(0, 4)) out.push({ kind: "task", id: t.id, label: t.title });
  return out;
}

/** A new database table in the page; the editor puts it where "/" was typed. */
export async function newTableAction(docId: string): Promise<Done<{ id: string }>> {
  const r = await getServices().docTables.create(await requireActor(), { docId });
  return r.ok ? { ok: true, value: r.value } : { ok: false, message: r.error.message };
}

/** AI on a selection (write, shorten, translate); "AI isn't switched on yet" until the owner adds a key. */
export async function aiWriteAction(input: { docId: string; mode: "write" | "shorten" | "translate"; text: string; ask: string }): Promise<Done<string>> {
  const r = await getServices().docAi.write(await requireActor(), input);
  return r.ok ? { ok: true, value: r.value.text } : { ok: false, message: r.error.message };
}
