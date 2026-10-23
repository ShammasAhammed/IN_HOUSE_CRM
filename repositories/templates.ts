// Template gallery (Stage 13.6): saved board and page templates, their uses, and presets.
import type { GalleryKind, GalleryScope, PresetKind, PresetValue } from "@/lib/types";

export type GalleryTemplateRecord = {
  id: string;
  kind: GalleryKind;
  name: string;
  description: string;
  tags: string[];
  scope: GalleryScope;
  ownerId: string;
  ownerName: string | null;
  approved: boolean;
  thumbnail: string | null;
  preview: string;
  createdAt: Date;
  updatedAt: Date;
};
export type PresetRecord = { id: string; kind: PresetKind; name: string; value: PresetValue; scope: GalleryScope; ownerId: string; createdAt: Date };

export interface TemplatesRepository {
  create(row: Omit<GalleryTemplateRecord, "ownerName" | "approved" | "createdAt" | "updatedAt"> & { content: Record<string, unknown>; at: Date }): Promise<void>;
  find(id: string): Promise<(GalleryTemplateRecord & { content: Record<string, unknown> }) | null>;
  /** Company templates and this person's own, newest first (no content). */
  list(filter: { personId: string; kind?: GalleryKind }): Promise<GalleryTemplateRecord[]>;
  update(id: string, patch: Partial<Pick<GalleryTemplateRecord, "name" | "description" | "tags" | "scope" | "approved" | "thumbnail">> & { approvedById?: string | null; at: Date }): Promise<void>;
  remove(id: string, at: Date): Promise<void>;
  addUse(row: { id: string; templateKey: string; personId: string; at: Date }): Promise<void>;
  /** Uses per template key. */
  useCounts(): Promise<Map<string, number>>;

  addPreset(row: Omit<PresetRecord, "createdAt"> & { at: Date }): Promise<void>;
  /** Company presets and this person's own. */
  presets(personId: string): Promise<PresetRecord[]>;
  preset(id: string): Promise<PresetRecord | null>;
  removePreset(id: string, at: Date): Promise<void>;
}
