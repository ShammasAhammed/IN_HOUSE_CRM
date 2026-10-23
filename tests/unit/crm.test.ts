import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firestoreCrm } from "@/adapters/crm/firestore";
import { segmentFrom } from "@/services/crm";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

describe("the CRM link (D84)", () => {
  it("reads won leads read-only and maps their fields", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fake = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      if (String(url).includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
      if (String(url).endsWith(":runQuery"))
        return Response.json([
          { document: { name: "projects/oppllo-crm/databases/(default)/documents/leads/abc", fields: { name: { stringValue: "Dr. Ramesh" }, inst: { stringValue: "Zenith IAS Academy" }, segment: { stringValue: "IAS coaching" }, phone: { stringValue: "9447011223" }, stage: { stringValue: "won" }, wonAt: { timestampValue: "2026-10-10T05:00:00Z" } } } },
          { readTime: "2026-10-15T00:00:00Z" },
        ]);
      return Response.json([{ result: { aggregateFields: { n: { integerValue: "4" } } } }]);
    }) as typeof fetch;
    const crm = firestoreCrm({ projectId: "oppllo-crm", clientEmail: "one@oppllo-crm.iam.gserviceaccount.com", privateKey, fetch: fake });
    const [lead] = await crm.listWon(50);
    expect(lead).toMatchObject({ id: "abc", name: "Dr. Ramesh", institution: "Zenith IAS Academy", phone: "9447011223" });
    expect(JSON.parse(calls.find((c) => c.url.endsWith(":runQuery"))!.body).structuredQuery.where.fieldFilter.value.stringValue).toBe("won");
    expect((await crm.stageCounts()).proposal).toBe(4);
    // Only reads: the two query endpoints and the token.
    expect(calls.every((c) => c.url.includes("oauth2") || /:(runQuery|runAggregationQuery)$/.test(c.url))).toBe(true);
  });

  it("picks the closest segment from the CRM's free text", () => {
    expect(segmentFrom("IAS coaching")).toBe("coaching");
    expect(segmentFrom("CBSE school")).toBe("school");
    expect(segmentFrom("Nursing College")).toBe("college");
    expect(segmentFrom(null)).toBe("other");
  });
});

describe("copying the CRM's leads (Stage 10a, D88)", () => {
  it("maps a lead's fields, keeps money as paise and everything else in details", async () => {
    const { leadFromDoc, activityFromDoc } = await import("@/adapters/crm/firestore");
    const lead = leadFromDoc({
      name: "projects/oppllo-crm/databases/(default)/documents/leads/abc",
      fields: {
        name: { stringValue: "Dr. Ramesh" },
        inst: { stringValue: "Zenith IAS Academy" },
        stage: { stringValue: "proposal" },
        score: { stringValue: "hot" },
        fee: { integerValue: "45000" },
        spend: { doubleValue: 12500.5 },
        ownerUid: { stringValue: "u1" },
        nextFollowUp: { timestampValue: "2026-10-16T04:30:00Z" },
        metaLeadId: { stringValue: "998877" },
        answers: { mapValue: { fields: { "best time": { stringValue: "evening" } } } },
        createdAt: { timestampValue: "2026-10-01T05:00:00Z" },
      },
    });
    expect(lead).toMatchObject({ crmId: "abc", institution: "Zenith IAS Academy", stage: "proposal", score: "hot", feePaise: 4_500_000, spendPaise: 1_250_050, ownerCrmUid: "u1", answers: { "best time": "evening" }, details: { metaLeadId: "998877" } });
    expect(lead.nextFollowUpAt?.toISOString()).toBe("2026-10-16T04:30:00.000Z");
    expect(leadFromDoc({ name: "x/leads/b", fields: { stage: { stringValue: "weird" } } }).stage).toBe("new");

    const act = activityFromDoc({ name: "projects/p/databases/(default)/documents/leads/abc/activities/a1", fields: { type: { stringValue: "stage" }, from: { stringValue: "new" }, to: { stringValue: "contacted" }, text: { stringValue: "New → Contacted" }, at: { timestampValue: "2026-10-02T05:00:00Z" } } });
    expect(act).toMatchObject({ crmId: "abc/a1", leadCrmId: "abc", type: "stage", fromStage: "new", toStage: "contacted" });
    expect(activityFromDoc({ name: "projects/p/databases/(default)/documents/other/x/activities/a1" })).toBeNull();
  });

  it("reads every page, and only reads", async () => {
    const calls: string[] = [];
    let page = 0;
    const fake = (async (url: string | URL, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
      const body = JSON.parse(String(init?.body));
      const size = page++ === 0 ? 500 : 3;
      expect(body.structuredQuery.limit).toBe(500);
      return Response.json(Array.from({ length: size }, (_, i) => ({ document: { name: `projects/p/databases/(default)/documents/leads/l${page}-${i}`, fields: {} } })));
    }) as typeof fetch;
    const crm = firestoreCrm({ projectId: "oppllo-crm", clientEmail: "one@oppllo-crm.iam.gserviceaccount.com", privateKey, fetch: fake });
    expect(await crm.allLeads()).toHaveLength(503);
    expect(calls.every((c) => c.includes("oauth2") || c.endsWith(":runQuery"))).toBe(true);
  });
});

describe("the sales dashboard's numbers (Stage 10a)", () => {
  it("count like the CRM's dashboard", async () => {
    const { summarise, channelOf } = await import("@/services/rules/sales");
    const row = (stage: string, extra: Record<string, unknown> = {}) =>
      ({ id: "x", name: "n", institution: null, phone: null, district: null, segment: null, stage, score: null, lostReason: null, channel: null, origin: "landing", landing: null, campaign: null, ownerId: null, ownerName: null, nextFollowUpAt: null, stageChangedAt: null, clientId: null, createdAt: new Date("2026-10-14T05:00:00Z"), updatedAt: new Date(), ...extra }) as never;
    const rows = [row("new", { score: "hot", origin: "meta_form", campaign: "NEET" }), row("won", { ownerName: "Ajmal" }), row("lost", { lostReason: "No budget" }), row("new", { createdAt: new Date("2026-01-01") })];
    const s = summarise(rows, "2026-10-15", 30);
    // "—" until five leads have closed (QA S6-B2); the count of closed leads is kept for the hint.
    expect(s).toMatchObject({ total: 3, open: 1, won: 1, hot: 1, unassigned: 1, winRate: null, closed: 2 });
    const five = summarise([...rows, row("won"), row("lost"), row("lost")], "2026-10-15", 30);
    expect(five.winRate).toBe(40);
    expect(s.channels.map((g) => g.key)).toEqual(["Landing page", "Meta lead form"]);
    expect(s.campaigns).toEqual([{ key: "NEET", leads: 1, won: 0, open: 1, hot: 1 }]);
    expect(s.pages[0]!.key).toBe("admissions.oppllo.com");
    expect(s.lostReasons).toEqual([{ reason: "No budget", count: 1 }]);
    expect(s.perDay).toHaveLength(30);
    expect(s.perDay.at(-2)).toEqual({ date: "2026-10-14", count: 3 });
    expect(summarise(rows, "2026-10-15", 0).total).toBe(4);
    expect(channelOf({ channel: null, origin: "google_form" })).toBe("Google lead form");
  });
});
