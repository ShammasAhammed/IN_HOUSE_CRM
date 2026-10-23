// The owner's morning summary (ops extra): once a day the dashboard's numbers go to the AI, and the short write-up
// arrives as a notification (and so in the email digest). Off until the owner turns it on and adds an AI key; each
// summary counts against the monthly AI limit like any question.
import { z } from "zod";
import { forbidden, ok, type Result } from "@/lib/result";
import { newId, settingId } from "@/lib/id";
import type { DataStore } from "@/repositories";
import type { AiService } from "./ai";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import type { DashboardService } from "./dashboard";
import { toActor } from "./identity";
import { can, type Actor } from "./permissions";
import { SUMMARY_SYSTEM, summaryFacts } from "./rules/daily-summary";

export const DAILY_SUMMARY_KEY = "ai_daily_summary";
type Setting = { on: boolean };

export function createDailySummaryService(deps: { store: DataStore; clock: Clock; ai: AiService; dashboard: DashboardService }) {
  const { store, clock, ai, dashboard } = deps;
  return {
    async setting(actor: Actor): Promise<Result<{ on: boolean }>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner changes the morning summary.");
      return ok({ on: Boolean((await store.calendar.getSetting<Setting>(DAILY_SUMMARY_KEY))?.on) });
    },

    async setOn(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner changes the morning summary.");
      const on = z.object({ on: z.string().optional() }).safeParse(raw).data?.on === "on";
      return commit(store, async (repos) => {
        if (Boolean((await repos.calendar.getSetting<Setting>(DAILY_SUMMARY_KEY))?.on) === on) return noChange(null);
        await repos.calendar.setSetting(DAILY_SUMMARY_KEY, { on } satisfies Setting, actor.personId);
        return change(null, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(DAILY_SUMMARY_KEY), data: { key: DAILY_SUMMARY_KEY, on } });
      });
    },

    /** Daily job: one summary per owner, when on. Failures are reported and tomorrow tries again. */
    async runDaily(): Promise<{ sent: number; errors: unknown[] }> {
      if (!(await store.calendar.getSetting<Setting>(DAILY_SUMMARY_KEY))?.on) return { sent: 0, errors: [] };
      const owners = (await store.people.listActive()).filter((p) => p.roles.includes("owner"));
      const errors: unknown[] = [];
      let sent = 0;
      for (const p of owners) {
        const actor = toActor(p);
        const d = await dashboard.owner(actor);
        if (!d.ok) continue;
        const r = await ai.ask(actor, "daily_summary", {
          system: SUMMARY_SYSTEM,
          turns: [{ role: "user", text: summaryFacts(d.value) }],
          tools: [],
          effort: "low",
          maxOutputTokens: 700,
          maxSteps: 1,
          maxCostMicroUsd: 50_000,
        });
        if (!r.ok) {
          errors.push(new Error(`Morning summary: ${r.error.message}`));
          continue;
        }
        await store.notifications.create([{ id: newId(), personId: p.id, kind: "summary.daily", title: `Morning summary, ${clock.today()}`, body: r.value.text.slice(0, 4000), link: "/dashboard", entityType: null, entityId: null }]);
        sent++;
      }
      return { sent, errors };
    },
  };
}
