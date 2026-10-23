// Letters HR issues from a person's record (HR slice 3). Pure, unit-tested. Templates use {{placeholders}}; HR edits
// them in People → Letters, these are the defaults until they do.
import type { LetterKind } from "@/lib/types";

export const LETTER_FIELDS = ["name", "job_title", "department", "join_date", "end_date", "today", "batch", "mentor", "worked_on", "company"] as const;
export type LetterField = (typeof LETTER_FIELDS)[number];

export type LetterTemplate = { title: string; body: string };

export const DEFAULT_LETTERS: Record<LetterKind, LetterTemplate> = {
  offer: {
    title: "Offer of employment",
    body: `Dear {{name}},

We are pleased to offer you the position of {{job_title}} in our {{department}} team at {{company}}, starting on {{join_date}}.

Your role, responsibilities and terms were discussed with you, and the detailed terms are in the agreement shared with this letter.

Please confirm your acceptance by signing and returning a copy of this letter.

We look forward to working with you.`,
  },
  internship_certificate: {
    title: "Internship certificate",
    body: `This is to certify that {{name}} worked with {{company}} as an intern in the {{department}} team from {{join_date}} to {{end_date}}.

During the internship, {{name}} worked on:
{{worked_on}}

We thank {{name}} for their contribution and wish them every success.`,
  },
  experience: {
    title: "Experience letter",
    body: `This is to certify that {{name}} worked with {{company}} as {{job_title}} in the {{department}} team from {{join_date}} to {{end_date}}.

During this time {{name}} was responsible for their work with diligence and care. We wish them well in their future work.`,
  },
  relieving: {
    title: "Relieving letter",
    body: `Dear {{name}},

This is to confirm that you have been relieved of your duties as {{job_title}} at {{company}} with effect from {{end_date}}, after completing the handover of your work.

All company property and access have been returned. We thank you for your contribution and wish you the very best.`,
  },
};

/** Puts the person's details into a template. Unknown or empty fields become a visible "—", never "{{x}}". */
export function fillLetter(text: string, values: Partial<Record<LetterField, string | null | undefined>>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => {
    const v = (values as Record<string, string | null | undefined>)[key];
    return v && v.trim() ? v.trim() : "—";
  });
}

/** How each fill-in reads in a warning to HR. */
export const LETTER_FIELD_LABELS: Record<LetterField, string> = {
  name: "name",
  job_title: "job title",
  department: "team",
  join_date: "joining date",
  end_date: "last working day",
  today: "date",
  batch: "intern batch",
  mentor: "mentor",
  worked_on: "what they worked on",
  company: "company name",
};

/** The template's fill-ins that have nothing to put in, so HR can fix them before issuing (test report L15). */
export function missingFields(text: string, values: Partial<Record<LetterField, string | null | undefined>>): LetterField[] {
  const out = new Set<LetterField>();
  for (const [, key] of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    const v = (values as Record<string, string | null | undefined>)[key!];
    if (!v || !v.trim()) out.add(key as LetterField);
  }
  return [...out];
}

/** The letter HR most likely wants: an offer for someone new, a certificate for an intern who is done, else experience. */
export function suggestLetterKind(p: { joinDate: string; endDate: string | null; employmentType: string }, today: string): LetterKind {
  if (p.endDate && p.endDate <= today) return p.employmentType === "intern" ? "internship_certificate" : "experience";
  return "offer";
}

/** "OPD/2026/007": the next reference number in the year. */
export function letterRef(year: number, issuedThisYear: number): string {
  return `OPD/${year}/${String(issuedThisYear + 1).padStart(3, "0")}`;
}
