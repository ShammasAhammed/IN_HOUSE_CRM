import { describe, expect, it } from "vitest";
import { dayFill, isTimeLocked, timeLockedOn } from "@/services/rules/time";

describe("time lock (D34)", () => {
  it("keeps a month open until the 5th of the next month", () => {
    expect(timeLockedOn("2026-09-14")).toBe("2026-10-06");
    expect(isTimeLocked("2026-09-30", "2026-10-05")).toBe(false);
    expect(isTimeLocked("2026-09-30", "2026-10-06")).toBe(true);
    expect(isTimeLocked("2026-10-01", "2026-10-31")).toBe(false);
  });

  it("handles the year end", () => {
    expect(timeLockedOn("2026-12-31")).toBe("2027-01-06");
  });
});

describe("filling the week (D72)", () => {
  const day = (date: string, loggedMinutes: number, expectedMinutes = 400) => dayFill({ date, today: "2026-10-16", expectedMinutes, loggedMinutes });

  it("flags past working days that are empty or under three quarters", () => {
    expect(day("2026-10-12", 0)).toBe("empty");
    expect(day("2026-10-13", 299)).toBe("short");
    expect(day("2026-10-14", 300)).toBe("ok");
    expect(day("2026-10-15", 480)).toBe("ok");
  });

  it("never flags days off, today or later", () => {
    expect(day("2026-10-12", 0, 0)).toBe("off");
    expect(day("2026-10-16", 0)).toBe("upcoming");
    expect(day("2026-10-16", 400)).toBe("ok");
    expect(day("2026-10-17", 0)).toBe("upcoming");
  });
});
