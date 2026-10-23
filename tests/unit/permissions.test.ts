import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "@/lib/types";
import { CAPABILITIES, capabilitiesFor, clientScope, type Actor } from "@/services/permissions";

const actor = (...roles: Role[]): Actor => ({
  personId: "p1",
  fullName: "Test",
  email: "t@oppllo.example",
  roles,
  employmentType: "full_time",
  capabilities: capabilitiesFor(roles),
});

describe("permissions table (plan/3-projects-module.md)", () => {
  it("gives the owner everything", () => {
    expect(capabilitiesFor(["owner"]).size).toBe(CAPABILITIES.length);
  });

  it("keeps HR records and salaries away from strategists and performance marketers", () => {
    for (const role of ["strategist", "performance_marketer"] as const) {
      const caps = capabilitiesFor([role]);
      expect(caps.has("clients.read.all")).toBe(true);
      expect(caps.has("budget.read")).toBe(true);
      expect(caps.has("people.private.read")).toBe(false);
      expect(caps.has("hr.documents")).toBe(false);
    }
  });

  it("hides fees, hours budgets and client contacts from creative roles", () => {
    for (const role of ["social_media", "designer", "video_editor"] as const) {
      const caps = capabilitiesFor([role]);
      expect(caps.has("money.read")).toBe(false);
      expect(caps.has("budget.read")).toBe(false);
      expect(caps.has("clients.contacts.read")).toBe(false);
      expect(caps.has("assets.read")).toBe(true);
    }
  });

  it("lets the BDO see clients and engagements but not creative files or HR", () => {
    const caps = capabilitiesFor(["bdo"]);
    expect(caps.has("engagements.read")).toBe(true);
    expect(caps.has("assets.read")).toBe(false);
    expect(caps.has("leave.read.all")).toBe(false);
  });

  it("keeps HR out of client work and client money", () => {
    const caps = capabilitiesFor(["hr"]);
    expect(caps.has("clients.read.all")).toBe(false);
    expect(caps.has("money.read")).toBe(false);
    expect(caps.has("people.private.read")).toBe(true);
  });

  it("lets the accountant see fees but not creative work or HR documents", () => {
    const caps = capabilitiesFor(["accountant"]);
    expect(caps.has("money.read")).toBe(true);
    expect(caps.has("assets.read")).toBe(false);
    expect(caps.has("hr.documents")).toBe(false);
  });

  it("gives interns nothing beyond their own tasks", () => {
    expect([...capabilitiesFor(["intern"])]).toEqual(["clients.read.own_tasks"]);
  });

  it("unions capabilities for people with several roles", () => {
    const caps = capabilitiesFor(["designer", "hr"]);
    expect(caps.has("assets.write")).toBe(true);
    expect(caps.has("people.write")).toBe(true);
  });

  it("maps every role to a client scope", () => {
    expect(clientScope(actor("owner")).kind).toBe("all");
    expect(clientScope(actor("designer")).kind).toBe("assigned");
    expect(clientScope(actor("intern")).kind).toBe("own_tasks");
    expect(clientScope(actor("hr")).kind).toBe("none");
    expect(clientScope(actor("intern", "strategist")).kind).toBe("all");
    for (const role of ROLES) expect(clientScope(actor(role))).toBeDefined();
  });
});

describe("development login switch", async () => {
  const { devLoginAllowed } = await import("@/services/identity");

  it("is never on in production, whatever the flag says", () => {
    expect(devLoginAllowed({ AUTH_DEV_LOGIN: "1", NODE_ENV: "production" })).toBe(false);
    expect(devLoginAllowed({ AUTH_DEV_LOGIN: "1", NODE_ENV: "development" })).toBe(true);
    expect(devLoginAllowed({ NODE_ENV: "development" })).toBe(false);
  });
});
