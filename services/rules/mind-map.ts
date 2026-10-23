// Mind maps on Idea Boards (Stage 13.1b, D-13.1b-a). Pure, unit-tested; runs in the browser on every change.
//   - The tree is ours, kept on each node's Excalidraw element as `customData.mm` ({ map, parent, order, collapsed };
//     the root also holds the map's layout, node style and colour switch). Layout, collapse, lists and the outline
//     editor all work from that tree, never from guessing positions.
//   - A node is a rectangle with its text inside (Excalidraw's bound text), so it behaves like any sticky: votes,
//     reactions, comments, sticky → task, List view and search keep working.
//   - Parent–child connectors are arrows we own (`customData.mmEdge`), bound to both nodes, rebuilt by every layout.
//   - A collapsed branch stays on the board, invisible and locked (still in search and the List view), with a "+N"
//     badge on its node.
import { wrap } from "./text-wrap";

export const MIND_LAYOUTS = ["right", "left", "both", "down", "radial"] as const;
export type MindLayout = (typeof MIND_LAYOUTS)[number];
export const MIND_LAYOUT_LABELS: Record<MindLayout, string> = { right: "Right", left: "Left", both: "Both sides", down: "Top-down", radial: "Radial" };
export const NODE_STYLES = ["sticky", "pill", "text"] as const;
export type NodeStyle = (typeof NODE_STYLES)[number];
export type MmMeta = { map: string; parent: string | null; order: number; collapsed?: boolean; layout?: MindLayout; style?: NodeStyle; colours?: boolean };

/** Branch colours: each top-level branch gets one (fill, line), its children inherit it. */
export const BRANCH_COLOURS: ReadonlyArray<{ fill: string; line: string }> = [
  { fill: "#d0ebff", line: "#1971c2" },
  { fill: "#d3f9d8", line: "#2f9e44" },
  { fill: "#ffe8cc", line: "#e8590c" },
  { fill: "#ffdeeb", line: "#c2255c" },
  { fill: "#fff3bf", line: "#e67700" },
  { fill: "#e5dbff", line: "#6741d9" },
  { fill: "#c5f6fa", line: "#0c8599" },
  { fill: "#f4fce3", line: "#5c940d" },
];
const ROOT_COLOUR = { fill: "#e9d8fd", line: "#7f21c2" };
const PLAIN = { fill: "#ffffff", line: "#495057" };

const GAP_X = 64;
const GAP_Y = 18;
const GAP_DOWN = 48;
const FONT = 18;
const ROOT_FONT = 24;

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number };
export type TreeNode = { id: string; parent: string | null; order: number; collapsed: boolean; text: string };
export type Tree = { map: string; root: string; layout: MindLayout; style: NodeStyle; colours: boolean; nodes: Map<string, TreeNode> };

const metaOf = (e: unknown): MmMeta | null => {
  const m = (e as { customData?: { mm?: MmMeta } } | null)?.customData?.mm;
  return m && typeof m.map === "string" ? m : null;
};
const live = (e: unknown) => Boolean(e) && (e as { isDeleted?: boolean }).isDeleted !== true;
export const isMindNode = (e: unknown) => live(e) && metaOf(e) !== null;
export const mapIdOf = (e: unknown) => metaOf(e)?.map ?? null;

// ---------- the tree ----------

/** Every map on a board: map id → its tree. */
export function mapsOn(elements: readonly unknown[]): Map<string, Tree> {
  const byMap = new Map<string, unknown[]>();
  for (const e of elements) {
    const m = live(e) ? metaOf(e) : null;
    if (m) byMap.set(m.map, [...(byMap.get(m.map) ?? []), e]);
  }
  const out = new Map<string, Tree>();
  for (const [map] of byMap) {
    const t = treeOf(elements, map);
    if (t) out.set(map, t);
  }
  return out;
}

/** One map's tree, read from its nodes' metadata (orphans hang from the root; a cycle is broken at the root). */
export function treeOf(elements: readonly unknown[], map: string): Tree | null {
  const texts = new Map<string, string>();
  for (const e of elements as El[]) if (live(e) && e.type === "text" && typeof e.containerId === "string") texts.set(e.containerId, String(e.originalText ?? e.text ?? ""));
  const nodes = new Map<string, TreeNode>();
  let rootEl: El | null = null;
  for (const e of elements as El[]) {
    const m = live(e) ? metaOf(e) : null;
    if (!m || m.map !== map) continue;
    nodes.set(e.id, { id: e.id, parent: m.parent, order: m.order ?? 0, collapsed: Boolean(m.collapsed), text: texts.get(e.id) ?? "" });
    if (m.parent === null && (!rootEl || e.id === map)) rootEl = e;
  }
  if (!rootEl) return null;
  const root = rootEl.id;
  const rm = metaOf(rootEl)!;
  for (const n of nodes.values()) {
    if (n.id === root) n.parent = null;
    else if (!n.parent || !nodes.has(n.parent)) n.parent = root;
  }
  // Break cycles: walk up from each node; if the root is never reached, hang it from the root.
  for (const n of nodes.values()) {
    const seen = new Set<string>();
    let cur: TreeNode | undefined = n;
    while (cur && cur.parent !== null && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = nodes.get(cur.parent);
    }
    if (cur && cur.parent !== null) n.parent = root;
  }
  return { map, root, layout: rm.layout ?? "right", style: rm.style ?? "sticky", colours: rm.colours ?? true, nodes };
}

export const childrenOf = (t: Tree, id: string) => [...t.nodes.values()].filter((n) => n.parent === id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export function descendants(t: Tree, id: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const c of childrenOf(t, p)) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}
export const depthOf = (t: Tree, id: string) => {
  let d = 0;
  for (let n = t.nodes.get(id); n?.parent; n = t.nodes.get(n.parent)) d++;
  return d;
};
const clone = (t: Tree): Tree => ({ ...t, nodes: new Map([...t.nodes].map(([k, v]) => [k, { ...v }])) });
const renumber = (t: Tree, parent: string) => childrenOf(t, parent).forEach((c, i) => (t.nodes.get(c.id)!.order = i));

export function addChild(t: Tree, parent: string, id: string, text = ""): Tree {
  const n = clone(t);
  n.nodes.set(id, { id, parent, order: childrenOf(n, parent).length, collapsed: false, text });
  n.nodes.get(parent)!.collapsed = false;
  return n;
}

/** A sibling right after the node (on the root: a child, as in FigJam). */
export function addSibling(t: Tree, of: string, id: string, text = ""): Tree {
  const node = t.nodes.get(of);
  if (!node?.parent) return addChild(t, of, id, text);
  const n = clone(t);
  for (const c of childrenOf(n, node.parent)) if (c.order > node.order) n.nodes.get(c.id)!.order += 1;
  n.nodes.set(id, { id, parent: node.parent, order: node.order + 1, collapsed: false, text });
  renumber(n, node.parent);
  return n;
}

/** Shift+Tab: up a level, placed right after its old parent. No change for the root or its children. */
export function outdent(t: Tree, id: string): Tree {
  const node = t.nodes.get(id);
  const parent = node?.parent ? t.nodes.get(node.parent) : undefined;
  if (!node || !parent?.parent) return t;
  const n = clone(t);
  const grand = parent.parent!;
  for (const c of childrenOf(n, grand)) if (c.order > parent.order) n.nodes.get(c.id)!.order += 1;
  Object.assign(n.nodes.get(id)!, { parent: grand, order: parent.order + 1 });
  renumber(n, grand);
  renumber(n, parent.id);
  return n;
}

/** Moves a node (with its branch) under another node, at an index; refuses its own branch. */
export function reparent(t: Tree, id: string, to: string, index?: number): Tree {
  if (id === t.root || id === to || !t.nodes.has(to) || descendants(t, id).includes(to)) return t;
  const n = clone(t);
  const old = n.nodes.get(id)!.parent!;
  const siblings = childrenOf(n, to).filter((c) => c.id !== id);
  const at = Math.max(0, Math.min(index ?? siblings.length, siblings.length));
  siblings.splice(at, 0, n.nodes.get(id)!);
  n.nodes.get(id)!.parent = to;
  siblings.forEach((c, i) => (n.nodes.get(c.id)!.order = i));
  n.nodes.get(to)!.collapsed = false;
  renumber(n, old);
  return n;
}

/** The node and everything under it go; returns the ids removed. The root can't be removed this way. */
export function removeNode(t: Tree, id: string): { tree: Tree; removed: string[] } {
  const node = t.nodes.get(id);
  if (!node || id === t.root) return { tree: t, removed: [] };
  const removed = [id, ...descendants(t, id)];
  const n = clone(t);
  for (const r of removed) n.nodes.delete(r);
  renumber(n, node.parent!);
  return { tree: n, removed };
}

export function toggleCollapse(t: Tree, id: string): Tree {
  if (!childrenOf(t, id).length) return t;
  const n = clone(t);
  n.nodes.get(id)!.collapsed = !n.nodes.get(id)!.collapsed;
  return n;
}

/** Nodes hidden because an ancestor is collapsed. */
export function hiddenNodes(t: Tree): Set<string> {
  const out = new Set<string>();
  for (const n of t.nodes.values()) if (n.collapsed) for (const d of descendants(t, n.id)) out.add(d);
  return out;
}

// ---------- layout ----------

export type Size = { w: number; h: number };
export type Pos = { x: number; y: number };

/**
 * Top-left positions for every visible node; the root stays where it is (`rootAt` is its top-left).
 * right/left: a tidy tree growing sideways; both: the root's branches split into two balanced halves; down: a tidy
 * tree growing downwards; radial: rings around the root, each branch an arc sized by its leaves.
 */
export function layoutTree(t: Tree, sizes: ReadonlyMap<string, Size>, kind: MindLayout, rootAt: Pos): Map<string, Pos> {
  const hidden = hiddenNodes(t);
  const kids = new Map<string, TreeNode[]>();
  for (const n of t.nodes.values()) if (n.parent && !hidden.has(n.id)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  for (const v of kids.values()) v.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const visKids = (id: string) => (t.nodes.get(id)?.collapsed ? [] : (kids.get(id) ?? []));
  const sz = (id: string) => sizes.get(id) ?? { w: 120, h: 44 };
  const pos = new Map<string, Pos>();
  const root = sz(t.root);
  const rc = { x: rootAt.x + root.w / 2, y: rootAt.y + root.h / 2 };
  pos.set(t.root, { ...rootAt });

  // Sideways: the height a branch needs, then place it.
  const spanH = new Map<string, number>();
  const measureH = (id: string): number => {
    const cs = visKids(id);
    const inner = cs.reduce((s, c) => s + measureH(c.id), 0) + Math.max(0, cs.length - 1) * GAP_Y;
    const v = Math.max(sz(id).h, inner);
    spanH.set(id, v);
    return v;
  };
  const placeSide = (id: string, dir: 1 | -1) => {
    const p = pos.get(id)!;
    const cs = visKids(id);
    const total = cs.reduce((s, c) => s + spanH.get(c.id)!, 0) + Math.max(0, cs.length - 1) * GAP_Y;
    let y = p.y + sz(id).h / 2 - total / 2;
    for (const c of cs) {
      const span = spanH.get(c.id)!;
      const x = dir === 1 ? p.x + sz(id).w + GAP_X : p.x - GAP_X - sz(c.id).w;
      pos.set(c.id, { x, y: y + span / 2 - sz(c.id).h / 2 });
      placeSide(c.id, dir);
      y += span + GAP_Y;
    }
  };
  const stack = (ids: TreeNode[], dir: 1 | -1) => {
    for (const c of ids) measureH(c.id);
    const total = ids.reduce((s, c) => s + spanH.get(c.id)!, 0) + Math.max(0, ids.length - 1) * GAP_Y;
    let y = rc.y - total / 2;
    for (const c of ids) {
      const span = spanH.get(c.id)!;
      const x = dir === 1 ? rootAt.x + root.w + GAP_X : rootAt.x - GAP_X - sz(c.id).w;
      pos.set(c.id, { x, y: y + span / 2 - sz(c.id).h / 2 });
      placeSide(c.id, dir);
      y += span + GAP_Y;
    }
  };

  if (kind === "right" || kind === "left") stack(visKids(t.root), kind === "right" ? 1 : -1);
  else if (kind === "both") {
    const cs = visKids(t.root);
    for (const c of cs) measureH(c.id);
    const total = cs.reduce((s, c) => s + spanH.get(c.id)!, 0);
    const right: TreeNode[] = [];
    const left: TreeNode[] = [];
    let acc = 0;
    // The first branches go right until about half the height is used; the rest go left (FigJam's balanced map).
    for (const c of cs) {
      if (right.length === 0 || acc + spanH.get(c.id)! / 2 <= total / 2) {
        right.push(c);
        acc += spanH.get(c.id)!;
      } else left.push(c);
    }
    stack(right, 1);
    stack(left, -1);
  } else if (kind === "down") {
    const spanW = new Map<string, number>();
    const measureW = (id: string): number => {
      const cs = visKids(id);
      const inner = cs.reduce((s, c) => s + measureW(c.id), 0) + Math.max(0, cs.length - 1) * GAP_Y;
      const v = Math.max(sz(id).w, inner);
      spanW.set(id, v);
      return v;
    };
    measureW(t.root);
    const place = (id: string) => {
      const p = pos.get(id)!;
      const cs = visKids(id);
      const total = cs.reduce((s, c) => s + spanW.get(c.id)!, 0) + Math.max(0, cs.length - 1) * GAP_Y;
      let x = p.x + sz(id).w / 2 - total / 2;
      for (const c of cs) {
        const span = spanW.get(c.id)!;
        pos.set(c.id, { x: x + span / 2 - sz(c.id).w / 2, y: p.y + sz(id).h + GAP_DOWN });
        place(c.id);
        x += span + GAP_Y;
      }
    };
    place(t.root);
  } else {
    // Radial: each node sits at the middle of its leaves' share of the circle, one ring per level.
    const leaves = new Map<string, number>();
    const countLeaves = (id: string): number => {
      const cs = visKids(id);
      const v = cs.length ? cs.reduce((s, c) => s + countLeaves(c.id), 0) : 1;
      leaves.set(id, v);
      return v;
    };
    const all = countLeaves(t.root);
    let biggest = 0;
    for (const id of t.nodes.keys()) if (!hidden.has(id) && id !== t.root) biggest = Math.max(biggest, Math.hypot(sz(id).w, sz(id).h));
    // The first ring clears the root and is long enough to hold every leaf; each further ring is one node further out.
    const ring = Math.max(biggest + 40, Math.hypot(root.w, root.h) / 2 + biggest / 2 + 40, (all * (biggest + 16)) / (2 * Math.PI));
    const place = (id: string, from: number, to: number, depth: number) => {
      const cs = visKids(id);
      let a = from;
      for (const c of cs) {
        const share = ((to - from) * leaves.get(c.id)!) / leaves.get(id)!;
        const mid = a + share / 2;
        const r = ring + depth * (biggest + 40);
        pos.set(c.id, { x: rc.x + r * Math.cos(mid) - sz(c.id).w / 2, y: rc.y + r * Math.sin(mid) - sz(c.id).h / 2 });
        place(c.id, a, a + share, depth + 1);
        a += share;
      }
    };
    place(t.root, -Math.PI / 2, (3 * Math.PI) / 2, 0);
  }
  // Hidden nodes wait under their nearest visible ancestor.
  for (const id of hidden) {
    let a = t.nodes.get(id)!.parent;
    while (a && hidden.has(a)) a = t.nodes.get(a)!.parent;
    pos.set(id, { ...(pos.get(a ?? t.root) ?? rootAt) });
  }
  return pos;
}

/** A node's size from its text: wide enough for a short phrase, wrapping past 260 px. */
export function nodeSize(text: string, isRoot: boolean): { size: Size; lines: string; fontSize: number } {
  const fontSize = isRoot ? ROOT_FONT : FONT;
  const longest = Math.max(4, ...text.split("\n").map((l) => l.length));
  const w = Math.round(Math.min(isRoot ? 320 : 260, Math.max(isRoot ? 140 : 90, longest * fontSize * 0.58 + 32)));
  const lines = wrap(text || " ", w - 24, fontSize);
  const h = Math.round(Math.max(isRoot ? 64 : 44, lines.split("\n").length * fontSize * 1.25 + 22));
  return { size: { w, h }, lines, fontSize };
}

// ---------- applying a tree to the board ----------

let seed = 7;
const bump = (e: El, patch: Record<string, unknown>): El => ({ ...e, ...patch, version: ((e.version as number) ?? 1) + 1, versionNonce: (seed = (seed * 48271) % 2147483647), updated: Date.now() });

function blank(id: string, type: string, extra: Record<string, unknown>): El {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: (seed = (seed * 48271) % 2147483647),
    version: 1,
    versionNonce: (seed = (seed * 48271) % 2147483647),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  };
}

/** A new node (a rectangle and its text), placed by the next layout. */
export function newNodeElements(ids: { node: string; text: string }, meta: MmMeta, text: string, at: Pos = { x: 0, y: 0 }): El[] {
  const rect = blank(ids.node, "rectangle", { ...at, customData: { mm: meta }, boundElements: [{ type: "text", id: ids.text }], roundness: { type: 3 } });
  const label = blank(ids.text, "text", { ...at, text, originalText: text, fontSize: FONT, fontFamily: 6, textAlign: "center", verticalAlign: "middle", containerId: ids.node, autoResize: true, lineHeight: 1.25, strokeWidth: 1 });
  return [rect, label];
}

export const edgeId = (child: string) => `mme-${child}`;
export const badgeId = (node: string) => `mmb-${node}`;

/**
 * Writes a tree back onto the board: metadata, sizes from text, layout positions, branch colours and node style,
 * the managed connectors (bound to both nodes) and collapse badges. Elements not in this map are left as they are.
 * Nodes in `drop` (removed from the tree) are taken off the board with their text and connectors.
 */
export function applyTree(elements: readonly unknown[], tree: Tree, opts: { drop?: readonly string[]; rootAt?: Pos } = {}): El[] {
  const els = elements as El[];
  const drop = new Set(opts.drop ?? []);
  const byId = new Map(els.map((e) => [e.id, e]));
  const textOf = new Map<string, El>();
  for (const e of els) if (live(e) && e.type === "text" && typeof e.containerId === "string") textOf.set(e.containerId, e);
  const hidden = hiddenNodes(tree);
  const sizes = new Map<string, Size>();
  const wrapped = new Map<string, { lines: string; fontSize: number }>();
  for (const n of tree.nodes.values()) {
    const s = nodeSize(n.text, n.id === tree.root);
    sizes.set(n.id, s.size);
    wrapped.set(n.id, { lines: s.lines, fontSize: s.fontSize });
  }
  const rootEl = byId.get(tree.root);
  const pos = layoutTree(tree, sizes, tree.layout, opts.rootAt ?? { x: rootEl?.x ?? 0, y: rootEl?.y ?? 0 });

  // Branch colour: the top-level ancestor's index.
  const tops = childrenOf(tree, tree.root);
  const branchOf = new Map<string, number>();
  for (const [i, top] of tops.entries()) for (const id of [top.id, ...descendants(tree, top.id)]) branchOf.set(id, i);
  const colourOf = (id: string) => (!tree.colours ? PLAIN : id === tree.root ? ROOT_COLOUR : BRANCH_COLOURS[(branchOf.get(id) ?? 0) % BRANCH_COLOURS.length]!);

  const out: El[] = [];
  const managed = new Set<string>();
  // Hidden by a folded section (13.1b sections): stays hidden whatever the map does.
  const folded = (e: El | undefined) => Boolean(e && (e.customData as { hiddenBy?: string } | undefined)?.hiddenBy);
  const childCount = (id: string) => descendants(tree, id).length;
  for (const e of els) {
    const mm = metaOf(e);
    if (e.customData && ((e.customData as { mmEdge?: unknown }).mmEdge || (e.customData as { mmBadge?: unknown }).mmBadge)) {
      // Our connectors and badges are rebuilt below (only for this map; other maps' stay).
      const owner = ((e.customData as { mmEdge?: { map: string }; mmBadge?: { map: string } }).mmEdge ?? (e.customData as { mmBadge?: { map: string } }).mmBadge)!.map;
      if (owner === tree.map) continue;
      out.push(e);
      continue;
    }
    if (mm && mm.map === tree.map) {
      if (drop.has(e.id) || !tree.nodes.has(e.id)) continue;
      const n = tree.nodes.get(e.id)!;
      const p = pos.get(e.id)!;
      const s = sizes.get(e.id)!;
      const c = colourOf(e.id);
      const isHidden = hidden.has(e.id) || folded(e);
      const style = tree.style;
      const meta: MmMeta = { map: tree.map, parent: n.parent, order: n.order, ...(n.collapsed ? { collapsed: true } : {}), ...(n.id === tree.root ? { layout: tree.layout, style: tree.style, colours: tree.colours } : {}) };
      const bound = [{ type: "text", id: textOf.get(e.id)?.id ?? "" }].filter((b) => b.id);
      out.push(
        bump(e, {
          x: p.x,
          y: p.y,
          width: s.w,
          height: s.h,
          customData: { ...((e.customData as object) ?? {}), mm: meta },
          backgroundColor: style === "text" ? "transparent" : style === "pill" ? "#ffffff" : c.fill,
          strokeColor: style === "sticky" ? "transparent" : style === "pill" ? c.line : "transparent",
          strokeWidth: 2,
          fillStyle: "solid",
          roughness: 0,
          roundness: { type: 3 },
          opacity: isHidden ? 0 : 100,
          locked: isHidden,
          boundElements: [...bound, ...(n.parent ? [{ type: "arrow", id: edgeId(e.id) }] : []), ...childrenOf(tree, e.id).map((ch) => ({ type: "arrow", id: edgeId(ch.id) }))],
        }),
      );
      managed.add(e.id);
      continue;
    }
    if (e.type === "text" && typeof e.containerId === "string") {
      const owner = byId.get(e.containerId);
      const om = owner ? metaOf(owner) : null;
      if (om && om.map === tree.map) {
        if (drop.has(e.containerId) || !tree.nodes.has(e.containerId)) continue;
        const p = pos.get(e.containerId)!;
        const s = sizes.get(e.containerId)!;
        const w = wrapped.get(e.containerId)!;
        const lineCount = w.lines.split("\n").length;
        const th = lineCount * w.fontSize * 1.25;
        const tw = s.w - 24;
        out.push(
          bump(e, {
            text: w.lines,
            originalText: tree.nodes.get(e.containerId)!.text,
            fontSize: w.fontSize,
            x: p.x + 12,
            y: p.y + (s.h - th) / 2,
            width: tw,
            height: th,
            textAlign: "center",
            verticalAlign: "middle",
            strokeColor: tree.style === "pill" ? "#1e1e1e" : "#1e1e1e",
            opacity: hidden.has(e.containerId) || folded(e) ? 0 : 100,
            locked: hidden.has(e.containerId) || folded(e),
          }),
        );
        continue;
      }
    }
    out.push(e);
  }

  // Connectors: parent's side → child's side, curved, no arrowhead, in the branch colour.
  for (const n of tree.nodes.values()) {
    if (!n.parent || !managed.has(n.id) || !managed.has(n.parent)) continue;
    const a = pos.get(n.parent)!;
    const as = sizes.get(n.parent)!;
    const b = pos.get(n.id)!;
    const bs = sizes.get(n.id)!;
    const acx = a.x + as.w / 2;
    const acy = a.y + as.h / 2;
    const bcx = b.x + bs.w / 2;
    const bcy = b.y + bs.h / 2;
    let sx: number, sy: number, ex: number, ey: number;
    if (tree.layout === "down") [sx, sy, ex, ey] = [acx, a.y + as.h, bcx, b.y];
    else if (tree.layout === "radial") {
      const d = Math.hypot(bcx - acx, bcy - acy) || 1;
      const ux = (bcx - acx) / d;
      const uy = (bcy - acy) / d;
      const reach = (s: Size) => Math.min(Math.abs(s.w / 2 / (ux || 1e-9)), Math.abs(s.h / 2 / (uy || 1e-9)));
      [sx, sy, ex, ey] = [acx + ux * reach(as), acy + uy * reach(as), bcx - ux * reach(bs), bcy - uy * reach(bs)];
    } else if (bcx >= acx) [sx, sy, ex, ey] = [a.x + as.w, acy, b.x, bcy];
    else [sx, sy, ex, ey] = [a.x, acy, b.x + bs.w, bcy];
    const dx = ex - sx;
    const dy = ey - sy;
    const points =
      tree.layout === "radial"
        ? [
            [0, 0],
            [dx, dy],
          ]
        : tree.layout === "down"
          ? [
              [0, 0],
              [dx * 0.1, dy * 0.45],
              [dx * 0.9, dy * 0.55],
              [dx, dy],
            ]
          : [
              [0, 0],
              [dx * 0.45, dy * 0.1],
              [dx * 0.55, dy * 0.9],
              [dx, dy],
            ];
    const prev = byId.get(edgeId(n.id));
    const isHidden = hidden.has(n.id) || folded(prev) || folded(byId.get(n.id));
    const edge = {
      x: sx,
      y: sy,
      width: Math.abs(dx),
      height: Math.abs(dy),
      points,
      lastCommittedPoint: null,
      startBinding: { elementId: n.parent, focus: 0, gap: 4 },
      endBinding: { elementId: n.id, focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: null,
      elbowed: false,
      strokeColor: tree.colours ? colourOf(n.id).line : "#868e96",
      strokeWidth: 2,
      roundness: tree.layout === "radial" ? null : { type: 2 },
      opacity: isHidden ? 0 : 100,
      locked: true,
      customData: { ...((prev?.customData as object) ?? {}), mmEdge: { map: tree.map, child: n.id } },
    };
    out.push(prev ? bump(prev, edge) : blank(edgeId(n.id), "arrow", edge));
  }

  // "+N" on collapsed nodes that are themselves visible.
  for (const n of tree.nodes.values()) {
    if (!n.collapsed || hidden.has(n.id) || !managed.has(n.id)) continue;
    const count = childCount(n.id);
    if (!count) continue;
    const p = pos.get(n.id)!;
    const s = sizes.get(n.id)!;
    const label = `+${count}`;
    const at = tree.layout === "down" ? { x: p.x + s.w / 2 - 14, y: p.y + s.h + 6 } : tree.layout === "left" ? { x: p.x - 40, y: p.y + s.h / 2 - 11 } : { x: p.x + s.w + 6, y: p.y + s.h / 2 - 11 };
    const badge = { ...at, width: 34, height: 22, text: label, originalText: label, fontSize: 14, fontFamily: 6, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, strokeColor: colourOf(n.id).line, locked: true, customData: { mmBadge: { map: tree.map, node: n.id } } };
    const prev = byId.get(badgeId(n.id));
    out.push(prev ? bump(prev, badge) : blank(badgeId(n.id), "text", badge));
  }
  return out;
}

/** Turns a sticky or shape (with its text) into the root of a new map. */
export function makeRoot(elements: readonly unknown[], id: string, layout: MindLayout = "right"): El[] {
  return (elements as El[]).map((e) => (e.id === id ? bump(e, { customData: { ...((e.customData as object) ?? {}), kind: undefined, mm: { map: id, parent: null, order: 0, layout, style: "sticky", colours: true } } }) : e));
}

// ---------- lists ----------

export type ListItem = { text: string; children: ListItem[] };

const BULLET = /^(?:[-*+•●○◦■□▪▫➢►–—]|\d{1,3}[.)]|[a-zA-Z][.)]|\[[ xX]\])\s+/;

/** A pasted list (Markdown, plain indents, bullets copied from Google Docs or Word) as a tree of items. */
export function parseList(text: string): ListItem[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const rows = lines.map((raw) => {
    const indentText = /^[\t ]*/.exec(raw)![0];
    const indent = [...indentText].reduce((s, ch) => s + (ch === "\t" ? 4 : 1), 0);
    let body = raw.slice(indentText.length);
    // Google Docs nests with its bullet shape: ● level 1, ○ level 2, ■ level 3.
    const shape = /^[●○■]/.exec(body)?.[0];
    body = body.replace(BULLET, "").replace(BULLET, "").trim();
    return { indent, shape, text: body };
  });
  const shapeLevel: Record<string, number> = { "●": 0, "○": 1, "■": 2 };
  const unit = Math.min(...rows.map((r) => r.indent).filter((i) => i > 0), 4) || 4;
  const roots: ListItem[] = [];
  const stack: Array<{ level: number; item: ListItem }> = [];
  for (const r of rows) {
    if (!r.text) continue;
    const level = r.indent ? Math.round(r.indent / unit) : r.shape ? (shapeLevel[r.shape] ?? 0) : 0;
    const item: ListItem = { text: r.text, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1]!.item.children.push(item);
    else roots.push(item);
    stack.push({ level, item });
  }
  return roots;
}

const decodeHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** An HTML list (Google Docs uses aria-level on flat lists; others nest <ul> in <li>). Null when there's no list. */
export function parseHtmlList(html: string): ListItem[] | null {
  if (!/<li\b/i.test(html)) return null;
  const tokens = html.replace(/<!--[\s\S]*?-->/g, "").split(/(<\/?(?:ul|ol|li)\b[^>]*>)/i);
  let depth = 0;
  const flat: Array<{ level: number; text: string }> = [];
  let current: { level: number; text: string } | null = null;
  for (const tok of tokens) {
    const m = /^<(\/?)(ul|ol|li)\b([^>]*)>$/i.exec(tok);
    if (!m) {
      if (current) current.text += tok;
      continue;
    }
    const [, close, tag, attrs] = m;
    if (tag!.toLowerCase() !== "li") {
      if (current) {
        flat.push(current);
        current = null;
      }
      depth += close ? -1 : 1;
      continue;
    }
    if (current) flat.push(current);
    current = null;
    if (!close) {
      const aria = /aria-level\s*=\s*"?(\d+)/i.exec(attrs ?? "")?.[1];
      current = { level: aria ? Number(aria) - 1 : Math.max(0, depth - 1), text: "" };
    }
  }
  if (current) flat.push(current);
  const md = flat
    .map((f) => ({ ...f, text: decodeHtml(f.text) }))
    .filter((f) => f.text)
    .map((f) => `${"    ".repeat(f.level)}- ${f.text}`)
    .join("\n");
  return md ? parseList(md) : null;
}

export const looksLikeList = (text: string) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.length >= 2 && lines.filter((l) => BULLET.test(l.trim()) || /^[\t ]+\S/.test(l)).length >= Math.max(1, lines.length - 1);
};

export function listToMarkdown(items: readonly ListItem[], depth = 0): string {
  return items.map((i) => `${"  ".repeat(depth)}- ${i.text.replace(/\n+/g, " ")}${i.children.length ? `\n${listToMarkdown(i.children, depth + 1)}` : ""}`).join("\n");
}

export function treeToList(t: Tree, from = t.root): ListItem {
  return { text: t.nodes.get(from)?.text ?? "", children: childrenOf(t, from).map((c) => treeToList(t, c.id)) };
}

/** A new map's tree from a list: one top item is the root; several hang from a root called `title`. */
export function treeFromList(items: readonly ListItem[], makeId: () => string, title = "Ideas", layout: MindLayout = "right"): { tree: Tree; ids: Map<string, string> } {
  const rootItem: ListItem = items.length === 1 ? items[0]! : { text: title, children: [...items] };
  const textIds = new Map<string, string>();
  const root = makeId();
  textIds.set(root, makeId());
  const nodes = new Map<string, TreeNode>();
  nodes.set(root, { id: root, parent: null, order: 0, collapsed: false, text: rootItem.text });
  const add = (parent: string, list: readonly ListItem[]) =>
    list.forEach((it, i) => {
      const id = makeId();
      textIds.set(id, makeId());
      nodes.set(id, { id, parent, order: i, collapsed: false, text: it.text });
      add(id, it.children);
    });
  add(root, rootItem.children);
  return { tree: { map: root, root, layout, style: "sticky", colours: true, nodes }, ids: textIds };
}

/** The outline editor: the map takes the edited list's shape, keeping ids in reading order (so votes and comments stay). */
export function treeFromOutline(t: Tree, items: readonly ListItem[], makeId: () => string): { tree: Tree; added: Map<string, string>; removed: string[] } {
  const order: string[] = [];
  const walk = (id: string) => {
    order.push(id);
    for (const c of childrenOf(t, id)) walk(c.id);
  };
  walk(t.root);
  const rootItem: ListItem = items.length === 1 ? items[0]! : { text: t.nodes.get(t.root)!.text, children: [...items] };
  const flat: Array<{ text: string; parentIndex: number | null; order: number }> = [];
  const visit = (it: ListItem, parentIndex: number | null, o: number) => {
    const me = flat.length;
    flat.push({ text: it.text, parentIndex, order: o });
    it.children.forEach((c, i) => visit(c, me, i));
  };
  visit(rootItem, null, 0);
  const ids = flat.map((_, i) => order[i] ?? makeId());
  const added = new Map<string, string>();
  for (const [i, id] of ids.entries()) if (i >= order.length) added.set(id, makeId());
  const nodes = new Map<string, TreeNode>();
  flat.forEach((f, i) => nodes.set(ids[i]!, { id: ids[i]!, parent: f.parentIndex === null ? null : ids[f.parentIndex]!, order: f.order, collapsed: Boolean(t.nodes.get(ids[i]!)?.collapsed), text: f.text }));
  return { tree: { ...t, nodes }, added, removed: order.slice(flat.length) };
}
