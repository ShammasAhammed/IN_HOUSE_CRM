// Idea Board templates (Stage 13.1): starting scenes as plain Excalidraw elements (frames, stickies, headings,
// connectors). Pure; `makeId` gives each element its id. Excalidraw fills any optional field it needs when it loads.
import type { BoardTemplate } from "@/lib/types";
import { applyTree, newNodeElements, parseList, treeFromList } from "./mind-map";
import { wrap } from "./text-wrap";

export { wrap };

export const STICKY_COLOURS = { yellow: "#fff3bf", green: "#d3f9d8", blue: "#d0ebff", pink: "#ffdeeb", purple: "#e5dbff", orange: "#ffe8cc" } as const;
const INK = "#1e1e1e";
const FONT_HAND = 5; // Excalifont
const FONT_CLEAN = 6; // Nunito

type Element = Record<string, unknown> & { id: string; type: string };


export function sceneBuilder(makeId: () => string) {
  let seed = 1;
  const elements: Element[] = [];
  const base = (type: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): Element => ({
    id: makeId(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: INK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: seed++,
    version: 1,
    versionNonce: seed * 7919,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  });
  const textEl = (text: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown>) =>
    base("text", x, y, width, height, { text, originalText: text, fontSize: 20, fontFamily: FONT_CLEAN, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, ...extra });

  return {
    elements,
    /** Any element, not added to `elements`. */
    element: base,
    frame(name: string, x: number, y: number, width: number, height: number) {
      const f = base("frame", x, y, width, height, { name, strokeColor: "#bbb" });
      elements.push(f);
      return f;
    },
    /** A sticky: a filled rectangle with its text inside (Excalidraw's bound text). */
    sticky(text: string, x: number, y: number, opts: { colour?: string; frame?: Element; size?: number } = {}) {
      const size = opts.size ?? 180;
      const r = base("rectangle", x, y, size, size, { backgroundColor: opts.colour ?? STICKY_COLOURS.yellow, strokeColor: "transparent", roundness: { type: 3 }, frameId: opts.frame?.id ?? null, customData: { kind: "sticky" } });
      const lines = wrap(text, size - 20, 20);
      const h = lines.split("\n").length * 25;
      const t = textEl(lines, x + 10, y + (size - h) / 2, size - 20, h, { originalText: text, fontFamily: FONT_HAND, textAlign: "center", verticalAlign: "middle", containerId: r.id, autoResize: true, frameId: opts.frame?.id ?? null });
      r.boundElements = [{ type: "text", id: t.id }];
      elements.push(r, t);
      return r;
    },
    heading(text: string, x: number, y: number, opts: { frame?: Element; size?: number } = {}) {
      const fontSize = opts.size ?? 28;
      const t = textEl(text, x, y, Math.max(40, text.length * fontSize * 0.68), fontSize * 1.25, { fontSize, frameId: opts.frame?.id ?? null, customData: { kind: "heading" } });
      elements.push(t);
      return t;
    },
    /** A connector that follows both shapes when they move. */
    connect(from: Element, to: Element) {
      const sx = (from.x as number) + (from.width as number);
      const sy = (from.y as number) + (from.height as number) / 2;
      const ex = to.x as number;
      const ey = (to.y as number) + (to.height as number) / 2;
      const a = base("arrow", sx + 8, sy, ex - sx - 16, ey - sy, {
        points: [
          [0, 0],
          [ex - sx - 16, ey - sy],
        ],
        lastCommittedPoint: null,
        startBinding: { elementId: from.id, focus: 0, gap: 8 },
        endBinding: { elementId: to.id, focus: 0, gap: 8 },
        startArrowhead: null,
        endArrowhead: "arrow",
        elbowed: false,
        strokeWidth: 2,
      });
      (from.boundElements as unknown[]).push({ type: "arrow", id: a.id });
      (to.boundElements as unknown[]).push({ type: "arrow", id: a.id });
      elements.push(a);
      return a;
    },
  };
}

/** Card sizes on the canvas (Stage 13.2): the task badge is small; references are tall enough for a video. */
export const CARD_SIZES: Record<string, { width: number; height: number }> = {
  badge: { width: 200, height: 44 },
  task: { width: 320, height: 150 },
  creative: { width: 320, height: 170 },
  results: { width: 360, height: 190 },
  sheet: { width: 360, height: 200 },
  doc: { width: 340, height: 200 },
  knowledge: { width: 340, height: 220 },
  ref: { width: 360, height: 320 },
};

/** A live card: an Excalidraw embeddable whose link Oppllo One draws from its own card pages. */
export function cardElement(makeId: () => string, link: string, x: number, y: number, size: string): Element {
  const { width, height } = CARD_SIZES[size] ?? CARD_SIZES.task!;
  return sceneBuilder(makeId).element("embeddable", x, y, width, height, { link, strokeColor: "#bbb", roundness: { type: 3 }, customData: { card: true } });
}

/** A row of frames, each with a heading and starter stickies. */
function columns(b: ReturnType<typeof sceneBuilder>, specs: ReadonlyArray<{ name: string; stickies: string[]; colour?: string }>, opts: { width?: number; height?: number; perRow?: number; link?: boolean } = {}) {
  const w = opts.width ?? 440;
  const h = opts.height ?? 560;
  const perRow = opts.perRow ?? specs.length;
  const firsts: Element[] = [];
  specs.forEach((s, i) => {
    const x = (i % perRow) * (w + 80);
    const y = Math.floor(i / perRow) * (h + 80);
    const f = b.frame(s.name, x, y, w, h);
    b.heading(s.name, x + 20, y + 20, { frame: f, size: 24 });
    s.stickies.forEach((text, j) => {
      const st = b.sticky(text, x + 20 + (j % 2) * 200, y + 80 + Math.floor(j / 2) * 200, { colour: s.colour, frame: f });
      if (j === 0) firsts.push(st);
    });
  });
  if (opts.link) for (let i = 1; i < firsts.length; i++) b.connect(firsts[i - 1]!, firsts[i]!);
}

/** A row of frames with headings and starter stickies, as a new board's elements (Stage 14.4 kits use it). */
export function columnsScene(specs: ReadonlyArray<{ name: string; stickies: string[]; colour?: string }>, makeId: () => string, opts: { width?: number; height?: number; perRow?: number; link?: boolean } = {}): { elements: Element[] } {
  const b = sceneBuilder(makeId);
  columns(b, specs, opts);
  return { elements: b.elements };
}

const C = STICKY_COLOURS;

/** A new board's starting elements. */
export function templateScene(template: BoardTemplate, makeId: () => string): { elements: Element[] } {
  const b = sceneBuilder(makeId);
  switch (template) {
    case "blank":
      break;
    case "mind_map": {
      // Stage 13.1b: a starter mind map (Tab adds a child, Enter a sibling).
      const { tree, ids } = treeFromList(parseList("- Main topic\n  - Idea\n  - Idea\n  - Idea\n  - Idea"), makeId);
      const els = [...tree.nodes.values()].flatMap((n) => newNodeElements({ node: n.id, text: ids.get(n.id)! }, { map: tree.map, parent: n.parent, order: n.order }, n.text));
      return { elements: applyTree(els, { ...tree, layout: "both" }) as Element[] };
    }
    case "campaign_plan":
      columns(
        b,
        [
          { name: "Goal", stickies: ["Admissions target", "By when"], colour: C.purple },
          { name: "Audience", stickies: ["Who are the students?", "Who decides? (parents)"], colour: C.blue },
          { name: "Message & offer", stickies: ["Why this institution", "Offer / scholarship"], colour: C.yellow },
          { name: "Channels", stickies: ["Meta ads", "Google", "WhatsApp", "Events"], colour: C.green },
          { name: "Budget & timeline", stickies: ["Monthly budget", "Launch date"], colour: C.orange },
          { name: "Measure", stickies: ["Leads", "Cost per lead", "Admissions"], colour: C.pink },
        ],
        { perRow: 3 },
      );
      break;
    case "content_month":
      columns(
        b,
        [1, 2, 3, 4].map((n) => ({ name: `Week ${n}`, stickies: ["Reel idea", "Static post", "Story", "Testimonial"], colour: n % 2 ? C.yellow : C.blue })),
      );
      break;
    case "swot":
      columns(
        b,
        [
          { name: "Strengths", stickies: ["Add a strength"], colour: C.green },
          { name: "Weaknesses", stickies: ["Add a weakness"], colour: C.pink },
          { name: "Opportunities", stickies: ["Add an opportunity"], colour: C.blue },
          { name: "Threats", stickies: ["Add a threat"], colour: C.orange },
        ],
        { perRow: 2, width: 520, height: 460 },
      );
      break;
    case "student_journey":
      columns(
        b,
        ["Awareness", "Interest", "Enquiry", "Counselling / visit", "Application", "Admission", "Joining"].map((name) => ({ name, stickies: ["What they do", "What they feel", "Where we help"], colour: C.blue })),
        { width: 420, height: 520, link: true },
      );
      break;
    case "admission_funnel":
      columns(
        b,
        [
          { name: "Leads", stickies: ["Number", "Source"], colour: C.purple },
          { name: "Contacted", stickies: ["Number", "Within how long"], colour: C.blue },
          { name: "Counselled", stickies: ["Number", "Common questions"], colour: C.green },
          { name: "Applied", stickies: ["Number", "Drop-off reasons"], colour: C.yellow },
          { name: "Admitted", stickies: ["Number", "Cost per admission"], colour: C.orange },
        ],
        { link: true },
      );
      break;
    case "retro":
      columns(b, [
        { name: "Went well", stickies: ["Add one"], colour: C.green },
        { name: "Didn't go well", stickies: ["Add one"], colour: C.pink },
        { name: "Try next", stickies: ["Add one"], colour: C.blue },
        { name: "Shout-outs", stickies: ["Add one"], colour: C.yellow },
      ]);
      break;
  }
  return { elements: b.elements };
}
