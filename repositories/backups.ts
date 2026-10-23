// Daily backups (Stage 11.7). Two ports: where backups are kept (BackupStore: R2, Drive, S3… — one adapter each,
// chosen by the owner) and the database side (export every table, log each run).
import type { BackupStatus } from "@/lib/types";

export type BackupObject = { name: string; sizeBytes: number; createdAt: Date };

/** Storage the owner controls, separate from the database host. */
export interface BackupStore {
  readonly connected: boolean;
  /** For screens: "Cloudflare R2", "Google Drive", "Not set up". */
  readonly label: string;
  put(name: string, bytes: Uint8Array): Promise<void>;
  /** Newest first. */
  list(): Promise<BackupObject[]>;
  get(name: string): Promise<Uint8Array | null>;
  /** Remove backups made before `before`; returns how many. */
  deleteOlderThan(before: Date): Promise<number>;
}

export type BackupRunRecord = {
  id: string;
  startedAt: Date;
  finishedAt: Date;
  status: BackupStatus;
  storage: string;
  fileName: string | null;
  sizeBytes: number | null;
  tables: number | null;
  rows: number | null;
  checkPassed: boolean | null;
  message: string | null;
};

export interface BackupsRepository {
  /** Every table's rows, by table name. File contents kept in the database are left out (their details stay). */
  exportTables(): Promise<Record<string, unknown[]>>;
  recordRun(row: BackupRunRecord): Promise<void>;
  /** Newest first. */
  recentRuns(limit: number): Promise<BackupRunRecord[]>;
}
