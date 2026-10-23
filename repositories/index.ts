// Repository interfaces. Services depend on these; adapters implement them.
// Nothing here may know which database is underneath (CLAUDE.md, architecture rule).

import type { IsoDate } from "@/lib/dates";
import type {
  ClientSegment,
  ClientStatus,
  EmploymentType,
  EngagementKind,
  EngagementStatus,
  AccessLevel,
  EntityType,
  PeriodStatus,
  PersonStatus,
  Role,
  RolloverPolicy,
  WorkLocation,
} from "@/lib/types";

// ---------- shared ----------

/** Which clients a query may return. Decided by services/permissions.ts. */
export type ClientScope =
  /** Every client; with `viewerId`, minus private spaces that person isn't a member of (Stage 14.1). */
  | { kind: "all"; viewerId?: string }
  /** On the client team, or owns a task for the client. */
  | { kind: "assigned"; personId: string }
  /** Owns a task for the client. */
  | { kind: "own_tasks"; personId: string }
  | { kind: "none" };

export type PersonRef = { id: string; fullName: string };

// ---------- people ----------

export type PersonRecord = {
  id: string;
  fullName: string;
  workEmail: string;
  workPhone: string | null;
  jobTitle: string;
  employmentType: EmploymentType;
  workLocation: WorkLocation;
  status: PersonStatus;
  departmentId: string | null;
  departmentName: string | null;
  reportsToId: string | null;
  reportsToName: string | null;
  roles: Role[];
  capacityMinutesPerWeek: number;
  joinDate: IsoDate;
  endDate: IsoDate | null;
  avatarUrl: string | null;
};

/** Personal fields: visible to the person, HR and the owner only (D17). Minimum data (DPDP Act). */
export type PersonPrivateRecord = {
  personalEmail: string | null;
  personalPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
};

export type PersonWrite = {
  fullName: string;
  workEmail: string;
  workPhone: string | null;
  jobTitle: string;
  employmentType: EmploymentType;
  workLocation: WorkLocation;
  departmentId: string | null;
  reportsToId: string | null;
  capacityMinutesPerWeek: number;
  joinDate: IsoDate;
} & PersonPrivateRecord;

export type DepartmentRecord = { id: string; name: string; headPersonId: string | null };

export interface PeopleRepository {
  findById(id: string): Promise<PersonRecord | null>;
  /** Case-insensitive. */
  findByEmail(email: string): Promise<PersonRecord | null>;
  listActive(): Promise<PersonRecord[]>;
  /**
   * Inside a transaction: lock the person's row until commit, so concurrent changes to their leave or record
   * queue up instead of interleaving (two applications can't both spend the same balance).
   */
  lockForUpdate(id: string): Promise<PersonRecord | null>;
  /** Everyone, including people who left (for HR). */
  listAll(): Promise<PersonRecord[]>;
  findPrivate(id: string): Promise<PersonPrivateRecord | null>;
  create(id: string, person: PersonWrite): Promise<void>;
  update(id: string, patch: Partial<PersonWrite> & { status?: PersonStatus; endDate?: IsoDate | null }): Promise<void>;
  /** Replace the person's roles: removed ones are soft-deleted, re-added ones restored. */
  setRoles(id: string, roles: readonly Role[]): Promise<void>;
  listDepartments(): Promise<DepartmentRecord[]>;
  addDepartment(id: string, row: { name: string; headPersonId: string | null }): Promise<void>;
  updateDepartment(id: string, patch: { name?: string; headPersonId?: string | null; deletedAt?: Date }): Promise<void>;
}

// ---------- clients ----------

export type ClientRecord = {
  id: string;
  name: string;
  segment: ClientSegment;
  city: string | null;
  status: ClientStatus;
  startDate: IsoDate | null;
  isInternal: boolean;
  /** A private space (Stage 14.1): seen only by its members and the owner. */
  isPrivate: boolean;
  /** Stage 14.2: grants need both the owner and HR. Private spaces always do. */
  isSensitive: boolean;
  /** Stage 14.5: Oppllo's own marketing space (results and reports like a client, never billed). */
  isSelf: boolean;
  /** Stage 14.2: the owner's last review of its members. */
  accessReviewedAt: Date | null;
  leadStrategist: PersonRef | null;
  teamSize: number;
};

export type ClientContactRecord = {
  id: string;
  clientId: string;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  isPrimary: boolean;
};

/** Everything stored about a client, for the edit form. GSTIN and billing address count as contact details (D14). */
export type ClientWrite = {
  name: string;
  legalName: string | null;
  segment: ClientSegment;
  city: string | null;
  status: ClientStatus;
  startDate: IsoDate | null;
  gstin: string | null;
  billingAddress: string | null;
  crmLeadId: string | null;
  leadStrategistId: string | null;
  notes: string | null;
  /** A link to the client's Google Drive folder, pasted by hand or made by the Drive connection (QA S4-B5). */
  driveFolderUrl: string | null;
};

export type ContactWrite = Omit<ClientContactRecord, "id" | "clientId">;

export interface ClientsRepository {
  /** Real clients only (not Oppllo's internal work), visible within the scope, by name. */
  list(scope: ClientScope): Promise<ClientRecord[]>;
  findById(id: string, scope: ClientScope): Promise<ClientRecord | null>;
  listContacts(clientIds: readonly string[]): Promise<ClientContactRecord[]>;
  /** The Oppllo team on a client, or a space's members: memberships that count now (not removed, not past their day). */
  listMembers(clientId: string): Promise<Array<{ personId: string; fullName: string; note: string | null; level: AccessLevel; expiresOn: IsoDate | null; since: Date }>>;
  /** All stored fields of a client (not in the trash), whatever the scope: callers check permission first. */
  findDetails(id: string): Promise<(ClientWrite & { id: string }) | null>;
  /** A live client with this name, case-insensitive, other than `exceptId`. */
  findByName(name: string, exceptId?: string): Promise<{ id: string; name: string } | null>;
  create(id: string, client: ClientWrite): Promise<void>;
  update(id: string, patch: Partial<ClientWrite>): Promise<void>;
  findContact(id: string): Promise<ClientContactRecord | null>;
  addContact(id: string, clientId: string, contact: ContactWrite): Promise<void>;
  updateContact(id: string, patch: Partial<ContactWrite> & { deletedAt?: Date }): Promise<void>;
  /** Only one primary contact per client: clears the flag on the others. */
  clearPrimaryContact(clientId: string, exceptId: string): Promise<void>;
  /** Add to the team, or restore a removed membership. */
  addMember(clientId: string, personId: string): Promise<void>;
  /** Soft delete. Returns false when they weren't on the team. */
  removeMember(clientId: string, personId: string): Promise<boolean>;
  /** Live clients (not Oppllo's internal work) whose team this person is on. */
  listTeamsOf(personId: string): Promise<Array<{ id: string; name: string }>>;
  /** Spaces (Stage 14.1): Oppllo's internal work areas, visible within the scope, by name, archived included. */
  listSpaces(scope: ClientScope): Promise<ClientRecord[]>;
  createSpace(id: string, space: { name: string; isPrivate: boolean }): Promise<void>;
  updateSpace(id: string, patch: { name?: string; isPrivate?: boolean; isSensitive?: boolean; isSelf?: boolean; status?: ClientStatus }): Promise<void>;
  /** Stage 14.5: the space that is Oppllo's own marketing, if one is set. */
  selfSpaceId(): Promise<string | null>;
  /** Ids of every live client and space the scope can see (lists that need ids, like docs and templates). */
  visibleIds(scope: ClientScope): Promise<string[]>;
  /** Private spaces this person isn't a member of: hidden from them whatever their role (Stage 14.1). */
  hiddenSpaces(personId: string): Promise<string[]>;
  /**
   * People on this client's or space's live work who aren't its members: owners, reviewers, assignees and watchers of
   * open tasks, owners of active recurring rules and request forms, and its lead.
   */
  outsidersOnWork(clientId: string): Promise<string[]>;
  /** Stage 14.2: make or restore a space membership with its level and last day (after the member confirmed). */
  setMember(row: { clientId: string; personId: string; level: AccessLevel; expiresOn: IsoDate | null; requestId: string | null }): Promise<void>;
  /** Stage 14.2: every space a person is a member of now. */
  spaceMembershipsOf(personId: string): Promise<Array<{ spaceId: string; name: string; isPrivate: boolean; isSensitive: boolean; level: AccessLevel; expiresOn: IsoDate | null; since: Date }>>;
  /** Stage 14.2: live space memberships whose last day is between `from` and `to`, or (with `before`) already past. */
  spaceMembersEnding(range: { from?: IsoDate; to?: IsoDate; before?: IsoDate }): Promise<Array<{ spaceId: string; spaceName: string; personId: string; fullName: string; expiresOn: IsoDate }>>;
  markReviewed(spaceId: string, at: Date): Promise<void>;
}

// ---------- engagements ----------

export type EngagementSummary = {
  id: string;
  clientId: string;
  name: string;
  serviceId: string;
  serviceName: string;
  kind: EngagementKind;
  status: EngagementStatus;
  startDate: IsoDate;
  endDate: IsoDate | null;
  renewalDate: IsoDate | null;
  rolloverPolicy: RolloverPolicy;
  /** Null unless budgets were asked for. */
  hoursBudgetMinutes: number | null;
  /** The fee in effect on the given date. Null unless fees were asked for. */
  currentFeePaise: number | null;
};

export type PeriodUsage = {
  engagementId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** The days of the period the engagement actually covers (differs from the month for a mid-month start). */
  coveredFrom: IsoDate;
  coveredTo: IsoDate;
  baseBudgetMinutes: number;
  rolloverInMinutes: number;
  /** All minutes logged inside the period: every hour counts towards burn (D26). */
  usedMinutes: number;
  /** The part of usedMinutes marked non-billable, shown separately. */
  nonBillableMinutes: number;
};

export type EngagementRecord = {
  id: string;
  clientId: string;
  serviceId: string;
  serviceName: string;
  kind: EngagementKind;
  name: string;
  status: EngagementStatus;
  startDate: IsoDate;
  endDate: IsoDate | null;
  renewalDate: IsoDate | null;
  hoursBudgetMinutes: number;
  rolloverPolicy: RolloverPolicy;
  notes: string | null;
};

export type EngagementWrite = Omit<EngagementRecord, "id" | "serviceName">;

export type FeeRow = { id: string; amountPaise: number; effectiveFrom: IsoDate; createdByName: string | null; createdAt: Date };

export type PeriodRow = PeriodUsage & { id: string; feePaise: number; status: PeriodStatus };

export type PeriodWrite = {
  engagementId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  baseBudgetMinutes: number;
  rolloverInMinutes: number;
  feePaise: number;
  status: PeriodStatus;
};

export type DeliverableRecord = { id: string; engagementId: string; name: string; targetCount: number };

export interface EngagementsRepository {
  findById(id: string): Promise<EngagementRecord | null>;
  /** Inside a transaction: lock the engagement until commit and read it fresh (fee changes, edits, the daily job). */
  lockForUpdate(id: string): Promise<EngagementRecord | null>;
  /** Active retainers of live clients (for the daily period job). */
  listActiveRetainers(): Promise<EngagementRecord[]>;
  create(id: string, engagement: EngagementWrite): Promise<void>;
  update(id: string, patch: Partial<Omit<EngagementWrite, "clientId">>): Promise<void>;

  /** Fee history, newest effective date first. */
  listFees(engagementId: string): Promise<FeeRow[]>;
  /** The fee in effect on a date (the latest effective on or before it; before the first, the first). Null if none. */
  feeOn(engagementId: string, on: IsoDate): Promise<number | null>;
  addFee(id: string, fee: { engagementId: string; amountPaise: number; effectiveFrom: IsoDate; createdById: string }): Promise<void>;
  /** Soft-delete fees with exactly this effective date (a correction replaces them). */
  removeFeesFrom(engagementId: string, effectiveFrom: IsoDate): Promise<void>;

  /** Every period, newest first. Hours used are counted only with `withUsage` (budget.read); otherwise 0. */
  listPeriods(engagementId: string, opts?: { withUsage: boolean }): Promise<PeriodRow[]>;
  findPeriod(engagementId: string, periodStart: IsoDate): Promise<PeriodRow | null>;
  createPeriod(id: string, period: PeriodWrite): Promise<void>;
  updatePeriod(id: string, patch: Partial<Pick<PeriodWrite, "baseBudgetMinutes" | "rolloverInMinutes" | "feePaise" | "status">> & { deletedAt?: Date }): Promise<void>;
  /** Close open periods that ended before `today`. Returns the ones closed. */
  closeEndedPeriods(today: IsoDate): Promise<Array<{ id: string; engagementId: string; clientId: string; periodStart: IsoDate }>>;
  /** All time logged on each engagement, ever (one-off jobs burn against the whole budget, D27). */
  totalUsage(engagementIds: readonly string[]): Promise<Array<{ engagementId: string; usedMinutes: number; nonBillableMinutes: number }>>;

  listDeliverables(engagementId: string): Promise<DeliverableRecord[]>;
  /** The engagement a live deliverable belongs to. */
  deliverableEngagement(deliverableId: string): Promise<string | null>;
  createDeliverable(id: string, d: Omit<DeliverableRecord, "id">): Promise<void>;
  updateDeliverable(id: string, patch: Partial<Pick<DeliverableRecord, "name" | "targetCount">> & { deletedAt?: Date }): Promise<void>;

  listForClients(
    clientIds: readonly string[],
    opts: { on: IsoDate; includeFees: boolean; includeBudgets: boolean; activeOnly: boolean },
  ): Promise<EngagementSummary[]>;
  /** The period covering `on` for each engagement that has one, with what has been used. */
  periodsOn(engagementIds: readonly string[], on: IsoDate): Promise<PeriodUsage[]>;
  /** Deliverables of these engagements with how many were delivered between from and to. */
  deliverablesProgress(engagementIds: readonly string[], from: IsoDate, to: IsoDate): Promise<DeliverableProgress[]>;
}

// ---------- tasks ----------

export type TaskCounts = { clientId: string; open: number; overdue: number };

export interface TasksRepository extends WorkTasksRepository {
  /**
   * Open and overdue top-level tasks per client. `ownerId` limits the count to one person's tasks.
   * Deleting a project soft-deletes its tasks too (decided in the stage 1–3 review), so tasks.deleted_at is enough.
   */
  countsByClient(clientIds: readonly string[], today: IsoDate, ownerId?: string): Promise<TaskCounts[]>;
}

// ---------- events ----------

export type NewEvent = {
  /** Null when the system acted. */
  actorId: string | null;
  action: string;
  entityType: EntityType;
  entityId: string;
  clientId?: string | null;
  personId?: string | null;
  data?: Record<string, unknown>;
};

export type EventRow = {
  id: string;
  occurredAt: Date;
  /** Null when the system acted. */
  actorId?: string | null;
  actorName: string | null;
  action: string;
  entityType: EntityType;
  entityId: string;
  data: Record<string, unknown>;
};

export interface EventsRepository {
  record(event: NewEvent): Promise<void>;
  /** The latest events about a client, newest first. */
  listForClient(clientId: string, opts: { limit: number; excludeActions?: readonly string[]; entityTypes?: readonly EntityType[] }): Promise<EventRow[]>;
  /** The latest events about one record (a task's history), newest first. */
  listForEntity(entityType: EntityType, entityId: string, limit: number): Promise<EventRow[]>;
  /**
   * A task's whole story, newest first (QA S8-B2): its own events, time logged on it, its creatives' review steps and
   * the calendar posts that use them.
   */
  listForTask(input: { taskId: string; assetIds: readonly string[]; contentIds: readonly string[]; limit: number }): Promise<EventRow[]>;
  /** The audit log (Stage 11.7): every event matching the filter, newest first, a page at a time. */
  search(filter: AuditFilter & { offset: number; limit: number }): Promise<AuditRow[]>;
}

export type AuditFilter = { actorId?: string; entityType?: EntityType; clientId?: string; from?: Date; to?: Date };
export type AuditRow = EventRow & { clientId: string | null; clientName: string | null };

export type DeliverableProgress = {
  id: string;
  engagementId: string;
  name: string;
  targetCount: number;
  /** Linked tasks completed inside the range. */
  delivered: number;
};

// ---------- what Oppllo sells ----------

export type ServiceRecord = { id: string; key: string; name: string; description: string | null; active: boolean; position: number };
export type ServiceStageRecord = { id: string; serviceId: string; name: string; position: number };
export type TaskTemplateRecord = {
  id: string;
  serviceId: string;
  title: string;
  /** The stage, by its position among the service's stages. */
  stagePosition: number | null;
  dueOffsetDays: number;
  estimateMinutes: number | null;
  defaultRole: Role | null;
  position: number;
};

export interface CatalogRepository {
  /** Services by position; `activeOnly` hides retired ones. */
  listServices(opts: { activeOnly: boolean }): Promise<ServiceRecord[]>;
  findServiceByKey(key: string): Promise<ServiceRecord | null>;
  createService(id: string, s: Omit<ServiceRecord, "id">): Promise<void>;
  updateService(id: string, patch: Partial<Omit<ServiceRecord, "id" | "key">>): Promise<void>;
  /** Live stages, by position (0, 1, 2 … with no gaps). */
  listStages(serviceIds: readonly string[]): Promise<ServiceStageRecord[]>;
  createStage(id: string, s: Omit<ServiceStageRecord, "id">): Promise<void>;
  updateStage(id: string, patch: Partial<Pick<ServiceStageRecord, "name" | "position">> & { deletedAt?: Date }): Promise<void>;
  listTemplates(serviceIds: readonly string[]): Promise<TaskTemplateRecord[]>;
  createTemplate(id: string, t: Omit<TaskTemplateRecord, "id">): Promise<void>;
  updateTemplate(id: string, patch: Partial<Omit<TaskTemplateRecord, "id" | "serviceId">> & { deletedAt?: Date }): Promise<void>;
}

// ---------- the store ----------

export * from "./access";
export * from "./assets";
export * from "./assistant";
export * from "./coworker";
export * from "./google-files";
export * from "./client-links";
export * from "./boards";
export * from "./web";
export * from "./swipe";
export * from "./doc-tables";
export * from "./meetings";
export * from "./templates";
export * from "./goals";
export * from "./space-kits";
export * from "./attendance";
export * from "./content";
export * from "./crm";
export * from "./notifications";
export * from "./documents";
export * from "./leave";
export * from "./storage";
export * from "./integrations";
export * from "./work";
export * from "./ai";
import type { AccessRepository } from "./access";
import type { AiUsageRepository, LeadAiScoreRepository } from "./ai";
import type { AssistantRepository } from "./assistant";
import type { CoworkerRepository } from "./coworker";
import type { ClientLinksRepository } from "./client-links";
import type { BoardsRepository } from "./boards";
import type { SwipeRepository } from "./swipe";
import type { DocTablesRepository } from "./doc-tables";
import type { MeetingsRepository } from "./meetings";
import type { TemplatesRepository } from "./templates";
import type { GoalsRepository } from "./goals";
import type { SpaceKitsRepository } from "./space-kits";
import type { OAuthRepository } from "./oauth";
import type { LeadsRepository } from "./leads";
import type { AdsRepository } from "./ads";
import type { ResultsRepository } from "./results";
import type { KnowledgeRepository } from "./knowledge";
import type { AiDraftsRepository } from "./ai-drafts";
import type { ReportsRepository } from "./reports";
import type { ConsentRepository } from "./consent";
import type { BackupsRepository } from "./backups";
import type { SpaceAccessRepository } from "./space-access";
import type { PortalRepository } from "./portal";
import type { ChatRepository } from "./chat";
import type { AssetsRepository } from "./assets";
import type { AttendanceRepository } from "./attendance";
import type { ContentRepository } from "./content";
import type { CrmInboxRepository } from "./crm";
import type { NotificationsRepository } from "./notifications";
import type { DocumentsRepository } from "./documents";
import type { CalendarRepository, LeaveRepository } from "./leave";
import type { ProjectsRepository, TimeRepository, WorkTasksRepository } from "./work";

export interface Repositories {
  people: PeopleRepository;
  clients: ClientsRepository;
  engagements: EngagementsRepository;
  tasks: TasksRepository;
  events: EventsRepository;
  leave: LeaveRepository;
  calendar: CalendarRepository;
  projects: ProjectsRepository;
  time: TimeRepository;
  assets: AssetsRepository;
  catalog: CatalogRepository;
  attendance: AttendanceRepository;
  access: AccessRepository;
  documents: DocumentsRepository;
  content: ContentRepository;
  notifications: NotificationsRepository;
  crmInbox: CrmInboxRepository;
  aiUsage: AiUsageRepository;
  leadAiScores: LeadAiScoreRepository;
  assistant: AssistantRepository;
  coworker: CoworkerRepository;
  clientLinks: ClientLinksRepository;
  boards: BoardsRepository;
  swipe: SwipeRepository;
  docTables: DocTablesRepository;
  meetings: MeetingsRepository;
  templates: TemplatesRepository;
  goals: GoalsRepository;
  spaceKits: SpaceKitsRepository;
  oauth: OAuthRepository;
  leads: LeadsRepository;
  ads: AdsRepository;
  results: ResultsRepository;
  knowledge: KnowledgeRepository;
  aiDrafts: AiDraftsRepository;
  reports: ReportsRepository;
  consent: ConsentRepository;
  backups: BackupsRepository;
  spaceAccess: SpaceAccessRepository;
  portal: PortalRepository;
  chat: ChatRepository;
  taskSetup: TaskSetupRepository;
  docs: DocsRepository;
  talent: TalentRepository;
  growth: GrowthRepository;
  billing: BillingRepository;
}

export interface DataStore extends Repositories {
  /** Run `fn` atomically: every write inside commits together or not at all. */
  transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
export * from "./oauth";
export * from "./leads";
export * from "./ads";
export * from "./results";
export * from "./knowledge";
export * from "./ai-drafts";
export * from "./reports";
export * from "./consent";
export * from "./backups";
export * from "./errors";
export * from "./space-access";
export * from "./portal";
export * from "./chat";
export * from "./task-setup";
import type { TaskSetupRepository } from "./task-setup";
import type { DocsRepository } from "./docs";
import type { TalentRepository } from "./talent";
import type { GrowthRepository } from "./growth";
export * from "./growth";
import type { BillingRepository } from "./billing";
export * from "./billing";
export * from "./talent";
export * from "./docs";
