// Client chat rules (Stage 12.6): links a client can follow, and the warning before something internal reaches them.
import { describe, expect, it } from "vitest";
import { clientWarnings, portalParts, type PortalAllowed } from "@/services/rules/client-chat";
import { findProblems } from "@/services/rules/coworker";

const zenith = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const asset = "0199a1b2-c3d4-7e5f-8a9b-00000000000a";
const request = "0199a1b2-c3d4-7e5f-8a9b-00000000000b";
const other = "0199a1b2-c3d4-7e5f-8a9b-00000000000c";
const allowed: PortalAllowed = { clientId: zenith, creativeIds: new Set([asset]), reportMonths: new Set(["2026-09"]), requestIds: new Set([request]) };
const origin = "https://one.oppllo.com";

describe("what a client sees of a link", () => {
  it("opens creatives, reports and requests the portal can show, and hides every other Oppllo One link", () => {
    const parts = portalParts(`See ${origin}/creatives/${asset} and ${origin}/clients/${zenith}/report?month=2026-09-01, also /tasks/${request}, /tasks/${other}, ${origin}/clients/${zenith} and https://drive.google.com/x`, origin, allowed);
    expect(parts.filter((p) => p.kind !== "text")).toEqual([
      { kind: "portal", href: "/portal/creatives", label: "Creative to review" },
      { kind: "portal", href: "/portal/reports/2026-09", label: "Monthly report" },
      { kind: "portal", href: "/portal/requests", label: "Your request" },
      { kind: "internal" },
      { kind: "internal" },
      { kind: "link", href: "https://drive.google.com/x", text: "https://drive.google.com/x" },
    ]);
    expect(JSON.stringify(parts)).not.toContain(other);
    // A report that isn't final yet, or another client's: internal.
    expect(portalParts(`${origin}/clients/${zenith}/report?month=2026-10-01`, origin, allowed)).toEqual([{ kind: "internal" }]);
  });
});

describe("Send to the client?", () => {
  it("warns about hours, money and other clients' names, and not about ordinary words", () => {
    expect(clientWarnings("Logged 6 hrs on this, the retainer is ₹45,000 and Alpha Nursing liked theirs", ["Alpha Nursing", "Brightpath"])).toEqual(["hours", "fees or money", "another client (Alpha Nursing)"]);
    expect(clientWarnings("The poster is ready for your approval tomorrow.", ["Alpha Nursing"])).toEqual([]);
    expect(clientWarnings("Budget for October?", [])).toEqual(["fees or money"]);
  });
});

describe("the co-worker's client-waiting rule", () => {
  it("asks a teammate to answer after a working day, not before", () => {
    const base = {
      today: "2026-10-21",
      now: new Date("2026-10-21T06:30:00Z"),
      clients: [{ id: "z", name: "Zenith", leadStrategistId: "lead", lastActivityAt: new Date("2026-10-21T05:00:00Z"), health: null, nextWeekPosts: 1, avgWeeklyPosts: null, activeProjectId: null }],
      tasks: [],
      inClientReview: [],
      away: [],
      load: new Map([["lead", { name: "Anjali", percent: 50 }]]),
      people: new Map([["lead", "Anjali"]]),
      workingDay: (d: string) => d,
    };
    expect(findProblems({ ...base, clientWaiting: [{ clientId: "z", since: new Date("2026-10-21T04:00:00Z") }] })).toEqual([]);
    const ps = findProblems({ ...base, clientWaiting: [{ clientId: "z", since: new Date("2026-10-20T04:00:00Z") }] });
    expect(ps).toEqual([expect.objectContaining({ kind: "client_waiting", action: { type: "ping", text: "@Anjali Zenith has been waiting since 20 Oct for a reply in the client chat. Could you answer them?" } })]);
  });
});
