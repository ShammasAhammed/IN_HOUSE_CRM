import { desc, sql } from "drizzle-orm";
import { backupRuns } from "@/db/schema";
import type { BackupsRepository } from "@/repositories";
import type { Db } from "./connection";

// File bytes are large and already kept apart from the business data (D78): the backup keeps their details only.
const SKIP_COLUMNS: Record<string, string[]> = { stored_files: ["data"] };

export function backupsRepository(db: Db): BackupsRepository {
  return {
    async exportTables() {
      const tables = await db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
      );
      const out: Record<string, unknown[]> = {};
      // One read-only transaction, so every table is read at the same moment.
      await db.transaction(
        async (tx) => {
          for (const { table_name: name } of tables) {
            const skip = SKIP_COLUMNS[name];
            if (!skip) {
              out[name] = [...(await tx.execute(sql`select * from ${sql.identifier(name)}`))];
              continue;
            }
            const cols = await tx.execute<{ column_name: string }>(
              sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${name} order by ordinal_position`,
            );
            const keep = cols.map((c) => c.column_name).filter((c) => !skip.includes(c));
            out[name] = [...(await tx.execute(sql`select ${sql.join(keep.map((c) => sql.identifier(c)), sql`, `)} from ${sql.identifier(name)}`))];
          }
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
      return out;
    },
    async recordRun(row) {
      await db.insert(backupRuns).values(row);
    },
    recentRuns: (limit) => db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(limit),
  };
}
