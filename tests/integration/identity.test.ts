import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIdentityService, decideSignIn } from "@/services/identity";
import { addPerson, softDelete, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const identity = createIdentityService({ store });
const ids = {} as Record<"active" | "multi" | "left" | "noRoles" | "lostRole", string>;

beforeAll(async () => {
  await wipe(db);
  ids.active = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.multi = await addPerson(db, "Faisal Rahman", ["owner", "hr"]);
  ids.left = await addPerson(db, "Gone Person", ["designer"], { status: "left", endDate: "2026-09-30" });
  ids.noRoles = await addPerson(db, "New Joiner", []);
  ids.lostRole = await addPerson(db, "Lost Role", ["bdo"]);
  await softDelete(db, "person_roles", sql`person_id = ${ids.lostRole}`);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("who can sign in", () => {
  it("finds an active person by email, ignoring case and spaces", async () => {
    expect((await identity.personForSignIn("  ANJALI.NAIR@oppllo.example "))?.id).toBe(ids.active);
  });

  it("refuses unknown emails, people who left, and people with no role", async () => {
    expect(await identity.personForSignIn("stranger@gmail.example")).toBeNull();
    expect(await identity.personForSignIn("gone.person@oppllo.example")).toBeNull();
    expect(await identity.personForSignIn("new.joiner@oppllo.example")).toBeNull();
    expect(await identity.personForSignIn("lost.role@oppllo.example")).toBeNull(); // only role was taken away
  });

  it("rebuilds roles on every request, so changes apply at once", async () => {
    const actor = await identity.actorFor(ids.multi);
    expect(actor?.roles).toEqual(["hr", "owner"]);
    expect(actor?.capabilities.has("people.write")).toBe(true);
    expect(await identity.actorFor(ids.left)).toBeNull();
    expect(await identity.actorFor(ids.lostRole)).toBeNull();
  });
});

describe("sign-in decision", () => {
  const person = async (email: string) => identity.findByEmail(email);

  it("lets a verified Google account of an active person in", async () => {
    expect(decideSignIn({ provider: "google", emailVerified: true, devLoginEnabled: false, person: await person("anjali.nair@oppllo.example") })).toEqual({
      allow: true,
      personId: ids.active,
    });
  });

  it("refuses unverified Google emails and people not on the team", async () => {
    const anjali = await person("anjali.nair@oppllo.example");
    expect(decideSignIn({ provider: "google", emailVerified: false, devLoginEnabled: false, person: anjali })).toEqual({ allow: false, reason: "Unverified" });
    expect(decideSignIn({ provider: "google", emailVerified: true, devLoginEnabled: false, person: null })).toEqual({ allow: false, reason: "NotInvited" });
    expect(decideSignIn({ provider: "google", emailVerified: true, devLoginEnabled: false, person: await person("gone.person@oppllo.example") }).allow).toBe(false);
  });

  it("allows the development login only when it is enabled", async () => {
    const anjali = await person("anjali.nair@oppllo.example");
    expect(decideSignIn({ provider: "dev", emailVerified: false, devLoginEnabled: true, person: anjali }).allow).toBe(true);
    expect(decideSignIn({ provider: "dev", emailVerified: false, devLoginEnabled: false, person: anjali }).allow).toBe(false);
    expect(decideSignIn({ provider: "github", emailVerified: true, devLoginEnabled: true, person: anjali }).allow).toBe(false);
  });
});
