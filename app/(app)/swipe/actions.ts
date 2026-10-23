"use server";

// The swipe file (Stage 13.2).
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Done = { ok: true; message?: string } | { ok: false; message: string };
const tagsOf = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
const err = (r: { ok: false; error: { message: string; fieldErrors?: Record<string, string[]> } }, form: FormData): ActionState => ({ status: "error", message: r.error.message, ...(r.error.fieldErrors ? { fieldErrors: r.error.fieldErrors } : {}), values: Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])) });

export async function saveLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  const boardId = String(form.get("boardId") ?? "");
  const r = await getServices().swipe.saveLink(await requireActor(), { clientId: String(form.get("clientId") ?? ""), url: String(form.get("url") ?? ""), notes: String(form.get("notes") ?? ""), tags: tagsOf(form.get("tags")), ...(boardId ? { boardId } : {}) });
  if (!r.ok) return err(r, form);
  revalidatePath("/swipe");
  // From the share screen with a board picked: straight to the board.
  if (boardId && !r.value.boardResult && form.get("then") === "board") redirect(`/boards/${boardId}` as Route);
  return { status: "ok", message: r.value.boardResult ? `Saved to the swipe file, but not added to the board: ${r.value.boardResult}` : boardId ? "Saved and added to the board." : "Saved to the swipe file." };
}

export async function saveFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const f = form.get("file");
  if (!(f instanceof File) || !f.size) return { status: "error", message: "Pick a screenshot or video first." };
  const r = await getServices().swipe.saveFile(actor, { clientId: String(form.get("clientId") ?? ""), notes: String(form.get("notes") ?? ""), tags: tagsOf(form.get("tags")) }, { name: f.name, contentType: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  if (!r.ok) return err(r, form);
  revalidatePath("/swipe");
  return { status: "ok", message: "Saved to the swipe file." };
}

export async function editSwipeAction(input: { id: string; title: string; notes: string; tags: string[] }): Promise<Done> {
  const r = await getServices().swipe.edit(await requireActor(), input);
  revalidatePath("/swipe");
  return r.ok ? { ok: true, message: "Saved." } : { ok: false, message: r.error.message };
}

export async function removeSwipeAction(id: string): Promise<Done> {
  const r = await getServices().swipe.remove(await requireActor(), id);
  revalidatePath("/swipe");
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}

export async function addToBoardAction(id: string, boardId: string): Promise<Done> {
  const r = await getServices().swipe.addToBoard(await requireActor(), id, boardId);
  return r.ok ? { ok: true, message: "Added to the board." } : { ok: false, message: r.error.message };
}

/** A phone's share, filed where the person says (and onto a board when picked). */
export async function useShareAction(_: ActionState, form: FormData): Promise<ActionState> {
  const boardId = String(form.get("boardId") ?? "");
  const r = await getServices().swipe.useShare(await requireActor(), { shareId: String(form.get("shareId") ?? ""), clientId: String(form.get("clientId") ?? ""), notes: String(form.get("notes") ?? ""), tags: tagsOf(form.get("tags")), ...(boardId ? { boardId } : {}) });
  if (!r.ok) return err(r, form);
  redirect((boardId && !r.value.boardResult ? `/boards/${boardId}` : `/swipe?item=${r.value.id}`) as Route);
}
