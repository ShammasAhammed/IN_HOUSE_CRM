// Idea Boards (Stage 13.1): who may do what, what a board says (for search and the List view), and its limits.
// Pure: no I/O, unit-tested. Scenes are Excalidraw JSON (D-13.1a); only the fields read here are typed.
import type { AccessLevel } from "@/lib/types";
import { sectionPaths } from "./sections";

/** Biggest scene saved (JSON); past WARN_* a board suggests splitting into linked boards. */
export const MAX_SCENE_BYTES = 12_000_000;
export const WARN_OBJECTS = 3000;
export const WARN_BYTES = 5_000_000;
export const MAX_IMAGE_BYTES = 3_500_000;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_THUMBNAIL_CHARS = 200_000;
/** An automatic version is kept at most this often while people save. */
export const AUTO_VERSION_MINUTES = 15;

export const STAMPS = [
  { id: "approved", label: "Approved", colour: "#2f9e44" },
  { id: "idea", label: "Idea", colour: "#6d28d9" },
  { id: "client_no", label: "Client said no", colour: "#e03131" },
  { id: "needs_data", label: "Needs data", colour: "#f08c00" },
] as const;

/**
 * A person's level on a board: what the space says for its members (14.2), otherwise the role.
 * view = view and vote; comment = also react and comment; edit = draw; manage = archive, restore and set up.
 */
export function boardLevel(p: { owner: boolean; member: AccessLevel | null; roleEdit: boolean; roleManage: boolean; creator: boolean }): AccessLevel {
  if (p.owner) return "manage";
  if (p.member) return p.member;
  if (p.roleManage || (p.creator && p.roleEdit)) return "manage";
  return p.roleEdit ? "edit" : "comment";
}

const ORDER: AccessLevel[] = ["view", "comment", "edit", "manage"];
export const levelAtLeast = (have: AccessLevel, need: AccessLevel) => ORDER.indexOf(have) >= ORDER.indexOf(need);

type El = { id?: unknown; type?: unknown; isDeleted?: unknown; text?: unknown; originalText?: unknown; containerId?: unknown; frameId?: unknown; name?: unknown; backgroundColor?: unknown; customData?: unknown; boundElements?: unknown };
const str = (v: unknown) => (typeof v === "string" ? v : null);
const live = (elements: readonly unknown[]) => elements.filter((e): e is El => Boolean(e) && typeof e === "object" && (e as El).isDeleted !== true);

export type BoardItem = { id: string; kind: "sticky" | "shape" | "text" | "node"; text: string; frameId: string | null; frame: string | null; colour: string | null; stamp: string | null; section: string | null };

/** Every sticky, labelled shape and loose text on a board, in drawing order, with its frame and colour. */
export function boardItems(elements: readonly unknown[]): { items: BoardItem[]; frames: Array<{ id: string; name: string }> } {
  const els = live(elements);
  const frames = els.filter((e) => e.type === "frame" || e.type === "magicframe").map((e, i) => ({ id: String(e.id), name: str(e.name)?.trim() || `Frame ${i + 1}` }));
  const frameName = new Map(frames.map((f) => [f.id, f.name]));
  const textOf = new Map<string, string>();
  for (const e of els) {
    const c = str(e.containerId);
    if (e.type === "text" && c) textOf.set(c, (str(e.originalText) ?? str(e.text) ?? "").trim());
  }
  // Stamps ("Approved", "Client said no") are their own small elements, pointing at the sticky they're on.
  const custom = (e: El) => (e.customData && typeof e.customData === "object" ? (e.customData as Record<string, unknown>) : {});
  const stampOn = new Map<string, string>();
  for (const e of els) {
    const c = custom(e);
    if (str(c.stamp) && str(c.on)) stampOn.set(str(c.on)!, str(c.stamp)!);
  }
  const paths = sectionPaths(els);
  const items: BoardItem[] = [];
  for (const e of els) {
    const id = str(e.id);
    if (!id) continue;
    const c = custom(e);
    // Stamps belong to their sticky; headings label a frame. Both stay searchable, neither is an item. Mind-map
    // badges ("+3") and section labels aren't ideas either (13.1b).
    if (c.stamp || c.kind === "heading" || c.mmBadge || c.sectionLabel || c.section) continue;
    const frameId = str(e.frameId);
    const base = { id, frameId, frame: frameId ? (frameName.get(frameId) ?? null) : null, stamp: stampOn.get(id) ?? null, section: paths.get(id) ?? null };
    if (e.type === "text") {
      if (str(e.containerId)) continue;
      const text = (str(e.originalText) ?? str(e.text) ?? "").trim();
      if (text) items.push({ ...base, kind: "text", text, colour: null });
      continue;
    }
    if (e.type === "arrow" || e.type === "line" || e.type === "frame" || e.type === "magicframe") continue;
    const text = textOf.get(id);
    if (c.mm) items.push({ ...base, kind: "node", text: text ?? "", colour: str(e.backgroundColor) === "transparent" ? null : str(e.backgroundColor) });
    else if (c.kind === "sticky") items.push({ ...base, kind: "sticky", text: text ?? "", colour: str(e.backgroundColor) });
    else if (text) items.push({ ...base, kind: "shape", text, colour: str(e.backgroundColor) === "transparent" ? null : str(e.backgroundColor) });
  }
  return { items, frames };
}

/** All the words on a board (texts, labels, frame names), for search. */
export function boardSearchText(elements: readonly unknown[]): string {
  const parts: string[] = [];
  for (const e of live(elements)) {
    const c = e.customData && typeof e.customData === "object" ? (e.customData as Record<string, unknown>) : {};
    if (c.mmBadge) continue;
    if (e.type === "text") parts.push((str(e.originalText) ?? str(e.text) ?? "").replace(/\s+/g, " ").trim());
    else if ((e.type === "frame" || e.type === "magicframe") && str(e.name)) parts.push(str(e.name)!.trim());
  }
  return parts.filter(Boolean).join("\n").slice(0, 200_000);
}

/** Objects that count towards a board's size: everything not deleted. */
export const objectCount = (elements: readonly unknown[]) => live(elements).length;

/** The ids of things people can vote, react and comment on. */
export const targetIds = (elements: readonly unknown[]) => new Set(boardItems(elements).items.map((i) => i.id));

/** Vote results, most first; ties keep board order. */
export function tally(votes: ReadonlyArray<{ elementId: string }>, items: readonly BoardItem[]): Array<{ item: BoardItem; votes: number }> {
  const n = new Map<string, number>();
  for (const v of votes) n.set(v.elementId, (n.get(v.elementId) ?? 0) + 1);
  return items
    .map((item, i) => ({ item, votes: n.get(item.id) ?? 0, i }))
    .filter((r) => r.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.i - b.i)
    .map(({ item, votes }) => ({ item, votes }));
}
