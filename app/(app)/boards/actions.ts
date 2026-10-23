"use server";

// Idea Boards (Stage 13.1): everything except saving the scene (that goes through /api/boards/[id], gzipped).
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Done = { ok: true; message?: string } | { ok: false; message: string };
const done = (r: { ok: boolean; error?: { message: string } }, message?: string): Done => (r.ok ? { ok: true, ...(message ? { message } : {}) } : { ok: false, message: r.error!.message });

export async function createBoardAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const values = () => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  // A style picked (Stage 13.6): made through the gallery, which applies presets and brand colours.
  if (text("palette") || text("sticky") || text("layout")) {
    const s = getServices();
    const made = await s.gallery.use(actor, { key: `builtin:board:${text("template") || "blank"}`, title: text("title"), clientId: text("clientId"), ...(text("projectId") ? { projectId: text("projectId") } : {}), ...Object.fromEntries(["palette", "sticky", "layout"].filter((k) => text(k)).map((k) => [k, text(k)])) });
    if (!made.ok) return { status: "error", message: made.error.message, values: values() };
    const tags = text("tags").split(",").map((t) => t.trim()).filter(Boolean);
    if (text("section") || tags.length) await s.boards.settings(actor, { boardId: made.value.id, section: text("section") || null, tags });
    redirect(`/boards/${made.value.id}` as Route);
  }
  const r = await getServices().boards.create(actor, {
    clientId: text("clientId"),
    ...(text("projectId") ? { projectId: text("projectId") } : {}),
    title: text("title"),
    section: text("section"),
    tags: text("tags")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    template: text("template") || "blank",
  });
  if (!r.ok) return { status: "error", message: r.error.message, ...(r.error.fieldErrors ? { fieldErrors: r.error.fieldErrors } : {}), values: Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) };
  redirect(`/boards/${r.value.id}` as Route);
}

/** "Move the selection to a new board": the new board gets those elements; the canvas removes them and links it. */
export async function splitBoardAction(input: { clientId: string; projectId: string | null; title: string; section: string | null; elements: unknown[] }): Promise<Done & { id?: string }> {
  const actor = await requireActor();
  const r = await getServices().boards.create(actor, { clientId: input.clientId, ...(input.projectId ? { projectId: input.projectId } : {}), title: input.title, ...(input.section ? { section: input.section } : {}), elements: input.elements });
  return r.ok ? { ok: true, id: r.value.id } : { ok: false, message: r.error.message };
}

export async function favouriteAction(boardId: string, on: boolean): Promise<Done> {
  const r = await getServices().boards.favourite(await requireActor(), boardId, on);
  revalidatePath("/boards");
  return done(r);
}

export async function archiveAction(boardId: string, archived: boolean): Promise<Done> {
  const r = await getServices().boards.archive(await requireActor(), boardId, archived);
  revalidatePath("/boards");
  return done(r, archived ? "Archived. Find it under Archived to restore it." : "Restored.");
}

export async function boardSettingsAction(input: { boardId: string; title?: string; section?: string | null; tags?: string[] }): Promise<Done> {
  return done(await getServices().boards.settings(await requireActor(), input), "Saved.");
}

export async function snapshotAction(boardId: string, name: string): Promise<Done> {
  return done(await getServices().boards.snapshot(await requireActor(), boardId, name), "Snapshot kept.");
}

export async function restoreVersionAction(boardId: string, versionId: string): Promise<Done> {
  return done(await getServices().boards.restoreVersion(await requireActor(), boardId, versionId));
}

export async function votingAction(boardId: string, action: { start: number } | "reveal" | "clear"): Promise<Done> {
  return done(await getServices().boards.voting(await requireActor(), boardId, action));
}

export async function voteAction(boardId: string, elementId: string, on: boolean): Promise<Done> {
  return done(await getServices().boards.vote(await requireActor(), boardId, elementId, on));
}

export async function reactAction(boardId: string, elementId: string, emoji: string): Promise<Done> {
  return done(await getServices().boards.react(await requireActor(), boardId, elementId, emoji));
}

export async function commentAction(boardId: string, elementId: string | null, body: string): Promise<Done> {
  return done(await getServices().boards.comment(await requireActor(), { boardId, elementId, body }));
}

export async function removeCommentAction(commentId: string): Promise<Done> {
  return done(await getServices().boards.removeComment(await requireActor(), commentId));
}

export async function timerAction(boardId: string, set: { minutes: number; sound: boolean } | null): Promise<Done> {
  return done(await getServices().boards.timer(await requireActor(), boardId, set));
}
