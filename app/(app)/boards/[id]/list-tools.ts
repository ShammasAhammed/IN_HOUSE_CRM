// Lists ↔ board (Stage 13.1b): a pasted list becomes a mind map, a sticky grid or text; a selection (stickies, a
// mind map, sections) becomes a Markdown list; the outline editor rewrites a map from its list.
import { sceneBuilder } from "@/services/rules/board-templates";
import { boardItems } from "@/services/rules/boards";
import { listToMarkdown, mapIdOf, parseList, treeFromOutline, treeOf, treeToList, type ListItem } from "@/services/rules/mind-map";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";
import { commitTree, insertMindMap } from "./mind-tools";

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number; containerId?: string | null };
const els = (api: ExcalidrawImperativeAPI) => api.getSceneElements() as unknown as El[];
const COLUMN = ["#d0ebff", "#d3f9d8", "#ffe8cc", "#ffdeeb", "#fff3bf", "#e5dbff"];

function centre(api: ExcalidrawImperativeAPI) {
  const s = api.getAppState();
  const z = s.zoom.value;
  return { x: -s.scrollX + s.width / 2 / z, y: -s.scrollY + s.height / 2 / z };
}

/** A pasted list on the board: as a mind map, a grid of stickies (a column per top item), or one text. */
export function placeList(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, items: readonly ListItem[], as: "map" | "grid" | "text") {
  if (as === "map") return void insertMindMap(api, lib, items);
  const c = centre(api);
  const b = sceneBuilder(() => crypto.randomUUID());
  if (as === "text") {
    b.heading(listToMarkdown(items), c.x - 200, c.y - 100, { size: 20 });
  } else {
    items.forEach((top, col) => {
      const x = c.x - (items.length * 220) / 2 + col * 220;
      b.sticky(top.text, x, c.y - 200, { colour: COLUMN[col % COLUMN.length], size: 200 });
      let y = c.y + 20;
      const walk = (list: readonly ListItem[], depth: number) =>
        list.forEach((it) => {
          b.sticky(it.text, x + depth * 12, y, { colour: COLUMN[col % COLUMN.length], size: 180 - depth * 12 });
          y += 200 - depth * 12;
          walk(it.children, depth + 1);
        });
      walk(top.children, 0);
    });
  }
  const added = b.elements.map((e) => e.id);
  api.updateScene({ elements: [...els(api), ...b.elements] as never, appState: { selectedElementIds: Object.fromEntries(added.map((id) => [id, true])) } as never, captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
  api.scrollToContent(b.elements as never, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true });
}

/** The selection as a list: a mind map (from the selected node down), or stickies grouped by their section. */
export function selectionAsList(api: ExcalidrawImperativeAPI): ListItem[] {
  const all = els(api);
  const s = api.getAppState();
  const sel = new Set(Object.keys(s.selectedElementIds).filter((k) => s.selectedElementIds[k]));
  for (const e of all) if (sel.has(e.id) && e.type === "text" && e.containerId) sel.add(e.containerId);
  // A map node: its branch (the whole map from the root).
  const node = all.find((e) => sel.has(e.id) && mapIdOf(e));
  if (node) {
    const t = treeOf(all, mapIdOf(node)!);
    const top = [...sel].filter((id) => t?.nodes.has(id)).sort((a, b) => (a === t!.root ? -1 : b === t!.root ? 1 : 0))[0];
    if (t && top) return [treeToList(t, top)];
  }
  const items = boardItems(all)
    .items.filter((i) => sel.has(i.id) && i.kind !== "node")
    .map((i) => ({ i, e: all.find((x) => x.id === i.id)! }))
    .sort((a, b) => (a.i.section ?? "").localeCompare(b.i.section ?? "") || Math.round(a.e.y / 120) - Math.round(b.e.y / 120) || a.e.x - b.e.x);
  const out: ListItem[] = [];
  for (const { i } of items) {
    const leaf = { text: i.text.replace(/\s+/g, " ").trim() || "(empty)", children: [] };
    if (!i.section) out.push(leaf);
    else {
      // Nested sections become nested items ("Campaign › Content").
      let level = out;
      for (const name of i.section.split(" › ")) {
        let g = level.find((x) => x.text === name && x.children.length);
        if (!g) {
          g = { text: name, children: [] };
          level.push(g);
        }
        level = g.children;
      }
      level.push(leaf);
    }
  }
  return out;
}

export const asMarkdown = (items: readonly ListItem[]) => listToMarkdown(items);

/** The outline editor's text for a map. */
export function mapMarkdown(api: ExcalidrawImperativeAPI, mapId: string): string | null {
  const t = treeOf(els(api), mapId);
  return t ? listToMarkdown([treeToList(t)]) : null;
}

/** Rewrites a map from the outline editor's list (ids kept in reading order, so votes and comments stay). */
export function applyOutlineText(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, mapId: string, text: string) {
  const t = treeOf(els(api), mapId);
  const items = parseList(text);
  if (!t || !items.length) return;
  const { tree, added, removed } = treeFromOutline(t, items, () => crypto.randomUUID());
  commitTree(api, lib, tree, { add: [...added.keys()].map((id) => ({ id, text: tree.nodes.get(id)!.text })), drop: removed });
}
