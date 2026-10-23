// Stage 9b.5: start/stop timer.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createTimerService } from "@/services/timers";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
let now = new Date("2026-10-14T04:00:00Z");
const clock = { now: () => now, today: () => "2026-10-14" };
const timers = createTimerService({ store, clock });

const ids = {} as Record<"designer" | "intern" | "zenith" | "reel" | "poster", string>;
const designer = () => actorOf(ids.designer, ["designer"] as Role[]);
const minutesOf = async (taskId: string) => (await db.select({ m: s.timeEntries.minutes, note: s.timeEntries.note, d: s.timeEntries.workDate }).from(s.timeEntries).where(sql`${s.timeEntries.taskId} = ${taskId}`));

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table timers cascade`);
  now = new Date("2026-10-14T04:00:00Z");
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.intern = await addPerson(db, "Hiba Nasrin", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
  const project = newId();
  await db.insert(s.projects).values({ id: project, clientId: ids.zenith, name: "Oct" });
  ids.reel = newId();
  ids.poster = newId();
  await db.insert(s.tasks).values([
    { id: ids.reel, projectId: project, clientId: ids.zenith, title: "Reel", rank: "a0", ownerId: ids.designer },
    { id: ids.poster, projectId: project, clientId: ids.zenith, title: "Poster", rank: "a1", ownerId: ids.designer },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("timer", () => {
  it("logs the minutes when stopped, and switching tasks stops the first", async () => {
    expect((await timers.start(designer(), ids.reel)).ok).toBe(true);
    expect(await timers.running(designer())).toMatchObject({ taskId: ids.reel, taskTitle: "Reel" });
    now = new Date("2026-10-14T04:47:20Z");
    expect(await timers.start(designer(), ids.poster)).toMatchObject({ ok: true, value: { stopped: { minutes: 47, logged: true, taskId: ids.reel } } });
    now = new Date("2026-10-14T05:10:00Z");
    expect(await timers.stop(designer())).toMatchObject({ ok: true, value: { minutes: 23, logged: true } });
    expect(await minutesOf(ids.reel)).toEqual([{ m: 47, note: "Timer", d: "2026-10-14" }]);
    expect(await minutesOf(ids.poster)).toEqual([{ m: 23, note: "Timer", d: "2026-10-14" }]);
    expect(await timers.running(designer())).toBeNull();
    expect(await timers.stop(designer())).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("caps a forgotten timer at 12 hours, logs nothing under a minute, and lets you discard one", async () => {
    await timers.start(designer(), ids.reel);
    now = new Date("2026-10-15T04:00:00Z");
    expect(await timers.stop(designer())).toMatchObject({ ok: true, value: { minutes: 720, capped: true } });
    expect((await minutesOf(ids.reel))[0]).toMatchObject({ m: 720, d: "2026-10-14" });
    await timers.start(designer(), ids.poster);
    now = new Date(now.getTime() + 20_000);
    expect(await timers.stop(designer())).toMatchObject({ ok: true, value: { minutes: 0, logged: false } });
    await timers.start(designer(), ids.poster);
    expect(await timers.discard(designer())).toEqual({ ok: true, value: null });
    expect(await minutesOf(ids.poster)).toEqual([]);
  });

  it("only times tasks you can see", async () => {
    expect(await timers.start(actorOf(ids.intern, ["intern"]), ids.reel)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
