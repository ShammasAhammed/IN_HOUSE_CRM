// Daily backups (Stage 11.7): every table exported to one file in storage the owner controls (separate from the
// database host), read back and compared with the database, kept 30 days. Run by the daily job. Until the owner picks
// the storage (docs/backups.md) nothing runs and Settings → Trust says so.
import { newId } from "@/lib/id";
import { forbidden, ok, type Result } from "@/lib/result";
import type { BackupRunRecord, BackupStore, DataStore } from "@/repositories";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { backupName, compareBackup, decodeBackup, encodeBackup, KEEP_DAYS } from "./rules/backups";

export type BackupStatusView = { connected: boolean; storage: string; runs: BackupRunRecord[]; keepDays: number };

export function createBackupService(deps: { store: DataStore; clock: Clock; backups: BackupStore }) {
  const { store, clock, backups } = deps;
  return {
    /** The daily job's step. Never throws: a failure is logged as a failed run and returned as an error. */
    async runDaily(): Promise<{ skipped?: true; ok?: boolean; sizeBytes?: number; errors: Error[] }> {
      if (!backups.connected) return { skipped: true, errors: [] };
      const startedAt = clock.now();
      const fileName = backupName(clock.today());
      const run: BackupRunRecord = { id: newId(), startedAt, finishedAt: startedAt, status: "failed", storage: backups.label, fileName, sizeBytes: null, tables: null, rows: null, checkPassed: null, message: null };
      try {
        const tables = await store.backups.exportTables();
        const counts = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length]));
        const bytes = encodeBackup(startedAt, tables);
        await backups.put(fileName, bytes);
        // The restore check: read the file back from storage and compare it with what was exported.
        const back = await backups.get(fileName);
        const problems = back ? compareBackup(decodeBackup(back), counts) : ["the file couldn't be read back"];
        Object.assign(run, {
          status: problems.length ? "failed" : "ok",
          sizeBytes: bytes.byteLength,
          tables: Object.keys(counts).length,
          rows: Object.values(counts).reduce((a, b) => a + b, 0),
          checkPassed: problems.length === 0,
          message: problems.length ? `Check failed: ${problems.slice(0, 5).join("; ")}` : null,
        });
        // Old backups go only after today's has been checked.
        if (!problems.length) await backups.deleteOlderThan(new Date(startedAt.getTime() - KEEP_DAYS * 86_400_000));
      } catch (err) {
        run.message = err instanceof Error ? err.message : String(err);
      }
      run.finishedAt = clock.now();
      // A log, not business data: written directly, like ai_usage.
      await store.backups.recordRun(run);
      return { ok: run.status === "ok", sizeBytes: run.sizeBytes ?? 0, errors: run.status === "ok" ? [] : [new Error(`Backup: ${run.message ?? "failed"}`)] };
    },

    /** Settings → Trust (owner). */
    async status(actor: Actor): Promise<Result<BackupStatusView>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner sees backups.");
      return ok({ connected: backups.connected, storage: backups.label, runs: await store.backups.recentRuns(7), keepDays: KEEP_DAYS });
    },
  };
}
export type BackupService = ReturnType<typeof createBackupService>;
