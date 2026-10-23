// Where files live (CLAUDE.md: "Files: DB stores a pointer… Storage interface: upload, getLink, delete, list").
// Services hold pointers; only an adapter knows whether the bytes are in PostgreSQL, Google Drive or R2.
import type { StorageProvider } from "@/lib/types";

export type FilePointer = { provider: StorageProvider; location: string; fileId: string };

/** Makes a link to the app's own download route, for one viewer, until a time (the container holds the secret). */
export type LinkSigner = (file: Pick<FilePointer, "provider" | "fileId">, expiresAt: Date, name: string, viewerId: string) => string;
export type StoredFile = FilePointer & { name: string; contentType: string; sizeBytes: number };

export interface FileStorage {
  readonly provider: StorageProvider;
  upload(input: { folder: string; name: string; contentType: string; bytes: Uint8Array }): Promise<StoredFile>;
  /** A link that opens the file for a few minutes, for one viewer, then stops working. */
  getLink(file: FilePointer, opts: { expiresInSeconds: number; downloadName: string; viewerId: string }): Promise<string>;
  /** Removes the file from use. Adapters keep what they can (the database adapter only marks it deleted). */
  delete(file: FilePointer): Promise<void>;
  list(folder: string): Promise<StoredFile[]>;
  /** The bytes behind one of the app's own links, for its download route. Null when missing or removed. */
  read(file: Pick<FilePointer, "provider" | "fileId">): Promise<{ bytes: Uint8Array; contentType: string; name: string } | null>;
}
