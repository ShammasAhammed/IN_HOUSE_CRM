// Sections and subsections on Idea Boards (Stage 13.1b, D-13.1b-b). Pure, unit-tested.
// Excalidraw frames can't hold other frames, so sections are our own: a rectangle (`customData.section`: name,
// colour, folded state) grouped with its name label (`customData.sectionLabel`). Nesting comes from geometry: a
// section inside another is its subsection; everything drawn inside a section belongs to it, so moving a section moves
// its contents and subsections, and folding hides them (invisible and locked, like a folded mind-map branch).
export const SECTION_COLOURS = ["#e7f5ff", "#ebfbee", "#fff4e6", "#fff0f6", "#f3f0ff", "#f8f9fa"] as const;
const LINE: Record<string, string> = { "#e7f5ff": "#1c7ed6", "#ebfbee": "#37b24d", "#fff4e6": "#f76707", "#fff0f6": "#d6336c", "#f3f0ff": "#7048e8", "#f8f9fa": "#868e96" };
export const HEADER = 56;

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean };
export type SectionMeta = { name: string; colour: string; collapsed?: boolean; h?: number };
export type SectionNode = { id: string; name: string; colour: string; collapsed: boolean; x: number; y: number; width: number; height: number; parent: string | null; depth: number };

const cd = (e: El) => (e.customData && typeof e.customData === "object" ? (e.customData as Record<string, unknown>) : {});
const live = (e: El) => !e.isDeleted;
export const isSection = (e: unknown) => Boolean(e) && live(e as El) && Boolean(cd(e as El).section);
const inside = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

/** Every section, each with its parent (the smallest section around it), outermost first. */
export function sectionsOf(elements: readonly unknown[]): SectionNode[] {
  const secs = (elements as El[]).filter(isSection);
  const out: SectionNode[] = secs.map((e) => {
    const m = cd(e).section as SectionMeta;
    return { id: e.id, name: m.name, colour: m.colour, collapsed: Boolean(m.collapsed), x: e.x, y: e.y, width: e.width, height: m.collapsed ? (m.h ?? e.height) : e.height, parent: null, depth: 0 };
  });
  for (const s of out) {
    const around = out.filter((o) => o.id !== s.id && o.width * o.height > s.width * s.height && inside(s, o)).sort((a, b) => a.width * a.height - b.width * b.height);
    s.parent = around[0]?.id ?? null;
  }
  for (const s of out) for (let p = s.parent; p; p = out.find((o) => o.id === p)?.parent ?? null) s.depth++;
  return out.sort((a, b) => a.depth - b.depth || a.y - b.y || a.x - b.x);
}

/** What's in a section (subsections and their contents included); not the section or its own label. */
export function contentsOf(elements: readonly unknown[], id: string): string[] {
  const els = (elements as El[]).filter(live);
  const sec = els.find((e) => e.id === id);
  if (!sec) return [];
  const area = { x: sec.x, y: sec.y, width: sec.width, height: (cd(sec).section as SectionMeta).collapsed ? ((cd(sec).section as SectionMeta).h ?? sec.height) : sec.height };
  return els.filter((e) => e.id !== id && cd(e).sectionLabel !== id && inside(e, area)).map((e) => e.id);
}

/** "Section › Subsection" for each element inside a section (the deepest one around it), for the List view. */
export function sectionPaths(elements: readonly unknown[]): Map<string, string> {
  const secs = sectionsOf(elements);
  const name = (id: string): string => {
    const s = secs.find((x) => x.id === id)!;
    return s.parent ? `${name(s.parent)} › ${s.name}` : s.name;
  };
  const out = new Map<string, string>();
  for (const e of (elements as El[]).filter(live)) {
    if (cd(e).section || cd(e).sectionLabel) continue;
    const around = secs.filter((s) => inside(e, s)).sort((a, b) => b.depth - a.depth)[0];
    if (around) out.set(e.id, name(around.id));
  }
  return out;
}

let seed = 11;
const bump = (e: El, patch: Record<string, unknown>): El => ({ ...e, ...patch, version: ((e.version as number) ?? 1) + 1, versionNonce: (seed = (seed * 48271) % 2147483647), updated: Date.now() });
function blank(id: string, type: string, extra: Record<string, unknown>): El {
  return { id, type, x: 0, y: 0, width: 10, height: 10, angle: 0, strokeColor: "#868e96", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, index: null, roundness: { type: 3 }, seed: (seed = (seed * 48271) % 2147483647), version: 1, versionNonce: (seed = (seed * 48271) % 2147483647), isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...extra };
}

/** A new section (its rectangle and name label, grouped), around `area`. */
export function newSection(ids: { section: string; label: string; group: string }, name: string, colour: string, area: { x: number; y: number; width: number; height: number }): El[] {
  const line = LINE[colour] ?? "#868e96";
  return [
    blank(ids.section, "rectangle", { ...area, backgroundColor: colour, strokeColor: line, strokeWidth: 2, groupIds: [ids.group], customData: { section: { name, colour } satisfies SectionMeta } }),
    blank(ids.label, "text", { x: area.x + 16, y: area.y + 14, width: Math.max(60, name.length * 12), height: 25, text: name, originalText: name, fontSize: 20, fontFamily: 6, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, strokeColor: line, groupIds: [ids.group], customData: { sectionLabel: ids.section } }),
  ];
}

/** The area around some elements, with room for the name on top. */
export function areaAround(elements: readonly unknown[], ids: readonly string[]): { x: number; y: number; width: number; height: number } | null {
  const els = (elements as El[]).filter((e) => ids.includes(e.id) && live(e));
  if (!els.length) return null;
  const x = Math.min(...els.map((e) => e.x)) - 32;
  const y = Math.min(...els.map((e) => e.y)) - HEADER - 8;
  const r = Math.max(...els.map((e) => e.x + e.width)) + 32;
  const b = Math.max(...els.map((e) => e.y + e.height)) + 32;
  return { x, y, width: r - x, height: b - y };
}

/** Moves a section's contents by the distance the section itself was moved. */
export function moveContents(elements: readonly unknown[], ids: ReadonlySet<string>, dx: number, dy: number): El[] {
  return (elements as El[]).map((e) => (ids.has(e.id) ? bump(e, { x: e.x + dx, y: e.y + dy }) : e));
}

/** Folds a section to its name bar (contents hidden and locked) or opens it again. */
export function toggleSection(elements: readonly unknown[], id: string): El[] {
  const els = elements as El[];
  const sec = els.find((e) => e.id === id);
  if (!sec) return els;
  const m = cd(sec).section as SectionMeta;
  const folding = !m.collapsed;
  const contents = new Set(contentsOf(els, id));
  return els.map((e) => {
    if (e.id === id) return bump(e, folding ? { height: HEADER, customData: { ...cd(e), section: { ...m, collapsed: true, h: e.height } } } : { height: m.h ?? e.height, customData: { ...cd(e), section: { name: m.name, colour: m.colour } } });
    if (!contents.has(e.id)) return e;
    const c = cd(e);
    if (folding) {
      if (c.hiddenBy) return e; // already hidden by an inner fold
      return bump(e, { opacity: 0, locked: true, customData: { ...c, hiddenBy: id, prev: { opacity: e.opacity ?? 100, locked: Boolean(e.locked) } } });
    }
    if (c.hiddenBy !== id) return e;
    const prev = (c.prev ?? {}) as { opacity?: number; locked?: boolean };
    const { hiddenBy: _h, prev: _p, ...rest } = c;
    return bump(e, { opacity: prev.opacity ?? 100, locked: prev.locked ?? false, customData: Object.keys(rest).length ? rest : undefined });
  });
}

/** Renames a section (its label follows) or a frame. */
export function renameSection(elements: readonly unknown[], id: string, name: string): El[] {
  return (elements as El[]).map((e) => {
    if (e.id === id && e.type === "frame") return bump(e, { name });
    if (e.id === id && cd(e).section) return bump(e, { customData: { ...cd(e), section: { ...(cd(e).section as SectionMeta), name } } });
    if (cd(e).sectionLabel === id) return bump(e, { text: name, originalText: name, width: Math.max(60, name.length * 12) });
    return e;
  });
}
