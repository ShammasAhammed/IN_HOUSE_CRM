// The owner's morning summary: off by default; on, the dashboard's facts go to the AI and the answer arrives as a
// notification, counted like any question.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiModel, AiRequest } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createCapacityService } from "@/services/capacity";
import { createDailySummaryService } from "@/services/daily-summary";
import { createDashboardService } from "@/services/dashboard";
import { actorOf, addClient, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-16");
const asked: AiRequest[] = [];
const model: AiModel = {
  connected: true,
  provider: "fake",
  model: "fake-1",
  answer: async (r) => (asked.push(r), { kind: "answer", outcome: "answered", text: "- Zenith is on track.", toolCalls: [], usage: [{ model: "fake-1", inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 1000 }] }),
};
const ai = createAiService({ store, clock, model, inrPerUsd: 85 });
const dashboard = createDashboardService({ store, clock, capacity: createCapacityService({ store, clock }) });
const summary = createDailySummaryService({ store, clock, ai, dashboard });

beforeEach(async () => {
  await wipe(db);
  asked.length = 0;
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("morning summary", () => {
  it("off by default; only the owner turns it on; then each owner gets one", async () => {
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const hr = await addPerson(db, "Divya Suresh", ["hr"]);
    await addClient(db, "Zenith IAS Academy");
    expect(await summary.runDaily()).toEqual({ sent: 0, errors: [] });
    expect(await summary.setOn(actorOf(hr, ["hr"]), { on: "on" })).toMatchObject({ ok: false });
    expect(await summary.setOn(actorOf(owner, ["owner"]), { on: "on" })).toMatchObject({ ok: true });
    expect(await summary.runDaily()).toEqual({ sent: 1, errors: [] });
    expect(asked[0]!.turns[0]!.text).toContain("Active clients: 1.");
    const [n] = await db.execute(sql`select person_id, kind, body from notifications`);
    expect(n).toMatchObject({ person_id: owner, kind: "summary.daily", body: "- Zenith is on track." });
    const [u] = await db.execute(sql`select feature from ai_usage`);
    expect(u).toMatchObject({ feature: "daily_summary" });
  });
});
