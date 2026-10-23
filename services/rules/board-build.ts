// Building on a board from outside the canvas (Stage 13.6, the MCP): stickies into a frame or section, a mind map
// from a list, a section with stickies, and the board as structured text. Pure: positions are worked out here, and
// new things go into the frame or section named, or to the right of what's already there, never on top of it.
import { sceneBuilder, STICKY_COLOURS } from "./board-templates";
import { boardItems } from "./boards";
import { applyTree, listToMarkdown, mapsOn, newNodeElements, treeFromList, treeToList, type ListItem, type MindLayout } from "./mind-map";
import { newSection, SECTION_COLOURS, sectionsOf } from "./sections";

type El = Record<string, unknown> & { id: string; type: string };
const live = (elements: readonly unknown[]) => (elements as El[]).filter((e) => e && e.isDeleted !== true);

export const MAX_NODES = 300;
const STEP = 200;
const GAP = 120;

/** Sticky colours by name, or a #hex. */
export function colourOf(name: string | undefined): string {
  if (!name) return STICKY_COLOURS.yellow;
  if (/^#[0-9a-f]{6}$/i.test(name)) return name;
  return STICKY_COLOURS[name.toLowerCase() as keyof typeof STICKY_COLOURS] ?? STICKY_COLOURS.yellow;
}

/** The free space to the right of everything on the board. */
function rightOf(elements: readonly unknown[]): { x: number; y: number } {
  const els = live(elements).filter((e) => typeof e.x === "number");
  if (!els.length) return { x: 0, y: 0 };
  return { x: Math.max(...els.map((e) => (e.x as number) + ((e.width as number) ?? 0))) + GAP, y: Math.min(...els.map((e) => e.y as number)) };
}

/** A frame or section by name (case doesn't matter). */
export function findArea(elements: readonly unknown[], name: string): { id: string; kind: "frame" | "section"; x: number; y: number; width: number; height: number } | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const frame = live(elements).find((e) => (e.type === "frame" || e.type === "magicframe") && String(e.name ?? "").trim().toLowerCase() === q);
  if (frame) return { id: frame.id, kind: "frame", x: frame.x as number, y: frame.y as number, width: frame.width as number, height: frame.height as number };
  const sec = sectionsOf(elements).find((s) => s.name.trim().toLowerCase() === q);
  return sec ? { id: sec.id, kind: "section", x: sec.x, y: sec.y, width: sec.width, height: sec.height } : null;
}

/** Stickies in a grid inside a frame or section (it grows to fit), or in a new block to the right. */
export function addStickies(elements: readonly unknown[], texts: readonly string[], opts: { colour?: string; into?: string }, makeId: () => string): { elements: unknown[]; placed: number; into: string | null } | string {
  if (!texts.length) return "Give at least one sticky.";
  const b = sceneBuilder(makeId);
  const colour = colourOf(opts.colour);
  const area = opts.into ? findArea(elements, opts.into) : null;
  if (opts.into && !area) return `There's no frame or section called "${opts.into}" on this board. Use read_board for the names.`;
  let next = [...(elements as El[])];
  if (area) {
    const cols = Math.max(1, Math.floor((area.width - 40) / STEP));
    const stickies = live(elements).filter((e) => (e.customData as { kind?: string } | undefined)?.kind === "sticky");
    const already = area.kind === "frame" ? stickies.filter((e) => e.frameId === area.id).length : stickies.filter((e) => (e.x as number) >= area.x && (e.y as number) >= area.y && (e.x as number) < area.x + area.width && (e.y as number) < area.y + area.height).length;
    texts.forEach((t, i) => {
      const k = already + i;
      b.sticky(t, area.x + 20 + (k % cols) * STEP, area.y + 80 + Math.floor(k / cols) * STEP, { colour, ...(area.kind === "frame" ? { frame: { id: area.id } as never } : {}) });
    });
    const bottom = area.y + 80 + Math.ceil((already + texts.length) / cols) * STEP + 20;
    if (bottom > area.y + area.height) next = next.map((e) => (e.id === area.id ? { ...e, height: bottom - area.y, version: ((e.version as number) ?? 1) + 1 } : e));
  } else {
    const at = rightOf(elements);
    texts.forEach((t, i) => b.sticky(t, at.x + (i % 4) * STEP, at.y + Math.floor(i / 4) * STEP, { colour }));
  }
  return { elements: [...next, ...b.elements], placed: texts.length, into: area ? area.id : null };
}

/** An indented list ("- a\n  - b") or a tree ({ text, children }) as a mind map, to the right of the board. */
export function addMindMap(elements: readonly unknown[], items: readonly ListItem[], opts: { title?: string; layout?: MindLayout }, makeId: () => string): { elements: unknown[]; nodes: number } | string {
  const count = (list: readonly ListItem[]): number => list.reduce((n, it) => n + 1 + count(it.children), 0);
  const n = count(items);
  if (!n) return "Give the mind map at least one idea.";
  if (n > MAX_NODES) return `That's ${n} ideas; up to ${MAX_NODES} at a time. Split it into two maps.`;
  const { tree, ids } = treeFromList(items, makeId, opts.title || "Ideas", opts.layout ?? "right");
  const els = [...tree.nodes.values()].flatMap((node) => newNodeElements({ node: node.id, text: ids.get(node.id)! }, { map: tree.map, parent: node.parent, order: node.order }, node.text));
  const at = rightOf(elements);
  return { elements: applyTree([...(elements as El[]), ...els], tree, { rootAt: { x: at.x + 200, y: at.y + 300 } }), nodes: tree.nodes.size };
}

/** A section (a named, coloured area) to the right of the board, with stickies inside. */
export function addSection(elements: readonly unknown[], name: string, opts: { colour?: string; stickies?: readonly string[] }, makeId: () => string): { elements: unknown[]; id: string } | string {
  if (!name.trim()) return "Name the section.";
  const stickies = opts.stickies ?? [];
  const cols = Math.min(4, Math.max(2, stickies.length));
  const at = rightOf(elements);
  const area = { x: at.x, y: at.y, width: cols * STEP + 40, height: Math.max(1, Math.ceil(stickies.length / cols)) * STEP + 100 };
  const colour = opts.colour && /^#[0-9a-f]{6}$/i.test(opts.colour) ? opts.colour : SECTION_COLOURS[sectionsOf(elements).length % SECTION_COLOURS.length]!;
  const ids = { section: makeId(), label: makeId(), group: makeId() };
  const b = sceneBuilder(makeId);
  stickies.forEach((t, i) => b.sticky(t, area.x + 20 + (i % cols) * STEP, area.y + 80 + Math.floor(i / cols) * STEP));
  return { elements: [...(elements as El[]), ...newSection(ids, name.trim(), colour, area), ...b.elements], id: ids.section };
}

/** The board as structured text: frames and sections with their stickies, mind maps as indented lists, the rest. */
export function describeBoard(elements: readonly unknown[]): { frames: Array<{ name: string; items: string[] }>; sections: Array<{ path: string; items: string[] }>; mindMaps: string[]; other: string[] } {
  const { items, frames } = boardItems(elements);
  const maps = mapsOn(elements);
  const text = (i: (typeof items)[number]) => `${i.text}${i.stamp ? ` [${i.stamp}]` : ""}`;
  const loose = items.filter((i) => i.kind !== "node");
  const sectionPaths = [...new Set(loose.map((i) => i.section).filter((s): s is string => Boolean(s)))];
  return {
    frames: frames.map((f) => ({ name: f.name, items: loose.filter((i) => i.frameId === f.id).map(text) })),
    sections: sectionPaths.map((path) => ({ path, items: loose.filter((i) => !i.frameId && i.section === path).map(text) })),
    mindMaps: [...maps.values()].map((t) => listToMarkdown([treeToList(t)])),
    other: loose.filter((i) => !i.frameId && !i.section).map(text),
  };
}
