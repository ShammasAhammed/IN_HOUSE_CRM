import { describe, expect, it } from "vitest";
import { checkAnswers, questionsSchema, taskFromAnswers, type Question } from "@/services/rules/request-forms";

const qs: Question[] = [
  { id: "qwhat", label: "What do you need?", kind: "short", required: true, options: [], isTitle: true },
  { id: "qtype", label: "Type", kind: "select", required: true, options: ["Poster", "Reel"], isTitle: false },
  { id: "qby", label: "Needed by", kind: "date", required: false, options: [], isTitle: false },
  { id: "qref", label: "Reference", kind: "link", required: false, options: [], isTitle: false },
  { id: "qmail", label: "Your email", kind: "email", required: false, options: [], isTitle: false },
];

describe("request form questions", () => {
  it("refuses forms without questions, two title questions, or a dropdown without choices", () => {
    expect(questionsSchema.safeParse([]).success).toBe(false);
    expect(questionsSchema.safeParse([qs[0], { ...qs[0], id: "qtwo" }]).success).toBe(false);
    expect(questionsSchema.safeParse([{ ...qs[1], options: ["One"] }]).success).toBe(false);
    expect(questionsSchema.safeParse(qs).success).toBe(true);
  });
});

describe("checkAnswers", () => {
  it("needs required answers and checks each kind", () => {
    expect(checkAnswers(qs, { qwhat: " ", qtype: "Banner", qby: "soon", qref: "http://x.com", qmail: "nope" })).toEqual({
      ok: false,
      errors: { qwhat: ["Please answer this."], qtype: ["Pick one of the choices."], qby: ["Pick a date."], qref: ["Paste a link starting with https://"], qmail: ["Type an email address."] },
    });
    expect(checkAnswers(qs, { qwhat: "Diwali poster", qtype: "Poster", qby: "2026-10-20", extra: "ignored" })).toEqual({ ok: true, answers: { qwhat: "Diwali poster", qtype: "Poster", qby: "2026-10-20" } });
  });
});

describe("taskFromAnswers", () => {
  it("titles the task from the title question, lists answers, and takes a 'needed by' date as due", () => {
    const t = taskFromAnswers("Design request", qs, { qwhat: "Diwali poster", qtype: "Poster", qby: "2026-10-20" }, "Anjali Nair");
    expect(t.title).toBe("Design request: Diwali poster");
    expect(t.dueDate).toBe("2026-10-20");
    expect(t.description).toContain('Request from Anjali Nair through the "Design request" form.');
    expect(t.description).toContain("Type\nPoster");
    expect(taskFromAnswers("Design request", qs.slice(1), { qtype: "Reel" }, "Zenith (outside)").title).toBe("Design request from Zenith (outside)");
  });
});
