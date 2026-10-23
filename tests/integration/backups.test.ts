// Daily backups (Stage 11.7): every table to the owner's storage (a memory store here), read back and checked, old
// ones removed; skipped and clearly "not set up" until storage is chosen.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { memoryBackupStore } from "@/adapters/backups/memory";
import { notConnectedBackupStore } from "@/adapters/backups/not-connected";
import type { BackupStore } from "@/repositories";
import { createBackupService } from "@/services/backups";
import { decodeBackup } from "@/services/rules/backups";
import { actorOf, addClient, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-19");
let owner = "";

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  await addClient(db, "Zenith IAS Academy");
  await store.events.record({ actorId: owner, action: "client.updated", entityType: "client", entityId: owner });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("daily backups", () => {
  it("export every table, read the file back, check it and log the run", async () => {
    const mem = memoryBackupStore(() => clock.now());
    mem.files.set("oppllo-one-2026-08-01.json.gz", { bytes: new Uint8Array([1]), createdAt: new Date("2026-08-01T00:00:00Z") });
    const backups = createBackupService({ store, clock, backups: mem });
    const r = await backups.runDaily();
    expect(r).toMatchObject({ ok: true, errors: [] });
    const file = decodeBackup(mem.files.get("oppllo-one-2026-10-19.json.gz")!.bytes);
    expect(file.tables.clients).toHaveLength(1);
    expect(file.tables.people).toHaveLength(1);
    expect(file.tables.backup_runs).toEqual([]);
    // Older than 30 days: removed once today's backup checked out.
    expect([...mem.files.keys()]).toEqual(["oppllo-one-2026-10-19.json.gz"]);
    const s = await backups.status(actorOf(owner, ["owner"]));
    expect(s.ok && s.value).toMatchObject({ connected: true, storage: "Memory (test)", runs: [{ status: "ok", checkPassed: true, fileName: "oppllo-one-2026-10-19.json.gz", tables: expect.any(Number) }] });
    expect(s.ok && s.value.runs[0]!.sizeBytes).toBeGreaterThan(0);
  });

  it("log a failed run, and keep old backups, when the file doesn't read back right", async () => {
    const mem = memoryBackupStore(() => clock.now());
    const broken: BackupStore = { ...mem, connected: true, label: "Broken", get: async () => new Uint8Array([9, 9, 9]) };
    let removed = 0;
    broken.deleteOlderThan = async () => ++removed;
    const r = await createBackupService({ store, clock, backups: broken }).runDaily();
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.message).toMatch(/^Backup: /);
    expect(removed).toBe(0);
    const [run] = await store.backups.recentRuns(1);
    expect(run).toMatchObject({ status: "failed", storage: "Broken", checkPassed: null });
  });

  it("are skipped until the owner chooses storage, and the status says so; owner only", async () => {
    const off = createBackupService({ store, clock, backups: notConnectedBackupStore() });
    expect(await off.runDaily()).toEqual({ skipped: true, errors: [] });
    const s = await off.status(actorOf(owner, ["owner"]));
    expect(s.ok && s.value).toEqual({ connected: false, storage: "Not set up", runs: [], keepDays: 30 });
    const strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
    expect((await off.status(actorOf(strategist, ["strategist"]))).ok).toBe(false);
  });
});
