// Custom fields on tasks and templates for tasks and projects (Stage 9b.4).
import type { TaskFieldKind, TemplateKind } from "@/lib/types";

export type TaskFieldRow = { id: string; name: string; kind: TaskFieldKind; options: string[]; clientId: string | null; clientName: string | null; position: number };
export type TemplateRow = { id: string; kind: TemplateKind; name: string; description: string | null; data: Record<string, unknown>; createdByName: string | null; updatedAt: Date };

export type RequestFormRow = {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  ownerId: string | null;
  questions: Array<Record<string, unknown>>;
  active: boolean;
  publicSlug: string | null;
  submissions: number;
};
export type RequestFormWrite = { name: string; description: string | null; projectId: string; ownerId: string | null; questions: Array<Record<string, unknown>>; active: boolean; publicSlug: string | null };

export type AutomationRow = {
  id: string;
  name: string;
  active: boolean;
  trigger: Record<string, unknown>;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  runs: number;
  lastRunAt: Date | null;
  createdById: string | null;
  createdByName: string | null;
};
export type AutomationWrite = Pick<AutomationRow, "name" | "active" | "trigger" | "conditions" | "actions">;

export interface TaskSetupRepository {
  // Stage 9b.5: automation rules.
  automations(opts?: { activeOnly?: boolean }): Promise<AutomationRow[]>;
  findAutomation(id: string): Promise<AutomationRow | null>;
  addAutomation(row: AutomationWrite & { id: string; createdById: string }): Promise<void>;
  updateAutomation(id: string, patch: Partial<AutomationWrite> & { deletedAt?: Date }): Promise<void>;
  /** Counts a run (the list shows how often each rule fired, and when last). */
  countRun(id: string, at: Date): Promise<void>;
  // Stage 9b.5: request forms.
  forms(): Promise<RequestFormRow[]>;
  findForm(id: string): Promise<RequestFormRow | null>;
  findFormBySlug(slug: string): Promise<RequestFormRow | null>;
  addForm(row: RequestFormWrite & { id: string; createdById: string }): Promise<void>;
  updateForm(id: string, patch: Partial<RequestFormWrite> & { deletedAt?: Date }): Promise<void>;
  addSubmission(row: { id: string; formId: string; taskId: string; submittedById: string | null; submitterName: string; submitterEmail: string | null; submitterKey?: string | null; answers: Record<string, string> }): Promise<void>;
  /** The request a task was made from, if any (its answers go at the top of the task, test report L11). */
  submissionForTask(taskId: string): Promise<{ formId: string; submitterName: string; answers: Record<string, string>; createdAt: Date } | null>;
  /** Public submissions to a form since a time (the daily cap), or from one sender. */
  countPublicSubmissions(formId: string, since: Date, submitterKey?: string): Promise<number>;
  /** Inside a transaction: hold the form's row until commit, so parallel requests are counted one after another. */
  lockForm(id: string): Promise<void>;
  /** Live fields, by position; with a client, the fields for every client plus that client's own. */
  fields(clientId?: string | null): Promise<TaskFieldRow[]>;
  findField(id: string): Promise<TaskFieldRow | null>;
  addField(row: { id: string; name: string; kind: TaskFieldKind; options: string[]; clientId: string | null; position: number; createdById: string }): Promise<void>;
  updateField(id: string, patch: { name?: string; options?: string[]; position?: number; deletedAt?: Date }): Promise<void>;
  templates(kind: TemplateKind): Promise<TemplateRow[]>;
  findTemplate(id: string): Promise<TemplateRow | null>;
  addTemplate(row: { id: string; kind: TemplateKind; name: string; description: string | null; data: Record<string, unknown>; createdById: string }): Promise<void>;
  removeTemplate(id: string, at: Date): Promise<boolean>;
}
