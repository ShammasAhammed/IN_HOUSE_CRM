// The PostgreSQL implementation of every repository, and file storage kept in PostgreSQL (D78).
// Only lib/server/container.ts (and tests) import this.
import type { DataStore, FileStorage, LinkSigner, Repositories } from "@/repositories";
import { connect, sharedConnection, type Db } from "./connection";
import { accessRepository } from "./access";
import { aiUsageRepository, leadAiScoreRepository } from "./ai";
import { assistantRepository } from "./assistant";
import { coworkerRepository } from "./coworker";
import { clientLinksRepository } from "./client-links";
import { boardsRepository } from "./boards";
import { swipeRepository } from "./swipe";
import { docTablesRepository } from "./doc-tables";
import { meetingsRepository } from "./meetings";
import { templatesRepository } from "./templates";
import { goalsRepository } from "./goals";
import { spaceKitsRepository } from "./space-kits";
import { oauthRepository } from "./oauth";
import { leadsRepository } from "./leads";
import { adsRepository } from "./ads";
import { resultsRepository } from "./results";
import { knowledgeRepository } from "./knowledge";
import { aiDraftsRepository } from "./ai-drafts";
import { reportsRepository } from "./reports";
import { consentRepository } from "./consent";
import { backupsRepository } from "./backups";
import { spaceAccessRepository } from "./space-access";
import { portalRepository } from "./portal";
import { chatRepository } from "./chat";
import { assetsRepository } from "./assets";
import { attendanceRepository } from "./attendance";
import { catalogRepository } from "./catalog";
import { clientsRepository } from "./clients";
import { contentRepository } from "./content";
import { crmInboxRepository } from "./crm";
import { notificationsRepository } from "./notifications";
import { documentsRepository } from "./documents";
import { engagementsRepository } from "./engagements";
import { eventsRepository } from "./events";
import { calendarRepository, leaveRepository } from "./leave";
import { peopleRepository } from "./people";
import { projectsRepository } from "./projects";
import { postgresStorage } from "./storage";
import { timeRepository } from "./time";
import { tasksRepository } from "./tasks";
import { taskSetupRepository } from "./task-setup";
import { docsRepository } from "./docs";
import { talentRepository } from "./talent";
import { growthRepository } from "./growth";
import { billingRepository } from "./billing";

function repositories(db: Db): Repositories {
  return {
    people: peopleRepository(db),
    clients: clientsRepository(db),
    engagements: engagementsRepository(db),
    tasks: tasksRepository(db),
    events: eventsRepository(db),
    leave: leaveRepository(db),
    calendar: calendarRepository(db),
    projects: projectsRepository(db),
    time: timeRepository(db),
    assets: assetsRepository(db),
    catalog: catalogRepository(db),
    attendance: attendanceRepository(db),
    access: accessRepository(db),
    documents: documentsRepository(db),
    content: contentRepository(db),
    notifications: notificationsRepository(db),
    crmInbox: crmInboxRepository(db),
    aiUsage: aiUsageRepository(db),
    leadAiScores: leadAiScoreRepository(db),
    assistant: assistantRepository(db),
    coworker: coworkerRepository(db),
    clientLinks: clientLinksRepository(db),
    boards: boardsRepository(db),
    swipe: swipeRepository(db),
    docTables: docTablesRepository(db),
    meetings: meetingsRepository(db),
    templates: templatesRepository(db),
    goals: goalsRepository(db),
    spaceKits: spaceKitsRepository(db),
    oauth: oauthRepository(db),
    leads: leadsRepository(db),
    ads: adsRepository(db),
    results: resultsRepository(db),
    knowledge: knowledgeRepository(db),
    aiDrafts: aiDraftsRepository(db),
    reports: reportsRepository(db),
    consent: consentRepository(db),
    backups: backupsRepository(db),
    spaceAccess: spaceAccessRepository(db),
    portal: portalRepository(db),
    chat: chatRepository(db),
    taskSetup: taskSetupRepository(db),
    docs: docsRepository(db),
    talent: talentRepository(db),
    growth: growthRepository(db),
    billing: billingRepository(db),
  };
}

/**
 * A store over PostgreSQL. `shared: true` (the app) reuses one pool per URL across hot reloads;
 * tests get their own pool and close it.
 */
export function createPostgresStore(url: string, opts: { max?: number; shared?: boolean } = {}): DataStore & { close(): Promise<void> } {
  const { client, db } = opts.shared ? sharedConnection(url) : connect(url, opts);
  return {
    ...repositories(db),
    transaction: (fn) => db.transaction((tx) => fn(repositories(tx as unknown as Db))),
    close: () => client.end(),
  };
}

/**
 * File storage in PostgreSQL (D78), on the same pool as the store. `signLink` makes the expiring links to the app's own
 * download route; the container passes it in so this adapter never holds the secret.
 */
export function createPostgresStorage(url: string, opts: { shared?: boolean; signLink: LinkSigner }): FileStorage & { close(): Promise<void> } {
  const { client, db } = opts.shared ? sharedConnection(url) : connect(url);
  return { ...postgresStorage(db, { signLink: opts.signLink }), close: () => client.end() };
}
