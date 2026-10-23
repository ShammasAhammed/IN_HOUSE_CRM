// Mind maps (Stage 13.1b): the tree model, every layout (no overlaps), lists in and out, the outline editor, and the
// time a 300-node map takes to lay out again.
import { describe, expect, it } from "vitest";
import {
  addChild,
  addSibling,
  applyTree,
  childrenOf,
  descendants,
  hiddenNodes,
  layoutTree,
  listToMarkdown,
  looksLikeList,
  MIND_LAYOUTS,
  newNodeElements,
  nodeSize,
  outdent,
  parseHtmlList,
  parseList,
  removeNode,
  reparent,
  toggleCollapse,
  treeFromList,
  treeFromOutline,
  treeOf,
  treeToList,
  type Tree,
} from "@/services/rules/mind-map";
import { boardItems, boardSearchText } from "@/services/rules/boards";

let n = 0;
const makeId = () => `id${++n}`;
const names = (t: Tree, id: string) => childrenOf(t, id).map((c) => c.text);

function sample(): Tree {
  const { tree } = treeFromList(parseList("- NEET campaign\n  - Audience\n    - Students\n    - Parents\n  - Channels\n    - Meta\n    - Google\n    - WhatsApp\n  - Offer"), makeId);
  return tree;
}

describe("tree model", () => {
  it("adds children and siblings in order; Enter on the root adds a child", () => {
    const t = sample();
    const audience = childrenOf(t, t.root)[0]!.id;
    const t2 = addSibling(addChild(t, audience, "x1", "Teachers"), audience, "x2", "Budget");
    expect(names(t2, audience)).toEqual(["Students", "Parents", "Teachers"]);
    expect(names(t2, t2.root)).toEqual(["Audience", "Budget", "Channels", "Offer"]);
    expect(names(addSibling(t, t.root, "x3", "Root sibling"), t.root)).toEqual(["Audience", "Channels", "Offer", "Root sibling"]);
  });
  it("moves a node up a level (Shift+Tab) and re-parents, refusing its own branch", () => {
    const t = sample();
    const [audience, channels] = childrenOf(t, t.root).map((c) => c.id) as [string, string];
    const parents = childrenOf(t, audience)[1]!.id;
    expect(names(outdent(t, parents), t.root)).toEqual(["Audience", "Parents", "Channels", "Offer"]);
    expect(outdent(t, audience)).toBe(t); // the root's children stay
    const moved = reparent(t, channels, audience, 0);
    expect(names(moved, audience)).toEqual(["Channels", "Students", "Parents"]);
    expect(descendants(moved, audience)).toHaveLength(6);
    expect(reparent(t, audience, childrenOf(t, audience)[0]!.id)).toBe(t);
    expect(reparent(t, t.root, audience)).toBe(t);
  });
  it("collapses a branch (its nodes hidden) and removes a node with everything under it", () => {
    const t = sample();
    const channels = childrenOf(t, t.root)[1]!.id;
    expect([...hiddenNodes(toggleCollapse(t, channels))].map((id) => t.nodes.get(id)!.text)).toEqual(["Meta", "Google", "WhatsApp"]);
    const { tree, removed } = removeNode(t, channels);
    expect(removed).toHaveLength(4);
    expect(names(tree, tree.root)).toEqual(["Audience", "Offer"]);
    expect(childrenOf(tree, tree.root).map((c) => c.order)).toEqual([0, 1]);
    expect(removeNode(t, t.root).removed).toEqual([]);
  });
});

describe("layouts", () => {
  const rects = (t: Tree, kind: (typeof MIND_LAYOUTS)[number]) => {
    const sizes = new Map([...t.nodes.values()].map((x) => [x.id, nodeSize(x.text, x.id === t.root).size]));
    const pos = layoutTree(t, sizes, kind, { x: 100, y: 100 });
    return [...t.nodes.keys()].map((id) => ({ id, ...pos.get(id)!, ...sizes.get(id)! }));
  };
  const overlaps = (r: ReturnType<typeof rects>) => {
    const bad: string[] = [];
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i]!;
        const b = r[j]!;
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push(`${a.id}/${b.id}`);
      }
    return bad;
  };
  it.each(MIND_LAYOUTS)("%s: no two nodes overlap and the root stays put", (kind) => {
    const t = sample();
    const r = rects(t, kind);
    expect(overlaps(r)).toEqual([]);
    expect(r.find((x) => x.id === t.root)).toMatchObject({ x: 100, y: 100 });
  });
  it("right grows right, left grows left, both splits, down grows down", () => {
    const t = sample();
    const x = (kind: (typeof MIND_LAYOUTS)[number]) => rects(t, kind).filter((q) => q.id !== t.root);
    expect(x("right").every((q) => q.x > 100)).toBe(true);
    expect(x("left").every((q) => q.x < 100)).toBe(true);
    const both = x("both");
    expect(both.some((q) => q.x > 100) && both.some((q) => q.x < 100)).toBe(true);
    expect(x("down").every((q) => q.y > 100)).toBe(true);
  });
  it("a big uneven tree has no overlaps in any layout", () => {
    const { tree } = treeFromList(parseList(Array.from({ length: 60 }, (_, i) => `${"  ".repeat(i % 4 === 0 ? 0 : (i % 3) + 1)}- Idea number ${i} with some words`).join("\n")), makeId, "Big");
    for (const kind of MIND_LAYOUTS) expect(overlaps(rects(tree, kind)), kind).toEqual([]);
  });
});

describe("on the board", () => {
  function board(t: Tree, ids: Map<string, string>) {
    const els = [...t.nodes.values()].flatMap((x) => newNodeElements({ node: x.id, text: ids.get(x.id)! }, { map: t.map, parent: x.parent, order: x.order }, x.text));
    return applyTree(els, t);
  }
  it("writes nodes, connectors and a badge; List view and search see the ideas, not the badge", () => {
    const { tree, ids } = treeFromList(parseList("- Root\n  - A\n    - A1\n  - B"), makeId);
    const a = childrenOf(tree, tree.root)[0]!.id;
    const els = applyTree(board(tree, ids), toggleCollapse(tree, a));
    const edges = els.filter((e) => (e.customData as { mmEdge?: unknown } | undefined)?.mmEdge);
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => e.startBinding && e.endBinding && e.endArrowhead === null)).toBe(true);
    expect(els.find((e) => e.id === `mmb-${a}`)?.text).toBe("+1");
    const hidden = els.find((e) => e.customData && (e.customData as { mm?: { parent?: string } }).mm?.parent === a)!;
    expect([hidden.opacity, hidden.locked]).toEqual([0, true]);
    const back = treeOf(els, tree.map)!;
    expect(listToMarkdown([treeToList(back)])).toBe("- Root\n  - A\n    - A1\n  - B");
    expect(boardItems(els).items.map((i) => i.text)).toEqual(["Root", "A", "A1", "B"]);
    expect(boardSearchText(els)).not.toContain("+1");
  });
  it("re-lays out a 300-node map in under 300 ms", () => {
    const md = Array.from({ length: 300 }, (_, i) => `${"  ".repeat(i === 0 ? 0 : 1 + (i % 3))}- Node ${i} ${"word ".repeat(i % 5)}`).join("\n");
    const { tree, ids } = treeFromList(parseList(md), makeId);
    const els = board(tree, ids);
    const t0 = performance.now();
    for (const kind of MIND_LAYOUTS) applyTree(els, { ...treeOf(els, tree.map)!, layout: kind });
    const each = (performance.now() - t0) / MIND_LAYOUTS.length;
    console.log(`300-node mind map: ${each.toFixed(1)} ms per re-layout (tree read + layout + writing ${els.length} elements)`);
    expect(tree.nodes.size).toBe(300);
    expect(each).toBeLessThan(300);
  });
});

describe("lists", () => {
  it("reads Markdown, plain indents, numbers, checkboxes and tabs", () => {
    expect(parseList("- a\n  - b\n    - c\n- d")).toEqual([{ text: "a", children: [{ text: "b", children: [{ text: "c", children: [] }] }] }, { text: "d", children: [] }]);
    expect(parseList("Topic\n\tFirst\n\t\tDeeper\n\tSecond")).toEqual([{ text: "Topic", children: [{ text: "First", children: [{ text: "Deeper", children: [] }] }, { text: "Second", children: [] }] }]);
    expect(parseList("1. one\n2. two\n   a. two-a\n- [ ] todo").map((i) => i.text)).toEqual(["one", "two", "todo"]);
  });
  it("reads Google Docs: plain-text bullets and its HTML (aria-level)", () => {
    expect(parseList("●\tAdmissions\n○\tNEET\n○\tJEE\n●\tFees")).toEqual([
      { text: "Admissions", children: [{ text: "NEET", children: [] }, { text: "JEE", children: [] }] },
      { text: "Fees", children: [] },
    ]);
    const gdocs = `<meta charset="utf-8"><b id="docs-internal-guid-x"><ul><li dir="ltr" aria-level="1"><p><span>Campaign</span></p></li><ul><li aria-level="2"><p><span>Hook &amp; offer</span></p></li></ul><li aria-level="1"><p><span>Budget</span></p></li></ul></b>`;
    expect(parseHtmlList(gdocs)).toEqual([{ text: "Campaign", children: [{ text: "Hook & offer", children: [] }] }, { text: "Budget", children: [] }]);
    expect(parseHtmlList("<ul><li>A<ul><li>B</li></ul></li><li>C</li></ul>")).toEqual([{ text: "A", children: [{ text: "B", children: [] }] }, { text: "C", children: [] }]);
    expect(parseHtmlList("<p>no list</p>")).toBeNull();
  });
  it("knows a list from a sentence", () => {
    expect(looksLikeList("- a\n- b")).toBe(true);
    expect(looksLikeList("Topic\n  child\n  child 2")).toBe(true);
    expect(looksLikeList("Just one line")).toBe(false);
    expect(looksLikeList("Line one\nLine two")).toBe(false);
  });
  it("round-trips board → list → board, and the outline editor keeps ids in reading order", () => {
    const md = "- Root\n  - A\n    - A1\n  - B";
    const { tree } = treeFromList(parseList(md), makeId);
    expect(listToMarkdown([treeToList(tree)])).toBe(md);
    const before = [tree.root, ...descendants(tree, tree.root)];
    const edited = treeFromOutline(tree, parseList("- Root\n  - A renamed\n  - B\n    - B1\n  - C"), makeId);
    expect(listToMarkdown([treeToList(edited.tree)])).toBe("- Root\n  - A renamed\n  - B\n    - B1\n  - C");
    expect([edited.tree.root, ...descendants(edited.tree, edited.tree.root)].slice(0, 4)).toEqual(before);
    expect(edited.added.size).toBe(1);
    expect(edited.removed).toEqual([]);
    expect(treeFromOutline(tree, parseList("- Root\n  - A"), makeId).removed).toHaveLength(2);
  });
});
