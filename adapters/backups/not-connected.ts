// Backups before the owner chooses where they go (docs/backups.md): nothing is stored, and screens say so.
import type { BackupStore } from "@/repositories";

export function notConnectedBackupStore(): BackupStore {
  const off = async (): Promise<never> => {
    throw new Error("Backups aren't set up yet.");
  };
  return { connected: false, label: "Not set up", put: off, list: async () => [], get: off, deleteOlderThan: off };
}
