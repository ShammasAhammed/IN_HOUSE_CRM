import { describe, expect, it } from "vitest";
import { DEFAULT_LETTERS, fillLetter, letterRef, missingFields, suggestLetterKind } from "@/services/rules/letters";

describe("letters", () => {
  it("suggests an offer for someone still here and lists empty fill-ins (test report L15)", () => {
    expect(suggestLetterKind({ joinDate: "2026-10-16", endDate: null, employmentType: "full_time" }, "2026-10-16")).toBe("offer");
    expect(suggestLetterKind({ joinDate: "2025-01-01", endDate: "2026-10-01", employmentType: "full_time" }, "2026-10-16")).toBe("experience");
    expect(suggestLetterKind({ joinDate: "2026-07-01", endDate: "2026-10-01", employmentType: "intern" }, "2026-10-16")).toBe("internship_certificate");
    expect(missingFields(DEFAULT_LETTERS.experience.body, { name: "A", company: "Oppllo Digital", job_title: "Designer", join_date: "1 Jan", end_date: null, department: " " })).toEqual(["department", "end_date"]);
  });

  it("fills every placeholder, and shows a dash for missing ones", () => {
    const out = fillLetter(DEFAULT_LETTERS.internship_certificate.body, { name: "Hiba Nasrin", company: "Oppllo Digital", department: "Design", join_date: "1 Jul 2026", end_date: "", worked_on: "Reels for Zenith" });
    expect(out).toContain("Hiba Nasrin worked with Oppllo Digital as an intern in the Design team from 1 Jul 2026 to —.");
    expect(out).not.toMatch(/\{\{/);
    expect(fillLetter("Hi {{ name }} {{unknown}}", { name: "A" })).toBe("Hi A —");
  });
  it("numbers letters within the year", () => {
    expect(letterRef(2026, 0)).toBe("OPD/2026/001");
    expect(letterRef(2026, 41)).toBe("OPD/2026/042");
  });
});
