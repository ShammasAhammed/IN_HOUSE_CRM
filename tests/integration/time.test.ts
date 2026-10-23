// The Friday screen: a person's week by task and day, gaps, filling by totals, the month lock (D34, D72).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createTimeService } from "@/services/time";
import { actorOf, addClient, addPerson, addProjectWithTask, addTime, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
// Friday 16 October 2026. The week runs Monday 12 to Sunday 18.
const at = (today: string) => createTimeService({ store, clock: fixedClock(today) });
const ids = {} as Record<"designer" | "strategist" | "editor" | "client" | "task" | "other", string>;
const designer = () => actorOf(ids.designer, ["designer"]);

const liveEntries = () =>
  db
    .select({ minutes: s.timeEntries.minutes, workDate: s.timeEntries.workDate })
    .from(s.timeEntries)
    .where(sql`${s.timeEntries.personId} = ${ids.designer} and ${s.timeEntries.deletedAt} is null`)
    .orderBy(s.timeEntries.workDate, s.timeEntries.createdAt);

beforeEach(async () => {
  await wipe(db);
  // 40 hours over a six-day week: 400 minutes a day.
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"], { capacityMinutesPerWeek: 2400 });
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.editor = await addPerson(db, "Nikhil Thomas", ["video_editor"]);
  ids.client = await addClient(db, "Medcrest NEET Coaching", { members: [ids.designer] });
  ids.task = (await addProjectWithTask(db, ids.client, { ownerId: ids.designer, dueDate: "2026-10-15" })).taskId;
  ids.other = (await addProjectWithTask(db, ids.client, { ownerId: ids.editor, dueDate: "2026-10-20" })).taskId;
  await db.insert(s.settings).values({ key: "work_week", value: { workingWeekdays: [1, 2, 3, 4, 5, 6], saturdaysOff: [2] } });
  // Monday 12th: a full day of 7h; Tuesday 13th: 2h only; Wednesday 14th: nothing; on someone else's task Thursday.
  await addTime(db, { taskId: ids.task, personId: ids.designer, clientId: ids.client, engagementId: null, minutes: 420, workDate: "2026-10-12" });
  await addTime(db, { taskId: ids.task, personId: ids.designer, clientId: ids.client, engagementId: null, minutes: 120, workDate: "2026-10-13" });
  await addTime(db, { taskId: ids.other, personId: ids.designer, clientId: ids.client, engagementId: null, minutes: 400, workDate: "2026-10-15" });
  // A half day of leave on Wednesday.
  const type = newId();
  await db.insert(s.leaveTypes).values({ id: type, key: "casual", name: "Casual" });
  await db.insert(s.leaveRequests).values({ id: newId(), personId: ids.designer, leaveTypeId: type, startDate: "2026-10-14", endDate: "2026-10-14", halfDay: "first_half", status: "approved", reason: "x" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("my week", () => {
  it("shows each day's expected and logged time, with gaps flagged", async () => {
    const r = await at("2026-10-16").week(designer(), { start: "2026-10-14" });
    if (!r.ok) throw new Error(r.error.message);
    const w = r.value;
    expect(w.weekStart).toBe("2026-10-12");
    expect(w.days.map((d) => [d.date, d.expectedMinutes, d.loggedMinutes, d.fill])).toEqual([
      ["2026-10-12", 400, 420, "ok"],
      ["2026-10-13", 400, 120, "short"],
      ["2026-10-14", 200, 0, "empty"],
      ["2026-10-15", 400, 400, "ok"],
      ["2026-10-16", 400, 0, "upcoming"],
      ["2026-10-17", 400, 0, "upcoming"],
      ["2026-10-18", 0, 0, "off"],
    ]);
    // Their own task, and the one they helped on.
    expect(w.rows.map((r) => [r.taskId, r.totalMinutes])).toEqual([
      [ids.task, 540],
      [ids.other, 400],
    ]);
    expect(w.days.map((d) => d.editable)).toEqual([true, true, true, true, true, false, false]);
  });

  it("is private: others see it only as a lead", async () => {
    const editor = await at("2026-10-16").week(actorOf(ids.editor, ["video_editor"]), { personId: ids.designer });
    expect(editor.ok ? "ok" : editor.error.code).toBe("forbidden");
    const lead = await at("2026-10-16").week(actorOf(ids.strategist, ["strategist"]), { personId: ids.designer });
    expect(lead.ok && lead.value.mine).toBe(false);
    expect(lead.ok && lead.value.days.every((d) => !d.editable)).toBe(true);
  });

  it("locks days of a month closed after the 5th", async () => {
    const r = await at("2026-11-06").week(designer(), { start: "2026-10-26" });
    expect(r.ok && r.value.days.map((d) => d.editable)).toEqual([false, false, false, false, false, false, true]);
  });
});

describe("filling by totals", () => {
  it("adds the difference when the total goes up", async () => {
    const r = await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-13", hours: "6.5" });
    expect(r.ok && r.value).toEqual({ minutes: 390, dayMinutes: 390 });
    expect((await liveEntries()).filter((e) => e.workDate === "2026-10-13").map((e) => e.minutes)).toEqual([120, 270]);
  });

  it("takes a lower total off the newest entries, keeping the older one's non-billable mark", async () => {
    // 2h (older, marked non-billable by a lead) then 1h: lowering the day to 1.5h removes the 1h and shrinks the 2h.
    await db.update(s.timeEntries).set({ billable: false, note: "Rework" }).where(sql`${s.timeEntries.workDate} = '2026-10-13'`);
    await addTime(db, { taskId: ids.task, personId: ids.designer, clientId: ids.client, engagementId: null, minutes: 60, workDate: "2026-10-13" });
    const r = await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-13", hours: "1.5" });
    expect(r.ok && r.value.minutes).toBe(90);
    const left = await db.select({ minutes: s.timeEntries.minutes, billable: s.timeEntries.billable, note: s.timeEntries.note }).from(s.timeEntries).where(sql`${s.timeEntries.workDate} = '2026-10-13' and ${s.timeEntries.deletedAt} is null`);
    expect(left).toEqual([{ minutes: 90, billable: false, note: "Rework" }]);
    const actions = (await db.select({ action: s.events.action }).from(s.events).where(sql`${s.events.actorId} = ${ids.designer}`)).map((e) => e.action).sort();
    expect(actions).toEqual(["time.changed", "time.removed"]);
  });

  it("two saves of the same cell at once add the hours only once", async () => {
    const save = () => at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-14", hours: "2" });
    const results = await Promise.all([save(), save(), save()]);
    expect(results.every((x) => x.ok)).toBe(true);
    expect((await liveEntries()).filter((e) => e.workDate === "2026-10-14").reduce((sum, e) => sum + e.minutes, 0)).toBe(120);
  });

  it("takes 1:30 and 1h30, and says what's wrong with the rest (test report M3)", async () => {
    const r = await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-15", hours: "1:30" });
    expect(r.ok && r.value.minutes).toBe(90);
    const h = await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-15", hours: "1h30" });
    expect(h.ok && h.value.minutes).toBe(90);
    const message = async (hours: string) => {
      const x = await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-15", hours });
      return !x.ok && x.error.fieldErrors?.hours?.[0];
    };
    expect(await message("-1")).toBe("Hours can't be negative.");
    expect(await message("30")).toBe("Hours must be between 0 and 16 for one day.");
    expect(await message("abc")).toBe("Write hours like 1.5, 1:30 or 1h30.");
  });

  it("allows up to 16 hours in a cell", async () => {
    expect((await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-15", hours: "13" })).ok).toBe(true);
  });

  it("clearing a cell removes that day's time on the task", async () => {
    expect((await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-12", hours: "" })).ok).toBe(true);
    expect((await liveEntries()).filter((e) => e.workDate === "2026-10-12")).toEqual([]);
  });

  it("refuses future days and closed months (but a lead can fix a closed month)", async () => {
    const future = await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-17", hours: "1" });
    expect(!future.ok && future.error.code).toBe("invalid");
    const closed = await at("2026-11-06").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-30", hours: "1" });
    expect(!closed.ok && closed.error.code).toBe("conflict");
    const lead = await at("2026-11-06").setDayTotal(actorOf(ids.designer, ["designer", "strategist"]), { taskId: ids.task, workDate: "2026-10-30", hours: "1" });
    expect(lead.ok).toBe(true);
  });

  it("only touches your own time", async () => {
    await addTime(db, { taskId: ids.task, personId: ids.editor, clientId: ids.client, engagementId: null, minutes: 60, workDate: "2026-10-13" });
    await at("2026-10-16").setDayTotal(designer(), { taskId: ids.task, workDate: "2026-10-13", hours: "" });
    const editor = await db.select().from(s.timeEntries).where(sql`${s.timeEntries.personId} = ${ids.editor} and ${s.timeEntries.deletedAt} is null`);
    expect(editor).toHaveLength(1);
    expect(await eventsFor(db, editor[0]!.id)).toEqual([]);
  });
});

describe("the team's week", () => {
  it("lists people with the most gaps first, for leads only", async () => {
    const r = await at("2026-10-16").team(actorOf(ids.strategist, ["strategist"]), "2026-10-12");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.rows[0]).toMatchObject({ personName: "Anjali Nair", gaps: 4 });
    expect(r.value.rows.find((x) => x.personId === ids.designer)).toMatchObject({ gaps: 2, loggedMinutes: 940, expectedMinutes: 2200 });
    const designerView = await at("2026-10-16").team(designer(), "2026-10-12");
    expect(designerView.ok ? "ok" : designerView.error.code).toBe("forbidden");
  });
});
