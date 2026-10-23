// Docs in the block editor (Stage 13.4, D-13.4a): Markdown → editor document → Markdown keeps every page's meaning,
// for pages written before 13.4 and for the new blocks; old versions read exactly as before.
import { describe, expect, it } from "vitest";
import { docToMarkdown, markdownToDoc } from "@/lib/doc-format";
import { parseMarkdown, plainText, safeImage } from "@/lib/markdown";

const id = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e8";
const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md));
/** The same tree, with neighbouring plain-text pieces joined (how text is split into pieces isn't meaning). */
function norm(v: unknown): unknown {
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const x of v.map(norm)) {
      const prev = out[out.length - 1] as { t?: string; v?: string } | undefined;
      if (prev?.t === "text" && (x as { t?: string }).t === "text") prev.v += (x as { v: string }).v;
      else out.push(x);
    }
    return out;
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
  return v;
}
const sameMeaning = (md: string) => expect(norm(parseMarkdown(roundTrip(md)))).toEqual(norm(parseMarkdown(md)));

// Pages as people wrote them in 9b.5 (every construct the old reader knew).
const OLD_PAGES = [
  "# Onboarding\n\nWelcome to **Oppllo**. Read the _whole_ page.\nSecond line, same paragraph.\n\n## Tools\n\n- Slack\n- [Drive](https://drive.google.com)\n- `npm run dev`",
  "1. First\n2. Second\n3. Third\n\n- [ ] Call the client\n- [x] Send the plan",
  "> Quote line one\n> quote line two\n\n```\ncode here\n  indented\n```\n\n---\n\nSee /docs and https://example.com/a_(b) too.",
  "### Small heading\nText right after\n\n* star bullet\n* another",
  "Plain paragraph with an [in-app link](/tasks) and a [bad link](javascript:alert(1)).",
];

describe("round trip keeps meaning", () => {
  it.each(OLD_PAGES)("old page %#", (md) => {
    sameMeaning(md);
  });
  it("new blocks: nested lists, callouts, toggles, tables, images, embeds, cards, database tables, mentions", () => {
    const md = [
      "# Campaign brief",
      "- Audience\n  - Students\n  - Parents\n- Channels",
      ":::note\nBudget is **fixed** this month.\n:::",
      ":::toggle Details\n- one\n- two\n:::",
      "| Channel | Budget |\n| --- | --- |\n| Meta | ₹50,000 |\n| Google | ₹20,000 |",
      `![Banner](/api/doc-files/${id})`,
      "::embed[https://www.youtube.com/watch?v=dQw4w9WgXcQ]",
      `::card[task/${id}]`,
      `::table[${id}]`,
      `Ask @[Anu Thomas](person:${id}) about @[](task:${id}) for @[](client:${id}).`,
    ].join("\n\n");
    sameMeaning(md);
    const doc = markdownToDoc(md);
    expect(doc.content!.map((n) => n.type)).toEqual(["heading", "bulletList", "callout", "details", "table", "image", "embed", "liveCard", "dbTable", "paragraph"]);
  });
  it("an empty page is one empty paragraph and saves back to nothing", () => {
    expect(markdownToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(roundTrip("")).toBe("");
  });
});

describe("the reader", () => {
  it("keeps old lists flat unless indented, and nests indented items", () => {
    const [l] = parseMarkdown("- a\n  - b\n- c") as unknown as [{ items: Array<{ sub: unknown }> }];
    expect(l.items).toHaveLength(2);
    expect(l.items[0]!.sub).toMatchObject({ items: [{ c: [{ t: "text", v: "b" }] }] });
  });
  it("only shows pictures from our doc files or https; mentions need a real id", () => {
    expect(safeImage("/api/doc-files/x")).toBeNull();
    expect(safeImage("javascript:alert(1)")).toBeNull();
    expect(parseMarkdown("![x](http://evil.example/a.png)")[0]!.t).toBe("p");
    expect(parseMarkdown("@[x](person:not-an-id)")[0]).toEqual({ t: "p", c: [{ t: "text", v: "@" }, { t: "text", v: "x" }] });
  });
  it("gives the plain words for search, without task or client titles", () => {
    const t = plainText(parseMarkdown(`# Plan\n\n:::toggle More\nHidden **words**\n:::\n\n| A | B |\n| --- | --- |\n| c | d |\n\n@[Anu](person:${id}) and @[](task:${id})`));
    expect(t).toContain("Hidden words");
    expect(t).toContain("c d");
    expect(t).toContain("@Anu and ");
  });
});
