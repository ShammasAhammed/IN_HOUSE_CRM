// A small, safe Markdown reader for docs (Stage 9b.5, grown in 13.4): headings, paragraphs, lists (nested by indent,
// with [ ] / [x]), quotes, code, rules, bold, italic, inline code and links; and since 13.4 callouts and toggles
// (":::note" … ":::"), tables (| a | b |), images, embeds, live cards, database tables ("::table[id]") and @mentions.
// Everything older pages used reads exactly as before. It returns a tree, never HTML, so nothing typed can run.

export type MentionKind = "person" | "task" | "client";

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  /** A single line break inside a paragraph, kept as typed (QA S9-19). */
  | { t: "br" }
  /** "@[Anu Thomas](person:<id>)"; tasks and clients carry no title ("@[](task:<id>)"): each viewer sees their own. */
  | { t: "mention"; kind: MentionKind; id: string; label: string };

export type ListItem = { c: Inline[]; checked: boolean | null; sub: ListBlock | null };
export type ListBlock = { t: "list"; ordered: boolean; items: ListItem[] };
export const CALLOUT_KINDS = ["note", "tip", "warning"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export type Block =
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | ListBlock
  | { t: "quote"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "hr" }
  | { t: "callout"; kind: CalloutKind; c: Block[] }
  | { t: "toggle"; title: Inline[]; c: Block[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "image"; src: string; alt: string }
  | { t: "embed"; url: string }
  | { t: "card"; kind: string; id: string }
  | { t: "dbtable"; id: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Only web, mail and in-app links; anything else (javascript:, data:) stays plain text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  // In-app paths only: "//x" and "/\x" both leave the site in browsers.
  if (/^\/(?![/\\])/.test(h)) return h;
  if (/^mailto:[^\s]+$/i.test(h)) return h;
  if (/^https?:\/\//i.test(h) && URL.canParse(h)) return h;
  return null;
}

/** Pictures only from Oppllo One's own doc files, or https. */
export function safeImage(src: string): string | null {
  const h = src.trim();
  if (/^\/api\/doc-files\/[0-9a-f-]{36}$/.test(h)) return h;
  if (/^https:\/\//i.test(h) && URL.canParse(h)) return h;
  return null;
}

/** Longer paragraphs are shown as plain text: reading them is never worth a slow page. */
const MAX_INLINE = 20_000;

/** Where a link target that started at `from` ends: its ")" with brackets inside counted, so "Foo_(bar)" stays whole. */
function closingParen(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i]!;
    if (/\s/.test(c)) return -1;
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** A bare web address without the sentence's punctuation after it, keeping a ")" only when it closes a "(" inside. */
function trimUrl(url: string): string {
  let u = url;
  for (;;) {
    const last = u.at(-1);
    if (last && ".,;:!?'\"".includes(last)) u = u.slice(0, -1);
    else if (last === ")" && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
    else return u;
  }
}

export function parseInline(s: string): Inline[] {
  if (s.length > MAX_INLINE) return [{ t: "text", v: s }];
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  // One pass, no slicing per character: each marker looks for its closer with indexOf, and a closer that isn't
  // there is remembered, so text full of unclosed markers stays linear.
  const missing = new Set<string>();
  const find = (what: string, from: number) => {
    if (missing.has(what)) return -1;
    const at = s.indexOf(what, from);
    if (at === -1) missing.add(what);
    return at;
  };
  const autolink = /https?:\/\/[^\s<>]+/y;
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    let used = 0;
    if (c === "`") {
      const close = find("`", i + 1);
      if (close > i + 1) {
        flush();
        out.push({ t: "code", v: s.slice(i + 1, close) });
        used = close + 1 - i;
      }
    } else if (c === "*" && s[i + 1] === "*") {
      const close = find("**", i + 3);
      if (close !== -1) {
        flush();
        out.push({ t: "strong", c: parseInline(s.slice(i + 2, close)) });
        used = close + 2 - i;
      }
    } else if ((c === "*" || c === "_") && (i === 0 || !/\w/.test(s[i - 1]!)) && s[i + 1] && !/\s/.test(s[i + 1]!)) {
      const close = find(c, i + 2);
      if (close !== -1 && !/\s/.test(s[close - 1]!) && !/\w/.test(s[close + 1] ?? "")) {
        flush();
        out.push({ t: "em", c: parseInline(s.slice(i + 1, close)) });
        used = close + 1 - i;
      }
    } else if (c === "@" && s[i + 1] === "[" && (i === 0 || !/\w/.test(s[i - 1]!))) {
      const mention = new RegExp(`^@\\[([^\\]\\n]{0,120})\\]\\((person|task|client):(${UUID})\\)`).exec(s.slice(i, i + 220));
      if (mention) {
        flush();
        out.push({ t: "mention", kind: mention[2] as MentionKind, id: mention[3]!, label: mention[1]! });
        used = mention[0].length;
      }
    } else if (c === "[") {
      const mid = find("]", i + 1);
      if (mid > i + 1 && s[mid + 1] === "(") {
        const end = closingParen(s, mid + 2);
        const target = end === -1 ? "" : s.slice(mid + 2, end);
        if (target && !/\s/.test(target)) {
          const label = s.slice(i + 1, mid);
          const href = safeHref(target);
          flush();
          if (href) out.push({ t: "link", href, c: parseInline(label) });
          else out.push({ t: "text", v: label });
          used = end + 1 - i;
        }
      }
    } else if (c === "h" && (i === 0 || /\s|\(/.test(s[i - 1]!))) {
      autolink.lastIndex = i;
      const raw = autolink.exec(s);
      const m = raw ? [trimUrl(raw[0])] : null;
      if (m && m[0]) {
        const href = safeHref(m[0]);
        flush();
        if (href) out.push({ t: "link", href, c: [{ t: "text", v: m[0] }] });
        else out.push({ t: "text", v: m[0] });
        used = m[0].length;
      }
    }
    if (used) i += used;
    else {
      text += c;
      i++;
    }
  }
  flush();
  return out;
}

const LIST = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const indentOf = (line: string) => /^\s*/.exec(line)![0].replace(/\t/g, "  ").length;

/** A list from line i, its items at `indent`; deeper items nest under the item above them. */
function parseList(lines: string[], start: number, indent: number): { block: ListBlock; next: number } {
  const first = lines[start]!.match(LIST)!;
  const ordered = /\d/.test(first[2]!);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const li = lines[i]!.match(LIST);
    if (!li) break;
    const ind = indentOf(lines[i]!);
    if (ind < indent) break;
    if (ind >= indent + 2 && items.length) {
      const sub = parseList(lines, i, ind);
      const last = items[items.length - 1]!;
      last.sub = last.sub ? { ...last.sub, items: [...last.sub.items, ...sub.block.items] } : sub.block;
      i = sub.next;
      continue;
    }
    if (/\d/.test(li[2]!) !== ordered) break;
    const box = li[3]!.match(/^\[( |x|X)\]\s+(.*)$/);
    items.push({ c: parseInline(box ? box[2]! : li[3]!), checked: box ? box[1] !== " " : null, sub: null });
    i++;
  }
  return { block: { t: "list", ordered, items }, next: i };
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => parseInline(c.trim().replace(/\\\|/g, "|")));

export function parseMarkdown(src: string, depth = 0): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const endPara = () => {
    // Each typed line keeps its own line; a blank line still starts a new paragraph (QA S9-19).
    if (para.length) blocks.push({ t: "p", c: para.flatMap((line, i): Inline[] => (i ? [{ t: "br" }, ...parseInline(line)] : parseInline(line))) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpMatchArray | null;
    if (/^```/.test(line)) {
      endPara();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ t: "code", v: code.join("\n") });
    } else if (depth < 4 && (m = line.match(/^:::(note|tip|warning|toggle)(?:\s+(.*))?$/))) {
      // A callout or toggle: everything up to its own ":::" (inner ones counted), read as blocks.
      endPara();
      const inner: string[] = [];
      let open = 1;
      for (i++; i < lines.length; i++) {
        if (/^:::(note|tip|warning|toggle)\b/.test(lines[i]!)) open++;
        else if (/^:::\s*$/.test(lines[i]!) && --open === 0) break;
        inner.push(lines[i]!);
      }
      const body = parseMarkdown(inner.join("\n"), depth + 1);
      blocks.push(m[1] === "toggle" ? { t: "toggle", title: parseInline((m[2] ?? "").trim()), c: body } : { t: "callout", kind: m[1] as CalloutKind, c: body });
    } else if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      endPara();
      blocks.push({ t: "h", level: m[1]!.length as 1 | 2 | 3, c: parseInline(m[2]!.trim()) });
    } else if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      endPara();
      blocks.push({ t: "hr" });
    } else if (LIST.test(line)) {
      endPara();
      const { block, next } = parseList(lines, i, indentOf(line));
      blocks.push(block);
      i = next - 1;
    } else if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? "")) {
      endPara();
      const head = cells(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]!); i++) rows.push(cells(lines[i]!).slice(0, head.length));
      i--;
      blocks.push({ t: "table", head, rows });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      endPara();
      const quote = [m[1]!];
      for (i++; i < lines.length && /^>/.test(lines[i]!); i++) quote.push(lines[i]!.replace(/^>\s?/, ""));
      i--;
      blocks.push({ t: "quote", c: parseInline(quote.join(" ")) });
    } else if ((m = line.match(/^!\[([^\]]*)\]\((\S+)\)\s*$/)) && safeImage(m[2]!)) {
      endPara();
      blocks.push({ t: "image", alt: m[1]!, src: safeImage(m[2]!)! });
    } else if ((m = line.match(/^::embed\[(https:\/\/\S+)\]\s*$/)) && URL.canParse(m[1]!)) {
      endPara();
      blocks.push({ t: "embed", url: m[1]! });
    } else if ((m = line.match(new RegExp(`^::card\\[(task|creative|results|sheet|doc|knowledge|ref)\\/(${UUID})\\]\\s*$`)))) {
      endPara();
      blocks.push({ t: "card", kind: m[1]!, id: m[2]! });
    } else if ((m = line.match(new RegExp(`^::table\\[(${UUID})\\]\\s*$`)))) {
      endPara();
      blocks.push({ t: "dbtable", id: m[1]! });
    } else if (!line.trim()) {
      endPara();
    } else {
      para.push(line.trim());
    }
  }
  endPara();
  return blocks;
}

/** The plain words of a page (search, previews, tools). */
export function plainText(blocks: readonly Block[]): string {
  const inl = (c: readonly Inline[]): string => c.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "br" ? " " : n.t === "mention" ? (n.label ? `@${n.label}` : "") : "c" in n ? inl(n.c) : "")).join("");
  const list = (l: ListBlock): string[] => l.items.flatMap((it) => [inl(it.c), ...(it.sub ? list(it.sub) : [])]);
  return blocks
    .flatMap((b): string[] => {
      switch (b.t) {
        case "h":
        case "p":
        case "quote":
          return [inl(b.c)];
        case "list":
          return list(b);
        case "code":
          return [b.v];
        case "callout":
          return [plainText(b.c)];
        case "toggle":
          return [inl(b.title), plainText(b.c)];
        case "table":
          return [b.head.map(inl).join(" "), ...b.rows.map((r) => r.map(inl).join(" "))];
        case "image":
          return [b.alt];
        default:
          return [];
      }
    })
    .filter(Boolean)
    .join("\n");
}
