// Sections on the canvas (Stage 13.1b, D-13.1b-b): make one around the selection, keep contents with a moved section,
// fold, rename and colour. The rules live in services/rules/sections.ts.
import { areaAround, contentsOf, moveContents, newSection, renameSection, sectionsOf, SECTION_COLOURS, toggleSection } from "@/services/rules/sections";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number; customData?: Record<string, unknown> };
const els = (api: ExcalidrawImperativeAPI) => api.getSceneElements() as unknown as El[];
const write = (api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, next: El[], select?: string[]) =>
  api.updateScene({ elements: next as never, ...(select ? { appState: { selectedElementIds: Object.fromEntries(select.map((s) => [s, true])) } as never } : {}), captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });

/** A section around what's selected (or an empty one in the middle of the screen), drawn behind it. */
export function addSection(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, name = "Section") {
  const all = els(api);
  const s = api.getAppState();
  const sel = Object.keys(s.selectedElementIds).filter((k) => s.selectedElementIds[k]);
  const z = s.zoom.value;
  const area = areaAround(all, sel) ?? { x: -s.scrollX + s.width / 2 / z - 300, y: -s.scrollY + s.height / 2 / z - 200, width: 600, height: 400 };
  const ids = { section: crypto.randomUUID(), label: crypto.randomUUID(), group: crypto.randomUUID() };
  const colour = SECTION_COLOURS[sectionsOf(all).length % SECTION_COLOURS.length]!;
  // First in the list, so it is drawn behind what it holds.
  write(api, lib, [...newSection(ids, name, colour, area), ...all], [ids.section, ids.label]);
  return ids.section;
}

/** The selected section (its rectangle or its name), if any. */
export function selectedSection(api: ExcalidrawImperativeAPI): { id: string; name: string; colour: string; collapsed: boolean } | null {
  const s = api.getAppState();
  const sel = new Set(Object.keys(s.selectedElementIds).filter((k) => s.selectedElementIds[k]));
  const all = els(api);
  const rect = all.find((e) => sel.has(e.id) && e.customData?.section) ?? all.find((e) => e.customData?.section && [...sel].some((id) => all.find((x) => x.id === id)?.customData?.sectionLabel === e.id));
  if (!rect) return null;
  const m = rect.customData!.section as { name: string; colour: string; collapsed?: boolean };
  return { id: rect.id, name: m.name, colour: m.colour, collapsed: Boolean(m.collapsed) };
}

/** Where each section and what it holds are, when a drag starts. */
export type SectionSnapshot = Map<string, { x: number; y: number; contents: Map<string, { x: number; y: number }> }>;
export function snapshotSections(api: ExcalidrawImperativeAPI): SectionSnapshot {
  const all = els(api);
  const out: SectionSnapshot = new Map();
  for (const sec of sectionsOf(all)) {
    const ids = contentsOf(all, sec.id);
    out.set(sec.id, { x: sec.x, y: sec.y, contents: new Map(ids.map((id) => { const e = all.find((x) => x.id === id)!; return [id, { x: e.x, y: e.y }]; })) });
  }
  return out;
}

/** After a drag: a moved section brings along whatever it held that didn't move with it. */
export function sectionsAfterDrag(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, before: SectionSnapshot) {
  let all = els(api);
  const byId = new Map(all.map((e) => [e.id, e]));
  const toMove = new Map<string, { dx: number; dy: number }>();
  // Outermost first, so contents of a moved parent aren't moved twice by a moved child.
  for (const [id, b] of before) {
    const now = byId.get(id);
    if (!now) continue;
    const dx = now.x - b.x;
    const dy = now.y - b.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    for (const [cid, p] of b.contents) {
      const c = byId.get(cid);
      if (c && Math.abs(c.x - p.x) < 1 && Math.abs(c.y - p.y) < 1 && !toMove.has(cid)) toMove.set(cid, { dx, dy });
    }
  }
  if (!toMove.size) return;
  for (const [cid, d] of toMove) all = moveContents(all, new Set([cid]), d.dx, d.dy) as El[];
  write(api, lib, all);
}

export function foldSection(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, id: string) {
  write(api, lib, toggleSection(els(api), id) as El[]);
}
export function renameOnBoard(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, id: string, name: string) {
  write(api, lib, renameSection(els(api), id, name.trim().slice(0, 80) || "Section") as El[]);
}
export function recolourSection(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, id: string, colour: string) {
  const LINE: Record<string, string> = { "#e7f5ff": "#1c7ed6", "#ebfbee": "#37b24d", "#fff4e6": "#f76707", "#fff0f6": "#d6336c", "#f3f0ff": "#7048e8", "#f8f9fa": "#868e96" };
  const next = els(api).map((e) => {
    if (e.id === id) return { ...e, backgroundColor: colour, strokeColor: LINE[colour] ?? e.strokeColor, customData: { ...e.customData, section: { ...(e.customData!.section as object), colour } }, version: ((e.version as number) ?? 1) + 1 };
    if (e.customData?.sectionLabel === id) return { ...e, strokeColor: LINE[colour] ?? e.strokeColor, version: ((e.version as number) ?? 1) + 1 };
    return e;
  });
  write(api, lib, next);
}

/** Frames and sections in reading order, with nesting: the Outline and the slides. */
export function outline(api: ExcalidrawImperativeAPI): Array<{ id: string; name: string; kind: "frame" | "section"; depth: number; collapsed: boolean }> {
  const all = els(api);
  const frames = all.filter((e) => e.type === "frame" && !e.isDeleted).map((f, i) => ({ id: f.id, name: (f.name as string | null) || `Frame ${i + 1}`, kind: "frame" as const, depth: 0, collapsed: false, x: f.x, y: f.y }));
  const secs = sectionsOf(all);
  const ordered: Array<{ id: string; name: string; kind: "frame" | "section"; depth: number; collapsed: boolean }> = [];
  const tops = [...frames, ...secs.filter((s) => !s.parent).map((s) => ({ id: s.id, name: s.name, kind: "section" as const, depth: 0, collapsed: s.collapsed, x: s.x, y: s.y }))].sort((a, b) => Math.round(a.y / 200) - Math.round(b.y / 200) || a.x - b.x);
  const addKids = (parent: string, depth: number) => {
    for (const k of secs.filter((s) => s.parent === parent).sort((a, b) => a.y - b.y || a.x - b.x)) {
      ordered.push({ id: k.id, name: k.name, kind: "section", depth, collapsed: k.collapsed });
      addKids(k.id, depth + 1);
    }
  };
  for (const t of tops) {
    ordered.push({ id: t.id, name: t.name, kind: t.kind, depth: 0, collapsed: t.collapsed });
    if (t.kind === "section") addKids(t.id, 1);
  }
  return ordered;
}
