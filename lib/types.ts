// Shared vocabulary: every enum-like value used by the schema, services and screens.
// Stored as text in PostgreSQL with CHECK constraints generated from these lists.

export const ROLES = [
  "owner",
  "strategist",
  "performance_marketer",
  "social_media",
  "designer",
  "video_editor",
  "bdo",
  "hr",
  "accountant",
  "intern",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  strategist: "Strategist",
  performance_marketer: "Performance marketer",
  social_media: "Social media marketer",
  designer: "Designer",
  video_editor: "Video editor",
  bdo: "BDO",
  hr: "HR",
  accountant: "Accountant",
  intern: "Intern",
};

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "intern", "freelancer"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  intern: "Intern",
  freelancer: "Freelancer",
};

export const WORK_LOCATIONS = ["office", "home", "hybrid"] as const;
export type WorkLocation = (typeof WORK_LOCATIONS)[number];

/** Where someone worked on a day (attendance). A client site covers shoots and campus visits. */
export const ATTENDANCE_LOCATIONS = ["office", "home", "client_site"] as const;
export type AttendanceLocation = (typeof ATTENDANCE_LOCATIONS)[number];
export const ATTENDANCE_LOCATION_LABELS: Record<AttendanceLocation, string> = { office: "Office", home: "Home", client_site: "Client site" };

/** Documents in a person's locker (HR slice 2). ID proofs are masked: last four digits only (NEVER list). */
export const DOCUMENT_KINDS = ["offer_letter", "contract", "id_proof", "certificate", "letter", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  offer_letter: "Offer letter",
  contract: "Agreement or contract",
  id_proof: "ID proof (masked)",
  certificate: "Certificate",
  letter: "Letter from Oppllo",
  other: "Other",
};

/** A person's joining checklist and exit checklist (HR slice 2). */
export const CHECKLIST_KINDS = ["joining", "exit"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

export const PERSON_STATUSES = ["active", "left"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const CLIENT_STATUSES = ["onboarding", "active", "paused", "churned"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  onboarding: "Onboarding",
  active: "Active",
  paused: "Paused",
  churned: "Churned",
};

export const CLIENT_SEGMENTS = ["coaching", "college", "school", "edtech", "training_institute", "other"] as const;
export type ClientSegment = (typeof CLIENT_SEGMENTS)[number];
export const CLIENT_SEGMENT_LABELS: Record<ClientSegment, string> = {
  coaching: "Coaching centre",
  college: "College / university",
  school: "School",
  edtech: "Edtech",
  training_institute: "Training institute",
  other: "Other",
};

export const ENGAGEMENT_KINDS = ["retainer", "one_off"] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];

export const ENGAGEMENT_STATUSES = ["draft", "active", "paused", "ended"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const ROLLOVER_POLICIES = ["expire", "rollover"] as const;
export type RolloverPolicy = (typeof ROLLOVER_POLICIES)[number];

export const PERIOD_STATUSES = ["open", "closed"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };

export const TASK_STATUSES = ["todo", "in_progress", "in_review", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

/** People on a task besides its owner (Stage 9b.2): assignees do it with the owner, watchers are kept informed. */
export const TASK_PERSON_ROLES = ["assignee", "watcher"] as const;
export type TaskPersonRole = (typeof TASK_PERSON_ROLES)[number];

/** Custom fields on tasks (Stage 9b.4). */
export const TASK_FIELD_KINDS = ["text", "number", "date", "select", "checkbox", "link"] as const;
export type TaskFieldKind = (typeof TASK_FIELD_KINDS)[number];
export const TASK_FIELD_KIND_LABELS: Record<TaskFieldKind, string> = { text: "Text", number: "Number", date: "Date", select: "Dropdown", checkbox: "Yes / no", link: "Link" };

/** Saved shapes to start new work from (Stage 9b.4). */
export const TEMPLATE_KINDS = ["task", "project"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const ASSET_KINDS = ["image", "video", "document", "link", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const APPROVAL_STATES = ["draft", "internal_review", "client_review", "changes_requested", "approved"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];
export const APPROVAL_STATE_LABELS: Record<ApprovalState, string> = {
  draft: "Draft",
  internal_review: "Internal review",
  client_review: "With client",
  changes_requested: "Changes asked",
  approved: "Approved",
};

/** A client's content calendar (Stage 7.3, D81): where a post or ad goes out, and how far along it is. */
export const CONTENT_CHANNELS = ["instagram_post", "instagram_reel", "instagram_story", "facebook_post", "youtube", "linkedin", "whatsapp", "meta_ad", "google_ad", "other"] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];
export const CONTENT_CHANNEL_LABELS: Record<ContentChannel, string> = {
  instagram_post: "Instagram post",
  instagram_reel: "Instagram reel",
  instagram_story: "Instagram story",
  facebook_post: "Facebook post",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  meta_ad: "Meta ad",
  google_ad: "Google ad",
  other: "Other",
};
export const CONTENT_STATUSES = ["idea", "in_production", "ready", "scheduled", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: "Idea",
  in_production: "In production",
  ready: "Ready to publish",
  scheduled: "Scheduled",
  published: "Published",
};

/** What moves a creative along (Stage 7.2, D80). Stored on the version's thread with its note. */
export const REVIEW_ACTIONS = ["submit", "send_to_client", "request_changes", "approve", "client_approved", "client_changes"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** Where a file's bytes live. "postgres" keeps them in the database until Drive or R2 is set up (D78). */
export const STORAGE_PROVIDERS = ["google_drive", "r2", "local", "external_link", "postgres"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled", "revoked"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  revoked: "Revoked",
};

export const HALF_DAYS = ["first_half", "second_half"] as const;
export type HalfDay = (typeof HALF_DAYS)[number];

export const RECURRENCE_FREQUENCIES = ["weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** Entities that events can point at. */
export const ENTITY_TYPES = [
  "invoice",
  "person",
  "attendance_day",
  "access_grant",
  "checklist_item",
  "person_document",
  "department",
  "client",
  "client_contact",
  "engagement",
  "engagement_period",
  "project",
  "task",
  "task_comment",
  "task_recurrence",
  "time_entry",
  "asset",
  "content_item",
  "crm_lead",
  "deliverable",
  "service",
  "leave_request",
  "leave_type",
  "leave_grant",
  "holiday",
  "setting",
  "mcp_connection",
  "lead",
  "client_ad_account",
  "lead_view",
  "task_view",
  "task_field",
  "template",
  "timer",
  "request_form",
  "doc",
  "automation",
  "intern_record",
  "one_to_one",
  "letter",
  "skill",
  "skill_level",
  "growth_goal",
  "learning_item",
  "client_result",
  "client_knowledge",
  "client_campaign",
  "client_file",
  "client_report",
  "consent_record",
  "space_access_request",
  "portal_user",
  "chat_channel",
  "coworker_suggestion",
  "client_link",
  "board",
  "board_comment",
  "swipe_item",
  "doc_table",
  "doc_comment",
  "meeting",
  "gallery_template",
  "preset",
  "goal",
  "space_kit",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Where a monthly result number came from (Stage 11.1): typed in, or as Meta reported it. */
export const RESULT_SOURCES = ["manual", "meta"] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

/** What a client knowledge file is (Stage 11.2): part of the brand kit, an SOP or how-to, or anything else. */
export const KNOWLEDGE_FILE_KINDS = ["brand", "sop", "other"] as const;
export type KnowledgeFileKind = (typeof KNOWLEDGE_FILE_KINDS)[number];
export const KNOWLEDGE_FILE_KIND_LABELS: Record<KnowledgeFileKind, string> = { brand: "Brand kit", sop: "SOP", other: "Other" };

/** What an AI teammate can draft on a task (Stage 11.3). */
export const AI_DRAFT_KINDS = ["caption", "brief", "script", "report_prep"] as const;
export type AiDraftKind = (typeof AI_DRAFT_KINDS)[number];
export const AI_DRAFT_KIND_LABELS: Record<AiDraftKind, string> = { caption: "Caption", brief: "Creative brief", script: "First script", report_prep: "Report prep" };
/** A draft waits for a person; approved or rejected, it is never changed again. */
export const AI_DRAFT_STATUSES = ["draft", "approved", "rejected"] as const;
export type AiDraftStatus = (typeof AI_DRAFT_STATUSES)[number];

/** A monthly client report (Stage 11.4): being written, or final and frozen. */
export const REPORT_STATUSES = ["draft", "final"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** DPDP consent records (Stage 11.7): whose consent, and how it was given or withdrawn. */
export const CONSENT_SUBJECTS = ["lead", "person", "client_contact"] as const;
export type ConsentSubject = (typeof CONSENT_SUBJECTS)[number];
export const CONSENT_METHODS = ["form", "call", "paper", "email", "in_person", "whatsapp"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];
export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = { form: "Online form", call: "Phone call", paper: "Signed paper", email: "Email", in_person: "In person", whatsapp: "WhatsApp" };

/** A daily backup run (Stage 11.7): whether it was saved, and whether reading it back matched the database. */
export const BACKUP_STATUSES = ["ok", "failed"] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

/** Access to a space (Stage 14.2, D-14.2a), lowest to highest. */
export const ACCESS_LEVELS = ["view", "comment", "edit", "manage"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = { view: "View", comment: "Comment", edit: "Edit", manage: "Manage" };
/** A request for access: asked, then approved or refused by the other of owner/HR, then confirmed by the member. */
export const ACCESS_REQUEST_STATUSES = ["pending", "approved", "refused", "confirmed", "cancelled"] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];
/** The asker's answer about the member's Google 2-step sign-in (Oppllo One can't check it itself). */
export const TWO_STEP_ANSWERS = ["yes", "not_sure"] as const;
export type TwoStepAnswer = (typeof TWO_STEP_ANSWERS)[number];

/** Chat channels (Stage 12.1): a client's or space's channel, a team channel, or direct messages. */
export const CHAT_KINDS = ["client", "team", "direct", "shared"] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

/** What the AI was asked for (Stage 9, D85). */
export const AI_FEATURES = ["assistant", "client_update", "mcp", "daily_summary", "teammate", "client_report", "chat_answer", "chat_catchup", "chat_tasks", "compare", "route_hint", "lead_score", "assistant_plan", "assistant_draft", "assistant_promise", "assistant_summary", "coworker", "doc_write", "doc_shorten", "doc_translate", "meeting_summary", "meeting_actions", "meeting_transcript"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  assistant: "Ask",
  client_update: "Client update",
  mcp: "MCP",
  daily_summary: "Morning summary",
  teammate: "AI teammate",
  client_report: "Client report",
  chat_answer: "Chat @AI",
  chat_catchup: "Chat catch-up",
  chat_tasks: "Chat task ideas",
  compare: "Model comparison",
  route_hint: "Router hint",
  lead_score: "Lead score",
  assistant_plan: "Morning plan",
  assistant_draft: "Draft reply",
  assistant_promise: "Promise check",
  assistant_summary: "Work summary",
  coworker: "AI co-worker",
  doc_write: "Docs: write",
  doc_shorten: "Docs: shorten",
  doc_translate: "Docs: translate",
  meeting_summary: "Meeting summary",
  meeting_actions: "Meeting action items",
  meeting_transcript: "Meeting notes from a transcript",
};

/** Where a promise was found (Stage 12.4), and what became of it. */
export const PROMISE_SOURCES = ["chat", "task", "creative"] as const;
export type PromiseSource = (typeof PROMISE_SOURCES)[number];
/** What a client's linked file is (Stage 13.0). */
export const CLIENT_LINK_KINDS = ["media_plan", "workbook", "calendar", "clarity", "doc", "slides", "artifact", "other"] as const;
export type ClientLinkKind = (typeof CLIENT_LINK_KINDS)[number];
export const CLIENT_LINK_KIND_LABELS: Record<ClientLinkKind, string> = { media_plan: "Media plan", workbook: "Workbook", calendar: "Calendar", clarity: "Clarity sheet", doc: "Doc", slides: "Slides", artifact: "Artifact", other: "Other" };
export const GOOGLE_TYPES = ["sheet", "doc", "slides", "file"] as const;
export type GoogleType = (typeof GOOGLE_TYPES)[number];

/** A co-worker suggestion's life (Stage 12.5): partly = approved but some changes failed. */
export const COWORKER_STATUSES = ["open", "approved", "partly", "dismissed", "snoozed"] as const;
export type CoworkerStatus = (typeof COWORKER_STATUSES)[number];
export const PROMISE_STATUSES = ["open", "reminder", "task", "kept", "dismissed"] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];
/** How a question ended: answered, declined by the model's safety checks, out of tool rounds, or an error. */
export const AI_OUTCOMES = ["answered", "refused", "step_limit", "failed"] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

/** Sales pipeline (Stage 10a, D88), the same stages as the old CRM. */
export const LEAD_STAGES = ["new", "contacted", "audit_booked", "proposal", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = { new: "New", contacted: "Contacted", audit_booked: "Audit call booked", proposal: "Proposal sent", won: "Won", lost: "Lost" };
export const OPEN_LEAD_STAGES = ["new", "contacted", "audit_booked", "proposal"] as const satisfies readonly LeadStage[];
export const LEAD_SCORES = ["hot", "warm", "cold"] as const;
export type LeadScore = (typeof LEAD_SCORES)[number];
export const LEAD_LOST_REASONS = ["No budget", "Not the decision maker", "Chose another agency", "Not interested now", "No response", "Wrong number / spam", "Student or job seeker", "Other"] as const;
export const LEAD_ACTIVITY_TYPES = ["stage", "note", "followup", "assign", "edit", "created", "other"] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

/** HR slice 3: would we take this intern on again. */
export const HIRE_AGAIN = ["yes", "maybe", "no"] as const;
export type HireAgain = (typeof HIRE_AGAIN)[number];
export const HIRE_AGAIN_LABELS: Record<HireAgain, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

/** Letters HR issues from a person's record. */
export const LETTER_KINDS = ["offer", "internship_certificate", "experience", "relieving"] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];
export const LETTER_KIND_LABELS: Record<LetterKind, string> = { offer: "Offer letter", internship_certificate: "Internship certificate", experience: "Experience letter", relieving: "Relieving letter" };

/** Skills and growth (plan/5). */
export const SKILL_GROUPS = ["craft", "client", "leadership"] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];
export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = { craft: "Craft", client: "Client", leadership: "Leadership" };
export const SKILL_LEVEL_LABELS: Record<number, string> = {
  0: "Not yet",
  1: "Learning — needs supervision",
  2: "Can do it with checking",
  3: "Works independently",
  4: "Handles difficult cases",
  5: "Sets how Oppllo does it",
};
export const GOAL_STATUSES = ["active", "done", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const LEARNING_KINDS = ["course", "sop", "practice", "shadowing", "stretch"] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];
export const LEARNING_KIND_LABELS: Record<LearningKind, string> = { course: "Course or video", sop: "SOP or recording", practice: "Practice task", shadowing: "Shadowing", stretch: "Stretch task" };
export const LEARNING_STATUSES = ["assigned", "started", "finished", "shown"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];
export const LEARNING_STATUS_LABELS: Record<LearningStatus, string> = { assigned: "Assigned", started: "Started", finished: "Finished", shown: "Shown in work" };

/** Idea Board templates (Stage 13.1). */
export const BOARD_TEMPLATES = ["blank", "mind_map", "campaign_plan", "content_month", "swot", "student_journey", "admission_funnel", "retro"] as const;
export type BoardTemplate = (typeof BOARD_TEMPLATES)[number];
export const BOARD_TEMPLATE_LABELS: Record<BoardTemplate, string> = {
  blank: "Blank",
  mind_map: "Mind map",
  campaign_plan: "Campaign plan",
  content_month: "Content month",
  swot: "SWOT",
  student_journey: "Student journey",
  admission_funnel: "Admission funnel",
  retro: "Retro",
};
export const BOARD_TEMPLATE_HINTS: Record<BoardTemplate, string> = {
  blank: "An empty canvas",
  mind_map: "A central topic and four branches",
  campaign_plan: "Goal, audience, offer, channels, budget, measure",
  content_month: "Four weeks of reels, posts and stories",
  swot: "Strengths, weaknesses, opportunities, threats",
  student_journey: "Awareness to joining, step by step",
  admission_funnel: "Leads to admitted, with drop-offs",
  retro: "Went well, didn't, try next, shout-outs",
};
/** A board's scene: Excalidraw's elements and a few lasting settings (D-13.1a). */
export type BoardScene = { elements: unknown[]; appState?: Record<string, unknown> };
export type BoardVoting = { round: number; perPerson: number; open: boolean; revealed: boolean };
export type BoardTimer = { endsAt: string; sound: boolean; startedById: string };
/** Reactions on stickies. */
export const BOARD_REACTIONS = ["👍", "❤️", "🔥", "💡", "😂", "🎯", "❓", "👀"] as const;

/** Swipe file items (Stage 13.2). */
export const SWIPE_KINDS = ["link", "youtube", "instagram", "facebook", "image", "video"] as const;
export type SwipeKind = (typeof SWIPE_KINDS)[number];
export const SWIPE_KIND_LABELS: Record<SwipeKind, string> = { link: "Link", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", image: "Screenshot", video: "Video" };
/** Live cards on a board (Stage 13.2). */
export const BOARD_CARD_KINDS = ["task", "creative", "results", "sheet", "doc", "knowledge", "ref"] as const;
export type BoardCardKind = (typeof BOARD_CARD_KINDS)[number];

/** Database tables inside pages (Stage 13.4). */
export const DOC_COLUMN_TYPES = ["text", "person", "date", "status", "select", "number", "checkbox", "link"] as const;
export type DocColumnType = (typeof DOC_COLUMN_TYPES)[number];
export type DocTableColumn = { id: string; name: string; type: DocColumnType; options?: string[] };
export type DocTableView = { kind: "table" | "board" | "calendar"; groupBy?: string; dateColumn?: string; sort?: { column: string; dir: "asc" | "desc" } | null; filter?: { column: string; value: string } | null };
/** Meetings (Stage 13.4). */
/** Company and team goals (Stage 14.3). Money targets are paise; percent targets are whole percent. */
export const GOAL_UNITS = ["money", "count", "percent"] as const;
export type GoalUnit = (typeof GOAL_UNITS)[number];
export const GOAL_PERIODS = ["year", "quarter", "month"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
/** Where a goal's number comes from: typed in by check-ins, or live from data Oppllo One already has (D-14.3a). */
export const GOAL_SOURCES = ["manual", "revenue", "won_leads", "new_leads", "client_leads", "client_admissions", "active_clients", "hires"] as const;
export type GoalSource = (typeof GOAL_SOURCES)[number];
export const GOAL_SOURCE_LABELS: Record<GoalSource, string> = {
  manual: "Typed in at each check-in",
  revenue: "Invoiced in the period (billing)",
  won_leads: "Sales leads won in the period",
  new_leads: "New sales leads in the period",
  client_leads: "Leads for clients in the period (results, all clients)",
  client_admissions: "Admissions for clients in the period (results, all clients)",
  active_clients: "Active clients now",
  hires: "People who joined in the period",
};
/** The unit each live source counts in. */
export const GOAL_SOURCE_UNITS: Record<Exclude<GoalSource, "manual">, GoalUnit> = { revenue: "money", won_leads: "count", new_leads: "count", client_leads: "count", client_admissions: "count", active_clients: "count", hires: "count" };

/** Template gallery (Stage 13.6): boards and Docs pages saved as templates, for everyone or for one person. */
export const GALLERY_KINDS = ["board", "page"] as const;
export type GalleryKind = (typeof GALLERY_KINDS)[number];
export const GALLERY_SCOPES = ["company", "mine"] as const;
export type GalleryScope = (typeof GALLERY_SCOPES)[number];
export const GALLERY_TAGS = ["sales", "content", "ads", "events", "hr", "finance", "client onboarding", "planning", "retro", "meetings"] as const;
/** Presets: a colour palette, a sticky style, or a layout (mind-map layout and section colours). */
export const PRESET_KINDS = ["palette", "sticky", "layout"] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];
export type PresetValue = { colours?: string[]; colour?: string; font?: "hand" | "clean"; mindLayout?: "right" | "left" | "both" | "down" | "radial"; sectionColours?: string[] };

export const MEETING_KINDS = ["client_call", "internal", "review"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const MEETING_KIND_LABELS: Record<MeetingKind, string> = { client_call: "Client call", internal: "Internal", review: "Review" };
export const MEETING_REPEATS = ["none", "weekly", "monthly"] as const;
export type MeetingRepeat = (typeof MEETING_REPEATS)[number];
