// The personal assistant's rules (Stage 12.4): which words can make a promise, and the due day worked out in code.
import { describe, expect, it } from "vitest";
import { dueOn, mayBePromise } from "@/services/rules/assistant";
import { DEFAULT_WORK_WEEK } from "@/services/rules/working-days";

describe("promises", () => {
  it("only words that can make a promise reach the AI", () => {
    expect(mayBePromise("I'll send the poster by Friday")).toBe(true);
    expect(mayBePromise("will share the reel tomorrow")).toBe(true);
    expect(mayBePromise("നാളെ അയക്കാം")).toBe(true);
    expect(mayBePromise("poster nale ayakkam")).toBe(true);
    expect(mayBePromise("Looks good, thanks!")).toBe(false);
    expect(mayBePromise("ok")).toBe(false);
  });

  it("works out the day in code, moving off non-working days", () => {
    const wed = "2026-10-21";
    const week = DEFAULT_WORK_WEEK; // Monday–Saturday, the second Saturday off
    expect(dueOn("today", wed, week)).toBe(wed);
    expect(dueOn("tomorrow", wed, week)).toBe("2026-10-22");
    expect(dueOn("friday", wed, week)).toBe("2026-10-23");
    expect(dueOn("wednesday", wed, week)).toBe(wed);
    expect(dueOn("monday", wed, week)).toBe("2026-10-26");
    expect(dueOn("this_week", wed, week)).toBe("2026-10-23");
    expect(dueOn("next_week", wed, week)).toBe("2026-10-26");
    expect(dueOn("end_of_month", wed, week)).toBe("2026-10-31");
    expect(dueOn("none", wed, week)).toBeNull();
    // "Sunday" lands on a day off: the next working day. A holiday too.
    expect(dueOn("sunday", wed, week)).toBe("2026-10-26");
    expect(dueOn("tomorrow", wed, week, new Set(["2026-10-22"]))).toBe("2026-10-23");
  });
});
