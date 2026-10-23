// Mind maps in the browser (Stage 13.1b): what the keys and buttons do to the map under the selection, using the pure
// tree model in services/rules/mind-map.ts and writing the result back to the canvas in one step.
import { addChild, addSibling, applyTree, childrenOf, descendants, mapIdOf, newNodeElements, outdent, removeNode, reparent, toggleCollapse, treeFromList, treeOf, treeToList, type ListItem, type MindLayout, type MmMeta, type NodeStyle, type Tree } from "@/services/rules/mind-map";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; containerId?: string | null };
const newId = () => crypto.randomUUID();
const els = (api: ExcalidrawImperativeAPI) => api.getSceneElements() as unknown as El[];

function write(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, next: El[], select?: string) {
  api.updateScene({
    elements: next as never,
    ...(select ? { appState: { selectedElementIds: { [select]: true } } as never } : {}),
    captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
  });
}

/** The map node the person is on: the selected node, or the node whose text they're typing in. */
export function currentNode(api: ExcalidrawImperativeAPI, nodeId?: string): { tree: Tree; id: string } | null {
  if (nodeId) {
    const all = els(api);
    const map = mapIdOf(all.find((x) => x.id === nodeId));
    const tree = map ? treeOf(all, map) : null;
    return tree?.nodes.has(nodeId) ? { tree, id: nodeId } : null;
  }
  const s = api.getAppState();
  const editing = s.editingTextElement as unknown as El | null;
  const all = els(api);
  let id: string | null = null;
  if (editing?.containerId) id = editing.containerId;
  else {
    const sel = Object.keys(s.selectedElementIds).filter((k) => s.selectedElementIds[k]);
    if (sel.length !== 1) return null;
    const e = all.find((x) => x.id === sel[0]);
    id = e?.type === "text" && e.containerId ? e.containerId : (e?.id ?? null);
  }
  const node = id ? all.find((x) => x.id === id) : undefined;
  const map = node ? mapIdOf(node) : null;
  const tree = map ? treeOf(all, map) : null;
  return tree && id && tree.nodes.has(id) ? { tree, id } : null;
}

/** Applies a changed tree, adding elements for new nodes first. */
export function commitTree(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, tree: Tree, opts: { add?: Array<{ id: string; text: string }>; drop?: string[]; select?: string; rootAt?: { x: number; y: number } } = {}) {
  const t0 = performance.now();
  const base = els(api);
  const root = base.find((e) => e.id === tree.root);
  const extra = (opts.add ?? []).flatMap((a) => {
    const n = tree.nodes.get(a.id)!;
    return newNodeElements({ node: a.id, text: newId() }, { map: tree.map, parent: n.parent, order: n.order } as MmMeta, a.text, { x: root?.x ?? 0, y: root?.y ?? 0 });
  });
  write(api, lib, applyTree([...base, ...extra], tree, { ...(opts.drop ? { drop: opts.drop } : {}), ...(opts.rootAt ? { rootAt: opts.rootAt } : {}) }), opts.select);
  // How long a re-layout takes in this browser (DevTools → Performance, "mind-map layout").
  performance.measure("mind-map layout", { start: t0, end: performance.now(), detail: { nodes: tree.nodes.size } });
}

/** Opens the text editor on the selected node, as Enter does (our own Enter handler lets this one through). */
export function editSelected(container: HTMLElement | null, mark: { skip: boolean }) {
  if (!container) return;
  mark.skip = true;
  setTimeout(() => {
    container.querySelector<HTMLElement>(".excalidraw")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    mark.skip = false;
  }, 30);
}

/** A new map in the middle of the screen (or from a list), its root selected. */
export function insertMindMap(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, items?: readonly ListItem[], layout: MindLayout = "right"): string {
  const s = api.getAppState();
  const z = s.zoom.value;
  const at = { x: -s.scrollX + s.width / 2 / z - 80, y: -s.scrollY + s.height / 2 / z - 32 };
  const { tree, ids } = treeFromList(items?.length ? items : [{ text: "Main topic", children: [] }], newId, "Ideas", layout);
  const nodes = [...tree.nodes.values()].flatMap((n) => newNodeElements({ node: n.id, text: ids.get(n.id)! }, { map: tree.map, parent: n.parent, order: n.order, ...(n.id === tree.root ? { layout, style: "sticky", colours: true } : {}) } as MmMeta, n.text, at));
  write(api, lib, applyTree([...els(api), ...nodes], tree, { rootAt: at }), tree.root);
  return tree.root;
}

/** "Make mind map" on a sticky, shape or loose text: it becomes the root of a new map. */
export function makeMindMap(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, id: string): boolean {
  const all = els(api);
  const e = all.find((x) => x.id === id);
  if (!e || mapIdOf(e)) return false;
  if (e.type === "text" && !e.containerId) {
    // Loose text: a new root with that text, where the text was.
    const text = String(e.originalText ?? e.text ?? "");
    const root = newId();
    const nodes = newNodeElements({ node: root, text: newId() }, { map: root, parent: null, order: 0, layout: "right", style: "sticky", colours: true }, text, { x: e.x, y: e.y });
    const t = treeOf([...all, ...nodes], root)!;
    write(api, lib, applyTree([...all.filter((x) => x.id !== id), ...nodes], t, { rootAt: { x: e.x, y: e.y } }), root);
    return true;
  }
  if (!["rectangle", "ellipse", "diamond"].includes(e.type)) return false;
  const meta: MmMeta = { map: id, parent: null, order: 0, layout: "right", style: "sticky", colours: true };
  const next = all.map((x) => (x.id === id ? { ...x, customData: { ...((x.customData as object) ?? {}), kind: undefined, mm: meta } } : x));
  write(api, lib, applyTree(next, treeOf(next, id)!, { rootAt: { x: e.x, y: e.y } }), id);
  return true;
}

/** Tab (child) or Enter (sibling): the new node is selected, ready to type in. */
export function addNode(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, how: "child" | "sibling", from?: string): string | null {
  const cur = currentNode(api, from);
  if (!cur) return null;
  const id = newId();
  const tree = how === "child" ? addChild(cur.tree, cur.id, id) : addSibling(cur.tree, cur.id, id);
  commitTree(api, lib, tree, { add: [{ id, text: "" }], select: id });
  return id;
}

export function outdentNode(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, from?: string): boolean {
  const cur = currentNode(api, from);
  if (!cur) return false;
  const t = outdent(cur.tree, cur.id);
  if (t !== cur.tree) commitTree(api, lib, t, { select: cur.id });
  return true;
}

/** How many nodes would go with this one (the caller asks first when there are any). */
export function branchSize(api: ExcalidrawImperativeAPI): { id: string; text: string; under: number; root: boolean } | null {
  const cur = currentNode(api);
  return cur ? { id: cur.id, text: cur.tree.nodes.get(cur.id)!.text, under: descendants(cur.tree, cur.id).length, root: cur.id === cur.tree.root } : null;
}

export function deleteNode(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, id: string) {
  const all = els(api);
  const node = all.find((e) => e.id === id);
  const map = node ? mapIdOf(node) : null;
  const tree = map ? treeOf(all, map) : null;
  if (!tree) return;
  if (id === tree.root) {
    // The whole map goes (nodes, their text, connectors and badges).
    const gone = new Set([...tree.nodes.keys()]);
    write(api, lib, all.filter((e) => !gone.has(e.id) && !(e.containerId && gone.has(e.containerId)) && !((e.customData as { mmEdge?: { map: string }; mmBadge?: { map: string } } | undefined)?.mmEdge?.map === map || (e.customData as { mmBadge?: { map: string } } | undefined)?.mmBadge?.map === map)));
    return;
  }
  const parent = tree.nodes.get(id)!.parent!;
  const { tree: t, removed } = removeNode(tree, id);
  commitTree(api, lib, t, { drop: removed, select: parent });
}

export function collapseNode(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule): boolean {
  const cur = currentNode(api);
  if (!cur || !childrenOf(cur.tree, cur.id).length) return false;
  commitTree(api, lib, toggleCollapse(cur.tree, cur.id), { select: cur.id });
  return true;
}

export function setMapLook(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, patch: { layout?: MindLayout; style?: NodeStyle; colours?: boolean }) {
  const cur = currentNode(api);
  if (cur) commitTree(api, lib, { ...cur.tree, ...patch }, { select: cur.id });
}

/** Lays out every map whose text or shape changed since the last layout (as people type). */
export function relayoutChanged(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, seen: Map<string, string>, opts: { dry?: boolean } = {}): boolean {
  const all = els(api);
  const texts = new Map<string, string>();
  for (const e of all) if (e.type === "text" && e.containerId) texts.set(e.containerId, String(e.originalText ?? e.text ?? ""));
  const sig = new Map<string, string>();
  for (const e of all) {
    const m = mapIdOf(e);
    if (m) sig.set(m, `${sig.get(m) ?? ""}|${e.id}:${texts.get(e.id) ?? ""}:${JSON.stringify((e.customData as { mm?: unknown }).mm)}`);
  }
  let next = all;
  let changed = false;
  for (const [map, s] of sig) {
    if (seen.get(map) === s) continue;
    seen.set(map, s);
    if (opts.dry) continue;
    const t = treeOf(next, map);
    if (!t) continue;
    next = applyTree(next, t) as El[];
    changed = true;
  }
  if (changed) {
    // Layout changes nothing the person typed: keep it out of undo as its own step.
    api.updateScene({ elements: next as never, captureUpdate: lib.CaptureUpdateAction.EVENTUALLY });
    // The written text may differ in layout only; remember what we wrote.
    for (const [map] of sig) if (treeOf(next, map)) seen.set(map, sig.get(map)!);
  }
  return changed;
}

/**
 * After a drag: a node dropped on another node moves under it (its branch with it); a node dropped elsewhere takes
 * its place among its siblings by position; a dragged root moves its whole map. Then the map is laid out again.
 */
export function afterDrag(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, before: ReadonlyMap<string, { x: number; y: number }>) {
  const all = els(api);
  const moved = all.filter((e) => mapIdOf(e) && before.has(e.id) && (Math.abs(before.get(e.id)!.x - e.x) > 2 || Math.abs(before.get(e.id)!.y - e.y) > 2));
  if (!moved.length) return;
  const maps = new Set(moved.map((e) => mapIdOf(e)!));
  if (moved.length === 1) {
    const e = moved[0]!;
    const t = treeOf(all, mapIdOf(e)!)!;
    if (e.id === t.root) return commitTree(api, lib, t, { rootAt: { x: e.x, y: e.y }, select: e.id });
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    const branch = new Set([e.id, ...descendants(t, e.id)]);
    const target = all.find((o) => o.id !== e.id && mapIdOf(o) === t.map && !branch.has(o.id) && (o.opacity as number) !== 0 && cx > o.x && cx < o.x + o.width && cy > o.y && cy < o.y + o.height);
    if (target) return commitTree(api, lib, reparent(t, e.id, target.id), { select: e.id });
    const parent = t.nodes.get(e.id)!.parent!;
    const sibs = childrenOf(t, parent).filter((s) => s.id !== e.id);
    const key = (o: El) => (t.layout === "down" ? o.x + o.width / 2 : t.layout === "radial" ? Math.atan2(o.y - cy, o.x - cx) : o.y + o.height / 2);
    const mine = t.layout === "down" ? cx : cy;
    const index = t.layout === "radial" ? sibs.length : sibs.filter((s) => key(all.find((o) => o.id === s.id)!) < mine).length;
    return commitTree(api, lib, reparent(t, e.id, parent, index), { select: e.id });
  }
  // Several moved together: a moved root moves its map; otherwise the layout puts them back.
  for (const map of maps) {
    const t = treeOf(els(api), map)!;
    const root = all.find((x) => x.id === t.root)!;
    commitTree(api, lib, t, { rootAt: { x: root.x, y: root.y } });
  }
}

/** Where every map node is now (taken when a drag starts). */
export function nodePositions(api: ExcalidrawImperativeAPI): Map<string, { x: number; y: number }> {
  return new Map(els(api).filter((e) => mapIdOf(e)).map((e) => [e.id, { x: e.x, y: e.y }]));
}

export function mapAsList(api: ExcalidrawImperativeAPI, id: string): ListItem | null {
  const all = els(api);
  const e = all.find((x) => x.id === id);
  const map = e ? mapIdOf(e) : null;
  const t = map ? treeOf(all, map) : null;
  return t ? treeToList(t) : null;
}
