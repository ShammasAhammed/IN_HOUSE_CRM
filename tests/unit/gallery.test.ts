// Template gallery (Stage 13.6): templates never carry a client's data; presets recolour and re-lay out.
import { describe, expect, it } from "vitest";
import { cardUrl } from "@/services/rules/references";
import { sceneBuilder, STICKY_COLOURS, templateScene } from "@/services/rules/board-templates";
import { applyPresets, boardPreview, cleanText, fillClient, pagePreview, removedWords, stripBoard, stripPage } from "@/services/rules/gallery";
import { mapsOn } from "@/services/rules/mind-map";

let n = 0;
const makeId = () => `e${++n}`;
const TASK = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e8";
const PERSON = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e9";

describe("cleaning words", () => {
  it("client name, dates and contacts become placeholders; filled back on use", () => {
    const r = { cards: 0, taskLinks: 0, references: 0, pictures: 0, links: 0, names: 0, dates: 0, contacts: 0, mentions: 0, rows: 0 };
    const t = cleanText("MES College open day on 12 Nov 2026 and 2026-11-20, call 98470 12345 or anu@mes.ac.in. mes college rocks", "MES College", r);
    expect(t).toBe("{client} open day on [date] and [date], call [contact] or [contact]. {client} rocks");
    expect([r.names, r.dates, r.contacts]).toEqual([2, 2, 2]);
    expect(fillClient(t, "Zenith")).toContain("Zenith open day");
  });
});

describe("boards", () => {
  it("live cards, task badges, references and pictures become placeholders of the same size; links go", () => {
    const b = sceneBuilder(makeId);
    const f = b.frame("MES College ideas", 0, 0, 800, 600);
    b.sticky("Reel on 5 Dec", 20, 80, { frame: f });
    const els = [
      ...b.elements,
      { ...b.element("embeddable", 300, 80, 320, 150, { link: cardUrl("task", TASK), customData: { card: true } }) },
      { ...b.element("embeddable", 300, 300, 200, 44, { link: cardUrl("task", TASK) }) },
      { ...b.element("embeddable", 0, 700, 360, 320, { link: cardUrl("ref", TASK) }) },
      { ...b.element("image", 400, 700, 100, 100, { fileId: "abc", status: "saved" }) },
      { ...b.element("rectangle", 600, 700, 100, 100, { link: "https://drive.google.com/x" }) },
    ];
    const { elements, removed } = stripBoard(els, "MES College", makeId);
    expect([removed.cards, removed.taskLinks, removed.references, removed.pictures, removed.links, removed.names, removed.dates]).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(elements.some((e) => e.type === "embeddable" || e.type === "image" || e.link)).toBe(false);
    const ph = elements.find((e) => e.id === els[3]!.id)!;
    expect([ph.type, ph.width, ph.height, ph.x]).toEqual(["rectangle", 320, 150, 300]);
    expect(JSON.stringify(elements)).not.toContain(TASK);
    expect(JSON.stringify(elements)).not.toContain("abc");
    expect(elements.find((e) => e.type === "frame")!.name).toBe("{client} ideas");
    expect(boardPreview(elements)).toContain("{client} ideas");
    expect(removedWords(removed)).toContain("1 live card");
  });

  it("mind maps and sections survive", () => {
    const els = templateScene("mind_map", makeId).elements;
    const { elements } = stripBoard(els, "Zenith", makeId);
    expect(mapsOn(elements).size).toBe(1);
    expect(elements).toHaveLength(els.length);
  });
});

describe("pages", () => {
  it("mentions become names; chips, cards, embeds and pictures placeholders; rows only when asked", () => {
    const body = `Ask @[Anu Thomas](person:${PERSON}) about @[](task:${TASK}) for @[](client:${TASK}).\n\n::card[task/${TASK}]\n\n::embed[https://youtu.be/x]\n\n![poster](/api/doc-files/${TASK})\n\n::table[t1]`;
    const tables = [{ id: "t1", title: "Plan", columns: [{ id: "a", name: "Name", type: "text" as const }, { id: "b", name: "Owner", type: "person" as const }], view: { kind: "table" as const }, rows: [{ a: "Call MES College", b: PERSON }] }];
    const without = stripPage(body, tables, "MES College", false);
    expect(without.body).toBe("Ask Anu Thomas about [task] for {client}.\n\n> Live card goes here\n\n> Link or video goes here\n\n> Picture goes here: poster\n\n::table[t1]");
    expect(without.tables[0]!.rows).toEqual([]);
    expect(without.removed.rows).toBe(1);
    const withRows = stripPage(body, tables, "MES College", true);
    expect(withRows.tables[0]!.rows).toEqual([{ a: "Call {client}", b: null }]);
    expect(pagePreview("## Purpose\n\nWhat this is for.\n\n- [ ] Step one")).toBe("Purpose · What this is for. · Step one");
  });
});

describe("presets", () => {
  it("a palette maps sticky colours in order; a sticky style sets colour and font; a layout recolours sections and re-lays mind maps", () => {
    const els = templateScene("swot", makeId).elements;
    const pal = applyPresets(els, { palette: { colours: ["#111111", "#222222"] } });
    const colours = [...new Set(pal.filter((e) => (e.customData as { kind?: string } | undefined)?.kind === "sticky").map((e) => e.backgroundColor))];
    expect(colours).toEqual(["#111111", "#222222"]);
    const sty = applyPresets(els, { sticky: { colour: STICKY_COLOURS.pink, font: "clean" } });
    expect(new Set(sty.filter((e) => (e.customData as { kind?: string } | undefined)?.kind === "sticky").map((e) => e.backgroundColor))).toEqual(new Set([STICKY_COLOURS.pink]));
    expect(sty.filter((e) => e.type === "text" && e.containerId).every((e) => e.fontFamily === 6)).toBe(true);
    const map = templateScene("mind_map", makeId).elements;
    const down = applyPresets(map, { layout: { mindLayout: "down" } });
    const tree = [...mapsOn(down).values()][0]!;
    expect(tree.layout).toBe("down");
  });
});
