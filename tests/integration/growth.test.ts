// Skills and growth (plan/5, stages 1–3): the matrix, levels with evidence, goals, learning, the team grid, HR's view
// and the monthly score snapshot.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createGrowthService } from "@/services/growth";
import { actorOf, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const growth = createGrowthService({ store, clock });

type Who = "hr" | "head" | "lead" | "designer" | "other";
const ids = {} as Record<Who | "dept", string>;
const roles: Record<Who, Role[]> = { hr: ["hr"], head: ["designer"], lead: ["designer"], designer: ["designer"], other: ["video_editor"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
const must = <T,>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table growth_scores, learning_items, growth_goals, skill_levels, role_skills, skills cascade`);
  ids.hr = await addPerson(db, "Divya Suresh", roles.hr);
  ids.head = await addPerson(db, "Anu Joseph", roles.head);
  ids.dept = newId();
  await db.insert(s.departments).values({ id: ids.dept, name: "Design", headPersonId: ids.head });
  ids.lead = await addPerson(db, "Rahul Menon", roles.lead, { departmentId: ids.dept });
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer, { departmentId: ids.dept, reportsToId: ids.lead });
  ids.other = await addPerson(db, "Nikhil Thomas", roles.other);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

async function skill(name = "Motion graphics", departmentId: string | null = null) {
  return must(await growth.saveSkill(as("hr"), { name, group: "craft", departmentId: departmentId ?? "" })).id;
}

describe("matrix", () => {
  it("HR keeps it; a team head adds their own department's skills only", async () => {
    expect(await growth.saveSkill(as("designer"), { name: "Typography", group: "craft" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await growth.saveSkill(as("head"), { name: "Typography", group: "craft" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    must(await growth.saveSkill(as("head"), { name: "Typography", group: "craft", departmentId: ids.dept }));
    const id = await skill();
    expect(await growth.saveSkill(as("hr"), { name: "motion GRAPHICS", group: "craft" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await growth.setRequirement(as("head"), { role: "designer", skillId: id, level: 3 })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    must(await growth.setRequirement(as("hr"), { role: "designer", skillId: id, level: 3 }));
    const m = must(await growth.matrix(as("head")));
    expect(m.skills.map((x) => x.name).sort()).toEqual(["Motion graphics", "Typography"]);
    expect(m.requirements).toMatchObject([{ role: "designer", skillId: id, requiredLevel: 3 }]);
    expect(m).toMatchObject({ canManage: false, headOf: [ids.dept] });
    must(await growth.setRequirement(as("hr"), { role: "designer", skillId: id, level: "" }));
    expect(must(await growth.matrix(as("hr"))).requirements).toEqual([]);
    expect(await growth.removeSkill(as("head"), id)).toMatchObject({ ok: false, error: { code: "not_found" } });
    must(await growth.removeSkill(as("hr"), id));
    expect(must(await growth.matrix(as("hr"))).skills.map((x) => x.name)).toEqual(["Typography"]);
  });
});

describe("a person's growth", () => {
  it("only coaches set levels, and moving up needs evidence", async () => {
    const id = await skill();
    must(await growth.setRequirement(as("hr"), { role: "designer", skillId: id, level: 3 }));
    expect(await growth.setLevel(as("designer"), { personId: ids.designer, skillId: id, level: 3, evidence: "me" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await growth.setLevel(as("other"), { personId: ids.designer, skillId: id, level: 3, evidence: "x" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await growth.setLevel(as("lead"), { personId: ids.designer, skillId: id, level: 2 })).toMatchObject({ ok: false, error: { code: "invalid" } });
    must(await growth.setLevel(as("lead"), { personId: ids.designer, skillId: id, level: 2, evidence: "Zenith reel" }));
    must(await growth.setLevel(as("head"), { personId: ids.designer, skillId: id, level: 1 }));
    const page = must(await growth.page(as("designer"), ids.designer));
    expect(page.skills).toMatchObject([{ required: 3, current: 1, gap: 2 }]);
    expect(page).toMatchObject({ isSelf: true, canCoach: false });
    expect(must(await growth.page(as("lead"), ids.designer))).toMatchObject({ canCoach: true });
    expect(await growth.page(as("other"), ids.designer)).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("three live goals at most; the person may drop, only a coach marks done", async () => {
    const goals = [];
    for (const t of ["Better kerning", "Faster reels", "Learn After Effects"]) goals.push(must(await growth.addGoal(as("designer"), { personId: ids.designer, title: t })).id);
    expect(await growth.addGoal(as("lead"), { personId: ids.designer, title: "One more" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await growth.addGoal(as("other"), { personId: ids.designer, title: "Not mine" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await growth.closeGoal(as("designer"), { goalId: goals[0], status: "done" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    must(await growth.closeGoal(as("designer"), { goalId: goals[0], status: "dropped" }));
    must(await growth.closeGoal(as("lead"), { goalId: goals[1], status: "done" }));
    must(await growth.addGoal(as("lead"), { personId: ids.designer, title: "One more" }));
    expect(await growth.assignLearning(as("lead"), { personId: ids.designer, goalId: goals[1], kind: "course", title: "Too late" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    // Two saves at once still keep three live goals.
    const both = await Promise.all([growth.addGoal(as("designer"), { personId: ids.designer, title: "Race one" }), growth.addGoal(as("lead"), { personId: ids.designer, title: "Race two" })]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
  });

  it("learning: a coach assigns; the person finishes; only a coach marks it shown", async () => {
    expect(await growth.assignLearning(as("designer"), { personId: ids.designer, kind: "course", title: "AE basics" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await growth.assignLearning(as("lead"), { personId: ids.designer, kind: "course", title: "AE basics", url: "http://x.com" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    const id = must(await growth.assignLearning(as("lead"), { personId: ids.designer, kind: "course", title: "AE basics", url: "https://x.com", minutes: 120, costRupees: 499 })).id;
    must(await growth.learningStatus(as("designer"), { learningId: id, status: "finished" }));
    expect(await growth.learningStatus(as("designer"), { learningId: id, status: "shown" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    must(await growth.learningStatus(as("lead"), { learningId: id, status: "shown" }));
    expect(await growth.learningStatus(as("designer"), { learningId: id, status: "finished" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const ov = must(await growth.overview(as("hr")));
    expect(ov.given).toEqual([{ personId: ids.designer, fullName: "Vishnu Prasad", minutes: 120, costPaise: 49900 }]);
  });
});

describe("team and HR views", () => {
  it("the team grid is for heads and HR; HR's overview and the monthly snapshot", async () => {
    const id = await skill();
    must(await growth.setRequirement(as("hr"), { role: "designer", skillId: id, level: 3 }));
    must(await growth.setLevel(as("lead"), { personId: ids.designer, skillId: id, level: 3, evidence: "Zenith reel" }));
    expect(await growth.team(as("designer"))).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const grid = must(await growth.team(as("head")));
    expect(grid.departmentId).toBe(ids.dept);
    expect(grid.cells[`${ids.designer}:${id}`]).toEqual({ level: 3, required: 3 });
    expect(grid.cells[`${ids.lead}:${id}`]).toEqual({ level: 0, required: 3 });
    expect(await growth.overview(as("head"))).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const ov = must(await growth.overview(as("hr")));
    expect(ov.support.find((x) => x.personId === ids.designer)?.reasons).toContain("no one-to-one in six weeks");
    const snap = await growth.snapshotScores();
    expect(snap.saved).toBeGreaterThan(0);
    expect((await growth.snapshotScores()).saved).toBe(snap.saved);
    const page = must(await growth.page(as("designer"), ids.designer));
    // This month's snapshot is the live score, not a past month.
    expect(page.history).toHaveLength(0);
    expect(page.score.parts.skill).toBe(100);
  });
});
