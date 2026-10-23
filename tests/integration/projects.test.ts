// Projects: created from an engagement with the service's stages and starter tasks (D19, D20).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createProjectService } from "@/services/projects";
import { actorOf, addClient, addPerson, addRetainer, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const projects = createProjectService({ store, clock: fixedClock("2026-10-14") });
const ids = {} as Record<"strategist" | "designer" | "client" | "engagement", string>;

beforeEach(async () => {
  await wipe(db);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  const serviceId = newId();
  await db.insert(s.services).values({ id: serviceId, key: "landing_page", name: "Landing page" });
  await db.insert(s.serviceStages).values(["Brief", "Design", "Build"].map((name, position) => ({ id: newId(), serviceId, name, position })));
  await db.insert(s.serviceTaskTemplates).values([
    { id: newId(), serviceId, title: "Write the brief", stagePosition: 0, dueOffsetDays: 2, estimateMinutes: 120, defaultRole: "strategist", position: 0 },
    { id: newId(), serviceId, title: "Design the page", stagePosition: 1, dueOffsetDays: 9, estimateMinutes: 600, defaultRole: "designer", position: 1 },
  ]);
  ids.client = await addClient(db, "Medcrest NEET Coaching", { strategistId: ids.strategist, members: [ids.strategist, ids.designer] });
  ids.engagement = await addRetainer(db, ids.client, serviceId, { feePaise: 1, budgetMinutes: 60, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("starting a project", () => {
  it("copies the service's stages and creates starter tasks for the right people", async () => {
    const r = await projects.create(actorOf(ids.strategist, ["strategist"]), {
      clientId: ids.client,
      engagementId: ids.engagement,
      name: "Admissions landing page",
      startDate: "2026-10-14",
      dueDate: "",
      leadId: "",
      starterTasks: "on",
    });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.starterTasks).toBe(2);
    const p = await projects.get(actorOf(ids.strategist, ["strategist"]), r.value.id);
    expect(p.ok && p.value.stages.map((st) => st.name)).toEqual(["Brief", "Design", "Build"]);
    expect(p.ok && p.value).toMatchObject({ currentStageName: "Brief", leadName: "Anjali Nair", openTasks: 2 });
    const rows = await db.select().from(s.tasks).where(sql`${s.tasks.projectId} = ${r.value.id}`).orderBy(s.tasks.rank);
    expect(rows.map((t) => [t.title, t.ownerId, t.dueDate])).toEqual([
      ["Write the brief", ids.strategist, "2026-10-16"],
      ["Design the page", ids.designer, "2026-10-23"],
    ]);
    expect((await eventsFor(db, r.value.id)).map((e) => e.action)).toEqual(["project.created"]);
  });

  it("refuses roles that don't plan work", async () => {
    expect((await projects.create(actorOf(ids.designer, ["designer"]), { clientId: ids.client, name: "Mine", startDate: "2026-10-14" })).ok).toBe(false);
  });
});
