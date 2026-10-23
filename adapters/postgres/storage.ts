// Files kept in PostgreSQL (D78): small HR documents, until Google Drive or R2 is set up. Links point at the app's own
// download route and are signed by the container's link signer, so this adapter never sees the secret.
import { and, asc, eq, isNull } from "drizzle-orm";
import { storedFiles } from "@/db/schema";
import { isId, newId } from "@/lib/id";
import type { FileStorage, LinkSigner } from "@/repositories";
import type { Db } from "./connection";

export function postgresStorage(db: Db, deps: { signLink: LinkSigner }): FileStorage {
  const where = (fileId: string) => and(eq(storedFiles.id, fileId), isNull(storedFiles.deletedAt));
  return {
    provider: "postgres",
    async upload({ folder, name, contentType, bytes }) {
      const id = newId();
      await db.insert(storedFiles).values({ id, folder, name, contentType, sizeBytes: bytes.byteLength, data: Buffer.from(bytes) });
      return { provider: "postgres", location: "stored_files", fileId: id, name, contentType, sizeBytes: bytes.byteLength };
    },
    async getLink(file, opts) {
      return deps.signLink(file, new Date(Date.now() + opts.expiresInSeconds * 1000), opts.downloadName, opts.viewerId);
    },
    async delete(file) {
      if (file.provider !== "postgres") return;
      await db.update(storedFiles).set({ deletedAt: new Date() }).where(where(file.fileId));
    },
    async list(folder) {
      const rows = await db
        .select({ fileId: storedFiles.id, name: storedFiles.name, contentType: storedFiles.contentType, sizeBytes: storedFiles.sizeBytes })
        .from(storedFiles)
        .where(and(eq(storedFiles.folder, folder), isNull(storedFiles.deletedAt)))
        .orderBy(asc(storedFiles.createdAt));
      return rows.map((r) => ({ ...r, provider: "postgres" as const, location: "stored_files" }));
    },
    async read({ provider, fileId }) {
      if (provider !== "postgres" || !isId(fileId)) return null;
      const [row] = await db.select({ data: storedFiles.data, contentType: storedFiles.contentType, name: storedFiles.name }).from(storedFiles).where(where(fileId)).limit(1);
      return row ? { bytes: new Uint8Array(row.data), contentType: row.contentType, name: row.name } : null;
    },
  };
}
