// AI teammates (Stage 11.3): drafts the AI wrote on tasks, waiting for a person.
import type { AiDraftKind, AiDraftStatus } from "@/lib/types";

export type AiDraftRecord = {
  id: string;
  taskId: string;
  clientId: string;
  kind: AiDraftKind;
  instructions: string | null;
  body: string;
  status: AiDraftStatus;
  requestedByName: string;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  /** From the AI usage log; null when the run wasn't logged. */
  model: string | null;
  costPaise: number | null;
  createdAt: Date;
};

export interface AiDraftsRepository {
  /** A task's drafts, newest first. */
  forTask(taskId: string): Promise<AiDraftRecord[]>;
  find(id: string): Promise<AiDraftRecord | null>;
  create(row: { id: string; taskId: string; clientId: string; kind: AiDraftKind; instructions: string | null; body: string; requestedById: string; aiUsageId: string | null }): Promise<void>;
  /** Approve or reject a draft still waiting. False when someone decided first. */
  decide(id: string, row: { status: Exclude<AiDraftStatus, "draft">; body: string; reviewedById: string }, at: Date): Promise<boolean>;
}
