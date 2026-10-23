// Several file stores behind one FileStorage: new files go to the primary; links, reads and removals go to wherever a
// file already is. Moving from PostgreSQL to Drive (or R2) then needs no copy on day one: old files keep opening.
import type { FileStorage } from "@/repositories";

export function storageRouter(primary: FileStorage, others: readonly FileStorage[]): FileStorage {
  const byProvider = new Map([primary, ...others].map((s) => [s.provider, s]));
  return {
    provider: primary.provider,
    upload: (input) => primary.upload(input),
    async getLink(file, opts) {
      const store = byProvider.get(file.provider);
      if (!store) throw new Error(`No file storage is set up for "${file.provider}".`);
      return store.getLink(file, opts);
    },
    async delete(file) {
      await byProvider.get(file.provider)?.delete(file);
    },
    list: (folder) => primary.list(folder),
    async read(file) {
      return (await byProvider.get(file.provider)?.read(file)) ?? null;
    },
  };
}
