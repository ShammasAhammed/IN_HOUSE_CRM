import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "@/lib/markdown";

describe("markdown", () => {
  it("reads headings, paragraphs, lists with ticks, quotes, code and rules", () => {
    const b = parseMarkdown("# Brief\n\nFirst line\nsame para.\n\n- [x] Script\n- [ ] Shoot\n1. One\n2. Two\n> Note\n```\n<b>raw</b>\n```\n---");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "list", "list", "quote", "code", "hr"]);
    // One paragraph, but the line break typed inside it stays (QA S9-19).
    expect(b[1]).toEqual({ t: "p", c: [{ t: "text", v: "First line" }, { t: "br" }, { t: "text", v: "same para." }] });
    expect(b[2]).toMatchObject({ ordered: false, items: [{ checked: true }, { checked: false }] });
    expect(b[3]).toMatchObject({ ordered: true, items: [{ checked: null }, { checked: null }] });
    expect(b[5]).toEqual({ t: "code", v: "<b>raw</b>" });
  });

  it("reads bold, italic, code and links, and keeps unsafe links as text", () => {
    expect(parseInline("**Bold** and *it* and `x<y`")).toEqual([
      { t: "strong", c: [{ t: "text", v: "Bold" }] },
      { t: "text", v: " and " },
      { t: "em", c: [{ t: "text", v: "it" }] },
      { t: "text", v: " and " },
      { t: "code", v: "x<y" },
    ]);
    expect(parseInline("[Drive](https://drive.google.com/x) [bad](javascript:alert(1))")).toEqual([
      { t: "link", href: "https://drive.google.com/x", c: [{ t: "text", v: "Drive" }] },
      { t: "text", v: " " },
      { t: "text", v: "bad" },
    ]);
    // Brackets inside an address stay part of it, and nothing stray is left (test report L4).
    expect(parseInline("[Wiki](https://en.wikipedia.org/wiki/Kerala_(state)) next")).toEqual([
      { t: "link", href: "https://en.wikipedia.org/wiki/Kerala_(state)", c: [{ t: "text", v: "Wiki" }] },
      { t: "text", v: " next" },
    ]);
    expect(parseInline("(see https://en.wikipedia.org/wiki/Kerala_(state))")).toEqual([
      { t: "text", v: "(see " },
      { t: "link", href: "https://en.wikipedia.org/wiki/Kerala_(state)", c: [{ t: "text", v: "https://en.wikipedia.org/wiki/Kerala_(state)" }] },
      { t: "text", v: ")" },
    ]);
    expect(parseInline("see https://oppllo.com.")).toEqual([{ t: "text", v: "see " }, { t: "link", href: "https://oppllo.com", c: [{ t: "text", v: "https://oppllo.com" }] }, { t: "text", v: "." }]);
    expect(parseInline("snake_case_name")).toEqual([{ t: "text", v: "snake_case_name" }]);
  });

  it("allows only web, mail and in-app links", () => {
    expect(safeHref("/tasks/1")).toBe("/tasks/1");
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
});

describe("markdown speed", () => {
  it("stays fast on long text full of unclosed markers", () => {
    for (const unit of ["*a ", "_a ", "[a ", "`a ", "**a ", "https://x "]) {
      const src = unit.repeat(Math.ceil(19_000 / unit.length));
      const t0 = performance.now();
      parseMarkdown(src);
      expect(performance.now() - t0).toBeLessThan(300);
    }
  });

  it("keeps protocol-relative and backslash links out", () => {
    expect(parseInline("[x](/\\evil.com)")).toEqual([{ t: "text", v: "x" }]);
  });
});
