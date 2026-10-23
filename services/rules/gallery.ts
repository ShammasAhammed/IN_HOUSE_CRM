// Template gallery (Stage 13.6): what a board or page keeps when it becomes a template, and presets. Pure, unit-tested.
//   - A template never carries a client's data (D-13.6b): live cards, task badges, references and pictures become
//     placeholders of the same size (the layout stays); element links are dropped; the client's name becomes
//     "{client}" (filled in with the new client's name on use); dates become "[date]"; phone numbers and emails
//     become "[contact]". Pages: person mentions become plain names; task and client chips, cards, embeds and
//     pictures become placeholders; table rows only when asked for, without their people. Comments, votes,
//     reactions and task links live outside the scene or page, so they are never copied.
//   - Presets recolour a new board: a palette maps the board's sticky colours in order, a sticky style sets the
//     colour and font of every sticky, a layout sets mind-map layouts and section colours.
import type { DocTableColumn, DocTableView, PresetValue } from "@/lib/types";
import { applyTree, mapsOn } from "./mind-map";
import { parseCardUrl } from "./references";

type El = Record<string, unknown> & { id: string; type: string };
const str = (v: unknown) => (typeof v === "string" ? v : null);
const custom = (e: El) => (e.customData && typeof e.customData === "object" ? (e.customData as Record<string, unknown>) : {});

export type Removed = { cards: number; taskLinks: number; references: number; pictures: number; links: number; names: number; dates: number; contacts: number; mentions: number; rows: number };
const none = (): Removed => ({ cards: 0, taskLinks: 0, references: 0, pictures: 0, links: 0, names: 0, dates: 0, contacts: 0, mentions: 0, rows: 0 });

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const DATE_RES = [/\b\d{4}-\d{2}-\d{2}\b/g, /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+\\d{4})?\\b`, "gi"), new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi")];
const CONTACT_RES = [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words in a template: the client's name → "{client}", dates → "[date]", phones and emails → "[contact]". */
export function cleanText(text: string, clientName: string | null, removed: Removed = none()): string {
  let t = text;
  for (const re of CONTACT_RES) t = t.replace(re, () => (removed.contacts++, "[contact]"));
  if (clientName && clientName.trim().length >= 3) t = t.replace(new RegExp(clientName.trim().split(/\s+/).map(escape).join("\\s+"), "gi"), () => (removed.names++, "{client}"));
  for (const re of DATE_RES) t = t.replace(re, () => (removed.dates++, "[date]"));
  return t;
}

/** "{client}" back to a client's name, when a template is used. */
export const fillClient = (text: string, clientName: string) => text.replaceAll("{client}", clientName);

function placeholder(e: El, label: string, textId: string): El[] {
  const rect: El = { ...e, type: "rectangle", link: null, backgroundColor: "#f8f9fa", strokeColor: "#adb5bd", strokeStyle: "dashed", fillStyle: "solid", customData: { placeholder: label }, boundElements: [...((e.boundElements as unknown[]) ?? []).filter((b) => (b as { type?: string }).type !== "text"), { type: "text", id: textId }] };
  delete rect.fileId;
  delete rect.status;
  delete rect.scale;
  delete rect.crop;
  const w = (e.width as number) ?? 200;
  const h = (e.height as number) ?? 100;
  const text: El = { id: textId, type: "text", x: (e.x as number) + 10, y: (e.y as number) + h / 2 - 12, width: w - 20, height: 25, angle: 0, strokeColor: "#868e96", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: e.groupIds ?? [], frameId: e.frameId ?? null, index: null, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, text: label, originalText: label, fontSize: 16, fontFamily: 6, textAlign: "center", verticalAlign: "middle", containerId: e.id, autoResize: true, lineHeight: 1.25 };
  return [rect, text];
}

const CARD_LABEL: Record<string, string> = { task: "Task card", creative: "Creative card", results: "Results card", sheet: "Sheet card", doc: "Docs page card", knowledge: "Knowledge card", ref: "Reference" };

/** A board's elements as a template: cleaned of client data, layout kept. `makeId` names placeholder labels. */
export function stripBoard(elements: readonly unknown[], clientName: string | null, makeId: () => string): { elements: El[]; removed: Removed } {
  const removed = none();
  const out: El[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as El;
    if (e.isDeleted === true) continue;
    if (e.type === "embeddable" || e.type === "iframe") {
      const card = parseCardUrl(str(e.link));
      if (card?.kind === "ref") removed.references++;
      else if (card?.kind === "task" && (e.width as number) <= 220) removed.taskLinks++;
      else if (card) removed.cards++;
      else removed.references++;
      out.push(...placeholder(e, card ? `${CARD_LABEL[card.kind] ?? "Card"} goes here` : "Link goes here", makeId()));
      continue;
    }
    if (e.type === "image") {
      removed.pictures++;
      out.push(...placeholder(e, "Picture goes here", makeId()));
      continue;
    }
    let next: El = e;
    if (str(e.link)) {
      removed.links++;
      next = { ...next, link: null };
    }
    // Count from the unwrapped words; the wrapped copy is cleaned too (a name can be split across lines).
    if (e.type === "text") next = { ...next, text: cleanText(str(e.text) ?? "", clientName, none()), originalText: cleanText(str(e.originalText) ?? str(e.text) ?? "", clientName, removed) };
    if ((e.type === "frame" || e.type === "magicframe") && str(e.name)) next = { ...next, name: cleanText(str(e.name)!, clientName, removed) };
    const c = custom(e);
    if (c.section && typeof c.section === "object") {
      const s = c.section as { name?: string };
      if (s.name) next = { ...next, customData: { ...c, section: { ...s, name: cleanText(s.name, clientName, removed) } } };
    }
    out.push(next);
  }
  return { elements: out, removed };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export type TemplateTable = { id: string; title: string; columns: DocTableColumn[]; view: DocTableView; rows: Array<Record<string, unknown>> };

/** A page as a template: chips, cards, embeds and pictures become placeholders; tables keep columns (rows if asked). */
export function stripPage(body: string, tables: readonly TemplateTable[], clientName: string | null, keepRows: boolean): { body: string; tables: TemplateTable[]; removed: Removed } {
  const removed = none();
  let b = body
    .replace(new RegExp(`@\\[([^\\]\\n]*)\\]\\(person:${UUID}\\)`, "g"), (_, name: string) => (removed.mentions++, name))
    .replace(new RegExp(`@\\[[^\\]\\n]*\\]\\(task:${UUID}\\)`, "g"), () => (removed.taskLinks++, "[task]"))
    .replace(new RegExp(`@\\[[^\\]\\n]*\\]\\(client:${UUID}\\)`, "g"), () => (removed.names++, "{client}"))
    .replace(/^::card\[[^\]\n]*\][ \t]*$/gm, () => (removed.cards++, "> Live card goes here"))
    .replace(/^::embed\[[^\]\n]*\][ \t]*$/gm, () => (removed.references++, "> Link or video goes here"))
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, (_, alt: string) => (removed.pictures++, `> Picture goes here${alt ? `: ${alt}` : ""}`));
  b = cleanText(b, clientName, removed);
  const out = tables.map((t) => {
    if (!keepRows) {
      removed.rows += t.rows.length;
      return { ...t, rows: [] };
    }
    const people = new Set(t.columns.filter((c) => c.type === "person").map((c) => c.id));
    return {
      ...t,
      rows: t.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, people.has(k) ? null : typeof v === "string" ? cleanText(v, clientName, removed) : v]))),
    };
  });
  return { body: b, tables: out, removed };
}

/** What a template shows without a picture: a page's first lines, or a board's first stickies and frames. */
export function boardPreview(elements: readonly El[]): string {
  const words: string[] = [];
  for (const e of elements) {
    if (e.type === "frame" && str(e.name)) words.push(str(e.name)!);
    else if (e.type === "text" && !custom(e).placeholder) words.push((str(e.originalText) ?? str(e.text) ?? "").replace(/\s+/g, " ").trim());
    if (words.length >= 16) break;
  }
  return [...new Set(words.filter((w) => w && !/goes here$/.test(w)))].join(" · ").slice(0, 400);
}
export const pagePreview = (body: string) =>
  body
    .split("\n")
    .map((l) => l.replace(/^[#>\-*\s:]+|\[[ x]\]\s*/g, "").trim())
    .filter((l) => l && !/^(note|tip|warning|toggle)\b/.test(l))
    .slice(0, 4)
    .join(" · ")
    .slice(0, 400);

/** A short summary of what was taken out, for the warning before saving. Empty when nothing was. */
export function removedWords(r: Removed): string[] {
  const n = (k: keyof Removed, one: string, many: string) => (r[k] ? [`${r[k]} ${r[k] === 1 ? one : many}`] : []);
  return [
    ...n("cards", "live card", "live cards"),
    ...n("taskLinks", "task link", "task links"),
    ...n("references", "reference", "references"),
    ...n("pictures", "picture", "pictures"),
    ...n("links", "link", "links"),
    ...n("names", "client name", "client names"),
    ...n("dates", "date", "dates"),
    ...n("contacts", "phone number or email", "phone numbers or emails"),
    ...n("mentions", "person mention (kept as a plain name)", "person mentions (kept as plain names)"),
    ...n("rows", "table row", "table rows"),
  ];
}

// ---------- presets ----------

const FONT = { hand: 5, clean: 6 } as const;

/** A new board's elements with presets applied (see the top of this file). */
export function applyPresets(elements: readonly El[], p: { palette?: PresetValue; sticky?: PresetValue; layout?: PresetValue }): El[] {
  const stickyIds = new Set(elements.filter((e) => custom(e).kind === "sticky").map((e) => e.id));
  const order: string[] = [];
  for (const e of elements) if (stickyIds.has(e.id)) {
    const c = str(e.backgroundColor) ?? "";
    if (!order.includes(c)) order.push(c);
  }
  const palette = p.palette?.colours?.filter(Boolean) ?? [];
  const sectionColours = p.layout?.sectionColours?.filter(Boolean) ?? [];
  let s = 0;
  const out = elements.map((e) => {
    const c = custom(e);
    if (stickyIds.has(e.id)) {
      const bg = p.sticky?.colour ?? (palette.length ? palette[order.indexOf(str(e.backgroundColor) ?? "") % palette.length] : undefined);
      return bg ? { ...e, backgroundColor: bg } : e;
    }
    if (e.type === "text" && p.sticky?.font && stickyIds.has(str(e.containerId) ?? "")) return { ...e, fontFamily: FONT[p.sticky.font] };
    if (c.section && sectionColours.length) {
      const colour = sectionColours[s++ % sectionColours.length]!;
      return { ...e, backgroundColor: colour, customData: { ...c, section: { ...(c.section as object), colour } } };
    }
    return e;
  });
  // Mind maps are laid out again in the preset's layout.
  const layout = p.layout?.mindLayout;
  if (!layout) return out;
  let laid: El[] = out;
  for (const tree of mapsOn(out).values()) laid = applyTree(laid, { ...tree, layout }) as El[];
  return laid;
}
