// Daily backups (Stage 11.7): the file format and the read-back check.
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { backupName, compareBackup, decodeBackup, encodeBackup } from "@/services/rules/backups";

describe("backup files", () => {
  it("round-trip every table, with dates as text", () => {
    const bytes = encodeBackup(new Date("2026-10-19T00:30:00Z"), { clients: [{ id: "c1", name: "Zenith", created_at: new Date("2026-01-01T00:00:00Z"), fee: "4500000" }], tasks: [] });
    const file = decodeBackup(bytes);
    expect(file).toEqual({ format: "oppllo-one-backup/1", takenAt: "2026-10-19T00:30:00.000Z", tables: { clients: [{ id: "c1", name: "Zenith", created_at: "2026-01-01T00:00:00.000Z", fee: "4500000" }], tasks: [] } });
    expect(backupName("2026-10-19")).toBe("oppllo-one-2026-10-19.json.gz");
  });

  it("refuse files that aren't Oppllo One backups", () => {
    expect(() => decodeBackup(gzipSync(JSON.stringify({ hello: "world" })))).toThrow("Not an Oppllo One backup.");
    expect(() => decodeBackup(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("compare table by table with the database", () => {
    const file = decodeBackup(encodeBackup(new Date(), { clients: [{}, {}], tasks: [{}], extra: [] }));
    expect(compareBackup(file, { clients: 2, tasks: 1, extra: 0 })).toEqual([]);
    expect(compareBackup(file, { clients: 3, tasks: 1, people: 4 })).toEqual(["clients: 2 rows, expected 3", "people: missing", "extra: not in the database"]);
  });
});
