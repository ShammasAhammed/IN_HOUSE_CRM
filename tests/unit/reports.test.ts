// Monthly client reports (Stage 11.4): the facts the AI sees and splitting its answer.
import { describe, expect, it } from "vitest";
import { factLines, parseReportSections, reportQuestion, type ReportFacts } from "@/services/rules/reports";

const facts: ReportFacts = {
  month: "2026-09-01",
  clientName: "Zenith IAS Academy",
  results: { leads: 120, spendPaise: 4_500_000, callsBooked: 30, admissions: 6, targetLeads: 200, targetAdmissions: null, costPerLeadPaise: 37_500, costPerAdmissionPaise: 750_000, leadToAdmissionPercent: 5 },
  ads: null,
  deliverables: [{ name: "Reels", delivered: 5, target: 8 }],
  tasksDone: { count: 2, titles: ["Open day post", "Topper reel"] },
  creativesApproved: 4,
  postsPublished: 9,
  internal: { minutesLogged: 3750, burnPercent: 112 },
  gatheredAt: "2026-10-18T06:30:00.000Z",
};

describe("factLines and reportQuestion", () => {
  it("give the client-facing numbers and never the internal ones", () => {
    const lines = factLines(facts);
    expect(lines).toContain("Leads: 120 (target 200)");
    expect(lines).toContain("Admissions: 6");
    expect(lines).toContain("Ad spend: ₹45,000");
    expect(lines).toContain("Reels: 5 of 8 delivered");
    expect(lines).toContain("Tasks completed: 2 (including: Open day post; Topper reel)");
    const q = reportQuestion(facts, "Warm, Malayalam first");
    expect(q).toContain("Tone of voice: Warm, Malayalam first");
    expect(q).not.toMatch(/62h|112|3750|hours/);
  });

  it("say 'not recorded' for missing results rather than zero", () => {
    const lines = factLines({ ...facts, results: { ...facts.results!, admissions: null, spendPaise: null, costPerLeadPaise: null } });
    expect(lines).toContain("Admissions: not recorded");
    expect(lines.some((l) => l.startsWith("Ad spend"))).toBe(false);
  });
});

describe("parseReportSections", () => {
  it("splits the three labelled parts in any order and with markdown around the labels", () => {
    expect(parseReportSections("SUMMARY: A strong month.\n\nWENT WELL:\n- Reels\n- Calls\n\nNEXT:\n- Open day")).toEqual({ summary: "A strong month.", wentWell: "- Reels\n- Calls", nextSteps: "- Open day" });
    expect(parseReportSections("**Next steps:**\n- More reels\n## Summary\nGood.\n**Went well:**\n- Leads")).toEqual({ summary: "Good.", wentWell: "- Leads", nextSteps: "- More reels" });
  });

  it("puts unlabelled text in the summary to be edited", () => {
    expect(parseReportSections("  Just one paragraph.  ")).toEqual({ summary: "Just one paragraph.", wentWell: "", nextSteps: "" });
  });
});
