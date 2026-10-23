import { describe, expect, it } from "vitest";
import { formatDate, formatMinutes, formatRupees, countOf, initials, shortNames, parseHoursToMinutes, parseRupeesToPaise } from "@/lib/format";
import { fail, ok } from "@/lib/result";
import { isId, newId } from "@/lib/id";

describe("format", () => {
  it("reads hours the way people type them (test report M3)", () => {
    for (const [typed, minutes] of [["1.5", 90], [".5", 30], ["2", 120], ["1:30", 90], ["0:45", 45], ["1h30", 90], ["1h 30m", 90], ["1 h 30 min", 90], ["2h", 120], ["1.5 hrs", 90], ["90m", 90], ["45 min", 45]] as const) {
      expect(parseHoursToMinutes(typed), typed).toBe(minutes);
    }
    for (const typed of ["abc", "1:75", "-1", "1,5", "h", "1.5.2", ""]) expect(parseHoursToMinutes(typed), typed).toBeNull();
  });

  it("formats rupees from integer paise in Indian grouping", () => {
    expect(formatRupees(12_500_000)).toBe("₹1,25,000");
    expect(formatRupees(12_550)).toBe("₹125.50");
    expect(() => formatRupees(10.5)).toThrow();
  });

  it("parses typed rupees into paise without floats", () => {
    expect(parseRupeesToPaise("1,25,000")).toBe(12_500_000);
    expect(parseRupeesToPaise("₹ 0.1")).toBe(10);
    expect(parseRupeesToPaise("19.99")).toBe(1999);
    expect(parseRupeesToPaise("-5")).toBeNull();
    expect(parseRupeesToPaise("1.234")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
  });

  it("formats durations and dates", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatDate("2026-10-14")).toBe("14 Oct 2026");
  });

  it("puts counts in the right number (QA S9-15)", () => {
    expect(countOf(1, "lead")).toBe("1 lead");
    expect(countOf(0, "lead")).toBe("0 leads");
    expect(countOf(12400, "person", "people")).toBe("12,400 people");
  });

  it("uses full names only where first names clash (QA S9-09)", () => {
    expect(shortNames(["Shammas Ahammed", "rinsha lerning", "Rinsha K", "TEST Designer B"])).toEqual(["Shammas", "rinsha lerning", "Rinsha K", "TEST"]);
  });

  it("makes initials", () => {
    expect(initials("Ahammed Shammas P")).toBe("AP");
    expect(initials("TEST <b>Gamma</b> & Co")).toBe("TC");
    expect(initials("(Zenith) IAS")).toBe("ZI");
    expect(initials("Neha")).toBe("N");
  });
});

describe("result and id", () => {
  it("builds results", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(fail("invalid", "Bad")).toEqual({ ok: false, error: { code: "invalid", message: "Bad" } });
  });

  it("makes time-ordered UUIDs", () => {
    const a = newId();
    const b = newId();
    expect(isId(a)).toBe(true);
    expect(a < b).toBe(true);
    expect(isId("nope")).toBe(false);
  });
});

describe("validation messages (QA S9-06)", () => {
  it("say the limit instead of a vague message", async () => {
    const { z } = await import("zod");
    const { parse } = await import("@/lib/validation/common");
    const schema = z.object({ name: z.string().max(120), tags: z.array(z.string()).max(3), hours: z.number().max(16) });
    const r = parse(schema, { name: "x".repeat(330), tags: ["a", "b", "c", "d"], hours: 30 });
    expect(!r.ok && r.error.fieldErrors).toEqual({ name: ["Keep it to 120 characters or fewer."], tags: ["Pick at most 3."], hours: ["Must be 16 or less."] });
    // Wrapped in "empty or a number", the limit still shows (leave quota days).
    const quota = parse(z.object({ days: z.union([z.literal(""), z.coerce.number().min(0).max(60)]) }), { days: "90" });
    expect(!quota.ok && quota.error.fieldErrors).toEqual({ days: ["Must be 60 or less."] });
  });
});

