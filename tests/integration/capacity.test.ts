// The Week view (D33): capacity minus holidays and leave; estimates spread over working days.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createCapacityService } from "@/services/capacity";
import { actorOf, addClient, addLeaveSetup, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const capacity = createCapacityService({ store, clock: fixedClock("2026-10-14") });
const ids = {} as Record<"strategist" | "designer", string>;

beforeEach(async () => {
  await wipe(db);
  const types = await addLeaveSetup(db); // holidays: 20 Oct
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  const clientId = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
  const projectId = newId();
  await db.insert(s.projects).values({ id: projectId, clientId, name: "P" });
  // Week of 19 Oct: Tue 20 is a holiday; the designer is off Wed 21.
  await db.insert(s.leaveRequests).values({ id: newId(), personId: ids.designer, leaveTypeId: types.casual, startDate: "2026-10-21", endDate: "2026-10-21", status: "approved" });
  await db.insert(s.tasks).values([
    { id: newId(), projectId, clientId, title: "Big", ownerId: ids.designer, startDate: "2026-10-19", dueDate: "2026-10-24", estimateMinutes: 1500, rank: "a0" },
    { id: newId(), projectId, clientId, title: "No estimate", ownerId: ids.designer, dueDate: "2026-10-22", rank: "a1" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("week view", () => {
  it("shows planners everyone, with holidays and leave removed from capacity", async () => {
    const r = await capacity.week(actorOf(ids.strategist, ["strategist"]), "2026-10-21");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.weekStart).toBe("2026-10-19");
    expect(r.value.everyone).toBe(true);
    const v = r.value.rows.find((x) => x.personName === "Vishnu Prasad")!;
    // 40h over 6 standard days = 400 min/day; Tue holiday and Wed leave → 4 days = 1600 min.
    expect(v.capacityMinutes).toBe(1600);
    expect(v.leave).toEqual({ "2026-10-21": 1 });
    // 1500 min over Mon, Thu, Fri, Sat (Tue holiday; Wed counts as a working day for the task) + 60 min with no estimate.
    expect(v.assignedMinutes).toBe(1560);
    expect(v.loadPercent).toBe(98);
    expect(r.value.days.find((d) => d.date === "2026-10-20")).toMatchObject({ working: false, holiday: "Vijayadashami" });
  });

  it("shows everyone else only their own week", async () => {
    const r = await capacity.week(actorOf(ids.designer, ["designer"]), "2026-10-21");
    expect(r.ok && r.value.rows.map((x) => x.personName)).toEqual(["Vishnu Prasad"]);
    expect(r.ok && r.value.everyone).toBe(false);
  });
});
