// Idea Boards (Stage 13.1): levels, what a board says (search and the List view), vote counts, and templates.
import { describe, expect, it } from "vitest";
import { BOARD_TEMPLATES } from "@/lib/types";
import { sceneBuilder, templateScene, wrap } from "@/services/rules/board-templates";
import { boardItems, boardLevel, boardSearchText, levelAtLeast, objectCount, tally } from "@/services/rules/boards";

let n = 0;
const makeId = () => `el${++n}`;

describe("boardLevel", () => {
  const p = { owner: false, member: null, roleEdit: false, roleManage: false, creator: false } as const;
  it("owner manages, space members get their level, roles decide elsewhere", () => {
    expect(boardLevel({ ...p, owner: true, member: "view" })).toBe("manage");
    expect(boardLevel({ ...p, member: "view", roleManage: true })).toBe("view");
    expect(boardLevel({ ...p, member: "comment" })).toBe("comment");
    expect(boardLevel({ ...p, roleManage: true })).toBe("manage");
    expect(boardLevel({ ...p, roleEdit: true })).toBe("edit");
    expect(boardLevel({ ...p, roleEdit: true, creator: true })).toBe("manage");
    expect(boardLevel({ ...p, creator: true })).toBe("comment");
    expect(boardLevel(p)).toBe("comment");
    expect([levelAtLeast("comment", "view"), levelAtLeast("edit", "manage")]).toEqual([true, false]);
  });
});

describe("boardItems and search text", () => {
  const b = sceneBuilder(makeId);
  const f = b.frame("Ideas", 0, 0, 400, 400);
  const s1 = b.sticky("Free NEET\\nmock test", 10, 10, { frame: f, colour: "#d3f9d8" });
  const s2 = b.sticky("Parent webinar", 210, 10, { frame: f });
  b.heading("Campaign title", 0, -60);
  b.elements.push({ ...b.elements.at(-1)!, id: "loose", customData: undefined, text: "A loose note", originalText: "A loose note" });
  const shape = b.sticky("x", 500, 0);
  shape.customData = undefined; // a plain labelled shape
  (b.elements.find((e) => e.containerId === shape.id) as Record<string, unknown>).originalText = "Budget?";
  b.connect(s1, s2);
  const stamp = b.sticky("Approved", 30, 30);
  stamp.customData = { stamp: "approved", on: s2.id };
  b.elements.push({ id: "gone", type: "text", text: "deleted words", isDeleted: true });
  const elements = b.elements;

  it("lists stickies with frame and colour, labelled shapes and loose text; skips arrows, stamps and deleted", () => {
    const { items, frames } = boardItems(elements);
    expect(frames).toEqual([{ id: f.id, name: "Ideas" }]);
    expect(items.map((i) => [i.kind, i.text, i.frame, i.colour, i.stamp])).toEqual([
      ["sticky", "Free NEET\\nmock test", "Ideas", "#d3f9d8", null],
      ["sticky", "Parent webinar", "Ideas", "#fff3bf", "approved"],
      ["text", "A loose note", null, null, null],
      ["shape", "Budget?", null, "#fff3bf", null],
    ]);
  });
  it("search text has every word, frame names included, deleted ones not", () => {
    const t = boardSearchText(elements);
    expect(t).toContain("Parent webinar");
    expect(t).toContain("Campaign title");
    expect(t).toContain("Ideas");
    expect(t).not.toContain("deleted words");
    expect(objectCount(elements)).toBe(elements.length - 1);
  });
  it("tallies votes, most first, ties in board order, unvoted left out", () => {
    const { items } = boardItems(elements);
    const r = tally([{ elementId: s2.id }, { elementId: s1.id }, { elementId: s2.id }, { elementId: "nope" }], items);
    expect(r.map((x) => [x.item.text, x.votes])).toEqual([
      ["Parent webinar", 2],
      ["Free NEET\\nmock test", 1],
    ]);
  });
});

describe("templates", () => {
  it.each(BOARD_TEMPLATES)("%s makes a valid scene", (t) => {
    const { elements } = templateScene(t, makeId);
    const ids = new Set(elements.map((e) => e.id));
    expect(ids.size).toBe(elements.length);
    for (const e of elements) {
      expect(typeof e.x === "number" && typeof e.y === "number" && (e.width as number) >= 0).toBe(true);
      if (e.containerId) expect(ids.has(e.containerId as string)).toBe(true);
      if (e.frameId) expect(elements.find((x) => x.id === e.frameId)?.type).toBe("frame");
      for (const be of (e.boundElements as Array<{ id: string }>) ?? []) expect(ids.has(be.id)).toBe(true);
      const sb = e.startBinding as { elementId: string } | null | undefined;
      if (sb) expect(ids.has(sb.elementId)).toBe(true);
    }
    if (t !== "blank") expect(boardItems(elements).items.filter((i) => i.kind === "sticky" || i.kind === "node").length).toBeGreaterThan(3);
  });
});

describe("wrap", () => {
  it("breaks sticky text into lines that fit", () => {
    expect(wrap("Admissions target this year", 160, 20)).toBe("Admissions\ntarget this\nyear");
    expect(wrap("Two\nparas", 160, 20)).toBe("Two\nparas");
  });
});
