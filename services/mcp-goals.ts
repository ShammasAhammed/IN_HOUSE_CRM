// Goals through the Oppllo MCP (Stage 14.3): read company and team goals and post a check-in, with the person's own
// rights (private spaces, "leaders only", money amounts only with money.read). A check-in is an event like on screen.
import { z } from "zod";
import { formatRupees } from "@/lib/format";
import type { AiTool } from "@/repositories";
import { fromResult, tool } from "./assistant";
import { GOAL_FILTERS, type GoalService, type GoalView } from "./goals";
import type { Actor } from "./permissions";

const amount = (g: Pick<GoalView, "unit" | "amountsHidden">, n: number | null) => (g.amountsHidden ? "hidden (money)" : n === null ? null : g.unit === "money" ? formatRupees(n) : g.unit === "percent" ? `${n}%` : n);
const brief = (g: GoalView) => ({
  id: g.id,
  title: g.title,
  period: g.periodName,
  owner: g.spaceName ?? g.ownerName,
  target: amount(g, g.target),
  now: amount(g, g.current),
  percent: g.health.percent,
  health: g.health.level.replace("_", " "),
  why: g.health.reasons,
  live_from: g.source === "manual" ? null : g.source,
  last_check_in: g.lastCheckin ? { by: g.lastCheckin.personName, on: g.lastCheckin.createdAt.toISOString().slice(0, 10), note: g.lastCheckin.note } : null,
  supporting_tasks: g.supporting ? `${g.supporting.done} of ${g.supporting.total} done` : null,
});

export function goalTools(actor: Actor, goals: GoalService): AiTool[] {
  return [
    tool({
      name: "list_goals",
      description: "Company goals with their team goals (owned by a space or a person): target, number now, percent, health (on track, at risk, off track, no target), last check-in. Money amounts only for people who see money. now = goals running today.",
      input: z.strictObject({ period: z.enum(GOAL_FILTERS).describe('"now" (running today), "year", "quarter", "month" or "all".') }),
      run: async ({ period }) => {
        const d = await goals.dashboard(actor, period);
        const list = [...d.company.map((c) => ({ ...brief(c), team_goals: c.teams.map(brief) })), ...d.teams.map(brief)];
        return { ok: true, text: list.length ? JSON.stringify(list) : "No goals to show." };
      },
    }),
    tool({
      name: "goal_details",
      description: "One goal in full: its numbers and health, the projects behind it with tasks done, and its check-in history.",
      input: z.strictObject({ goal_id: z.string().describe("The goal's id from list_goals.") }),
      run: async ({ goal_id }) =>
        fromResult(await goals.get(actor, goal_id), (g) => ({ ...brief(g), description: g.description, company_goal: g.parentTitle, projects: g.supporting?.projects ?? [], check_ins: g.checkins.map((c) => ({ by: c.personName, on: c.createdAt.toISOString().slice(0, 10), value: amount(g, c.value), note: c.note })) })),
    }),
    tool({
      name: "post_goal_checkin",
      description: 'Post a check-in on a goal as the person: the number now (for typed-in goals; money in rupees) and a short note. Goals with a live number take a note only (value ""). Confirm the number with the person first.',
      input: z.strictObject({ goal_id: z.string().describe("The goal's id."), value: z.string().describe('The number now (rupees for money, e.g. "1250000"), or "".'), note: z.string().describe("A short note: what changed, what's next.") }),
      run: async ({ goal_id, value, note }) => {
        const g = await goals.get(actor, goal_id);
        if (!g.ok) return { ok: false, text: g.error.message };
        const raw = value.replace(/[,₹\s]/g, "");
        if (raw && !/^\d+(\.\d{1,2})?$/.test(raw)) return { ok: false, text: "value must be a number." };
        const n = raw ? (g.value.unit === "money" ? Math.round(Number(raw) * 100) : Math.round(Number(raw))) : null;
        return fromResult(await goals.checkin(actor, { goalId: goal_id, value: n, note }), () => ({ done: "Check-in posted." }));
      },
    }),
  ];
}
