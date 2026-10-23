// AI in Docs and meetings (Stage 13.4): write, shorten or translate (Malayalam goes through the router to Gemini or
// ChatGPT), a meeting summary, suggested action items, and notes from a meeting transcript. Every call goes through
// ai.ask() with its own feature name (logged, priced, inside the monthly limit); without keys each one says the AI
// isn't on yet and everything else in Docs works the same. The AI only suggests: the person puts the text in the page.
import { z } from "zod";
import { invalid, notFound, ok, type Result } from "@/lib/result";
import type { AiFeature } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { DataStore } from "@/repositories";
import type { AiService } from "./ai";
import type { DocService } from "./docs";
import type { MeetingService } from "./meetings";
import type { Actor } from "./permissions";
import { levelBlocks } from "./spaces";

const MAX_TEXT = 20_000;
/** A consent record covers a recording when its purpose says so (11.7 consent records, subject "person"). */
const RECORDING = /record|transcri/i;

const writeSchema = z.object({
  docId: z.uuid(),
  mode: z.enum(["write", "shorten", "translate"]),
  text: z.string().max(MAX_TEXT, { message: "Pick a shorter part of the page." }).default(""),
  /** For "write": what to write. For "translate": "ml" (Malayalam) or "en". */
  ask: z.string().trim().max(500).default(""),
});

const SYSTEM: Record<"write" | "shorten" | "translate", string> = {
  write: "You write for an Indian education-marketing agency's internal docs. Plain, short sentences. Markdown: headings, lists, checklists. Reply with the text only.",
  shorten: "Shorten the text to about half, keeping every fact, number, name and decision. Keep its Markdown. Reply with the text only.",
  translate: "Translate the text, keeping its Markdown, names, numbers and @mentions exactly. Reply with the translation only.",
};

export function createDocAiService(deps: { store: DataStore; ai: Pick<AiService, "ask">; docs: Pick<DocService, "get">; meetings: Pick<MeetingService, "get"> }) {
  const { store, ai } = deps;

  async function ask(actor: Actor, feature: AiFeature, system: string, text: string, maxOutputTokens = 1500): Promise<Result<{ text: string }>> {
    const r = await ai.ask(actor, feature, { system, turns: [{ role: "user", text }], tools: [], effort: "low", maxOutputTokens, maxSteps: 1, maxCostMicroUsd: 100_000 });
    return r.ok ? ok({ text: r.value.text.trim() }) : r;
  }

  /** The page, when this person may edit it (the AI writes only for people who could write it themselves). */
  async function editable(actor: Actor, docId: string) {
    const d = await deps.docs.get(actor, docId);
    if (!d.ok) return d;
    if (d.value.clientId) { const blocked = await levelBlocks(store, actor, d.value.clientId, "edit"); if (blocked) return blocked; }
    return d;
  }

  return {
    /** Write, shorten or translate a selection; returns the suggestion for the person to put in. */
    async write(actor: Actor, raw: unknown): Promise<Result<{ text: string }>> {
      const parsed = parse(writeSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const d = await editable(actor, v.docId);
      if (!d.ok) return d;
      if (v.mode === "write") {
        if (!v.ask) return invalid("Say what to write.");
        return ask(actor, "doc_write", SYSTEM.write, `Page: ${d.value.title}\n\n${v.text ? `Around this text:\n${v.text}\n\n` : ""}Write: ${v.ask}`);
      }
      if (!v.text.trim()) return invalid("Select some text first.");
      if (v.mode === "shorten") return ask(actor, "doc_shorten", SYSTEM.shorten, v.text);
      // "Malayalam" in the question sends it to a model that writes Malayalam (D-12.3b).
      return ask(actor, "doc_translate", SYSTEM.translate, `${v.ask === "en" ? "Translate into English." : "Translate into Malayalam."}\n\n${v.text}`);
    },

    /** A short summary of a meeting page: decisions, open items, risks. */
    async summary(actor: Actor, meetingId: string): Promise<Result<{ text: string }>> {
      const m = await deps.meetings.get(actor, meetingId);
      if (!m.ok) return m;
      return ask(actor, "meeting_summary", "Summarise this meeting page for the team in at most 8 bullet points: what was decided, who does what by when, and anything at risk. Plain words. Reply with the bullets only.", `${m.value.title} (${m.value.meetingDate})\n\n${m.value.body}`, 800);
    },

    /** Action items the AI finds in the notes, as checklist lines to add (Approve still makes the tasks). */
    async suggestActions(actor: Actor, meetingId: string): Promise<Result<{ items: string[] }>> {
      const m = await deps.meetings.get(actor, meetingId);
      if (!m.ok) return m;
      const people = m.value.people.map((p) => p.name).join(", ") || "none listed";
      const r = await ask(actor, "meeting_actions", `List the follow-up actions in these meeting notes, one per line, as "- [ ] @Name what by when". Only names from: ${people}. Skip ones already under "Action items". Reply with the lines only.`, m.value.body, 600);
      if (!r.ok) return r;
      return ok({ items: r.value.text.split("\n").map((l) => l.trim()).filter((l) => /^- \[ \] /.test(l)).slice(0, 20) });
    },

    /**
     * Notes from a meeting transcript (typed, dictated, or exported from a recorder). Only when every attendee has a
     * live recording consent in the consent records; the transcript itself isn't stored.
     */
    async notesFromTranscript(actor: Actor, raw: unknown): Promise<Result<{ text: string }>> {
      const parsed = parse(z.object({ meetingId: z.uuid(), transcript: z.string().trim().min(20, { message: "Paste the transcript." }).max(60_000, { message: "That transcript is too long; split it." }) }), raw);
      if (!parsed.ok) return parsed;
      const m = await deps.meetings.get(actor, parsed.value.meetingId);
      if (!m.ok) return notFound("That meeting");
      const missing: string[] = [];
      for (const p of m.value.people) {
        const records = await store.consent.list("person", p.id);
        if (!records.some((c) => !c.withdrawnAt && RECORDING.test(c.purpose))) missing.push(p.name);
      }
      if (!m.value.people.length) return invalid("Add the attendees first: notes from a recording need everyone's consent.");
      if (missing.length) return invalid(`Recording consent isn't on record for ${missing.join(", ")}. Record it in their consent records (purpose: meeting recording) first.`);
      return ask(actor, "meeting_transcript", "Turn this meeting transcript into notes under these headings: Notes, Decisions, Action items (as \"- [ ] @Name what by when\"). Keep it short. Reply with Markdown only.", parsed.value.transcript, 1500);
    },
  };
}

export type DocAiService = ReturnType<typeof createDocAiService>;
