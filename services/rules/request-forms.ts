// Request forms (Stage 9b.5, ClickUp parity): questions a lead sets up, answers checked here, and the task each
// submission becomes. Pure, unit-tested.
import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

export const QUESTION_KINDS = ["short", "long", "date", "select", "link", "email", "phone"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = { short: "Short answer", long: "Paragraph", date: "Date", select: "Dropdown", link: "Link", email: "Email", phone: "Phone" };

export const questionSchema = z.object({
  id: z.string().regex(/^q[a-z0-9]{1,12}$/),
  label: z.string().trim().min(1, { message: "Every question needs a label." }).max(120),
  kind: z.enum(QUESTION_KINDS),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  /** This answer becomes the task's title (one question at most). */
  isTitle: z.boolean().default(false),
});
export type Question = z.infer<typeof questionSchema>;

export const questionsSchema = z
  .array(questionSchema)
  .min(1, { message: "Add at least one question." })
  .max(30, { message: "Up to 30 questions." })
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { message: "Two questions have the same id." })
  .refine((qs) => qs.filter((q) => q.isTitle).length <= 1, { message: "Only one question can be the task title." })
  .refine((qs) => qs.every((q) => q.kind !== "select" || q.options.length >= 2), { message: "Give each dropdown at least two choices." });

const MAX = { short: 200, long: 5000, link: 1000, email: 200, phone: 20, date: 10, select: 60 } as const;

/** Checks answers against the questions: required ones present, each the right shape. */
export function checkAnswers(questions: readonly Question[], raw: Record<string, unknown>): { ok: true; answers: Record<string, string> } | { ok: false; errors: Record<string, string[]> } {
  const answers: Record<string, string> = {};
  const errors: Record<string, string[]> = {};
  for (const q of questions) {
    const v = typeof raw[q.id] === "string" ? (raw[q.id] as string).trim() : "";
    if (!v) {
      if (q.required) errors[q.id] = ["Please answer this."];
      continue;
    }
    const bad = (m: string) => (errors[q.id] = [m]);
    if (v.length > MAX[q.kind]) bad(`Keep it under ${MAX[q.kind]} characters.`);
    else if (q.kind === "date" && !isIsoDate(v)) bad("Pick a date.");
    else if (q.kind === "select" && !q.options.includes(v)) bad("Pick one of the choices.");
    else if (q.kind === "link" && !(URL.canParse(v) && new URL(v).protocol === "https:")) bad("Paste a link starting with https://");
    else if (q.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) bad("Type an email address.");
    else if (q.kind === "phone" && !/^\+?[\d\s-]{7,20}$/.test(v)) bad("Type a phone number.");
    else answers[q.id] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/** The task a submission becomes: title from the title question (or the form's name), the answers as its notes. */
export function taskFromAnswers(formName: string, questions: readonly Question[], answers: Record<string, string>, from: string): { title: string; description: string; dueDate: string | null } {
  const titleQ = questions.find((q) => q.isTitle && answers[q.id]);
  const title = (titleQ ? `${formName}: ${answers[titleQ.id]}` : `${formName} from ${from}`).replace(/\s+/g, " ").slice(0, 200);
  const lines = questions.filter((q) => answers[q.id]).map((q) => `${q.label}\n${answers[q.id]}`);
  const dueQ = questions.find((q) => q.kind === "date" && /due|deadline|need.*by|by when/i.test(q.label) && answers[q.id]);
  return { title, description: [`Request from ${from} through the "${formName}" form.`, ...lines].join("\n\n").slice(0, 10000), dueDate: dueQ ? answers[dueQ.id]! : null };
}
