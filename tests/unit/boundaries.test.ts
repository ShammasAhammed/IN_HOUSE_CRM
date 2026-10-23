// Proves the architecture rule is mechanical: imports that break the layering fail lint.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportErrors(filePath: string, code: string, rule = "no-restricted-imports"): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === rule).length;
}

describe("architecture boundaries", () => {
  it("rejects database clients outside adapters/", async () => {
    expect(await restrictedImportErrors("app/page.tsx", 'import postgres from "postgres";\nexport const x = postgres;\n')).toBe(1);
    expect(await restrictedImportErrors("services/x.ts", 'import { eq } from "drizzle-orm";\nexport const x = eq;\n')).toBe(1);
    expect(await restrictedImportErrors("components/x.tsx", 'import { google } from "googleapis";\nexport const x = google;\n')).toBe(1);
  });

  it("rejects the db schema and adapters outside their layer", async () => {
    expect(await restrictedImportErrors("app/page.tsx", 'import * as s from "@/db/schema";\nexport const x = s;\n')).toBe(1);
    expect(await restrictedImportErrors("services/x.ts", 'import * as a from "@/adapters/postgres";\nexport const x = a;\n')).toBe(1);
  });

  it("keeps services and repositories free of the framework", async () => {
    expect(await restrictedImportErrors("services/x.ts", 'import { redirect } from "next/navigation";\nexport const x = redirect;\n')).toBe(1);
    expect(await restrictedImportErrors("repositories/x.ts", 'import * as s from "@/services/clients";\nexport const x = s;\n')).toBe(1);
  });

  it("allows infrastructure inside adapters/ and the container to wire adapters", async () => {
    expect(await restrictedImportErrors("adapters/postgres/x.ts", 'import { eq } from "drizzle-orm";\nexport const x = eq;\n')).toBe(0);
    expect(await restrictedImportErrors("lib/server/container.ts", 'import * as a from "@/adapters/postgres";\nexport const x = a;\n')).toBe(0);
  });

  it("keeps Google, Meta and Zoho API calls inside adapters/", async () => {
    const call = 'export const go = (id: string) => fetch(`https://www.googleapis.com/drive/v3/files/${id}`);\n';
    expect(await restrictedImportErrors("services/x.ts", call, "no-restricted-syntax")).toBe(1);
    expect(await restrictedImportErrors("app/api/x/route.ts", 'export const u = "https://graph.facebook.com/v21.0/me";\n', "no-restricted-syntax")).toBe(1);
    expect(await restrictedImportErrors("adapters/google-drive/x.ts", call, "no-restricted-syntax")).toBe(0);
  });

  it("allows Firebase only in the CRM adapter", async () => {
    expect(await restrictedImportErrors("adapters/postgres/x.ts", 'import admin from "firebase-admin";\nexport const x = admin;\n')).toBe(1);
    expect(await restrictedImportErrors("adapters/crm/x.ts", 'import admin from "firebase-admin";\nexport const x = admin;\n')).toBe(0);
  });
});
