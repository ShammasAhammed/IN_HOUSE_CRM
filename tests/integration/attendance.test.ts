// Attendance (HR slice 2, D76): check in/out, the presence board, months, HR corrections.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { istInstant } from "@/lib/dates";
import { newId } from "@/lib/id";
import { createAttendanceService } from "@/services/attendance";
import type { Clock } from "@/services/clock";
import { actorOf, addPerson, eventsFor, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
/** A clock at a wall-clock time in India. */
const at = (date: string, time: string): Clock => ({ today: () => date, now: () => istInstant(date, time) });
const svc = (date: string, time = "09:30") => createAttendanceService({ store, clock: at(date, time) });
const ids = {} as Record<"designer" | "intern" | "freelancer" | "hr" | "owner", string>;
const designer = () => actorOf(ids.designer, ["designer"]);
const hr = () => actorOf(ids.hr, ["hr"]);

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.intern = await addPerson(db, "Hiba Nasrin", ["intern"]);
  ids.freelancer = await addPerson(db, "Rafi Shoot", ["video_editor"], { employmentType: "freelancer" });
  ids.hr = await addPerson(db, "Divya Suresh", ["hr"]);
  await db.insert(s.settings).values({ key: "work_week", value: { workingWeekdays: [1, 2, 3, 4, 5, 6], saturdaysOff: [2] } });
  // The intern is on approved leave on Wednesday 14 October.
  const type = newId();
  await db.insert(s.leaveTypes).values({ id: type, key: "casual", name: "Casual" });
  await db.insert(s.leaveRequests).values({ id: newId(), personId: ids.intern, leaveTypeId: type, startDate: "2026-10-14", endDate: "2026-10-14", status: "approved", reason: "x" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("checking in and out", () => {
  it("records where and when, flags late after 9:45, and only once a day", async () => {
    const r = await svc("2026-10-14", "10:02").checkIn(designer(), { location: "client_site", note: "Shoot at Zenith", lat: "10.0261", lng: "76.3125" });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.late).toBe(true);
    const again = await svc("2026-10-14", "10:05").checkIn(designer(), { location: "office" });
    expect(!again.ok && again.error.code).toBe("conflict");
    expect((await svc("2026-10-14", "18:40").checkOut(designer(), {})).ok).toBe(true);
    const [row] = await db.select().from(s.attendanceDays);
    expect(row).toMatchObject({ location: "client_site", note: "Shoot at Zenith", latMilli: 10026, lngMilli: 76313, workDate: "2026-10-14" });
    expect(row!.checkOutAt!.toISOString()).toBe("2026-10-14T13:10:00.000Z");
    expect((await eventsFor(db, row!.id)).map((e) => e.action)).toEqual(["attendance.checked_in", "attendance.checked_out"]);
  });

  it("is not for freelancers", async () => {
    const r = await svc("2026-10-14").checkIn(actorOf(ids.freelancer, ["video_editor"]), { location: "home" });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
  });

  it("closes a forgotten day with the time you left, within a week", async () => {
    await svc("2026-10-12", "09:31").checkIn(designer(), { location: "office" });
    const view = await svc("2026-10-14").today(designer());
    expect(view.ok && view.value.me.openDays.map((d) => d.workDate)).toEqual(["2026-10-12"]);
    const before = await svc("2026-10-14").checkOut(designer(), { workDate: "2026-10-12", time: "08:00" });
    expect(!before.ok && before.error.fieldErrors?.time).toEqual(["That's before you checked in."]);
    expect((await svc("2026-10-14").checkOut(designer(), { workDate: "2026-10-12", time: "18:15" })).ok).toBe(true);
    // A day left open for more than a week goes to HR.
    await svc("2026-10-13", "09:31").checkIn(designer(), { location: "office" });
    const old = await svc("2026-10-30").checkOut(designer(), { workDate: "2026-10-13", time: "18:15" });
    expect(!old.ok && old.error).toMatchObject({ code: "conflict", message: "That's more than a week ago. Ask HR to correct it." });
  });
});

describe("who is where", () => {
  it("shows everyone who keeps attendance, without locations", async () => {
    await svc("2026-10-14", "09:20").checkIn(designer(), { location: "home", lat: "10", lng: "76" });
    const r = await svc("2026-10-14", "11:00").today(actorOf(ids.intern, ["intern"]));
    if (!r.ok) throw new Error(r.error.message);
    const byName = Object.fromEntries(r.value.board.map((b) => [b.fullName, [b.status, b.location]]));
    expect(byName).toEqual({ "Vishnu Prasad": ["in", "home"], "Hiba Nasrin": ["leave", null], "Faisal Rahman": ["not_in", null], "Divya Suresh": ["not_in", null] });
    expect(JSON.stringify(r.value.board)).not.toContain("lat");
    // Times would show who was late: only on your own row, or for HR and the owner (D76).
    expect(r.value.board.find((b) => b.fullName === "Vishnu Prasad")!.since).toBeNull();
    const own = await svc("2026-10-14", "11:00").today(designer());
    expect(own.ok && own.value.board.find((b) => b.fullName === "Vishnu Prasad")!.since).not.toBeNull();
    const asHr = await svc("2026-10-14", "11:00").today(hr());
    expect(asHr.ok && asHr.value.board.find((b) => b.fullName === "Vishnu Prasad")!.since).not.toBeNull();
  });

  it("My Day asks for a check-in only on a working day you're not on leave", async () => {
    const onLeave = await svc("2026-10-14").my(actorOf(ids.intern, ["intern"]));
    expect(onLeave.ok && onLeave.value!.expected).toBe(false);
    const working = await svc("2026-10-14").my(designer());
    expect(working.ok && working.value!.expected).toBe(true);
    const sunday = await svc("2026-10-18").my(designer());
    expect(sunday.ok && sunday.value!.expected).toBe(false);
    const freelancer = await svc("2026-10-14").my(actorOf(ids.freelancer, ["video_editor"], { employmentType: "freelancer" }));
    expect(freelancer.ok && freelancer.value).toBeNull();
  });
});

describe("the month", () => {
  it("is yours to see; HR and the owner see anyone's", async () => {
    await svc("2026-10-12", "09:31").checkIn(designer(), { location: "office" });
    const mine = await svc("2026-10-14").month(designer(), { month: "2026-10" });
    if (!mine.ok) throw new Error(mine.error.message);
    expect(mine.value.counts.present.office).toBe(1);
    const peek = await svc("2026-10-14").month(actorOf(ids.intern, ["intern"]), { personId: ids.designer, month: "2026-10" });
    expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
    expect((await svc("2026-10-14").month(hr(), { personId: ids.designer, month: "2026-10" })).ok).toBe(true);
    expect((await svc("2026-10-14").team(designer())).ok).toBe(false);
  });

  it("keeps a leaver in the team month they left, and in earlier ones", async () => {
    await db.update(s.people).set({ status: "left", endDate: "2026-10-09" }).where(sql`${s.people.id} = ${ids.designer}`);
    const names = async (month: string) => {
      const r = await svc("2026-10-14").team(hr(), month);
      if (!r.ok) throw new Error(r.error.message);
      return r.value.rows.map((x) => x.fullName);
    };
    expect(await names("2026-10")).toContain("Vishnu Prasad");
    expect(await names("2026-11")).not.toContain("Vishnu Prasad");
    expect(await names("2026-10")).not.toContain("Rafi Shoot");
  });
});

describe("corrections", () => {
  it("HR records and corrects a day with a reason, and can remove one", async () => {
    const add = await svc("2026-10-14").record(hr(), { personId: ids.designer, workDate: "2026-10-13", location: "office", inTime: "09:30", outTime: "18:00", reason: "Forgot to check in" });
    expect(add.ok).toBe(true);
    const fix = await svc("2026-10-14").record(hr(), { personId: ids.designer, workDate: "2026-10-13", location: "client_site", inTime: "09:30", outTime: "18:00", reason: "Was at the shoot" });
    expect(fix.ok).toBe(true);
    const [row] = await db.select().from(s.attendanceDays);
    expect(row).toMatchObject({ location: "client_site", correctedById: ids.hr, correctionReason: "Was at the shoot" });
    expect((await eventsFor(db, row!.id)).map((e) => e.action)).toEqual(["attendance.recorded", "attendance.corrected"]);
    expect((await svc("2026-10-14").remove(hr(), { personId: ids.designer, workDate: "2026-10-13", reason: "Duplicate" })).ok).toBe(true);
    expect(await db.select({ id: s.attendanceDays.id }).from(s.attendanceDays).where(sql`${s.attendanceDays.deletedAt} is null`)).toEqual([]);
  });

  it("needs a reason, isn't for others, and HR can't correct their own days", async () => {
    const noReason = await svc("2026-10-14").record(hr(), { personId: ids.designer, workDate: "2026-10-13", location: "office", inTime: "09:30", reason: "" });
    expect(!noReason.ok && noReason.error.fieldErrors?.reason).toBeDefined();
    const designerFix = await svc("2026-10-14").record(designer(), { personId: ids.designer, workDate: "2026-10-13", location: "office", inTime: "09:30", reason: "Myself" });
    expect(designerFix.ok ? "ok" : designerFix.error.code).toBe("forbidden");
    const own = await svc("2026-10-14").record(hr(), { personId: ids.hr, workDate: "2026-10-13", location: "office", inTime: "09:30", reason: "Myself" });
    expect(own.ok ? "ok" : own.error.code).toBe("forbidden");
    const owner = await svc("2026-10-14").record(actorOf(ids.owner, ["owner"]), { personId: ids.hr, workDate: "2026-10-13", location: "office", inTime: "09:30", reason: "Confirmed" });
    expect(owner.ok).toBe(true);
  });

  it("isn't for freelancers, or for days outside someone's time here", async () => {
    const freelancer = await svc("2026-10-14").record(hr(), { personId: ids.freelancer, workDate: "2026-10-13", location: "office", inTime: "09:30", reason: "Shoot day" });
    expect(!freelancer.ok && freelancer.error.code).toBe("invalid");
    const before = await svc("2026-10-14").record(hr(), { personId: ids.designer, workDate: "2019-01-07", location: "office", inTime: "09:30", reason: "Old day" });
    expect(!before.ok && before.error.fieldErrors?.workDate).toEqual(["Pick a day while they worked here."]);
  });
});

describe("test report fixes", () => {
  it("H3: a check-in or check-out later than now is refused", async () => {
    const at1016 = svc("2026-10-16", "10:16");
    const owner = actorOf(ids.owner, ["owner"]);
    expect(await at1016.record(owner, { personId: ids.owner, workDate: "2026-10-16", location: "office", inTime: "09:30", outTime: "18:30", reason: "test" })).toMatchObject({ ok: false, error: { code: "invalid", fieldErrors: { outTime: expect.any(Array) } } });
    expect(await at1016.record(hr(), { personId: ids.designer, workDate: "2026-10-16", location: "office", inTime: "11:00", reason: "test" })).toMatchObject({ ok: false, error: { fieldErrors: { inTime: expect.any(Array) } } });
    expect(await at1016.record(hr(), { personId: ids.designer, workDate: "2026-10-16", location: "office", inTime: "09:30", reason: "still here" })).toMatchObject({ ok: true });
    expect(await at1016.record(hr(), { personId: ids.designer, workDate: "2026-10-15", location: "office", inTime: "09:30", outTime: "18:30", reason: "yesterday" })).toMatchObject({ ok: true });
  });

  it("M1: checking in again after checking out reopens the day; the time away isn't worked", async () => {
    await svc("2026-10-14", "09:30").checkIn(designer(), { location: "office" });
    await svc("2026-10-14", "12:30").checkOut(designer(), {});
    expect(await svc("2026-10-14", "13:30").checkIn(designer(), { location: "office" })).toMatchObject({ ok: true });
    expect(await svc("2026-10-14", "13:31").checkIn(designer(), { location: "office" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    await svc("2026-10-14", "18:30").checkOut(designer(), {});
    const [row] = await db.select().from(s.attendanceDays);
    expect(row).toMatchObject({ awayMinutes: 60 });
    const m = await svc("2026-10-14", "19:00").month(designer(), { month: "2026-10" });
    expect(m.ok && m.value.days.find((d) => d.date === "2026-10-14")?.workedMinutes).toBe(8 * 60);
  });
});
