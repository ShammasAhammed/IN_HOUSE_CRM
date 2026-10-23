// Projects and tasks: the day-to-day work (Projects slice 1 and 2).
import type { IsoDate } from "@/lib/dates";
import type { ProjectStatus, RecurrenceFrequency, StorageProvider, TaskPersonRole, TaskPriority, TaskStatus } from "@/lib/types";

/** Which tasks a query may return. Decided by services/permissions.ts. */
export type TaskScope =
  /** Every task; with `viewerId`, minus those in private spaces that person isn't a member of (Stage 14.1). */
  | { kind: "all"; viewerId?: string }
  /** Tasks of clients they're on the team of, plus anything they own or review. */
  | { kind: "assigned"; personId: string }
  /** Only tasks they own, review, are assigned to or watch. */
  | { kind: "own"; personId: string };

export type TaskRow = {
  id: string;
  title: string;
  tags: string[];
  status: TaskStatus;
  priority: TaskPriority;
  startDate: IsoDate | null;
  dueDate: IsoDate | null;
  estimateMinutes: number | null;
  completedAt: Date | null;
  rank: string;
  parentTaskId: string | null;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  stageId: string | null;
  stageName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  reviewerId: string | null;
  createdById: string | null;
  recurrenceId: string | null;
  subtasksDone: number;
  subtasksTotal: number;
  commentCount: number;
  /** All time logged on the task, by anyone. */
  loggedMinutes: number;
  /** People doing it with the owner (Stage 9b.2), in the order they were added. */
  assignees: Array<{ id: string; name: string }>;
};

export type TaskDetailRow = TaskRow & {
  description: string | null;
  /** Custom field values by field id (Stage 9b.4). */
  custom: Record<string, string | number | boolean>;
  reviewerName: string | null;
  deliverableId: string | null;
  engagementId: string | null;
  createdAt: Date;
  /** When anything on the task row last changed: the Details form sends it back to catch a stale tab (QA S8-B1). */
  updatedAt: Date;
};

export type TaskFilter = {
  scope: TaskScope;
  ownerId?: string;
  /** Timeline: the task's span (start, or due when it has no start, to due) touches these days. */
  overlaps?: { from: IsoDate; to: IsoDate };
  /** Owned by this person, or one of the task's other assignees (My Day, "my tasks"). */
  assignedTo?: string;
  projectId?: string;
  clientId?: string;
  statuses?: readonly TaskStatus[];
  /** Open tasks due on or before this date (My Day). */
  openDueOnOrBefore?: IsoDate;
  dueFrom?: IsoDate;
  dueTo?: IsoDate;
  completedSince?: Date;
  /** Top-level tasks only (default) or the subtasks of one task. */
  parentTaskId?: string | null;
  /** Due in [from, to], or open and overdue before `from` (Week view). */
  forWeek?: { from: IsoDate; to: IsoDate };
  /** Tasks made by one recurring rule. */
  recurrenceId?: string;
  /** Only these tasks, subtasks included unless `parentTaskId` is given. */
  ids?: readonly string[];
  /** Top-level tasks and subtasks alike (counting everything someone owns). */
  anyLevel?: boolean;
  /** Stage 9b list view: any of these tags, these priorities, title contains, no due date, sort order. */
  tags?: readonly string[];
  priorities?: readonly TaskPriority[];
  search?: string;
  noDueDate?: boolean;
  sort?: { by: TaskSort; dir: "asc" | "desc" };
  limit?: number;
};

export const TASK_SORTS = ["due", "priority", "title", "client", "owner", "status", "created"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];
export type SavedTaskView = { id: string; name: string; query: string };

export type TaskWrite = {
  projectId: string;
  clientId: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  ownerId: string | null;
  reviewerId: string | null;
  stageId: string | null;
  deliverableId: string | null;
  startDate: IsoDate | null;
  dueDate: IsoDate | null;
  estimateMinutes: number | null;
  completedAt: Date | null;
  rank: string;
  recurrenceId: string | null;
  /** Null for tasks the system made with nobody behind them. */
  createdById: string | null;
  /** Where an imported task came from ("clickup:<id>"). */
  externalId?: string | null;
  /** The occurrence a recurring task stands for (fixed; the due date can move). */
  recurrenceDate?: IsoDate | null;
};

export type TaskPatch = Partial<Omit<TaskWrite, "projectId" | "clientId" | "createdById" | "recurrenceId" | "externalId" | "recurrenceDate">> & { deletedAt?: Date; tags?: string[]; custom?: Record<string, string | number | boolean> };

export type CommentRow = { id: string; taskId: string; authorId: string; authorName: string; body: string; createdAt: Date };

export interface WorkTasksRepository {
  list(filter: TaskFilter): Promise<TaskRow[]>;
  /** Tags in use with how many tasks carry each: on the top-level tasks a scope sees, or (no scope) everywhere. */
  allTags(scope?: TaskScope): Promise<Array<{ tag: string; count: number }>>;
  views(personId: string): Promise<SavedTaskView[]>;
  addView(row: SavedTaskView & { personId: string }): Promise<void>;
  removeView(id: string, personId: string, at: Date): Promise<boolean>;
  findById(id: string, scope: TaskScope): Promise<TaskDetailRow | null>;
  create(id: string, task: TaskWrite): Promise<void>;
  /** Insert many at once; rows whose (recurrence, occurrence date) already exist are skipped. Returns ids inserted. */
  createMany(tasks: Array<TaskWrite & { id: string }>): Promise<string[]>;
  update(id: string, patch: TaskPatch): Promise<void>;
  /** Highest rank among top-level tasks of a project with this status (to append at the bottom of a column). */
  lastRank(projectId: string, status: TaskStatus): Promise<string | null>;
  /** A live task with this title made by this person in this project in the last few seconds (a double submit), if any. */
  recentSame(input: { projectId: string; parentTaskId: string | null; title: string; createdById: string; withinSeconds: number }): Promise<string | null>;
  /** Which of these external ids already belong to live tasks, with their task ids. */
  findExternal(externalIds: readonly string[]): Promise<Array<{ id: string; externalId: string; parentTaskId: string | null; projectId: string; clientId: string }>>;
  listComments(taskId: string): Promise<CommentRow[]>;
  addComment(id: string, taskId: string, authorId: string, body: string): Promise<void>;

  // Stage 9b.2: more people on a task, its checklist, its files.
  people(taskId: string): Promise<TaskPersonRow[]>;
  addPerson(row: { id: string; taskId: string; personId: string; role: TaskPersonRole; addedById: string }): Promise<void>;
  removePerson(taskId: string, personId: string, role: TaskPersonRole, at: Date): Promise<boolean>;
  checklist(taskId: string): Promise<ChecklistItemRow[]>;
  findChecklistItem(id: string): Promise<(ChecklistItemRow & { taskId: string }) | null>;
  addChecklistItem(row: { id: string; taskId: string; text: string; rank: string; createdById: string | null }): Promise<void>;
  updateChecklistItem(id: string, patch: { text?: string; done?: boolean; doneById?: string | null; doneAt?: Date | null; rank?: string; deletedAt?: Date }): Promise<void>;
  files(taskId: string): Promise<TaskFileRow[]>;
  findFile(id: string): Promise<TaskFileRow | null>;
  addFile(row: Omit<TaskFileRow, "addedByName" | "createdAt">): Promise<void>;
  removeFile(id: string, at: Date): Promise<boolean>;

  // Stage 9b.3: "waits on" links between live tasks, in both directions for the tasks given.
  dependencyLinks(taskIds: readonly string[]): Promise<Array<{ taskId: string; dependsOnId: string }>>;
  addDependency(row: { id: string; taskId: string; dependsOnId: string; createdById: string }): Promise<void>;
  removeDependency(taskId: string, dependsOnId: string, at: Date): Promise<boolean>;
}

export type TaskPersonRow = { personId: string; fullName: string; role: TaskPersonRole; addedAt: Date };
export type ChecklistItemRow = { id: string; text: string; done: boolean; doneByName: string | null; doneAt: Date | null; rank: string };
export type TaskFileRow = {
  id: string;
  taskId: string;
  title: string;
  provider: StorageProvider;
  location: string;
  fileId: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  addedById: string | null;
  addedByName: string | null;
  createdAt: Date;
};

export type TimeEntryRow = {
  id: string;
  taskId: string;
  taskTitle: string;
  personId: string;
  personName: string;
  clientId: string;
  clientName: string;
  engagementId: string | null;
  workDate: IsoDate;
  minutes: number;
  billable: boolean;
  note: string | null;
  createdAt: Date;
};

export type TimeEntryWrite = {
  taskId: string;
  personId: string;
  clientId: string;
  engagementId: string | null;
  workDate: IsoDate;
  minutes: number;
  billable: boolean;
  note: string | null;
};

export type RunningTimer = { id: string; taskId: string; taskTitle: string; clientName: string; startedAt: Date };

export interface TimeRepository {
  add(id: string, entry: TimeEntryWrite): Promise<void>;
  /** Stage 9b.5: the person's running timer, if any. */
  runningTimer(personId: string): Promise<RunningTimer | null>;
  startTimer(row: { id: string; personId: string; taskId: string; startedAt: Date }): Promise<void>;
  /** Ends a running timer; false when it was already stopped (someone pressed stop twice). */
  stopTimer(id: string, at: Date, timeEntryId: string | null): Promise<boolean>;
  findById(id: string): Promise<TimeEntryRow | null>;
  update(id: string, patch: Partial<Pick<TimeEntryWrite, "minutes" | "workDate" | "note" | "billable">> & { deletedAt?: Date }): Promise<void>;
  list(filter: { personId?: string; taskId?: string; from?: IsoDate; to?: IsoDate }): Promise<TimeEntryRow[]>;
  /** Minutes per person per day in a range (the Friday screen and utilisation). */
  totalsByPersonDay(personIds: readonly string[], from: IsoDate, to: IsoDate): Promise<Array<{ personId: string; workDate: IsoDate; minutes: number }>>;
}

export type ProjectRow = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  engagementId: string | null;
  engagementName: string | null;
  status: ProjectStatus;
  currentStageId: string | null;
  currentStageName: string | null;
  leadId: string | null;
  leadName: string | null;
  startDate: IsoDate | null;
  dueDate: IsoDate | null;
  openTasks: number;
  overdueTasks: number;
  doneTasks: number;
};

export type StageRow = { id: string; projectId: string; name: string; position: number };

export type ProjectWrite = {
  clientId: string;
  engagementId: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadId: string | null;
  startDate: IsoDate | null;
  dueDate: IsoDate | null;
  createdById: string;
};

export type ServiceTemplate = {
  serviceId: string;
  serviceName: string;
  stages: Array<{ name: string; position: number }>;
  tasks: Array<{ title: string; stagePosition: number | null; dueOffsetDays: number; estimateMinutes: number | null; defaultRole: string | null; position: number }>;
};

export type RecurrenceRow = {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  reviewerId: string | null;
  priority: TaskPriority;
  stageId: string | null;
  deliverableId: string | null;
  estimateMinutes: number | null;
  frequency: RecurrenceFrequency;
  weekday: number | null;
  dayOfMonth: number | null;
  leadWorkingDays: number;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  active: boolean;
  generatedUntil: IsoDate | null;
  createdById: string | null;
};

export type RecurrenceWrite = Omit<RecurrenceRow, "id" | "projectName" | "ownerName" | "generatedUntil">;

export interface ProjectsRepository {
  list(filter: { clientIds?: readonly string[]; statuses?: readonly ProjectStatus[]; scope: TaskScope; today: IsoDate }): Promise<ProjectRow[]>;
  findById(id: string, scope: TaskScope, today: IsoDate): Promise<ProjectRow | null>;
  create(id: string, project: ProjectWrite): Promise<void>;
  update(id: string, patch: Partial<Omit<ProjectWrite, "clientId" | "createdById">> & { currentStageId?: string | null; completedAt?: Date | null; deletedAt?: Date }): Promise<void>;
  listStages(projectIds: readonly string[]): Promise<StageRow[]>;
  createStages(rows: StageRow[]): Promise<void>;
  /** The default stages and starter tasks of a service (D19, D20). */
  serviceTemplate(serviceId: string): Promise<ServiceTemplate | null>;

  /** `liveOnly`: active rules of active projects of live clients (what the daily job fills). */
  listRecurrences(filter: { projectId?: string; activeOnly?: boolean; liveOnly?: boolean }): Promise<RecurrenceRow[]>;
  findRecurrence(id: string): Promise<RecurrenceRow | null>;
  /** Inside a transaction: lock the rule until commit and read it fresh (edits and the daily job queue up). */
  lockRecurrence(id: string): Promise<RecurrenceRow | null>;
  createRecurrence(id: string, rule: RecurrenceWrite): Promise<void>;
  updateRecurrence(id: string, patch: Partial<RecurrenceWrite> & { generatedUntil?: IsoDate | null; deletedAt?: Date }): Promise<void>;
}
