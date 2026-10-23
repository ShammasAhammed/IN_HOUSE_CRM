// Lead hints from the decision helper (Stage 12.3): hot, warm or cold, a 1–10 fit and "looks like junk", shown to the
// sales team beside the lead. A hint only: it never changes the lead's own score, stage, owner or anything else.
// New leads are read when someone with leads access opens the Leads list or a lead (after the page is sent), as that
// person, inside the AI limit; the owner can switch it off in Settings → AI.
import { isId } from "@/lib/id";
import { forbidden, ok, type Result } from "@/lib/result";
import type { DataStore, LeadAiScore } from "@/repositories";
import type { AiService } from "./ai";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { LEAD_QUESTIONS, leadState, readLeadScore } from "./rules/lead-score";

/** How far back a lead still counts as new, and how many are read at a time. */
const NEW_DAYS = 7;
const BATCH = 5;

export function createLeadScoreService(deps: { store: DataStore; clock: Clock; ai: Pick<AiService, "decide" | "helperOn"> }) {
  const { store, clock, ai } = deps;

  async function score(actor: Actor, leadId: string): Promise<LeadAiScore | null> {
    const lead = await store.leads.find(leadId);
    if (!lead) return null;
    const notes = (await store.leads.activities(lead.id)).filter((a) => a.type === "note" && a.text).map((a) => a.text);
    const decided = await ai.decide(actor, "lead_score", leadState(lead, notes), LEAD_QUESTIONS);
    const s = decided ? readLeadScore(lead.id, decided.answers, decided, clock.now()) : null;
    if (s) await store.leadAiScores.save(s);
    return s;
  }

  return {
    /** The hints for these leads (only for people who see leads). */
    async forLeads(actor: Actor, leadIds: readonly string[]): Promise<Map<string, LeadAiScore>> {
      if (!can(actor, "leads.read")) return new Map();
      return new Map((await store.leadAiScores.forLeads(leadIds.filter(isId))).map((s) => [s.leadId, s]));
    },

    /** Read this lead, when it has no hint yet (its page, after the page is sent). */
    async scoreLead(actor: Actor, leadId: string): Promise<Result<boolean>> {
      if (!can(actor, "leads.read")) return forbidden("Only the sales team sees leads.");
      if (!isId(leadId) || !(await ai.helperOn("leadScores")) || (await store.leadAiScores.forLeads([leadId])).length) return ok(false);
      return ok(Boolean(await score(actor, leadId)));
    },

    /** Read a few new leads that have no hint yet. Runs after a Leads page is sent; quietly does nothing when off. */
    async scoreNew(actor: Actor): Promise<Result<number>> {
      if (!can(actor, "leads.read")) return forbidden("Only the sales team sees leads.");
      if (!(await ai.helperOn("leadScores"))) return ok(0);
      const since = new Date(clock.now().getTime() - NEW_DAYS * 86_400_000);
      let n = 0;
      for (const id of await store.leadAiScores.unscored(since, BATCH)) if (await score(actor, id)) n++;
      return ok(n);
    },
  };
}
export type LeadScoreService = ReturnType<typeof createLeadScoreService>;
