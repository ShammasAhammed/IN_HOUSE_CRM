// The composition root: the ONE place that picks adapters and wires them into services.
// Swapping PostgreSQL (or later Drive for R2) means changing this file and adding an adapter — nothing else.
import "server-only";
import { anthropicModel } from "@/adapters/ai/anthropic";
import { chatDecisionModel } from "@/adapters/ai/decision-fallback";
import { geminiModel } from "@/adapters/ai/gemini";
import { openAiModel } from "@/adapters/ai/openai";
import { jevDecisionModel } from "@/adapters/ai/typesafe";
import { metaConversions, notConnectedMetaConversions } from "@/adapters/meta/conversions";
import { metaAdInsights, notConnectedMetaInsights } from "@/adapters/meta/insights";
import { metaLeadAds, notConnectedMeta } from "@/adapters/meta/lead-ads";
import { firestoreCrm, notConnectedCrm } from "@/adapters/crm/firestore";
import { logMailer, resendMailer } from "@/adapters/email/resend";
import { googleDriveClientFolders, googleDriveStorage, notConnectedClientFolders } from "@/adapters/google-drive/storage";
import { notConnectedZohoBooks, zohoBooks } from "@/adapters/zoho/books";
import { createPostgresStorage, createPostgresStore } from "@/adapters/postgres";
import { storageRouter } from "@/adapters/storage-router";
import { notConnectedBackupStore } from "@/adapters/backups/not-connected";
import type { AiModel, DecisionModel, FileStorage, GoogleFiles } from "@/repositories";
import { createAccessService } from "@/services/access";
import { createAdService } from "@/services/ads";
import { createAiService } from "@/services/ai";
import { createAssistantService } from "@/services/assistant";
import { createMcpService } from "@/services/mcp";
import { createMcpAuthService } from "@/services/mcp-auth";
import { createAssetService } from "@/services/assets";
import { createAutomationService } from "@/services/automations";
import { createContentService } from "@/services/content";
import { createConversionService } from "@/services/conversions";
import { createCrmService } from "@/services/crm";
import { createDashboardService } from "@/services/dashboard";
import { createNotificationService } from "@/services/notifications";
import { createAttendanceService } from "@/services/attendance";
import { createCapacityService } from "@/services/capacity";
import { createCatalogService } from "@/services/catalog";
import { createClientAdminService } from "@/services/client-admin";
import { createClientService } from "@/services/clients";
import { systemClock } from "@/services/clock";
import { createDocumentService, createFileService } from "@/services/documents";
import { createEngagementService } from "@/services/engagements";
import { createIdentityService } from "@/services/identity";
import { createImportService } from "@/services/import";
import { createLeadImportService } from "@/services/lead-import";
import { createLeadIntakeService } from "@/services/lead-intake";
import { createLeadService } from "@/services/leads";
import { createLeaveService } from "@/services/leave";
import { createPeopleService } from "@/services/people";
import { createProjectService } from "@/services/projects";
import { createRecurrenceService } from "@/services/recurrences";
import { createPlanningService } from "@/services/planning";
import { createAutomationRuleService } from "@/services/automation-rules";
import { createDocService } from "@/services/docs";
import { createMeetingService } from "@/services/meetings";
import { createDocAiService } from "@/services/doc-ai";
import { createGalleryService } from "@/services/gallery";
import { createGoalService } from "@/services/goals";
import { createSpaceKitService } from "@/services/space-kits";
import { createTalentService } from "@/services/talent";
import { createGrowthService } from "@/services/growth";
import { createBillingService } from "@/services/billing";
import { createDailySummaryService } from "@/services/daily-summary";
import { createRequestFormService } from "@/services/request-forms";
import { createResultService } from "@/services/results";
import { createKnowledgeService } from "@/services/knowledge";
import { createAiDraftService } from "@/services/ai-drafts";
import { createReportService } from "@/services/reports";
import { createAuditService } from "@/services/audit";
import { createConsentService } from "@/services/consent";
import { createSpaceService } from "@/services/spaces";
import { createSpaceAccessService } from "@/services/space-access";
import { createPortalService } from "@/services/portal";
import { createChatService } from "@/services/chat";
import { createChatAiService } from "@/services/chat-ai";
import { createLeadScoreService } from "@/services/lead-scores";
import { createMyAssistantService } from "@/services/my-assistant";
import { createCoworkerService } from "@/services/coworker";
import { createClientChatService } from "@/services/client-chat";
import { createDocTablesService } from "@/services/doc-tables";
import { createBoardCardsService } from "@/services/board-cards";
import { createSwipeService } from "@/services/swipe";
import { createBoardsService } from "@/services/boards";
import { createClientLinksService } from "@/services/client-links";
import { googleFiles, notConnectedGoogleFiles } from "@/adapters/google-drive/files";
import { publicWeb } from "@/adapters/web/public-web";
import { createBackupService } from "@/services/backups";
import { createSearchService } from "@/services/search";
import { createTaskSetupService } from "@/services/task-setup";
import { createTimerService } from "@/services/timers";
import { createTaskCollabService } from "@/services/task-collab";
import { createTaskService } from "@/services/tasks";
import { createTimeService } from "@/services/time";
import { DEFAULT_INR_PER_USD } from "@/services/rules/ai";
import { reportError } from "./report-error";
import { signFileLink, verifyFileLink } from "./signed-links";

/**
 * Where new files go: PostgreSQL by default (D78), or Google Drive when FILE_STORAGE=google_drive and its service
 * account is set (D79). Files already saved stay readable wherever they are.
 */
function fileStorage(url: string): FileStorage {
  const postgres = createPostgresStorage(url, { shared: true, signLink: signFileLink });
  if ((process.env.FILE_STORAGE || "postgres") === "postgres") return postgres;
  if (process.env.FILE_STORAGE !== "google_drive") throw new Error(`FILE_STORAGE must be "postgres" or "google_drive", not "${process.env.FILE_STORAGE}".`);
  const { GOOGLE_DRIVE_CLIENT_EMAIL: clientEmail, GOOGLE_DRIVE_PRIVATE_KEY: key, GOOGLE_DRIVE_FOLDER_ID: rootFolderId } = process.env;
  if (!clientEmail || !key || !rootFolderId) throw new Error("FILE_STORAGE=google_drive needs GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY and GOOGLE_DRIVE_FOLDER_ID.");
  // Hosts keep the key on one line with "\n" for each line break.
  const drive = googleDriveStorage({ credentials: { clientEmail, privateKey: key.replace(/\\n/g, "\n") }, rootFolderId, signLink: signFileLink });
  return storageRouter(drive, [postgres]);
}

/** A Drive folder per client, once the service account and the clients folder are set (docs/google-drive.md). */
function clientFolders() {
  const { GOOGLE_DRIVE_CLIENT_EMAIL: clientEmail, GOOGLE_DRIVE_PRIVATE_KEY: key, GOOGLE_DRIVE_CLIENTS_FOLDER_ID: parentFolderId } = process.env;
  if (!clientEmail || !key || !parentFolderId) return notConnectedClientFolders();
  return googleDriveClientFolders({ credentials: { clientEmail, privateKey: key.replace(/\\n/g, "\n") }, parentFolderId });
}

/** Zoho Books draft invoices, once its keys are set (docs/zoho-books.md). */
function invoiceBook() {
  const { ZOHO_CLIENT_ID: clientId, ZOHO_CLIENT_SECRET: clientSecret, ZOHO_REFRESH_TOKEN: refreshToken, ZOHO_ORGANIZATION_ID: organizationId } = process.env;
  if (!clientId || !clientSecret || !refreshToken || !organizationId) return notConnectedZohoBooks();
  return zohoBooks({ clientId, clientSecret, refreshToken, organizationId, dc: process.env.ZOHO_DC });
}

/** Every model the router may use: three per provider whose key is set (ids and prices in adapters/ai/prices.ts). */
function aiModels(): AiModel[] {
  const { ANTHROPIC_API_KEY: claude, OPENAI_API_KEY: openai, GEMINI_API_KEY: gemini, AI_MODEL } = process.env;
  const claudeIds = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
  return [
    ...(claude ? [...claudeIds, ...(AI_MODEL && !claudeIds.includes(AI_MODEL) ? [AI_MODEL] : [])].map((model) => anthropicModel({ apiKey: claude, model })) : []),
    ...(openai ? ["gpt-5-nano", "gpt-5-mini", "gpt-5.5"].map((model) => openAiModel({ apiKey: openai, model })) : []),
    ...(gemini ? ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-4-argon"].map((model) => geminiModel({ apiKey: gemini, model })) : []),
  ];
}

/** The decision helper: TypeSafe's Jev when its key is set, then Claude Haiku answering the same questions. */
function decisionModels(): DecisionModel[] {
  const { TYPESAFE_API_KEY: jev, ANTHROPIC_API_KEY: claude } = process.env;
  return [...(jev ? [jevDecisionModel({ apiKey: jev })] : []), ...(claude ? [chatDecisionModel(anthropicModel({ apiKey: claude, model: "claude-haiku-5-5" }))] : [])];
}

/** Reading clients' Google files (13.0) with the Drive service account; without its keys, links stay plain links. */
function googleFilesAccess(): GoogleFiles {
  const { GOOGLE_DRIVE_CLIENT_EMAIL: clientEmail, GOOGLE_DRIVE_PRIVATE_KEY: key } = process.env;
  return clientEmail && key ? googleFiles({ credentials: { clientEmail, privateKey: key.replace(/\\n/g, "\n") } }) : notConnectedGoogleFiles();
}

function build() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const s = createPostgresStore(url, { shared: true });
  const storage = fileStorage(url);
  const clock = systemClock;
  const capacity = createCapacityService({ store: s, clock });
  // The prospect CRM, read-only, once its key is set (docs/crm-link.md, D84).
  const crm = createCrmService({
    store: s,
    clock,
    source:
      process.env.CRM_FIREBASE_CLIENT_EMAIL && process.env.CRM_FIREBASE_PRIVATE_KEY
        ? firestoreCrm({ projectId: process.env.CRM_FIREBASE_PROJECT_ID || "oppllo-crm", clientEmail: process.env.CRM_FIREBASE_CLIENT_EMAIL, privateKey: process.env.CRM_FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") })
        : notConnectedCrm(),
  });
  // Stage results back to Meta and Google Ads (Stage 10a.5, D90).
  const conversions = createConversionService({
    store: s,
    clock,
    meta: process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN ? metaConversions({ token: (process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN)!, version: process.env.META_GRAPH_VERSION }) : notConnectedMetaConversions(),
    googleUploadKey: process.env.GOOGLE_CONVERSIONS_UPLOAD_KEY,
  });
  const leads = createLeadService({
    store: s,
    clock,
    crmConnected: crm.connected,
    intake: { metaReady: Boolean(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN && process.env.META_ACCESS_TOKEN), googleReady: Boolean(process.env.GOOGLE_LEAD_WEBHOOK_KEY) },
    onStageChanged: (leadId, stage) => conversions.onStage(leadId, stage),
    report: reportError,
  });
  const ads = createAdService({
    store: s,
    clock,
    report: reportError,
    meta: process.env.META_ADS_TOKEN || process.env.META_ACCESS_TOKEN ? metaAdInsights({ token: (process.env.META_ADS_TOKEN || process.env.META_ACCESS_TOKEN)!, version: process.env.META_GRAPH_VERSION }) : notConnectedMetaInsights(),
  });
  // Email goes out once Resend is set up (D82); until then it's only logged.
  const mailer = process.env.RESEND_API_KEY ? resendMailer({ apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM || "Oppllo One <one@oppllo.com>" }) : logMailer();
  const core = {
    identity: createIdentityService({ store: s }),
    clients: createClientService({ store: s, clock }),
    clientAdmin: createClientAdminService({ store: s, clock }),
    engagements: createEngagementService({ store: s, clock }),
    people: createPeopleService({ store: s, clock }),
    leave: createLeaveService({ store: s, clock }),
    attendance: createAttendanceService({ store: s, clock }),
    access: createAccessService({ store: s, clock }),
    documents: createDocumentService({ store: s, storage, clock, report: reportError }),
    files: createFileService({ storage, verifyLink: verifyFileLink }),
    assets: createAssetService({ store: s, storage, clock }),
    content: createContentService({ store: s, clock }),
    automations: createAutomationService({ store: s, clock }),
    crm,
    notifications: createNotificationService({
      store: s,
      clock,
      mailer,
      appUrl: process.env.APP_URL || "http://localhost:3000",
    }),
    tasks: createTaskService({ store: s, clock }),
    planning: createPlanningService({ store: s, clock }),
    search: createSearchService({ store: s, clock }),
    requestForms: createRequestFormService({ store: s, clock }),
    docs: createDocService({ store: s, clock, storage }),
    automationRules: createAutomationRuleService({ store: s, clock }),
    talent: createTalentService({ store: s, clock }),
    growth: createGrowthService({ store: s, clock }),
    // Ops extras: client Drive folders and Zoho Books invoices.
    billing: createBillingService({ store: s, clock, folders: clientFolders(), books: invoiceBook(), report: reportError }),
    taskSetup: createTaskSetupService({ store: s, clock }),
    timers: createTimerService({ store: s, clock }),
    taskCollab: createTaskCollabService({ store: s, clock, storage, report: reportError }),
    time: createTimeService({ store: s, clock }),
    projects: createProjectService({ store: s, clock }),
    recurrences: createRecurrenceService({ store: s, clock }),
    capacity,
    // Sales, moved in from the CRM (Stage 10a, D88).
    conversions,
    // Meta ad results on the client page (Stage 10.1, D92, docs/meta-ads.md).
    ads,
    // Results per client (Stage 11.1): leads, spend, calls, admissions and targets, pre-filled from Meta.
    results: createResultService({ store: s, clock, ads }),
    // Client knowledge base (Stage 11.2): tone, do's and don'ts, past campaigns, brand kit files and SOP links.
    knowledge: createKnowledgeService({ store: s, clock, storage, report: reportError }),
    leads,
    leadImport: createLeadImportService({ store: s, clock, isLive: leads.isLive }),
    // Claude, ChatGPT and Gemini once the owner adds their keys (docs/ai.md, D85); the router picks per job (12.3) and
    // the monthly limit is checked on every attempt. A provider with no key is simply not there.
    ai: createAiService({
      store: s,
      clock,
      models: aiModels(),
      decisions: decisionModels(),
      inrPerUsd: Number(process.env.AI_INR_PER_USD) || DEFAULT_INR_PER_USD,
      report: reportError,
    }),
    dashboard: createDashboardService({ store: s, clock, capacity }),
    catalog: createCatalogService({ store: s, clock }),
    import: createImportService({ store: s, clock }),
  };
  // The owner's morning summary (ops extra), off until turned on in Settings → AI.
  const dailySummary = createDailySummaryService({ store: s, clock, ai: core.ai, dashboard: core.dashboard });
  // Chat (Stage 12.1): client, space, team and direct channels; who sees what follows the existing rules.
  const chat = createChatService({ store: s, clock, storage, report: reportError });
  const spaceAccess = createSpaceAccessService({ store: s, clock });
  // Database tables inside pages (Stage 13.4), read and edited with the page's own rights.
  const docTables = createDocTablesService({ store: s, clock, docs: core.docs });
  const meetings = createMeetingService({ store: s, clock, docs: core.docs, tasks: core.tasks });
  const docAi = createDocAiService({ store: s, ai: core.ai, docs: core.docs, meetings });
  const boards = createBoardsService({ store: s, clock, storage, tasks: core.tasks, docs: core.docs });
  const gallery = createGalleryService({ store: s, clock, boards, docs: core.docs, docTables });
  const goals = createGoalService({ store: s, clock });
  const spaceKits = createSpaceKitService({ store: s, clock });
  const spaces = createSpaceService({ store: s, clock });
  const clientLinks = createClientLinksService({ store: s, clock, storage, google: googleFilesAccess(), report: reportError });
  // The swipe file (Stage 13.2): previews through the guarded public-web adapter; Meta oEmbed with its token, if any.
  const swipe = createSwipeService({ store: s, clock, storage, web: publicWeb({ metaToken: process.env.META_OEMBED_TOKEN || process.env.META_ACCESS_TOKEN || null, metaVersion: process.env.META_GRAPH_VERSION }), boards });
  // Live cards on boards (Stage 13.2): each read through its own service with the viewer's rights.
  const boardCards = createBoardCardsService({ store: s, clock, sources: { tasks: core.tasks, assets: core.assets, results: core.results, clientLinks, docs: core.docs, knowledge: core.knowledge, swipe } });
  const portal = createPortalService({ store: s, clock, storage, mailer, emailReady: Boolean(process.env.RESEND_API_KEY), appUrl: process.env.APP_URL || "http://localhost:3000", logLinks: process.env.NODE_ENV !== "production" });
  // The assistant reads through the other services with the asker's own permissions (D86).
  return {
    ...core,
    chat,
    // AI in chat (Stage 12.2): @AI answers with what everyone in the chat sees; catch-up and task proposals for the asker.
    chatAi: createChatAiService({ store: s, clock, ai: core.ai, chat, tools: { ...core, clientLinks, docTables, meetings } }),
    dailySummary,
    // A client's sheets, Google files and artifacts (Stage 13.0): Google stays the editor; read through the service account.
    clientLinks,
    boards,
    swipe,
    boardCards,
    docTables,
    meetings,
    docAi,
    gallery,
    goals,
    spaceKits,
    // The AI co-worker (Stage 12.5): daily suggestions as cards in each client's chat; nothing changes until approved.
    coworker: createCoworkerService({ store: s, clock, ai: core.ai, chat, tasks: core.tasks, capacity: core.capacity, results: core.results, clients: core.clients, goals }),
    // The personal assistant (Stage 12.4): everyone's own plan, drafts, promises and report help; only suggestions.
    myAssistant: createMyAssistantService({ store: s, clock, ai: core.ai, tasks: core.tasks, leave: core.leave, assets: core.assets, chat, spaceAccess, knowledge: core.knowledge, growth: core.growth, projects: core.projects }),
    // Lead hints from the decision helper (Stage 12.3): shown beside leads, never changing them.
    leadScores: createLeadScoreService({ store: s, clock, ai: core.ai }),
    // AI teammates (Stage 11.3): drafts on tasks a person approves, through the same AI limit and log.
    aiDrafts: createAiDraftService({ store: s, clock, ai: core.ai, knowledge: core.knowledge }),
    // Monthly client reports (Stage 11.4): numbers from the data, words by the AI or a person, frozen when final.
    reports: createReportService({ store: s, clock, ai: core.ai, ads: core.ads, files: clientLinks }),
    // Trust layer (Stage 11.7): the owner's audit log over the events every change writes.
    audit: createAuditService({ store: s }),
    // DPDP consent records for leads and staff.
    consent: createConsentService({ store: s, clock }),
    // Spaces (Stage 14.1): internal work areas, private ones only for their members and the owner.
    spaces,
    // Access to spaces (Stage 14.2): asked, approved by the other of owner/HR, confirmed by the member.
    spaceAccess,
    // Client portal (Stage 11.6): a client's own contacts, only their client's work; links printed in development.
    portal,
    // Client chat (Stage 12.6): the chat a client shares with Oppllo, from the portal side, and its email alerts.
    clientChat: createClientChatService({ store: s, clock, storage, mailer, emailReady: Boolean(process.env.RESEND_API_KEY), appUrl: process.env.APP_URL || "http://localhost:3000", portal }),
    // Daily backups to storage the owner controls; not set up until they choose one (docs/backups.md). Choosing R2,
    // Drive or S3 later = one adapter in adapters/backups + this line.
    backups: createBackupService({ store: s, clock, backups: notConnectedBackupStore() }),
    assistant: createAssistantService({ ...core, clock, clientLinks, docTables, meetings }),
    // The Oppllo MCP (D87): OAuth sign-in for AI apps, and the tools they may use as that person.
    mcpAuth: createMcpAuthService({ store: s, clock }),
    mcp: createMcpService({ ...core, clock, store: s, clientLinks, docTables, meetings, boards, gallery, goals, spaceKits, spaces }),
    // New leads from landing pages, Meta lead ads and Google lead forms (Stage 10a.4, docs/lead-intake.md).
    leadIntake: createLeadIntakeService({
      store: s,
      clock,
      meta: process.env.META_ACCESS_TOKEN ? metaLeadAds({ accessToken: process.env.META_ACCESS_TOKEN, version: process.env.META_GRAPH_VERSION, defaultPageId: process.env.META_PAGE_ID }) : notConnectedMeta(),
      report: reportError,
      secrets: { metaAppSecret: process.env.META_APP_SECRET, metaVerifyToken: process.env.META_VERIFY_TOKEN, googleWebhookKey: process.env.GOOGLE_LEAD_WEBHOOK_KEY },
    }),
  };
}

export type Services = ReturnType<typeof build>;

// Built once per module load: a code change in development rebuilds it with the new code.
let services: Services | undefined;

export function getServices(): Services {
  services ??= build();
  return services;
}
