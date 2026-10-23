// The decision helper's read of a new lead (Stage 12.3): a hint for the sales team, never a change to the lead. Pure.
// What it may read: the institution and its details, where the lead came from, the form answers and the notes. Never
// the person's name, phone or email (phones and emails inside free text are blanked too).
import type { DecisionAnswer, DecisionQuestion, LeadAiScore } from "@/repositories";
import type { LeadScore } from "@/lib/types";
import { stripContacts } from "./ai-router";

type LeadFacts = {
  institution: string | null;
  contactRole: string | null;
  district: string | null;
  segment: string | null;
  problem: string | null;
  timeline: string | null;
  seats: number | null;
  channel: string | null;
  origin: string | null;
  campaign: string | null;
  answers: Record<string, string> | null;
};

/** The text the helper judges: facts only, contacts blanked, notes last. */
export function leadState(l: LeadFacts, notes: readonly string[]): string {
  const facts: Record<string, unknown> = {
    institution: l.institution,
    "contact's role": l.contactRole,
    district: l.district,
    segment: l.segment,
    "what they need": l.problem,
    timeline: l.timeline,
    seats: l.seats,
    source: [l.origin, l.channel, l.campaign].filter(Boolean).join(" / ") || null,
    "form answers": l.answers && Object.keys(l.answers).length ? l.answers : null,
    notes: notes.length ? notes.slice(0, 10) : null,
  };
  const kept = Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== null && v !== ""));
  return stripContacts(JSON.stringify(kept)).slice(0, 4000);
}

export const LEAD_QUESTIONS: DecisionQuestion[] = [
  {
    id: "label",
    kind: "choice",
    instructions: "How ready is this education institution to hire an admissions-marketing agency (Meta and Google ads, social media, landing pages)?",
    options: { hot: "a clear need, budget or timeline, and a decision-maker", warm: "interested but missing a timeline, budget or decision-maker", cold: "little sign of a need or of buying soon" },
  },
  {
    id: "score",
    kind: "score",
    instructions: "How good a fit is this lead for the agency?",
    levels: ["no fit", "very poor", "poor", "weak", "uncertain", "fair", "good", "strong", "very strong", "ideal"],
  },
  { id: "junk", kind: "yesno", instructions: "The lead looks like junk: spam, a test, a student or job seeker, or nonsense." },
];

/** The helper's answers as a hint to keep, or null when they don't fit. */
export function readLeadScore(leadId: string, a: Record<string, DecisionAnswer>, by: { provider: string; model: string }, at: Date): LeadAiScore | null {
  const label = a.label?.value;
  const score = a.score?.value;
  const junk = a.junk?.value;
  if ((label !== "hot" && label !== "warm" && label !== "cold") || typeof score !== "number" || typeof junk !== "boolean") return null;
  return { leadId, label: label as LeadScore, score: Math.max(1, Math.min(10, Math.round(score))), junk, surePercent: Math.round((a.label?.probability ?? 0) * 100), provider: by.provider, model: by.model, scoredAt: at };
}
