// Meetings (Stage 13.4): what a meeting page says, read by rules (no AI). Pure, unit-tested.
//   - Decisions: the items under its "Decisions" heading.
//   - Action items: the checklist items under "Action items"; each one's owner is its first @mention and its due
//     date comes from words like "by Friday", "25 Oct", "tomorrow", "in 3 days", "naale", "നാളെ" (India time),
//     moved to the next working day when it lands on a day off.
//   - The next meeting of a repeating series starts with the open action items carried over.
import { addDays, addMonths, dayOfWeek, endOfMonth, type IsoDate } from "@/lib/dates";
import { parseMarkdown, type Block, type Inline, type ListBlock } from "@/lib/markdown";
import { MEETING_HEADINGS } from "./doc-templates";

const inlineText = (c: readonly Inline[]): string => c.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "br" ? " " : n.t === "mention" ? `@${n.label}` : "c" in n ? inlineText(n.c) : "")).join("");

/** The blocks under a "## Heading" (up to the next heading of the same or a higher level). */
function section(blocks: readonly Block[], heading: string): Block[] {
  const at = blocks.findIndex((b) => b.t === "h" && inlineText(b.c).trim().toLowerCase() === heading.toLowerCase());
  if (at === -1) return [];
  const level = (blocks[at] as { level: number }).level;
  const out: Block[] = [];
  for (const b of blocks.slice(at + 1)) {
    if (b.t === "h" && b.level <= level) break;
    out.push(b);
  }
  return out;
}

const listItems = (l: ListBlock): Array<{ c: Inline[]; checked: boolean | null }> => l.items.flatMap((it) => [{ c: it.c, checked: it.checked }, ...(it.sub ? listItems(it.sub) : [])]);
const placeholder = (s: string) => !s || /^type @ to pick who/i.test(s);

/** The decisions written in a meeting page. */
export function decisionsOf(md: string): string[] {
  const out: string[] = [];
  for (const b of section(parseMarkdown(md), MEETING_HEADINGS.decisions)) {
    if (b.t === "list") for (const it of listItems(b)) out.push(inlineText(it.c).trim());
    else if (b.t === "p") out.push(inlineText(b.c).trim());
  }
  return out.filter((s) => !placeholder(s));
}

// ---------- due dates ----------

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\b(?:sunday|sun|nyayar|njayar)\b|ഞായർ/i, 0],
  [/\b(?:monday|mon|thinkal|thingal)\b|തിങ്കൾ/i, 1],
  [/\b(?:tuesday|tue|tues|chovva)\b|ചൊവ്വ/i, 2],
  [/\b(?:wednesday|wed|budhan|budan)\b|ബുധൻ/i, 3],
  [/\b(?:thursday|thu|thur|thurs|vyazham|vyaazham)\b|വ്യാഴം/i, 4],
  [/\b(?:friday|fri|velli)\b|വെള്ളി/i, 5],
  [/\b(?:saturday|sat|shani|sani)\b|ശനി/i, 6],
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A due date from the words in an action item, or null when it names none. `isWorkingDay` moves a date that lands on
 * a day off to the next working day ("by Sunday" → Monday).
 */
export function dueFrom(text: string, today: IsoDate, isWorkingDay: (d: IsoDate) => boolean = () => true): IsoDate | null {
  const t = text.toLowerCase();
  const year = Number(today.slice(0, 4));
  let d: IsoDate | null = null;
  let m: RegExpExecArray | null;
  const valid = (y: number, mo: number, da: number) => {
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    return mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && new Date(`${iso}T00:00:00Z`).getUTCDate() === da ? iso : null;
  };
  // A date with no year that has already passed means next year's.
  const ahead = (mo: number, da: number) => {
    const iso = valid(year, mo, da);
    return iso && iso < today ? valid(year + 1, mo, da) : iso;
  };
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) d = valid(Number(m[1]), Number(m[2]), Number(m[3]));
  else if ((m = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(t))) d = m[3] ? valid(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]), Number(m[1])) : ahead(Number(m[2]), Number(m[1]));
  else if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})[a-z]*\\b`).exec(t))) d = ahead(MONTHS.indexOf(m[2]!) + 1, Number(m[1]));
  else if ((m = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t))) d = ahead(MONTHS.indexOf(m[1]!) + 1, Number(m[2]));
  else if (/\b(?:day after tomorrow|mattannaal|mattannal|mattenal)\b|മറ്റന്നാൾ/.test(t)) d = addDays(today, 2);
  else if (/\b(?:tomorrow|tmrw|naale|nale|naley)\b|നാളെ/.test(t)) d = addDays(today, 1);
  else if (/\b(?:today|tonight|eod|innu|inn)\b|ഇന്ന്/.test(t)) d = today;
  else if ((m = /\bin\s+(\d{1,3})\s+(day|week)s?\b/.exec(t)) || (m = /\b(\d{1,3})\s+(day|week)s?\b/.exec(t))) d = addDays(today, Number(m[1]) * (m[2] === "week" ? 7 : 1));
  else if (/\bnext week\b/.test(t)) d = addDays(today, 8 - (dayOfWeek(today) || 7));
  else if (/\b(?:end of (?:the )?week|eow)\b/.test(t)) d = addDays(today, (5 - dayOfWeek(today) + 7) % 7);
  else if (/\b(?:end of (?:the )?month|eom)\b/.test(t)) d = endOfMonth(today);
  else
    for (const [re, wd] of WEEKDAYS) {
      if (!re.test(text)) continue;
      // The next one after today ("by Friday" on a Friday is next Friday; "next Friday" too).
      d = addDays(today, ((wd - dayOfWeek(today) + 7) % 7) || 7);
      break;
    }
  if (!d) return null;
  for (let i = 0; i < 14 && !isWorkingDay(d); i++) d = addDays(d, 1);
  return d;
}

// ---------- action items ----------

export type ActionItem = { key: string; text: string; done: boolean; ownerId: string | null; ownerName: string | null; due: IsoDate | null; line: string };

/** A stable key for an action item: its words, lower-case, without the tick. */
export const itemKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

/** The action items in a meeting page, with owner (first @mention) and due date from rules. */
export function actionItemsOf(md: string, today: IsoDate, isWorkingDay?: (d: IsoDate) => boolean): ActionItem[] {
  const out: ActionItem[] = [];
  for (const b of section(parseMarkdown(md), MEETING_HEADINGS.actions)) {
    if (b.t !== "list") continue;
    for (const it of listItems(b)) {
      const text = inlineText(it.c).replace(/\s+/g, " ").trim();
      if (placeholder(text)) continue;
      const owner = it.c.find((n): n is Extract<Inline, { t: "mention" }> => n.t === "mention" && n.kind === "person");
      out.push({ key: itemKey(text), text, done: it.checked === true, ownerId: owner?.id ?? null, ownerName: owner?.label ?? null, due: dueFrom(text, today, isWorkingDay), line: "" });
    }
  }
  // The original Markdown of each open item (mentions kept), for carrying it into the next meeting.
  const open = new Map<string, string>();
  for (const l of md.split("\n")) {
    const m = /^\s*[-*]\s+\[ \]\s+(.*)$/.exec(l);
    const first = m ? parseMarkdown(m[1]!)[0] : undefined;
    if (m && first && first.t === "p") open.set(itemKey(inlineText(first.c).replace(/\s+/g, " ").trim()), m[1]!.trim());
  }
  for (const a of out) a.line = `- [ ] ${open.get(a.key) ?? a.text}`;
  return out;
}

/** The open action items of a meeting, as checklist lines for the next one. */
export const carriedItems = (md: string, today: IsoDate) =>
  actionItemsOf(md, today)
    .filter((a) => !a.done)
    .map((a) => a.line);

/** A task title from an action item: without the owner mention and the due-date words. */
export function taskTitle(text: string, ownerName: string | null): string {
  let t = text;
  if (ownerName) t = t.replace(`@${ownerName}`, "");
  t = t.replace(/\b(?:by|before|on|till|until)\s+[^,.;]+$/i, "").replace(/\s+[-–—]\s*$/, "");
  return t.replace(/\s+/g, " ").replace(/^[\s,:–—-]+|[\s,:–—-]+$/g, "").slice(0, 200) || text.slice(0, 200);
}

/** When the next meeting of a series is: a week later, or the same day next month. */
export const nextDate = (date: IsoDate, repeat: "weekly" | "monthly"): IsoDate => (repeat === "weekly" ? addDays(date, 7) : addMonths(date, 1));
