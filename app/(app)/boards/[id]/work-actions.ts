"use server";

// Boards connected to the work (Stage 13.2): what can go on a board as a live card, sticky → task, and references.
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Done<T = undefined> = { ok: true; value: T } | { ok: false; message: string };
const done = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): Done<T> => (r.ok ? { ok: true, value: r.value } : { ok: false, message: r.error.message });

export type CardOptions = {
  tasks: Array<{ id: string; title: string; status: string }>;
  creatives: Array<{ id: string; title: string; state: string }>;
  docs: Array<{ id: string; title: string }>;
  sheets: Array<{ id: string; title: string; kind: string }>;
  projects: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
};

/** What this person may put on a board of this client or space (each list read with their own rights). */
export async function cardOptionsAction(clientId: string): Promise<CardOptions> {
  const actor = await requireActor();
  const s = getServices();
  const [tasks, creatives, tree, files, projects, people] = await Promise.all([s.tasks.table(actor, { clientId }), s.assets.list(actor, { clientId }), s.docs.tree(actor), s.clientLinks.page(actor, clientId), s.projects.list(actor, { clientId }), s.people.directory(actor)]);
  type Node = { id: string; title: string; clientId: string | null; children: Node[] };
  const flat = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
  return {
    tasks: tasks.ok ? tasks.value.tasks.filter((t) => t.status !== "done").slice(0, 150).map((t) => ({ id: t.id, title: t.title, status: t.status })) : [],
    creatives: creatives.ok ? creatives.value.assets.slice(0, 100).map((a) => ({ id: a.id, title: a.title, state: a.approvalState })) : [],
    docs: flat(tree.nodes as Node[])
      .filter((d) => d.clientId === clientId || d.clientId === null)
      .slice(0, 150)
      .map((d) => ({ id: d.id, title: d.title })),
    sheets: files.ok ? files.value.links.filter((l) => !l.fileName).map((l) => ({ id: l.id, title: l.title, kind: l.kindLabel })) : [],
    projects: projects.ok ? projects.value.filter((p) => p.status !== "completed").map((p) => ({ id: p.id, name: p.name })) : [],
    people: people.ok ? people.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName })) : [],
  };
}

export async function stickyToTaskAction(input: { boardId: string; elementId: string; projectId: string; ownerId?: string; dueDate?: string; title?: string }): Promise<Done<{ taskId: string }>> {
  return done(await getServices().boards.stickyToTask(await requireActor(), input));
}

/** A pasted or typed link becomes a reference in the client's swipe file; the board then shows it as a live card. */
export async function saveReferenceAction(input: { clientId: string; url: string; notes?: string; tags?: string[] }): Promise<Done<{ id: string }>> {
  return done(await getServices().swipe.saveLink(await requireActor(), input));
}

/** A picture on the board saved to the swipe file (with notes and tags). */
export async function saveScreenshotAction(form: FormData): Promise<Done<{ id: string }>> {
  const actor = await requireActor();
  const f = form.get("file");
  if (!(f instanceof File)) return { ok: false, message: "No picture came through." };
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return done(await getServices().swipe.saveFile(actor, { clientId: String(form.get("clientId") ?? ""), notes: String(form.get("notes") ?? ""), tags }, { name: f.name, contentType: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }));
}

/** Stage 13.1b: a list from the board becomes a Docs page in the board's client or space. */
export async function boardToDocAction(input: { boardId: string; title: string; markdown: string }): Promise<Done<{ id: string }>> {
  return done(await getServices().boards.toDocsPage(await requireActor(), input));
}
