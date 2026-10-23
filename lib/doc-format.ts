// Docs (Stage 13.4, D-13.4a): a page is stored as Markdown (the safe dialect of lib/markdown.ts), and the block editor
// works on a Tiptap/ProseMirror document. These two pure functions turn one into the other; the round trip keeps the
// meaning of every page (tests/unit/doc-format.test.ts), so old pages need no conversion and old versions stay valid.
import { parseMarkdown, type Block, type Inline, type ListBlock } from "./markdown";

export type PMMark = { type: "bold" | "italic" | "code" | "link"; attrs?: { href: string } };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: PMMark[] };

// ---------- Markdown → editor ----------

function inlines(c: readonly Inline[], marks: PMMark[] = []): PMNode[] {
  return c.flatMap((n): PMNode[] => {
    switch (n.t) {
      case "text":
        return n.v ? [{ type: "text", text: n.v, ...(marks.length ? { marks } : {}) }] : [];
      case "br":
        return [{ type: "hardBreak" }];
      case "code":
        return n.v ? [{ type: "text", text: n.v, marks: [...marks, { type: "code" }] }] : [];
      case "strong":
        return inlines(n.c, [...marks, { type: "bold" }]);
      case "em":
        return inlines(n.c, [...marks, { type: "italic" }]);
      case "link":
        return inlines(n.c, [...marks, { type: "link", attrs: { href: n.href } }]);
      case "mention":
        return [{ type: "mention", attrs: { id: n.id, label: n.label, kind: n.kind } }];
    }
  });
}
const para = (c: readonly Inline[]): PMNode => {
  const content = inlines(c);
  return { type: "paragraph", ...(content.length ? { content } : {}) };
};

function list(l: ListBlock): PMNode {
  const task = l.items.some((i) => i.checked !== null);
  return {
    type: task ? "taskList" : l.ordered ? "orderedList" : "bulletList",
    content: l.items.map((it) => ({
      type: task ? "taskItem" : "listItem",
      ...(task ? { attrs: { checked: Boolean(it.checked) } } : {}),
      content: [para(it.c), ...(it.sub ? [list(it.sub)] : [])],
    })),
  };
}

function block(b: Block): PMNode {
  switch (b.t) {
    case "h":
      return { type: "heading", attrs: { level: b.level }, content: inlines(b.c) };
    case "p":
      return para(b.c);
    case "list":
      return list(b);
    case "quote":
      return { type: "blockquote", content: [para(b.c)] };
    case "code":
      return { type: "codeBlock", ...(b.v ? { content: [{ type: "text", text: b.v }] } : {}) };
    case "hr":
      return { type: "horizontalRule" };
    case "callout":
      return { type: "callout", attrs: { kind: b.kind }, content: b.c.length ? b.c.map(block) : [{ type: "paragraph" }] };
    case "toggle":
      return { type: "details", content: [{ type: "detailsSummary", content: inlines(b.title) }, { type: "detailsContent", content: b.c.length ? b.c.map(block) : [{ type: "paragraph" }] }] };
    case "table":
      return {
        type: "table",
        content: [
          { type: "tableRow", content: b.head.map((c) => ({ type: "tableHeader", content: [para(c)] })) },
          ...b.rows.map((r) => ({ type: "tableRow", content: b.head.map((_, i) => ({ type: "tableCell", content: [para(r[i] ?? [])] })) })),
        ],
      };
    case "image":
      return { type: "image", attrs: { src: b.src, alt: b.alt } };
    case "embed":
      return { type: "embed", attrs: { url: b.url } };
    case "card":
      return { type: "liveCard", attrs: { kind: b.kind, id: b.id } };
    case "dbtable":
      return { type: "dbTable", attrs: { id: b.id } };
  }
}

export function markdownToDoc(md: string): PMNode {
  const blocks = parseMarkdown(md);
  return { type: "doc", content: blocks.length ? blocks.map(block) : [{ type: "paragraph" }] };
}

// ---------- editor → Markdown ----------

const has = (n: PMNode, t: PMMark["type"]) => n.marks?.some((m) => m.type === t);
const href = (n: PMNode) => n.marks?.find((m) => m.type === "link")?.attrs?.href;

/** Inline content back to Markdown: neighbouring text with the same link or emphasis is wrapped once. */
function inlineMd(content: readonly PMNode[] = []): string {
  let out = "";
  let i = 0;
  while (i < content.length) {
    const n = content[i]!;
    if (n.type === "hardBreak") {
      out += "\n";
      i++;
      continue;
    }
    if (n.type === "mention") {
      const kind = String(n.attrs?.kind ?? "person");
      out += `@[${kind === "person" ? String(n.attrs?.label ?? "").replace(/[\]\n]/g, "") : ""}](${kind}:${String(n.attrs?.id ?? "")})`;
      i++;
      continue;
    }
    if (n.type !== "text" || !n.text) {
      i++;
      continue;
    }
    const link = href(n);
    if (link) {
      // A link's whole run, its own marks inside.
      const run: PMNode[] = [];
      for (let j = i; j < content.length && content[j]!.type === "text" && href(content[j]!) === link; j++) run.push({ ...content[j]!, marks: content[j]!.marks?.filter((m) => m.type !== "link") });
      const label = inlineMd(run);
      // A bare address stays bare (as typed); anything else is [label](address).
      out += label === link && /^https?:\/\//.test(link) ? link : `[${label}](${link})`;
      i += run.length;
      continue;
    }
    let t = n.text;
    if (has(n, "code")) t = `\`${t.replace(/`/g, "'")}\``;
    if (has(n, "italic")) t = `_${t}_`;
    if (has(n, "bold")) t = `**${t}**`;
    out += t;
    i++;
  }
  return out;
}

function listMd(n: PMNode, indent: string): string[] {
  const ordered = n.type === "orderedList";
  return (n.content ?? []).flatMap((item, i) => {
    const [first, ...rest] = item.content ?? [];
    const marker = ordered ? `${i + 1}.` : "-";
    const box = item.type === "taskItem" ? (item.attrs?.checked ? "[x] " : "[ ] ") : "";
    const text = first && first.type === "paragraph" ? inlineMd(first.content).replace(/\n/g, " ") : "";
    const lines = [`${indent}${marker} ${box}${text}`];
    for (const r of rest) if (r.type === "bulletList" || r.type === "orderedList" || r.type === "taskList") lines.push(...listMd(r, `${indent}  `));
    return lines;
  });
}

const cellMd = (c: PMNode) => inlineMd(c.content?.flatMap((p) => p.content ?? []) ?? []).replace(/\n/g, " ").replace(/\|/g, "\\|");

function blockMd(n: PMNode): string {
  switch (n.type) {
    case "heading":
      return `${"#".repeat(Math.min(3, Math.max(1, Number(n.attrs?.level ?? 1))))} ${inlineMd(n.content).replace(/\n/g, " ")}`;
    case "paragraph":
      return inlineMd(n.content);
    case "bulletList":
    case "orderedList":
    case "taskList":
      return listMd(n, "").join("\n");
    case "blockquote":
      return (n.content ?? [])
        .map(blockMd)
        .join(" ")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`\n${(n.content ?? []).map((t) => t.text ?? "").join("")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "callout":
      return `:::${String(n.attrs?.kind ?? "note")}\n${docMd(n.content)}\n:::`;
    case "details": {
      const summary = n.content?.find((c) => c.type === "detailsSummary");
      const body = n.content?.find((c) => c.type === "detailsContent");
      return `:::toggle ${inlineMd(summary?.content).replace(/\n/g, " ")}\n${docMd(body?.content)}\n:::`;
    }
    case "table": {
      const rows = n.content ?? [];
      const head = (rows[0]?.content ?? []).map(cellMd);
      const lines = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
      for (const r of rows.slice(1)) lines.push(`| ${(r.content ?? []).map(cellMd).join(" | ")} |`);
      return lines.join("\n");
    }
    case "image":
      return `![${String(n.attrs?.alt ?? "").replace(/[\]\n]/g, "")}](${String(n.attrs?.src ?? "")})`;
    case "embed":
      return `::embed[${String(n.attrs?.url ?? "")}]`;
    case "liveCard":
      return `::card[${String(n.attrs?.kind ?? "")}/${String(n.attrs?.id ?? "")}]`;
    case "dbTable":
      return `::table[${String(n.attrs?.id ?? "")}]`;
    default:
      return n.content ? docMd(n.content) : "";
  }
}

function docMd(content: readonly PMNode[] = []): string {
  return content
    .map(blockMd)
    .filter((b, i, all) => b !== "" || (i > 0 && i < all.length - 1))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const docToMarkdown = (doc: PMNode): string => docMd(doc.content);
