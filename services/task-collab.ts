// Working together on a task (Stage 9b.2, ClickUp parity): more assignees and watchers, a checklist inside the task,
// and files or links on it. Comments with @mentions live in services/tasks.ts (they add the mentioned as watchers).
import { generateKeyBetween } from "fractional-indexing";
import { formatFileSize } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { TaskPersonRole } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { addChecklistSchema, addTaskFileSchema, checklistItemSchema, taskPersonSchema } from "@/lib/validation/tasks";
import type { ChecklistItemRow, DataStore, FileStorage, NewEvent, Repositories, StoredFile, TaskDetailRow, TaskFileRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { OUTSIDE_SPACE, spaceGuard, levelBlocks } from "./spaces";
import { safeFileName } from "./rules/documents";
import { isProgramFile, MAX_TASK_FILE_BYTES, sniffTaskFileType } from "./rules/task-files";
import { canEdit, taskScope } from "./tasks";

const LINK_SECONDS = 5 * 60;
const NOT_YOURS = "Only the task's owner, assignees, reviewer, creator or a lead can change it.";

export type TaskTeam = {
  /** Owner first, then the other assignees; then watchers. */
  assignees: Array<{ id: string; name: string; isOwner: boolean }>;
  watchers: Array<{ id: string; name: string }>;
  watching: boolean;
  checklist: ChecklistItemRow[];
  files: Array<Omit<TaskFileRow, "location" | "fileId" | "provider"> & { isLink: boolean; host: string | null; canRemove: boolean }>;
  canEdit: boolean;
};

export function createTaskCollabService(deps: { store: DataStore; clock: Clock; storage: FileStorage; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, storage } = deps;

  const event = (actor: Actor, t: Pick<TaskDetailRow, "id" | "clientId" | "title">, action: string, data: Record<string, unknown> = {}): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "task",
    entityId: t.id,
    clientId: t.clientId,
    data: { title: t.title, ...data },
  });

  const find = (repos: Repositories, actor: Actor, taskId: string) => (isId(taskId) ? repos.tasks.findById(taskId, taskScope(actor)) : Promise.resolve(null));

  /** Who added a file, the task's editors with tasks.write.all, or the task's owner may take it off. */
  const mayRemoveFile = (actor: Actor, t: TaskDetailRow, f: Pick<TaskFileRow, "addedById">) => f.addedById === actor.personId || t.ownerId === actor.personId || can(actor, "tasks.write.all");

  return {
    /** Everything on the task page's side: people, checklist, files. */
    async forTask(actor: Actor, taskId: string): Promise<Result<TaskTeam>> {
      const t = await find(store, actor, taskId);
      if (!t) return notFound("That task");
      const [people, checklist, files] = await Promise.all([store.tasks.people(t.id), store.tasks.checklist(t.id), store.tasks.files(t.id)]);
      const watchers = people.filter((p) => p.role === "watcher").map((p) => ({ id: p.personId, name: p.fullName }));
      return ok({
        assignees: [...(t.ownerId ? [{ id: t.ownerId, name: t.ownerName ?? "Owner", isOwner: true }] : []), ...t.assignees.map((a) => ({ ...a, isOwner: false }))],
        watchers,
        watching: watchers.some((w) => w.id === actor.personId),
        checklist,
        files: files.map(({ location, fileId: _pointer, provider, ...f }) => ({
          ...f,
          isLink: provider === "external_link",
          host: provider === "external_link" && URL.canParse(location) ? new URL(location).hostname : null,
          canRemove: mayRemoveFile(actor, t, f),
        })),
        canEdit: canEdit(actor, t),
      });
    },

    /**
     * Add an assignee or a watcher. People who can change the task add anyone on the team; anyone who sees the task
     * may watch it themselves. Being on a task lets that person see it, whatever their role.
     */
    async addPerson(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(taskPersonSchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, personId, role } = parsed.value;
      return commit(store, async (repos) => {
        const t = await find(repos, actor, taskId);
        if (!t) return notFound("That task");
        const self = personId === actor.personId && role === "watcher";
        if (!self && !canEdit(actor, t)) return forbidden(NOT_YOURS);
        { const blocked = await levelBlocks(repos, actor, t.clientId, self ? "comment" : "edit"); if (blocked) return blocked; }
        const person = await repos.people.findById(personId);
        if (!person || person.status !== "active") return invalid("Pick someone on the team.");
        if (await spaceGuard(repos)(personId, t.clientId)) return invalid(OUTSIDE_SPACE);
        if (role === "assignee" && t.ownerId === personId) return noChange(null);
        const current = await repos.tasks.people(t.id);
        if (current.some((p) => p.personId === personId && p.role === role)) return noChange(null);
        if (role === "assignee" && current.filter((p) => p.role === "assignee").length >= 10) return invalid("At most 10 people besides the owner.");
        await repos.tasks.addPerson({ id: newId(), taskId: t.id, personId, role, addedById: actor.personId });
        return change(null, event(actor, t, "task.person_added", { personId, role }));
      });
    },

    /** Take someone off a task. Editors take anyone off; anyone may stop watching. */
    async removePerson(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(taskPersonSchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, personId, role } = parsed.value;
      return commit(store, async (repos) => {
        const t = await find(repos, actor, taskId);
        if (!t) return notFound("That task");
        const self = personId === actor.personId && role === "watcher";
        if (!self && !canEdit(actor, t)) return forbidden(NOT_YOURS);
        { const blocked = await levelBlocks(repos, actor, t.clientId, self ? "comment" : "edit"); if (blocked) return blocked; }
        if (!(await repos.tasks.removePerson(t.id, personId, role as TaskPersonRole, clock.now()))) return noChange(null);
        return change(null, event(actor, t, "task.person_removed", { personId, role }));
      });
    },

    /** Add one step, or several pasted one per line, at the end of the checklist. */
    async addChecklist(actor: Actor, raw: unknown): Promise<Result<{ added: number }>> {
      const parsed = parse(addChecklistSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const t = await find(repos, actor, parsed.value.taskId);
        if (!t) return notFound("That task");
        if (!canEdit(actor, t)) return forbidden(NOT_YOURS);
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        const items = await repos.tasks.checklist(t.id);
        if (items.length + parsed.value.text.length > 100) return invalid("A checklist holds up to 100 steps. Split the work into subtasks.");
        let rank = items.at(-1)?.rank ?? null;
        for (const text of parsed.value.text) {
          rank = generateKeyBetween(rank, null);
          await repos.tasks.addChecklistItem({ id: newId(), taskId: t.id, text, rank, createdById: actor.personId });
        }
        return change({ added: parsed.value.text.length }, event(actor, t, "task.checklist_added", { steps: parsed.value.text }));
      });
    },

    /** Tick, untick, rename, remove or move one step. */
    async changeChecklist(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(checklistItemSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const item = await repos.tasks.findChecklistItem(v.itemId);
        const t = item ? await find(repos, actor, item.taskId) : null;
        if (!item || !t) return notFound("That step");
        if (!canEdit(actor, t)) return forbidden(NOT_YOURS);
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        const now = clock.now();
        if (v.action === "check" || v.action === "uncheck") {
          const done = v.action === "check";
          if (item.done === done) return noChange(null);
          await repos.tasks.updateChecklistItem(item.id, { done, doneById: done ? actor.personId : null, doneAt: done ? now : null });
          return change(null, event(actor, t, done ? "task.checklist_checked" : "task.checklist_unchecked", { step: item.text }));
        }
        if (v.action === "rename") {
          if (item.text === v.text) return noChange(null);
          await repos.tasks.updateChecklistItem(item.id, { text: v.text! });
          return change(null, event(actor, t, "task.checklist_renamed", { from: item.text, to: v.text }));
        }
        if (v.action === "remove") {
          await repos.tasks.updateChecklistItem(item.id, { deletedAt: now });
          return change(null, event(actor, t, "task.checklist_removed", { step: item.text }));
        }
        // Up or down: between the neighbours on that side.
        const items = await repos.tasks.checklist(t.id);
        const i = items.findIndex((x) => x.id === item.id);
        const j = v.action === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= items.length) return noChange(null);
        const rank = v.action === "up" ? generateKeyBetween(items[j - 1]?.rank ?? null, items[j]!.rank) : generateKeyBetween(items[j]!.rank, items[j + 1]?.rank ?? null);
        await repos.tasks.updateChecklistItem(item.id, { rank });
        return change(null, event(actor, t, "task.checklist_moved", { step: item.text }));
      });
    },

    /** Attach a file (checked by its bytes, up to 3.5 MB) or a link to one kept elsewhere. */
    async addFile(actor: Actor, raw: unknown, file: { name: string; bytes: Uint8Array } | null): Promise<Result<{ id: string }>> {
      const parsed = parse(addTaskFileSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const t = await find(store, actor, v.taskId);
      if (!t) return notFound("That task");
      if (!canEdit(actor, t)) return forbidden(NOT_YOURS);
      { const blocked = await levelBlocks(store, actor, t.clientId, "edit"); if (blocked) return blocked; }
      if (!file && !v.link) return invalid("Choose a file or paste a link.", { file: ["Choose a file or paste a link."] });
      if (file && v.link) return invalid("Attach a file or a link, not both.", { link: ["Attach a file or a link, not both."] });
      const id = newId();
      let stored: StoredFile | null = null;
      let row: Omit<TaskFileRow, "addedByName" | "createdAt">;
      if (file) {
        if (file.bytes.byteLength > MAX_TASK_FILE_BYTES) {
          const size = formatFileSize(file.bytes.byteLength);
          return invalid(`That file is ${size}; the limit is ${formatFileSize(MAX_TASK_FILE_BYTES)}.`, { file: [`${size} is too big. Put it in Drive and attach the link instead.`] });
        }
        if (isProgramFile(file.bytes, file.name)) return invalid("Programs and scripts can't be attached.", { file: ["Programs and scripts (.exe and the like) can't be attached. Put it in Drive and attach the link instead."] });
        const type = sniffTaskFileType(file.bytes, file.name);
        if (!type) return invalid("That kind of file can't be attached.", { file: ["Attach a PDF, photo, Word, Excel, PowerPoint, CSV or text file, or a link."] });
        const fileName = safeFileName(file.name, type);
        stored = await storage.upload({ folder: `clients/${t.clientId}/tasks/${t.id}`, name: fileName, contentType: type.contentType, bytes: file.bytes });
        row = { id, taskId: t.id, title: v.title ?? fileName, provider: stored.provider, location: stored.location, fileId: stored.fileId, fileName, contentType: type.contentType, sizeBytes: stored.sizeBytes, addedById: actor.personId };
      } else {
        const url = new URL(v.link!);
        row = { id, taskId: t.id, title: v.title ?? `${url.hostname}${url.pathname.length > 1 ? url.pathname.slice(0, 40) : ""}`, provider: "external_link", location: url.toString(), fileId: url.toString(), fileName: null, contentType: null, sizeBytes: null, addedById: actor.personId };
      }
      try {
        const r = await commit(store, async (repos) => {
          await repos.tasks.addFile(row);
          return change({ id }, event(actor, t, "task.file_added", { fileId: id, name: row.title, link: !file }));
        });
        if (!r.ok && stored) await storage.delete(stored);
        return r;
      } catch (err) {
        if (stored) await storage.delete(stored).catch((e) => deps.report?.(e, { where: "task-files.cleanup", fileId: stored?.fileId }));
        throw err;
      }
    },

    /** Where to open a file: the link itself, or a short-lived link made for this person. */
    async fileLink(actor: Actor, fileId: string): Promise<Result<{ url: string }>> {
      if (!isId(fileId)) return notFound("That file");
      const f = await store.tasks.findFile(fileId);
      const t = f ? await find(store, actor, f.taskId) : null;
      if (!f || !t) return notFound("That file");
      if (f.provider === "external_link") return ok({ url: f.location });
      return ok({ url: await storage.getLink(f, { expiresInSeconds: LINK_SECONDS, downloadName: f.fileName ?? f.title, viewerId: actor.personId }) });
    },

    /** Take a file off the task (kept in storage; nothing is ever hard-deleted). */
    async removeFile(actor: Actor, fileId: string): Promise<Result<null>> {
      if (!isId(fileId)) return notFound("That file");
      return commit(store, async (repos) => {
        const f = await repos.tasks.findFile(fileId);
        const t = f ? await find(repos, actor, f.taskId) : null;
        if (!f || !t) return notFound("That file");
        if (!mayRemoveFile(actor, t, f)) return forbidden("Only who added it, the task's owner or a lead can remove a file.");
        if (!(await repos.tasks.removeFile(f.id, clock.now()))) return noChange(null);
        return change(null, event(actor, t, "task.file_removed", { fileId: f.id, name: f.title }));
      });
    },
  };
}

export type TaskCollabService = ReturnType<typeof createTaskCollabService>;
