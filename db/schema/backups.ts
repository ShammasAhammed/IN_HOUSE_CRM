// Daily backups (Stage 11.7): one row per run, so Settings → Trust can say when the last good backup was, how big it
// was and whether reading it back matched the database. The backup files live in the owner's own storage.
import { bigint, boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { BACKUP_STATUSES, type BackupStatus } from "@/lib/types";
import { id, oneOf } from "./columns";

export const backupRuns = pgTable(
  "backup_runs",
  {
    id: id(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    status: text("status").$type<BackupStatus>().notNull(),
    /** Where it went ("Cloudflare R2", "Google Drive") and its file name there. */
    storage: text("storage").notNull(),
    fileName: text("file_name"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    tables: integer("tables"),
    rows: integer("rows"),
    /** Read back from storage and compared, table by table, with the database at the time. */
    checkPassed: boolean("check_passed"),
    message: text("message"),
  },
  (t) => [index("backup_runs_started_idx").on(t.startedAt), check("backup_runs_status_ck", oneOf(t.status, BACKUP_STATUSES))],
);
