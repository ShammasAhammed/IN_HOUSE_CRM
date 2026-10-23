// AI spending (Stage 9.1, D85): the limit, the daily cap, the usage log and the owner's view.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiModel, AiRequest, AiResult } from "@/repositories";
import { createAiService } from "@/services/ai";
import { DAILY_QUESTIONS_PER_PERSON } from "@/services/rules/ai";
import { actorOf, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";
import { settingId } from "@/lib/id";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-15");

/** A model that answers "fine" for $0.10 (₹9 at ₹90 a dollar), or whatever the test scripts. */
function fakeModel(reply?: Partial<AiResult>): AiModel & { asked: number } {
  const m = {
    connected: true,
    provider: "test",
    model: "test-model",
    asked: 0,
    async answer(): Promise<AiResult> {
      m.asked++;
      const usage = [{ model: "test-model", inputTokens: 5000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 100_000 }];
      return { kind: "answer", outcome: "answered", text: "fine", toolCalls: [], usage, ...reply } as AiResult;
    },
  };
  return m;
}
const request: AiRequest = { system: "s", turns: [{ role: "user", text: "q" }], tools: [], effort: "low", maxOutputTokens: 1000, maxSteps: 2, maxCostMicroUsd: 1_000_000 };

let owner = "";
let designer = "";

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("asking the AI", () => {
  it("logs what each question cost, and shows it to the owner only", async () => {
    const ai = createAiService({ store, clock, model: fakeModel(), inrPerUsd: 90 });
    const r = await ai.ask(actorOf(designer, ["designer"]), "assistant", request);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value).toMatchObject({ text: "fine", costPaise: null }); // only the owner sees costs

    const page = await ai.usage(actorOf(owner, ["owner"]));
    if (!page.ok) throw new Error(page.error.message);
    expect(page.value.spent).toEqual({ questions: 1, costPaise: 900 });
    expect(page.value.limitPaise).toBe(200_000);
    expect(page.value.byPerson).toMatchObject([{ personName: "Nikhil Das", questions: 1, costPaise: 900 }]);
    expect(page.value.recent[0]).toMatchObject({ feature: "assistant", outcome: "answered", inputTokens: 5000, model: "test-model" });

    const peek = await ai.usage(actorOf(designer, ["designer"]));
    expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
  });

  it("stops once the month's limit is spent, and the owner can raise it", async () => {
    const model = fakeModel();
    const ai = createAiService({ store, clock, model, inrPerUsd: 90 });
    const o = actorOf(owner, ["owner"]);
    const set = await ai.setLimit(o, { monthly: "10" }); // ₹10: one ₹9 question fits, the second takes it over
    if (!set.ok) throw new Error(set.error.message);
    expect((await ai.ask(o, "assistant", request)).ok).toBe(true);
    expect((await ai.ask(o, "assistant", request)).ok).toBe(true);
    const third = await ai.ask(o, "assistant", request);
    expect(third.ok ? "" : third.error.message).toMatch(/limit is reached/);
    expect(model.asked).toBe(2);
    expect((await ai.status(o)).ready).toBe(false);

    await ai.setLimit(o, { monthly: "2,000" });
    expect((await ai.status(o)).ready).toBe(true);
    const events = await eventsFor(db, settingId("ai_limit"));
    expect(events.map((e) => e.action)).toEqual(["setting.changed", "setting.changed"]);
  });

  it("lets only one of many questions sent at once past a nearly spent limit", async () => {
    const model = fakeModel();
    const ai = createAiService({ store, clock, model, inrPerUsd: 90 });
    const o = actorOf(owner, ["owner"]);
    await ai.setLimit(o, { monthly: "5" });
    const all = await Promise.all(Array.from({ length: 5 }, () => ai.ask(o, "assistant", request)));
    expect(all.filter((r) => r.ok)).toHaveLength(1);
    expect(model.asked).toBe(1);
  });

  it("still logs the spending when the model call breaks", async () => {
    const broken = { ...fakeModel(), answer: async () => { throw new Error("boom"); } };
    const ai = createAiService({ store, clock, model: broken, inrPerUsd: 90 });
    const r = await ai.ask(actorOf(owner, ["owner"]), "assistant", request);
    expect(r.ok).toBe(false);
    const page = await ai.usage(actorOf(owner, ["owner"]));
    expect(page.ok && page.value.recent[0]?.outcome).toBe("failed");
  });

  it("lets only the owner set the limit, and checks the amount", async () => {
    const ai = createAiService({ store, clock, model: fakeModel(), inrPerUsd: 90 });
    const r = await ai.setLimit(actorOf(designer, ["designer"]), { monthly: "50000" });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    const bad = await ai.setLimit(actorOf(owner, ["owner"]), { monthly: "5,00,000" });
    expect(bad.ok ? "ok" : bad.error.fieldErrors?.monthly?.[0]).toMatch(/1,00,000 or less/);
  });

  it("caps each person's questions a day", async () => {
    const ai = createAiService({ store, clock, model: fakeModel({ usage: [] }), inrPerUsd: 90 });
    const d = actorOf(designer, ["designer"]);
    for (let i = 0; i < DAILY_QUESTIONS_PER_PERSON; i++) expect((await ai.ask(d, "assistant", request)).ok).toBe(true);
    const over = await ai.ask(d, "assistant", request);
    expect(over.ok ? "" : over.error.message).toMatch(/daily limit/);
    // Someone else still can.
    expect((await ai.ask(actorOf(owner, ["owner"]), "assistant", request)).ok).toBe(true);
  });

  it("says plainly when there is no key or the key fails, and logs the failed try", async () => {
    const off = createAiService({ store, clock, model: { ...fakeModel(), connected: false }, inrPerUsd: 90 });
    const r = await off.ask(actorOf(owner, ["owner"]), "assistant", request);
    expect(r.ok ? "" : r.error.message).toMatch(/isn't switched on/);

    const broken = createAiService({ store, clock, model: fakeModel({ kind: "failed", reason: "auth", message: "invalid x-api-key" } as Partial<AiResult>), inrPerUsd: 90 });
    const f = await broken.ask(actorOf(owner, ["owner"]), "assistant", request);
    expect(f.ok ? "" : f.error.message).toMatch(/key isn't working/);
    const page = await broken.usage(actorOf(owner, ["owner"]));
    expect(page.ok && page.value.recent[0]?.outcome).toBe("failed");
  });
});
