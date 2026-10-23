// Client knowledge base (Stage 11.2): reading do's and don'ts as points, and matching a search.
import { describe, expect, it } from "vitest";
import { matchesQuery, points } from "@/services/rules/knowledge";

describe("points", () => {
  it("makes one point per line, without the marks people type in front", () => {
    expect(points("- Use the college crest\n• Always show the NAAC grade\n\n1. Malayalam first\n2) English below\n  plain line  ")).toEqual([
      "Use the college crest",
      "Always show the NAAC grade",
      "Malayalam first",
      "English below",
      "plain line",
    ]);
    expect(points("")).toEqual([]);
    // A hyphen inside a line stays.
    expect(points("Self-financing seats")).toEqual(["Self-financing seats"]);
  });
});

describe("matchesQuery", () => {
  it("needs every word, in any order and case, across the texts", () => {
    expect(matchesQuery(["NEET repeaters batch", "Reels with toppers worked"], "toppers neet")).toBe(true);
    expect(matchesQuery(["NEET repeaters batch", null], "neet fees")).toBe(false);
    expect(matchesQuery(["Anything"], "   ")).toBe(true);
    expect(matchesQuery([null, null], "neet")).toBe(false);
  });

  it("finds Malayalam words", () => {
    expect(matchesQuery(["പ്രവേശനം ആരംഭിച്ചു"], "പ്രവേശനം")).toBe(true);
  });
});
