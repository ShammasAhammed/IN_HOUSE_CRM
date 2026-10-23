// Skills and growth (plan/5, stages 1–3): the skill matrix per position, each person's levels (moved up only with
// evidence), growth goals (three live at most), assigned learning, a continuous score shown with its workings, the
// trend, and the team-head and HR views. 360 reviews are stage 4 and not built yet: the people part is left out of
// the score (and the rest re-weighted) until they exist.
// Who may do what: HR and the owner everything; a department head their department; a lead (whom someone reports
// to) that person's levels, goals and learning; everyone their own page, their own goals and learning progress.
import { z } from "zod";
import { addDays, addMonths, istDate, startOfMonth, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { LEARNING_KINDS, LEARNING_STATUSES, ROLES, SKILL_GROUPS, type LearningStatus, type Role } from "@/lib/types";
import { isoDate, optionalId, optionalText, parse } from "@/lib/validation/common";
import type { DataStore, GoalRow, LearningRow, LevelRow, PersonRecord, RoleSkillRow, SkillRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { coverageRisks, deliveryPart, growthPart, overallScore, skillPart, trendOf, weightsFor, type PartKey, type Weights } from "./rules/growth";
import { countOf } from "@/lib/format";

export const MAX_ACTIVE_GOALS = 3;
const DELIVERY_DAYS = 90;

const skillSchema = z.object({
  skillId: optionalId,
  name: z.string().trim().min(2, { message: "Name the skill." }).max(80),
  group: z.enum(SKILL_GROUPS),
  description: optionalText(500),
  departmentId: optionalId,
});
const requirementSchema = z.object({ role: z.enum(ROLES), skillId: z.uuid(), level: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]) });
const levelSchema = z.object({
  personId: z.uuid(),
  skillId: z.uuid(),
  level: z.coerce.number().int().min(0).max(5),
  evidence: optionalText(1000),
});
const goalSchema = z.object({
  personId: z.uuid(),
  skillId: optionalId,
  title: z.string().trim().min(3, { message: "Say what they will get better at." }).max(150),
  targetLevel: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  dueDate: z.union([z.literal(""), isoDate]).optional().transform((v) => v || null),
  plan: optionalText(1000),
  proof: optionalText(500),
});
const learningSchema = z.object({
  personId: z.uuid(),
  goalId: optionalId,
  kind: z.enum(LEARNING_KINDS),
  title: z.string().trim().min(2, { message: "Name what to learn." }).max(150),
  url: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || (URL.canParse(v) && new URL(v).protocol === "https:"), { message: "Paste a link starting with https://" }),
  docId: optionalId,
  minutes: z.union([z.literal(""), z.coerce.number().int().min(0).max(10_000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  costRupees: z.union([z.literal(""), z.coerce.number().min(0).max(10_000_000)]).optional().transform((v) => (v === "" || v === undefined ? null : Math.round(v * 100))),
});

export type ScoreView = { score: number | null; parts: Record<PartKey, number | null>; weights: Weights; workings: Record<PartKey, string> };
export type SkillLine = { skill: SkillRow; required: number | null; current: number; gap: number; evidence: string | null; setByName: string | null; setAt: Date | null };
export type GrowthPage = {
  person: Pick<PersonRecord, "id" | "fullName" | "jobTitle" | "roles" | "departmentName">;
  skills: SkillLine[];
  goals: GoalRow[];
  learning: LearningRow[];
  score: ScoreView;
  history: Array<{ month: IsoDate; score: number }>;
  trend: "rising" | "falling" | "steady" | null;
  canCoach: boolean;
  isSelf: boolean;
};

export function createGrowthService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const hr = (actor: Actor) => can(actor, "people.write") || can(actor, "settings.manage");

  async function headedDepartments(actor: Actor): Promise<Set<string>> {
    return new Set((await store.people.listDepartments()).filter((d) => d.headPersonId === actor.personId).map((d) => d.id));
  }

  /** Coach: HR, the person's lead, or the head of their department. Never yourself. */
  async function coaches(actor: Actor, p: PersonRecord): Promise<boolean> {
    if (p.id === actor.personId) return false;
    if (hr(actor) || p.reportsToId === actor.personId) return true;
    return Boolean(p.departmentId && (await headedDepartments(actor)).has(p.departmentId));
  }

  /** The skills a person's roles need, at the highest level any of their roles asks. */
  function requiredFor(roles: readonly Role[], reqs: readonly RoleSkillRow[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const r of reqs) if (roles.includes(r.role)) out.set(r.skillId, Math.max(out.get(r.skillId) ?? 0, r.requiredLevel));
    return out;
  }

  async function scoreFor(p: PersonRecord, reqs: readonly RoleSkillRow[], levels: readonly LevelRow[], goals: readonly GoalRow[], learning: readonly LearningRow[]): Promise<ScoreView> {
    const today = clock.today();
    const since = addDays(today, -DELIVERY_DAYS);
    const done = (await store.tasks.list({ scope: { kind: "all" }, ownerId: p.id, statuses: ["done"], anyLevel: true, completedSince: new Date(`${since}T00:00:00+05:30`), limit: 2000 })).filter((t) => t.completedAt);
    const withDue = done.filter((t) => t.dueDate);
    const onTime = withDue.filter((t) => istDate(t.completedAt!) <= t.dueDate!).length;
    const reopened = await store.growth.reopenedCount(p.id, new Date(`${since}T00:00:00+05:30`));
    const required = requiredFor(p.roles, reqs);
    const current = new Map(levels.filter((l) => l.personId === p.id).map((l) => [l.skillId, l.level]));
    const lines = [...required].map(([skillId, req]) => ({ required: req, current: current.get(skillId) ?? 0 }));
    const recent = addDays(today, -180);
    const closed = goals.filter((g) => g.status === "done" && g.closedAt && istDate(g.closedAt) >= recent).length;
    const active = goals.filter((g) => g.status === "active");
    const overdue = active.filter((g) => g.dueDate && g.dueDate < today).length;
    const shown = learning.filter((l) => l.status === "shown").length;
    const parts: Record<PartKey, number | null> = {
      delivery: deliveryPart({ done: done.length, withDue: withDue.length, onTime, reopened }),
      skill: skillPart(lines),
      growth: growthPart({ goalsClosed: closed, goalsActive: active.length, goalsOverdue: overdue, learningAssigned: learning.length, learningShown: shown }),
      people: null,
    };
    const weights = weightsFor(p.roles);
    return {
      score: overallScore(parts, weights),
      parts,
      weights,
      workings: {
        delivery: done.length ? `${onTime} of ${countOf(withDue.length, "task")} with a due date done on time, ${reopened} reopened, in the last ${DELIVERY_DAYS} days (70% on time, 30% stayed done).` : `No tasks finished in the last ${DELIVERY_DAYS} days.`,
        skill: lines.length ? `${lines.filter((l) => l.current >= l.required).length} of ${lines.length} required skills at the level the role needs (each counted up to its requirement).` : "No skills set for this role yet.",
        growth: active.length || closed || learning.length ? `${closed} goals closed in six months, ${shown} of ${learning.length} learning shown in work, ${overdue} of ${active.length} live goals overdue.` : "No growth plan yet.",
        people: "From 360 feedback, once the first round runs. Left out until then.",
      },
    };
  }

  const service = {
    // ---------- the matrix ----------

    async matrix(actor: Actor): Promise<Result<{ skills: SkillRow[]; requirements: RoleSkillRow[]; departments: Array<{ id: string; name: string }>; canManage: boolean; headOf: string[] }>> {
      const [skills, requirements, departments, headOf] = await Promise.all([store.growth.skills(), store.growth.roleSkills(), store.people.listDepartments(), headedDepartments(actor)]);
      return ok({ skills, requirements, departments: departments.map((d) => ({ id: d.id, name: d.name })), canManage: hr(actor), headOf: [...headOf] });
    },

    /** Add or change a skill: HR any; a department head their department's own skills. */
    async saveSkill(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(skillSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const heads = await headedDepartments(actor);
      const mayFor = (dept: string | null) => hr(actor) || (dept !== null && heads.has(dept));
      if (!mayFor(v.departmentId ?? null)) return forbidden("HR keeps the matrix; team heads add their department's skills.");
      return commit(store, async (repos) => {
        const before = v.skillId ? await repos.growth.findSkill(v.skillId) : null;
        if (v.skillId && (!before || !mayFor(before.departmentId))) return notFound("That skill");
        if ((await repos.growth.skills()).some((s) => s.id !== before?.id && s.name.toLowerCase() === v.name.toLowerCase())) return invalid("There's already a skill with that name.", { name: ["There's already a skill with that name."] });
        const id = before?.id ?? newId();
        const row = { name: v.name, group: v.group, description: v.description, departmentId: v.departmentId ?? null };
        if (before) await repos.growth.updateSkill(id, row);
        else await repos.growth.addSkill({ ...row, id, position: 0 });
        return change({ id }, { actorId: actor.personId, action: before ? "skill.changed" : "skill.added", entityType: "skill", entityId: id, data: { name: v.name } });
      });
    },

    async removeSkill(actor: Actor, skillId: string): Promise<Result<null>> {
      if (!isId(skillId)) return notFound("That skill");
      const heads = await headedDepartments(actor);
      return commit(store, async (repos) => {
        const s = await repos.growth.findSkill(skillId);
        if (!s || !(hr(actor) || (s.departmentId && heads.has(s.departmentId)))) return notFound("That skill");
        await repos.growth.updateSkill(s.id, { deletedAt: clock.now() });
        return change(null, { actorId: actor.personId, action: "skill.removed", entityType: "skill", entityId: s.id, data: { name: s.name } });
      });
    },

    /** What a position needs: HR sets the level (empty removes the requirement). */
    async setRequirement(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!hr(actor)) return forbidden("HR sets what each position needs.");
      const parsed = parse(requirementSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const s = await repos.growth.findSkill(v.skillId);
        if (!s) return notFound("That skill");
        const level = v.level === "" ? null : v.level;
        if (!(await repos.growth.setRoleSkill(v.role, s.id, level, newId(), clock.now()))) return noChange(null);
        return change(null, { actorId: actor.personId, action: "skill.requirement_set", entityType: "skill", entityId: s.id, data: { role: v.role, level } });
      });
    },

    // ---------- a person ----------

    /** A person's growth page: theirs, their coaches' and HR's. Opens on what they grow towards, then the number. */
    async page(actor: Actor, personId: string): Promise<Result<GrowthPage>> {
      if (!isId(personId)) return notFound("That person");
      const p = await store.people.findById(personId);
      if (!p) return notFound("That person");
      const isSelf = p.id === actor.personId;
      const canCoach = await coaches(actor, p);
      if (!isSelf && !canCoach) return forbidden("A growth page is for the person, their lead, their team head and HR.");
      const [skills, reqs, levels, goals, learning, scores] = await Promise.all([
        store.growth.skills(),
        store.growth.roleSkills(),
        store.growth.currentLevels([p.id]),
        store.growth.goals({ personId: p.id }),
        store.growth.learning({ personId: p.id }),
        store.growth.scores([p.id], addMonths(startOfMonth(clock.today()), -5)),
      ]);
      const required = requiredFor(p.roles, reqs);
      const levelOf = new Map(levels.map((l) => [l.skillId, l]));
      const relevant = skills.filter((s) => required.has(s.id) || levelOf.has(s.id));
      const lines: SkillLine[] = relevant
        .map((s) => {
          const l = levelOf.get(s.id);
          const req = required.get(s.id) ?? null;
          return { skill: s, required: req, current: l?.level ?? 0, gap: req ? Math.max(req - (l?.level ?? 0), 0) : 0, evidence: l?.evidence ?? null, setByName: l?.setByName ?? null, setAt: l?.createdAt ?? null };
        })
        .sort((a, b) => b.gap - a.gap || a.skill.name.localeCompare(b.skill.name));
      const score = await scoreFor(p, reqs, levels, goals, learning);
      // This month is the live score; its saved snapshot would count it twice.
      const thisMonth = startOfMonth(clock.today());
      const history = scores.filter((s) => s.month !== thisMonth).map((s) => ({ month: s.month, score: s.score }));
      return ok({
        person: { id: p.id, fullName: p.fullName, jobTitle: p.jobTitle, roles: p.roles, departmentName: p.departmentName },
        skills: lines,
        goals,
        learning,
        score,
        history,
        trend: trendOf([...history.map((h) => h.score), ...(score.score !== null ? [score.score] : [])]),
        canCoach,
        isSelf,
      });
    },

    /** A coach sets a level. Moving up needs the evidence: work that showed it (plan/5). */
    async setLevel(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(levelSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const p = await store.people.findById(v.personId);
      if (!p) return notFound("That person");
      if (!(await coaches(actor, p))) return forbidden(p.id === actor.personId ? "Your lead or HR sets your levels, from work that shows them." : "Only their lead, team head or HR sets levels.");
      return commit(store, async (repos) => {
        const s = await repos.growth.findSkill(v.skillId);
        if (!s) return notFound("That skill");
        const current = (await repos.growth.currentLevels([p.id])).find((l) => l.skillId === s.id)?.level ?? 0;
        if (current === v.level) return noChange(null);
        if (v.level > current && !v.evidence) return invalid("Say what showed it: a piece of work, a test campaign, a session taught.", { evidence: ["Moving up needs evidence."] });
        await repos.growth.addLevel({ id: newId(), personId: p.id, skillId: s.id, level: v.level, evidence: v.evidence, setById: actor.personId });
        return change(null, { actorId: actor.personId, action: "skill.level_set", entityType: "skill_level", entityId: s.id, personId: p.id, data: { skill: s.name, from: current, to: v.level } });
      });
    },

    /** A growth goal: the person or a coach. Three live at most: "a plan with ten goals is a plan nobody follows". */
    async addGoal(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(goalSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const p = await store.people.findById(v.personId);
      if (!p) return notFound("That person");
      if (p.id !== actor.personId && !(await coaches(actor, p))) return forbidden("Goals are set by the person, their lead, team head or HR.");
      return commit(store, async (repos) => {
        await repos.growth.lockPerson(p.id);
        if ((await repos.growth.goals({ personId: p.id, status: "active" })).length >= MAX_ACTIVE_GOALS) return conflict(`Three goals at a time. Close one first.`);
        if (v.skillId && !(await repos.growth.findSkill(v.skillId))) return notFound("That skill");
        const id = newId();
        await repos.growth.addGoal({ id, personId: p.id, skillId: v.skillId ?? null, title: v.title, targetLevel: v.targetLevel, dueDate: v.dueDate, plan: v.plan, proof: v.proof, createdById: actor.personId });
        return change({ id }, { actorId: actor.personId, action: "growth.goal_set", entityType: "growth_goal", entityId: id, personId: p.id, data: { title: v.title } });
      });
    },

    /** Close a goal: done (a coach, who saw the proof) or dropped (the person or a coach). */
    async closeGoal(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(z.object({ goalId: z.uuid(), status: z.enum(["done", "dropped"]) }), raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const g = await repos.growth.findGoal(v.goalId);
        const p = g ? await repos.people.findById(g.personId) : null;
        if (!g || !p) return notFound("That goal");
        const coach = await coaches(actor, p);
        if (!coach && !(p.id === actor.personId && v.status === "dropped")) return forbidden("Their lead, team head or HR marks a goal done, once they've seen the proof.");
        if (g.status !== "active") return noChange(null);
        await repos.growth.updateGoal(g.id, { status: v.status, closedAt: clock.now() });
        return change(null, { actorId: actor.personId, action: v.status === "done" ? "growth.goal_done" : "growth.goal_dropped", entityType: "growth_goal", entityId: g.id, personId: p.id, data: { title: g.title } });
      });
    },

    /** A coach assigns learning (with the time and money the company gives for it). */
    async assignLearning(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(learningSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const p = await store.people.findById(v.personId);
      if (!p) return notFound("That person");
      if (!(await coaches(actor, p))) return forbidden("Their lead, team head or HR assigns learning.");
      return commit(store, async (repos) => {
        if (v.goalId) {
          const g = await repos.growth.findGoal(v.goalId);
          if (!g || g.personId !== p.id || g.status !== "active") return invalid("Pick one of their live goals.");
        }
        // Team pages only: every person can open those, so the link never leads to a client page they can't see.
        if (v.docId) {
          const doc = await repos.docs.findById(v.docId);
          if (!doc || doc.clientId) return invalid("Pick a team page from Docs.");
        }
        const id = newId();
        await repos.growth.addLearning({ id, personId: p.id, goalId: v.goalId ?? null, kind: v.kind, title: v.title, url: v.url, docId: v.docId ?? null, taskId: null, minutes: v.minutes, costPaise: v.costRupees, assignedById: actor.personId });
        return change({ id }, { actorId: actor.personId, action: "growth.learning_assigned", entityType: "learning_item", entityId: id, personId: p.id, data: { title: v.title, kind: v.kind } });
      });
    },

    /** Progress on learning: the person marks started or finished; only a coach marks it shown in work. */
    async learningStatus(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(z.object({ learningId: z.uuid(), status: z.enum(LEARNING_STATUSES) }), raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const l = await repos.growth.findLearning(v.learningId);
        const p = l ? await repos.people.findById(l.personId) : null;
        if (!l || !p) return notFound("That learning");
        const coach = await coaches(actor, p);
        const self = p.id === actor.personId;
        if (!coach && !(self && l.status !== "shown" && (["assigned", "started", "finished"] as LearningStatus[]).includes(v.status))) return forbidden(self ? "Your lead marks it shown in work, once they've seen it." : "Only the person or their coach updates learning.");
        if (l.status === v.status) return noChange(null);
        await repos.growth.updateLearning(l.id, { status: v.status });
        return change(null, { actorId: actor.personId, action: "growth.learning_progress", entityType: "learning_item", entityId: l.id, personId: p.id, data: { from: l.status, to: v.status } });
      });
    },

    // ---------- views for team heads and HR ----------

    /** A department as a grid: people down, skills across, levels in the cells, gaps visible; overdue goals. */
    async team(actor: Actor, departmentId?: string): Promise<Result<{ departments: Array<{ id: string; name: string }>; departmentId: string; people: Array<{ id: string; fullName: string; jobTitle: string; overdueGoals: number }>; skills: SkillRow[]; cells: Record<string, { level: number; required: number | null }> }>> {
      const all = await store.people.listDepartments();
      const heads = await headedDepartments(actor);
      const allowed = all.filter((d) => hr(actor) || heads.has(d.id));
      if (!allowed.length) return forbidden("Team heads and HR see the team grid.");
      const dept = allowed.find((d) => d.id === departmentId) ?? allowed[0]!;
      const people = (await store.people.listActive()).filter((p) => p.departmentId === dept.id);
      const [skills, reqs, levels, goals] = await Promise.all([store.growth.skills(), store.growth.roleSkills(), store.growth.currentLevels(people.map((p) => p.id)), store.growth.goals({ status: "active" })]);
      const neededHere = new Set(reqs.filter((r) => people.some((p) => p.roles.includes(r.role))).map((r) => r.skillId));
      const cols = skills.filter((s) => s.departmentId === dept.id || neededHere.has(s.id));
      const cells: Record<string, { level: number; required: number | null }> = {};
      for (const p of people) {
        const req = requiredFor(p.roles, reqs);
        for (const s of cols) cells[`${p.id}:${s.id}`] = { level: levels.find((l) => l.personId === p.id && l.skillId === s.id)?.level ?? 0, required: req.get(s.id) ?? null };
      }
      const today = clock.today();
      return ok({
        departments: allowed.map((d) => ({ id: d.id, name: d.name })),
        departmentId: dept.id,
        people: people.map((p) => ({ id: p.id, fullName: p.fullName, jobTitle: p.jobTitle, overdueGoals: goals.filter((g) => g.personId === p.id && g.dueDate && g.dueDate < today).length })),
        skills: cols,
        cells,
      });
    },

    /** HR's control room: thin skills, who needs support now, who is ready for more, and learning given. */
    async overview(actor: Actor): Promise<
      Result<{
        risks: Array<{ id: string; name: string; people: number }>;
        /** How many skills are set up: none means no risks to show, not full coverage. */
        skillCount: number;
        support: Array<{ personId: string; fullName: string; reasons: string[] }>;
        ready: Array<{ personId: string; fullName: string; score: number }>;
        given: Array<{ personId: string; fullName: string; minutes: number; costPaise: number }>;
      }>
    > {
      if (!hr(actor)) return forbidden("HR and the owner see the whole agency's growth.");
      const people = (await store.people.listActive()).filter((p) => p.employmentType !== "freelancer");
      const [skills, reqs, levels, goals, learning, scores, last1on1] = await Promise.all([
        store.growth.skills(),
        store.growth.roleSkills(),
        store.growth.currentLevels(),
        store.growth.goals({}),
        store.growth.learning({}),
        store.growth.scores(people.map((p) => p.id), addMonths(startOfMonth(clock.today()), -3)),
        store.talent.lastOneToOnes(),
      ]);
      const today = clock.today();
      const support: Array<{ personId: string; fullName: string; reasons: string[] }> = [];
      const ready: Array<{ personId: string; fullName: string; score: number }> = [];
      for (const p of people) {
        const mine = scores.filter((s) => s.personId === p.id).map((s) => s.score);
        const g = goals.filter((x) => x.personId === p.id);
        const l = learning.filter((x) => x.personId === p.id);
        const reasons: string[] = [];
        if (trendOf(mine) === "falling") reasons.push("score falling");
        if (g.some((x) => x.status === "active" && x.dueDate && x.dueDate < today)) reasons.push("a goal past its date");
        if (!g.some((x) => x.status === "active") && !l.some((x) => x.status !== "shown")) reasons.push("no live goal or learning");
        const lastMeet = last1on1.find((x) => x.personId === p.id)?.meetingDate;
        if (p.reportsToId && (!lastMeet || lastMeet < addDays(today, -42))) reasons.push("no one-to-one in six weeks");
        if (reasons.length) support.push({ personId: p.id, fullName: p.fullName, reasons });
        const req = requiredFor(p.roles, reqs);
        const atLevel = [...req].every(([s, r]) => (levels.find((x) => x.personId === p.id && x.skillId === s)?.level ?? 0) >= r);
        const latest = mine.at(-1);
        if (req.size && atLevel && latest !== undefined && latest >= 80) ready.push({ personId: p.id, fullName: p.fullName, score: latest });
      }
      const given = people
        .map((p) => {
          const l = learning.filter((x) => x.personId === p.id);
          return { personId: p.id, fullName: p.fullName, minutes: l.reduce((n, x) => n + (x.minutes ?? 0), 0), costPaise: l.reduce((n, x) => n + (x.costPaise ?? 0), 0) };
        })
        .filter((x) => x.minutes || x.costPaise)
        .sort((a, b) => b.minutes - a.minutes);
      return ok({ risks: coverageRisks(skills, levels), skillCount: skills.length, support: support.sort((a, b) => b.reasons.length - a.reasons.length), ready: ready.sort((a, b) => b.score - a.score), given });
    },

    /** Daily job: this month's score for everyone, kept for the trend. */
    async snapshotScores(): Promise<{ saved: number }> {
      const people = (await store.people.listActive()).filter((p) => p.employmentType !== "freelancer");
      const [reqs, levels, goals, learning] = await Promise.all([store.growth.roleSkills(), store.growth.currentLevels(), store.growth.goals({}), store.growth.learning({})]);
      const month = startOfMonth(clock.today());
      let saved = 0;
      for (const p of people) {
        const s = await scoreFor(p, reqs, levels, goals.filter((g) => g.personId === p.id), learning.filter((l) => l.personId === p.id));
        if (s.score === null) continue;
        await store.growth.saveScore({ id: newId(), personId: p.id, month, score: s.score, parts: s.parts });
        saved++;
      }
      return { saved };
    },
  };
  return service;
}

export type GrowthService = ReturnType<typeof createGrowthService>;
