// Sections and subsections (Stage 13.1b): nesting from geometry, contents, paths for the List view, folding and moving.
import { describe, expect, it } from "vitest";
import { sceneBuilder } from "@/services/rules/board-templates";
import { boardItems } from "@/services/rules/boards";
import { areaAround, contentsOf, moveContents, newSection, renameSection, sectionPaths, sectionsOf, toggleSection } from "@/services/rules/sections";

let n = 0;
const id = () => `e${++n}`;

function scene() {
  const b = sceneBuilder(id);
  const a = b.sticky("Hook idea", 40, 100);
  const c = b.sticky("Reel script", 640, 100);
  const outer = newSection({ section: "S1", label: "L1", group: "G1" }, "Campaign", "#e7f5ff", { x: 0, y: 0, width: 1000, height: 400 });
  const inner = newSection({ section: "S2", label: "L2", group: "G2" }, "Content", "#ebfbee", { x: 600, y: 40, width: 360, height: 320 });
  return { elements: [...outer, ...inner, ...b.elements], a, c };
}

describe("sections", () => {
  it("nest by geometry and give each sticky its path", () => {
    const { elements, a, c } = scene();
    expect(sectionsOf(elements).map((s) => [s.name, s.parent, s.depth])).toEqual([
      ["Campaign", null, 0],
      ["Content", "S1", 1],
    ]);
    expect(sectionPaths(elements).get(a.id)).toBe("Campaign");
    expect(sectionPaths(elements).get(c.id)).toBe("Campaign › Content");
    expect(contentsOf(elements, "S1")).toContain("S2");
    expect(contentsOf(elements, "S1")).not.toContain("L1");
    expect(boardItems(elements).items.map((i) => [i.text, i.section])).toEqual([
      ["Hook idea", "Campaign"],
      ["Reel script", "Campaign › Content"],
    ]);
  });
  it("fold hides contents (subsections too) and unfolding restores them exactly", () => {
    const { elements, c } = scene();
    const folded = toggleSection(elements, "S1");
    const s1 = folded.find((e) => e.id === "S1")!;
    expect(s1.height).toBe(56);
    const hidden = folded.find((e) => e.id === c.id)!;
    expect([hidden.opacity, hidden.locked]).toEqual([0, true]);
    expect(folded.find((e) => e.id === "L1")!.opacity).toBe(100);
    const open = toggleSection(folded, "S1");
    expect(open.find((e) => e.id === "S1")!.height).toBe(400);
    expect(open.find((e) => e.id === c.id)).toMatchObject({ opacity: 100, locked: false });
    expect((open.find((e) => e.id === c.id)!.customData as { kind: string }).kind).toBe("sticky");
  });
  it("moves contents with the section (its label moves with it as a group), renames, and wraps a selection", () => {
    const { elements, a, c } = scene();
    const ids = new Set(contentsOf(elements, "S2"));
    const moved = moveContents(elements, ids, 100, 50);
    expect(moved.find((e) => e.id === a.id)!.x).toBe(40);
    expect(moved.find((e) => e.id === c.id)!.x).toBe(740);
    expect(moved.find((e) => e.id === "L2")!.x).toBe(elements.find((e) => e.id === "L2")!.x);
    const renamed = renameSection(elements, "S2", "Reels");
    expect([sectionsOf(renamed)[1]!.name, renamed.find((e) => e.id === "L2")!.text]).toEqual(["Reels", "Reels"]);
    const area = areaAround(elements, [a.id])!;
    expect(area.x).toBeLessThan(a.x as number);
    expect(area.y).toBeLessThan((a.y as number) - 40);
  });
});

describe("sections and mind maps together", () => {
  it("a map inside a folded section stays hidden when it is laid out again", async () => {
    const { applyTree, newNodeElements, parseList, treeFromList, treeOf } = await import("@/services/rules/mind-map");
    const { tree, ids } = treeFromList(parseList("- Root\n  - A"), id);
    const nodes = [...tree.nodes.values()].flatMap((x) => newNodeElements({ node: x.id, text: ids.get(x.id)! }, { map: tree.map, parent: x.parent, order: x.order }, x.text, { x: 100, y: 100 }));
    const map = applyTree(nodes, tree, { rootAt: { x: 100, y: 100 } });
    const all = [...newSection({ section: "S9", label: "L9", group: "G9" }, "Plan", "#e7f5ff", { x: 0, y: 0, width: 900, height: 600 }), ...map];
    const folded = toggleSection(all, "S9");
    const again = applyTree(folded, treeOf(folded, tree.map)!);
    expect(again.filter((e) => (e.customData as { mm?: unknown; mmEdge?: unknown } | undefined)?.mm || (e.customData as { mmEdge?: unknown } | undefined)?.mmEdge).every((e) => e.opacity === 0 && e.locked)).toBe(true);
    const open = toggleSection(again, "S9");
    expect(open.filter((e) => (e.customData as { mm?: unknown } | undefined)?.mm).every((e) => e.opacity === 100 && !e.locked)).toBe(true);
  });
});
