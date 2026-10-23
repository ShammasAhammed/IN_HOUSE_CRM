// The swipe file (Stage 13.2): saved references, the link-preview cache and the phone share inbox.
import type { StorageProvider, SwipeKind } from "@/lib/types";

export type SwipeItemRecord = {
  id: string;
  clientId: string;
  clientName: string;
  boardId: string | null;
  kind: SwipeKind;
  url: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  site: string | null;
  embedHtml: string | null;
  fileProvider: StorageProvider | null;
  fileLocation: string | null;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  contentType: string | null;
  notes: string;
  tags: string[];
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewSwipeItem = Omit<SwipeItemRecord, "clientName" | "createdByName" | "createdAt" | "updatedAt"> & { searchText: string; at: Date };

export type SwipeFilter = { clientIds: readonly string[]; q?: string; tag?: string; kind?: SwipeKind; createdById?: string; from?: Date; to?: Date; limit?: number };

export type ShareRecord = { id: string; personId: string; url: string | null; title: string | null; text: string | null; fileProvider: StorageProvider | null; fileLocation: string | null; fileId: string | null; fileName: string | null; fileSize: number | null; contentType: string | null; createdAt: Date; usedAt: Date | null };

export interface SwipeRepository {
  add(row: NewSwipeItem): Promise<void>;
  find(id: string): Promise<SwipeItemRecord | null>;
  list(filter: SwipeFilter): Promise<SwipeItemRecord[]>;
  update(id: string, patch: { notes: string; tags: string[]; title: string; searchText: string; at: Date }): Promise<void>;
  remove(id: string, at: Date): Promise<boolean>;
  /** Tags in use in these clients, most used first. */
  tags(clientIds: readonly string[]): Promise<string[]>;
  /** People who saved something in these clients. */
  savers(clientIds: readonly string[]): Promise<Array<{ id: string; name: string }>>;

  previewGet(url: string, since: Date): Promise<unknown>;
  previewPut(url: string, data: unknown, at: Date): Promise<void>;

  shareAdd(row: Omit<ShareRecord, "createdAt" | "usedAt"> & { at: Date }): Promise<void>;
  share(id: string): Promise<ShareRecord | null>;
  shareUsed(id: string, at: Date): Promise<void>;
}
