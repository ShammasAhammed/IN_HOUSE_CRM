// Backups kept in memory: for tests and trying the backup flow locally. Gone when the process ends.
import type { BackupStore } from "@/repositories";

export function memoryBackupStore(now: () => Date = () => new Date()): BackupStore & { files: Map<string, { bytes: Uint8Array; createdAt: Date }> } {
  const files = new Map<string, { bytes: Uint8Array; createdAt: Date }>();
  return {
    connected: true,
    label: "Memory (test)",
    files,
    async put(name, bytes) {
      files.set(name, { bytes: new Uint8Array(bytes), createdAt: now() });
    },
    async list() {
      return [...files.entries()].map(([name, f]) => ({ name, sizeBytes: f.bytes.byteLength, createdAt: f.createdAt })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async get(name) {
      return files.get(name)?.bytes ?? null;
    },
    async deleteOlderThan(before) {
      let n = 0;
      for (const [name, f] of files) if (f.createdAt < before && files.delete(name)) n++;
      return n;
    },
  };
}
