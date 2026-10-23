// Daily backups (Stage 11.7): the backup file's format and the check that it reads back whole. Pure: no I/O.
// Format: gzip of JSON { format, takenAt, tables: { name: rows[] } }. Plain JSON on purpose: any tool can open it, and
// a restore is "create the schema with the migrations, then insert these rows", which needs no special software.
import { gunzipSync, gzipSync } from "node:zlib";
import type { IsoDate } from "@/lib/dates";

export const BACKUP_FORMAT = "oppllo-one-backup/1";
export const KEEP_DAYS = 30;

export type BackupFile = { format: string; takenAt: string; tables: Record<string, unknown[]> };

export const backupName = (day: IsoDate) => `oppllo-one-${day}.json.gz`;

export function encodeBackup(takenAt: Date, tables: Record<string, unknown[]>): Uint8Array {
  // bigint columns arrive as strings, dates as Date: both survive JSON as text.
  return gzipSync(JSON.stringify({ format: BACKUP_FORMAT, takenAt: takenAt.toISOString(), tables } satisfies BackupFile));
}

export function decodeBackup(bytes: Uint8Array): BackupFile {
  const parsed = JSON.parse(gunzipSync(bytes).toString("utf8")) as BackupFile;
  if (parsed?.format !== BACKUP_FORMAT || typeof parsed.tables !== "object" || parsed.tables === null) throw new Error("Not an Oppllo One backup.");
  return parsed;
}

/** What differs between the file read back and the database it was taken from (empty = the check passed). */
export function compareBackup(file: BackupFile, expected: Record<string, number>): string[] {
  const problems: string[] = [];
  for (const [table, rows] of Object.entries(expected)) {
    const got = file.tables[table];
    if (!Array.isArray(got)) problems.push(`${table}: missing`);
    else if (got.length !== rows) problems.push(`${table}: ${got.length} rows, expected ${rows}`);
  }
  for (const table of Object.keys(file.tables)) if (!(table in expected)) problems.push(`${table}: not in the database`);
  return problems;
}
