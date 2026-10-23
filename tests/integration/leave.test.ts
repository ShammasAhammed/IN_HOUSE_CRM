// HR slice 1: leave rules end to end (decisions D39–D48), on real PostgreSQL.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";

import type { Role } from "@/lib/types";
import { createLeaveService } from "@/services/leave";
import { actorOf, addDepartment, addLeaveSetup, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const leave = createLeaveService({ store, clock: fixedClock("2026-10-14") }); // a Wednesday

let types: Awaited<ReturnType<typeof addLeaveSetup>>;
const ids = {} as Record<"owner" | "anjali" | "rahul" | "vishnu" | "aswathy" | "hr" | "intern" | "freelancer", string>;
const roles: Record<keyof typeof ids, Role[]> = {
  owner: ["owner"],
  anjali: ["strategist"],
  rahul: ["performance_marketer"],
  vishnu: ["designer"],
  aswathy: ["designer"],
  hr: ["hr"],
  intern: ["intern"],
  freelancer: ["video_editor"],
};
const as = (who: keyof typeof ids) => actorOf(ids[who], roles[who]);

beforeEach(async () => {
  await wipe(db);
  types = await addLeaveSetup(db);
  const creative = await addDepartment(db, "Creative");
  const performance = await addDepartment(db, "Performance");
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.anjali = await addPerson(db, "Anjali Nair", roles.anjali, { reportsToId: ids.owner, departmentId: performance });
  ids.rahul = await addPerson(db, "Rahul Krishnan", roles.rahul, { reportsToId: ids.anjali, departmentId: performance });
  ids.vishnu = await addPerson(db, "Vishnu Prasad", roles.vishnu, { reportsToId: ids.owner, departmentId: creative });
  ids.aswathy = await addPerson(db, "Aswathy Menon", roles.aswathy, { reportsToId: ids.vishnu, departmentId: creative });
  ids.hr = await addPerson(db, "Divya Suresh", roles.hr, { reportsToId: ids.owner });
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern, { reportsToId: ids.vishnu, joinDate: "2026-07-10" });
  ids.freelancer = await addPerson(db, "Free Lancer", roles.freelancer, { employmentType: "freelancer" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

const casual = (startDate: string, endDate = startDate, extra: Record<string, unknown> = {}) => ({ leaveTypeId: types.casual, startDate, endDate, ...extra });

async function balance(who: keyof typeof ids, key: string, year = 2026) {
  const r = await leave.balancesFor(as(who), ids[who], year);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.find((b) => b.key === key)!;
}

describe("applying", () => {
  it("sends the request to the person's manager and reserves the balance", async () => {
    const r = await leave.apply(as("rahul"), casual("2026-10-22", "2026-10-23", { reason: "Wedding" }));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value).toMatchObject({ approved: false, request: { status: "pending", approverName: "Anjali Nair", halfDays: 4 } });
    expect(await balance("rahul", "casual")).toMatchObject({ entitledHalfDays: 24, pendingHalfDays: 4, availableHalfDays: 20 });
    expect((await eventsFor(db, r.value.request.id)).map((e) => e.action)).toEqual(["leave.requested"]);
  });

  it("counts working days only and half-days as half", async () => {
    // Fri 16 → Wed 21 Oct: Fri, Sat (3rd), Mon, Wed = 4 days (Sun off, Tue 20th a holiday).
    const r = await leave.preview(as("rahul"), casual("2026-10-16", "2026-10-21"));
    expect(r.ok && r.value.halfDays).toBe(8);
    const half = await leave.preview(as("rahul"), casual("2026-10-15", "2026-10-15", { halfDay: "first_half" }));
    expect(half.ok && half.value.halfDays).toBe(1);
  });

  it("refuses days that are already off, past days, double booking and too little balance", async () => {
    expect(await leave.apply(as("rahul"), casual("2026-10-18"))).toMatchObject({ ok: false, error: { message: expect.stringContaining("already off") } });
    expect(await leave.apply(as("rahul"), casual("2026-10-13"))).toMatchObject({ ok: false, error: { code: "invalid" } });
    await leave.apply(as("rahul"), casual("2026-10-22"));
    expect(await leave.apply(as("rahul"), casual("2026-10-22", "2026-10-23"))).toMatchObject({ ok: false, error: { code: "conflict" } });
    // 12 days a year, 1 already pending, 11 left. 2–16 Nov is 12 working days (the 14th is the second Saturday).
    const tooMuch = await leave.apply(as("rahul"), casual("2026-11-02", "2026-11-16"));
    expect(tooMuch).toMatchObject({ ok: false, error: { code: "conflict", message: expect.stringContaining("left in 2026") } });
  });

  it("records no event for a refused request (rollback itself is proven by the holiday test below)", async () => {
    await leave.apply(as("rahul"), casual("2026-11-02", "2026-12-14"));
    const [{ count }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from events`).then((r) => [...r]) as Array<{ count: number }>;
    expect(count).toBe(0);
  });

  it("allows sick leave up to 7 days back, but not more", async () => {
    expect((await leave.apply(as("rahul"), { leaveTypeId: types.sick, startDate: "2026-10-07", endDate: "2026-10-07" })).ok).toBe(true);
    const old = await leave.apply(as("rahul"), { leaveTypeId: types.sick, startDate: "2026-10-06", endDate: "2026-10-06" });
    expect(old).toMatchObject({ ok: false, error: { message: expect.stringContaining("7 days back") } });
  });

  it("warns about a clash in the same department without blocking", async () => {
    await leave.apply(as("vishnu"), casual("2026-10-23"));
    const r = await leave.apply(as("aswathy"), casual("2026-10-23", "2026-10-24"));
    if (!r.ok) throw new Error(r.error.message);
    // Vishnu's own request is still pending with the owner; pending leave clashes too.
    expect(r.value.clashes).toEqual([expect.objectContaining({ personName: "Vishnu Prasad", status: "pending" })]);
  });

  it("auto-approves the owner's own leave", async () => {
    const r = await leave.apply(as("owner"), casual("2026-11-05"));
    expect(r.ok && r.value.approved).toBe(true);
  });

  it("refuses freelancers", async () => {
    expect(await leave.apply(as("freelancer"), casual("2026-11-05"))).toMatchObject({ ok: false, error: { code: "invalid" } });
  });

  it("lets HR record past leave for someone, approved", async () => {
    const r = await leave.apply(as("hr"), { ...casual("2026-09-01"), forPersonId: ids.rahul });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.approved).toBe(true);
    expect((await eventsFor(db, r.value.request.id)).map((e) => e.action)).toEqual(["leave.requested", "leave.recorded"]);
    // A designer can't.
    expect(await leave.apply(as("vishnu"), { ...casual("2026-11-01"), forPersonId: ids.rahul })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("charges a leave across the year end to each year", async () => {
    const r = await leave.apply(as("rahul"), casual("2026-12-30", "2027-01-02"));
    if (!r.ok) throw new Error(r.error.message);
    expect((await balance("rahul", "casual", 2026)).pendingHalfDays).toBe(4);
    expect((await balance("rahul", "casual", 2027)).pendingHalfDays).toBe(4);
  });

  it("prorates an intern who joined mid-year", async () => {
    // Joined 10 Jul (≤ 15th): Jul–Dec = 6 months of a 6-day quota = 3 days.
    expect((await balance("intern", "casual")).entitledHalfDays).toBe(6);
  });
});

describe("deciding", () => {
  async function pending(who: keyof typeof ids, start = "2026-10-22", end = start) {
    const r = await leave.apply(as(who), casual(start, end));
    if (!r.ok) throw new Error(r.error.message);
    return r.value.request.id;
  }

  it("lets the manager approve, and not colleagues or HR", async () => {
    const id = await pending("rahul");
    expect(await leave.decide(as("vishnu"), { requestId: id }, true)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await leave.decide(as("hr"), { requestId: id }, true)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await leave.decide(as("anjali"), { requestId: id }, true)).toMatchObject({ ok: true, value: { status: "approved" } });
    expect(await leave.decide(as("anjali"), { requestId: id }, true)).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("lets the owner decide anyone's request, and rejecting frees the balance", async () => {
    const id = await pending("rahul");
    expect(await leave.decide(as("owner"), { requestId: id, note: "Launch week" }, false)).toMatchObject({ ok: true, value: { status: "rejected" } });
    expect((await balance("rahul", "casual")).availableHalfDays).toBe(24);
  });

  it("lists approvals with the clash and balance after", async () => {
    await leave.apply(as("vishnu"), casual("2026-10-23"));
    await pending("aswathy", "2026-10-23");
    const r = await leave.approvals(as("vishnu"));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.mine).toHaveLength(1);
    expect(r.value.mine[0]).toMatchObject({ kind: "leave", availableAfter: 22, clashes: [expect.objectContaining({ personName: "Vishnu Prasad" })] });
  });
});

describe("cancelling and revoking (D43)", () => {
  it("cancels pending and future approved leave at once, restoring the balance", async () => {
    const r = await leave.apply(as("rahul"), casual("2026-10-22"));
    if (!r.ok) throw new Error(r.error.message);
    expect(await leave.cancel(as("rahul"), r.value.request.id)).toEqual({ ok: true, value: { outcome: "cancelled" } });
    expect((await balance("rahul", "casual")).availableHalfDays).toBe(24);
    // Someone else can't cancel it.
    const other = await leave.apply(as("rahul"), casual("2026-10-27"));
    if (!other.ok) throw new Error(other.error.message);
    expect((await leave.cancel(as("vishnu"), other.value.request.id)).ok).toBe(false);
  });

  it("turns cancelling started leave into a request to cut it short, which the manager approves", async () => {
    // The owner records leave that started yesterday and runs to Friday (approved at once).
    const r = await leave.apply(as("owner"), { ...casual("2026-10-13", "2026-10-16"), forPersonId: ids.rahul });
    if (!r.ok) throw new Error(r.error.message);
    expect(await leave.cancel(as("rahul"), r.value.request.id)).toEqual({ ok: true, value: { outcome: "cut_short_requested" } });
    const inbox = await leave.approvals(as("anjali"));
    expect(inbox.ok && inbox.value.mine.map((i) => i.kind)).toEqual(["cut_short"]);
    expect(await leave.decideCutShort(as("anjali"), { requestId: r.value.request.id }, true)).toMatchObject({ ok: true, value: { effectiveEnd: "2026-10-14" } });
    // 13–14 Oct remain: 2 days used, not 4.
    expect((await balance("rahul", "casual")).usedHalfDays).toBe(4);
  });

  it("lets the approver revoke future approved leave with a reason", async () => {
    const r = await leave.apply(as("rahul"), casual("2026-10-27"));
    if (!r.ok) throw new Error(r.error.message);
    await leave.decide(as("anjali"), { requestId: r.value.request.id }, true);
    expect(await leave.revoke(as("anjali"), { requestId: r.value.request.id, note: "" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await leave.revoke(as("anjali"), { requestId: r.value.request.id, note: "Client launch moved to that day" })).toMatchObject({
      ok: true,
      value: { status: "revoked", decisionNote: "Client launch moved to that day" },
    });
  });
});

describe("comp-off", () => {
  it("can be granted by HR and used before it expires", async () => {
    const g = await leave.grant(as("hr"), { personId: ids.rahul, leaveTypeId: types.comp_off, days: "1", reason: "Sunday shoot" });
    expect(g.ok).toBe(true);
    expect((await balance("rahul", "comp_off")).availableHalfDays).toBe(2);
    expect((await leave.apply(as("rahul"), { leaveTypeId: types.comp_off, startDate: "2026-10-22", endDate: "2026-10-22" })).ok).toBe(true);
    expect((await balance("rahul", "comp_off")).availableHalfDays).toBe(0);
  });

  it("can't be used on a date after the grant expires", async () => {
    await leave.grant(as("hr"), { personId: ids.rahul, leaveTypeId: types.comp_off, days: "1", reason: "Shoot" });
    // Granted 14 Oct, expires 13 Dec.
    const late = await leave.apply(as("rahul"), { leaveTypeId: types.comp_off, startDate: "2026-12-15", endDate: "2026-12-15" });
    expect(late).toMatchObject({ ok: false, error: { message: expect.stringContaining("comp-off") } });
  });

  it("can't be granted to yourself by HR, or by a designer at all", async () => {
    expect((await leave.grant(as("hr"), { personId: ids.hr, leaveTypeId: types.comp_off, days: "1", reason: "x x x" })).ok).toBe(false);
    expect((await leave.grant(as("vishnu"), { personId: ids.rahul, leaveTypeId: types.comp_off, days: "1", reason: "x x x" })).ok).toBe(false);
  });
});

describe("team calendar (D18)", () => {
  it("shows everyone who is off, but the type only to the person, approver and HR", async () => {
    const r = await leave.apply(as("rahul"), { leaveTypeId: types.sick, startDate: "2026-10-14", endDate: "2026-10-14" });
    if (!r.ok) throw new Error(r.error.message);
    await leave.decide(as("anjali"), { requestId: r.value.request.id }, true);
    const pendingReq = await leave.apply(as("aswathy"), casual("2026-10-22"));
    expect(pendingReq.ok).toBe(true);

    const forColleague = await leave.teamCalendar(as("vishnu"), "2026-10");
    const forHr = await leave.teamCalendar(as("hr"), "2026-10");
    if (!forColleague.ok || !forHr.ok) throw new Error("calendar failed");
    const row = (cal: typeof forHr, name: string) => cal.ok && cal.value.rows.find((x) => x.personName === name)!;
    expect(row(forColleague, "Rahul Krishnan") && row(forColleague, "Rahul Krishnan").days["2026-10-14"]).toEqual({ status: "approved", halfDay: null, typeName: null });
    expect(row(forHr, "Rahul Krishnan") && row(forHr, "Rahul Krishnan").days["2026-10-14"]?.typeName).toBe("Sick leave");
    // Aswathy's pending request: her approver (Vishnu) sees it; an unrelated colleague doesn't.
    expect(row(forColleague, "Aswathy Menon") && row(forColleague, "Aswathy Menon").days["2026-10-22"]?.status).toBe("pending");
    const forRahul = await leave.teamCalendar(as("rahul"), "2026-10");
    expect(forRahul.ok && forRahul.value.rows.find((x) => x.personName === "Aswathy Menon")!.days["2026-10-22"]).toBeUndefined();
    expect(forHr.value.holidays).toEqual([{ date: "2026-10-20", name: "Vijayadashami" }]);
  });
});

describe("HR settings", () => {
  it("lets HR change a quota and records the change; others can't", async () => {
    expect(await leave.setQuota(as("hr"), { leaveTypeId: types.casual, employmentType: "full_time", days: "15" })).toEqual({ ok: true, value: { halfDays: 30 } });
    expect((await balance("rahul", "casual")).entitledHalfDays).toBe(30);
    expect((await leave.setQuota(as("anjali"), { leaveTypeId: types.casual, employmentType: "full_time", days: "20" })).ok).toBe(false);
    expect((await eventsFor(db, types.casual)).map((e) => e.action)).toEqual(["leave.quota_changed"]);
  });

  it("manages holidays, refusing duplicates", async () => {
    const added = await leave.addHoliday(as("hr"), { date: "2026-11-08", name: "Deepavali" });
    expect(added.ok).toBe(true);
    expect((await leave.addHoliday(as("hr"), { date: "2026-11-08", name: "Again" })).ok).toBe(false);
    if (added.ok) expect((await leave.removeHoliday(as("hr"), added.value.id)).ok).toBe(true);
    expect((await leave.addHoliday(as("rahul"), { date: "2026-11-09", name: "Mine" })).ok).toBe(false);
    const rows = await db.select().from(s.holidays).where(sql`${s.holidays.date} = '2026-11-08'`);
    expect(rows[0]?.deletedAt).not.toBeNull(); // soft-deleted, never removed
  });
});


describe("review fixes (stage 5)", () => {
  it("accepts form-shaped input: empty strings for 'full day' and 'for me'", async () => {
    const r = await leave.apply(as("rahul"), { leaveTypeId: types.casual, startDate: "2026-10-22", endDate: "2026-10-22", halfDay: "", forPersonId: "", reason: "" });
    expect(r.ok).toBe(true);
  });

  it("lets only one of several simultaneous requests spend the same balance", async () => {
    // 11 working days of a 12-day balance, sent three times at once.
    const tries = await Promise.all([1, 2, 3].map(() => leave.apply(as("rahul"), casual("2026-11-02", "2026-11-13"))));
    expect(tries.filter((t) => t.ok)).toHaveLength(1);
    expect((await balance("rahul", "casual")).availableHalfDays).toBeGreaterThanOrEqual(0);
  });

  it("lets only one of a simultaneous approve and reject win", async () => {
    const r = await leave.apply(as("rahul"), casual("2026-10-22"));
    if (!r.ok) throw new Error(r.error.message);
    const [a, b] = await Promise.all([
      leave.decide(as("anjali"), { requestId: r.value.request.id }, true),
      leave.decide(as("owner"), { requestId: r.value.request.id }, false),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const events = (await eventsFor(db, r.value.request.id)).map((e) => e.action);
    expect(events.filter((e) => e === "leave.approved" || e === "leave.rejected")).toHaveLength(1);
  });

  it("sends HR-recorded future leave to the approver; past leave is recorded approved", async () => {
    const future = await leave.apply(as("hr"), { ...casual("2026-12-01", "2026-12-02"), forPersonId: ids.anjali });
    expect(future).toMatchObject({ ok: true, value: { approved: false, request: { status: "pending", approverName: "Faisal Rahman" } } });
    const past = await leave.apply(as("hr"), { ...casual("2026-10-05"), forPersonId: ids.anjali });
    expect(past).toMatchObject({ ok: true, value: { approved: true } });
    const byOwner = await leave.apply(as("owner"), { ...casual("2026-12-10"), forPersonId: ids.anjali });
    expect(byOwner).toMatchObject({ ok: true, value: { approved: true } });
  });

  it("refuses leave beyond the end of next year", async () => {
    expect(await leave.apply(as("rahul"), casual("2028-01-03"))).toMatchObject({ ok: false, error: { fieldErrors: { endDate: expect.any(Array) } } });
  });

  it("allows a morning and an afternoon on the same day", async () => {
    expect((await leave.apply(as("rahul"), casual("2026-10-22", "2026-10-22", { halfDay: "first_half" }))).ok).toBe(true);
    expect((await leave.apply(as("rahul"), { leaveTypeId: types.sick, startDate: "2026-10-22", endDate: "2026-10-22", halfDay: "second_half" })).ok).toBe(true);
    expect((await leave.apply(as("rahul"), casual("2026-10-22", "2026-10-22", { halfDay: "first_half" }))).ok).toBe(false);
  });

  it("refuses revoke and cut-short decisions from people who aren't the approver", async () => {
    const r = await leave.apply(as("rahul"), casual("2026-10-27"));
    if (!r.ok) throw new Error(r.error.message);
    await leave.decide(as("anjali"), { requestId: r.value.request.id }, true);
    expect(await leave.revoke(as("vishnu"), { requestId: r.value.request.id, note: "Not mine to say" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const started = await leave.apply(as("owner"), { ...casual("2026-10-13", "2026-10-16"), forPersonId: ids.rahul });
    if (!started.ok) throw new Error(started.error.message);
    await leave.cancel(as("rahul"), started.value.request.id);
    expect(await leave.decideCutShort(as("vishnu"), { requestId: started.value.request.id }, true)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    // Declining keeps the leave as planned.
    expect(await leave.decideCutShort(as("anjali"), { requestId: started.value.request.id }, false)).toMatchObject({ ok: true, value: { effectiveEnd: "2026-10-16", cancelRequestedFrom: null } });
  });

  it("refuses removing a past holiday, or one that would take someone below zero, and rolls back", async () => {
    const [christmas] = await db.select().from(s.holidays).where(sql`${s.holidays.date} = '2026-12-25'`);
    // Spend the whole balance on leave around Christmas: 23 Dec – 13 Jan… keep it simple: 12 working days incl. the 25th.
    const r = await leave.apply(as("owner"), casual("2026-12-14", "2026-12-28"));
    if (!r.ok) throw new Error(r.error.message);
    expect((await balance("owner", "casual")).availableHalfDays).toBe(0);
    const removal = await leave.removeHoliday(as("hr"), christmas!.id);
    expect(removal).toMatchObject({ ok: false, error: { code: "conflict", message: expect.stringContaining("Faisal Rahman") } });
    const [still] = await db.select().from(s.holidays).where(sql`${s.holidays.id} = ${christmas!.id}`);
    expect(still?.deletedAt).toBeNull(); // the soft delete was rolled back
    const past = await leave.addHoliday(as("hr"), { date: "2026-10-08", name: "Past day" });
    if (!past.ok) throw new Error(past.error.message);
    expect(await leave.removeHoliday(as("hr"), past.value.id)).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("shows the approver the leave type on the calendar (D18)", async () => {
    const r = await leave.apply(as("aswathy"), { leaveTypeId: types.sick, startDate: "2026-10-15", endDate: "2026-10-15" });
    if (!r.ok) throw new Error(r.error.message);
    const cal = await leave.teamCalendar(as("vishnu"), "2026-10");
    expect(cal.ok && cal.value.rows.find((x) => x.personName === "Aswathy Menon")!.days["2026-10-15"]?.typeName).toBe("Sick leave");
  });

  it("won't let an HR correction take a balance below zero", async () => {
    expect(await leave.grant(as("hr"), { personId: ids.rahul, leaveTypeId: types.casual, days: "-13", reason: "Correction" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect((await leave.grant(as("hr"), { personId: ids.rahul, leaveTypeId: types.casual, days: "-1", reason: "Correction" })).ok).toBe(true);
  });
});

describe("when someone leaves", () => {
  it("cancels their future leave and sends requests waiting on them to the owner", async () => {
    const { createPeopleService } = await import("@/services/people");
    const people = createPeopleService({ store, clock: fixedClock("2026-10-14") });
    const mine = await leave.apply(as("anjali"), casual("2026-11-02"));
    const waiting = await leave.apply(as("rahul"), casual("2026-10-27")); // Anjali approves Rahul
    if (!mine.ok || !waiting.ok) throw new Error("setup");
    expect((await people.markLeft(as("hr"), { personId: ids.anjali, endDate: "2026-10-14" })).ok).toBe(true);
    expect((await store.leave.findRequest(mine.value.request.id))?.status).toBe("cancelled");
    expect((await store.leave.findRequest(waiting.value.request.id))?.approverId).toBe(ids.owner);
    expect(await leave.waitingOnMeCount(as("owner"))).toBeGreaterThanOrEqual(1);
  });
});

describe("leave types (test report H2)", () => {
  it("HR adds a type with yearly days; it can be asked for; retiring hides it from new requests", async () => {
    expect(await leave.addType(as("anjali"), { name: "Earned leave", kind: "quota", maxBackdateDays: "0", full_time: "15" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await leave.addType(as("hr"), { name: "Casual leave", kind: "quota", maxBackdateDays: "0" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await leave.addType(as("hr"), { name: "Odd", kind: "quota", maxBackdateDays: "0", full_time: "1.3" })).toMatchObject({ ok: false });
    const r = await leave.addType(as("hr"), { name: "Earned leave", kind: "quota", maxBackdateDays: "0", full_time: "15", intern: "", allowHalfDay: "on" });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.value.id : "";
    const t = (await store.leave.listTypes()).find((x) => x.id === id)!;
    expect(t).toMatchObject({ key: "earned_leave", usesBalance: true, grantedOnly: false, allowHalfDay: true, quotas: { full_time: 30 } });
    expect((await leave.myOverview(as("anjali"))).ok && (await leave.myOverview(as("anjali")))).toBeTruthy();
    expect(await leave.setTypeActive(as("hr"), { leaveTypeId: id, active: "no" })).toMatchObject({ ok: true });
    expect((await store.leave.findType(id))!.active).toBe(false);
    expect(await leave.apply(as("anjali"), { leaveTypeId: id, startDate: "2026-10-20", endDate: "2026-10-20" })).toMatchObject({ ok: false });
  });
});
