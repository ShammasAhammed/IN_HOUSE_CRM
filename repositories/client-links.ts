// A client's linked files (Stage 13.0): Google files, other links and Claude artifacts, and a short read cache.
import type { ClientLinkKind, GoogleType, StorageProvider } from "@/lib/types";

export type ClientLinkMeta = { title?: string; modifiedTime?: string | null; modifiedBy?: string | null; tabs?: Array<{ title: string; rows: number; cols: number }>; namedRanges?: string[]; problem?: string; reason?: string };

export type ClientLinkRecord = {
  id: string;
  clientId: string;
  kind: ClientLinkKind;
  title: string;
  url: string | null;
  googleType: GoogleType | null;
  googleId: string | null;
  fileProvider: StorageProvider | null;
  fileLocation: string | null;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  tabs: string[];
  summary: Array<{ label: string; range: string }>;
  aiReadable: boolean;
  writeBack: boolean;
  meta: ClientLinkMeta | null;
  metaAt: Date | null;
  seenModifiedAt: Date | null;
  noticedOn: string | null;
  addedById: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

export type NewClientLink = Pick<ClientLinkRecord, "id" | "clientId" | "kind" | "title" | "url" | "googleType" | "googleId" | "fileProvider" | "fileLocation" | "fileId" | "fileName" | "fileSize" | "meta" | "metaAt" | "seenModifiedAt" | "addedById">;

export interface ClientLinksRepository {
  add(row: NewClientLink): Promise<void>;
  find(id: string): Promise<ClientLinkRecord | null>;
  /** A client's live files, newest first. */
  list(clientId: string): Promise<ClientLinkRecord[]>;
  update(id: string, patch: Partial<Pick<ClientLinkRecord, "title" | "tabs" | "summary" | "aiReadable" | "writeBack" | "meta" | "metaAt" | "seenModifiedAt" | "noticedOn">>): Promise<void>;
  remove(id: string, at: Date): Promise<boolean>;
  /** Every live Google file of a live client (the daily check). */
  allGoogle(): Promise<ClientLinkRecord[]>;
  cacheGet(linkId: string, key: string, since: Date): Promise<unknown>;
  cachePut(linkId: string, key: string, value: unknown, at: Date): Promise<void>;
}
