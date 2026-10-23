// Client files (Stage 13.0): reading pasted links, ranges, the size cap, artifact checks and text.
import { describe, expect, it } from "vitest";
import { artifactFormat, clip, htmlText, isNamedRange, isText, MAX_CELLS, parseLink, rangeTab, tabRange } from "@/services/rules/client-links";

describe("client file rules", () => {
  it("knows Google files, Claude artifacts and other links", () => {
    expect(parseLink("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0")).toEqual({ kind: "google", googleType: "sheet", googleId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" });
    expect(parseLink("https://docs.google.com/document/d/1abcDEFghiJKLmno/edit")).toMatchObject({ googleType: "doc" });
    expect(parseLink("https://docs.google.com/presentation/d/1abcDEFghiJKLmno/edit")).toMatchObject({ googleType: "slides" });
    expect(parseLink("https://drive.google.com/file/d/1abcDEFghiJKLmno/view")).toMatchObject({ googleType: "file" });
    expect(parseLink("https://claude.ai/public/artifacts/1234-abcd")).toEqual({ kind: "artifact" });
    expect(parseLink("https://www.canva.com/design/x")).toEqual({ kind: "other" });
    expect(parseLink("javascript:alert(1)")).toBeNull();
    expect(parseLink("not a link")).toBeNull();
  });

  it("reads tabs in parts and only named or one-tab ranges, with a cap", () => {
    expect(tabRange("Media plan", 201)).toBe("'Media plan'!A201:Z400");
    expect(tabRange("Ravi's tab", 1)).toBe("'Ravi''s tab'!A1:Z200");
    expect([isNamedRange("PlannedBudget"), isNamedRange("A1:B2"), isNamedRange("x; drop")]).toEqual([true, false, false]);
    expect([rangeTab("'Media plan'!A1:F40"), rangeTab("Budget!B2"), rangeTab("A1:F40"), rangeTab("'X'!A1:F40;drop")]).toEqual(["Media plan", "Budget", null, null]);
    const big = Array.from({ length: 300 }, () => Array.from({ length: 26 }, () => "1"));
    const c = clip(big);
    expect([c.cut, c.rows.length * 26 <= MAX_CELLS]).toEqual([true, true]);
  });

  it("checks artifact pages and reads their text", () => {
    expect([artifactFormat("guide.HTML"), artifactFormat("notes.md"), artifactFormat("run.exe")]).toEqual(["html", "md", null]);
    expect(isText(new TextEncoder().encode("<h1>Setup</h1>"))).toBe(true);
    expect(isText(new Uint8Array([0x4d, 0x5a, 0, 1]))).toBe(false);
    expect(htmlText("<style>p{}</style><h1>Setup guide</h1><script>alert(1)</script><p>Step 1 &amp; 2</p>")).toBe("Setup guide\nStep 1 & 2");
  });
});
