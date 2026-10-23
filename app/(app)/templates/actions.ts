"use server";

// Template gallery (Stage 13.6).
import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Done<T = null> = { ok: true; value: T } | { ok: false; message: string };
const done = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): Done<T> => (r.ok ? { ok: true, value: r.value } : { ok: false, message: r.error.message });
const tagList = (v: unknown) =>
  String(v ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

/** A new board or page from a template; opens it. */
export async function useTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const values = formToObject(form);
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
  const r = await getServices().gallery.use(await requireActor(), clean);
  if (!r.ok) return toActionState(r, "", values);
  redirect((r.value.kind === "board" ? `/boards/${r.value.id}` : `/docs/${r.value.id}`) as Route);
}

/** What saving would take out (the warning before saving). */
export async function checkTemplateAction(input: { boardId?: string; docId?: string; keepRows?: boolean }): Promise<Done<{ removed: string[] }>> {
  return done(await getServices().gallery.check(await requireActor(), input));
}

export async function saveBoardTemplateAction(input: { boardId: string; name: string; description: string; tags: string; scope: string }): Promise<Done<{ id: string; removed: string[]; elements: unknown[] }>> {
  return done(await getServices().gallery.saveBoard(await requireActor(), { ...input, tags: tagList(input.tags) }));
}

export async function savePageTemplateAction(input: { docId: string; name: string; description: string; tags: string; scope: string; keepRows: boolean }): Promise<Done<{ id: string; removed: string[] }>> {
  return done(await getServices().gallery.savePage(await requireActor(), { ...input, tags: tagList(input.tags) }));
}

export async function templateThumbnailAction(id: string, thumbnail: string): Promise<Done> {
  return done(await getServices().gallery.setThumbnail(await requireActor(), id, thumbnail));
}

export async function approveTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().gallery.approve(await requireActor(), String(form.get("id") ?? ""), form.get("on") === "on");
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}

export async function removeTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().gallery.remove(await requireActor(), String(form.get("id") ?? ""));
  if (!r.ok) return toActionState(r, "");
  redirect("/templates");
}

export async function savePresetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const kind = String(form.get("kind") ?? "");
  const colours = String(form.get("colours") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const value = kind === "palette" ? { colours } : kind === "sticky" ? { colour: colours[0] ?? "", font: String(form.get("font") ?? "hand") } : { ...(form.get("mindLayout") ? { mindLayout: String(form.get("mindLayout")) } : {}), ...(colours.length ? { sectionColours: colours } : {}) };
  const r = await getServices().gallery.savePreset(await requireActor(), { kind, name: String(form.get("name") ?? ""), scope: String(form.get("scope") ?? "mine"), value });
  if (r.ok) refresh();
  return toActionState(r, "Preset saved.", formToObject(form));
}

export async function removePresetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().gallery.removePreset(await requireActor(), String(form.get("id") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}
