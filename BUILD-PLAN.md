# Oppllo One — build plan

How to resume: read `CLAUDE.md`, this file, then the `plan/` tab for the current stage. Find the first
unticked task, build it as one vertical slice, run `npm run check`, review the diff with a subagent
against CLAUDE.md and the plan tab, commit, tick it here. STOP points are marked **STOP**.

Status: **Stage 9 — AI assistant and Oppllo MCP** (Stages 8 and 9 done; next: Stage 10 or the open items in the Log).

---

## Decisions (owner delegated all of these on 14 Oct 2026 — "make your decisions, own it")

Owner may override any of these; when one changes, update here and in code together.

**Setup**
- D1 Code lives in `one/` of the oppllo-admissions repo (branch `claude/zealous-bell-hxgttc`) so the live CRM is
  untouched. Move to its own repo later with `git subtree split --prefix=one`.
- D2 Plan tabs saved in `plan/` unchanged. Precedence: 3–6 current, 1 vision (its tech stack and 5 roles are void).
- D3 Auth: Auth.js (next-auth v5), Google provider, JWT sessions (no auth tables). Sign-in allowed only for an
  email that matches an active Person record (any Google account, so interns can use Gmail). A dev-only
  "sign in as" provider exists when `AUTH_DEV_LOGIN=1` and NODE_ENV is not production.
- D4 Errors go through `lib/server/report-error.ts` (console now; Sentry when the owner creates an account).
- D5 Seed data is fictional (Kerala-realistic). Real data never enters git.
- D6 Look: the CRM's Oppllo purple brand and calm neutral style. Name: Oppllo One. UI in English.
- D7 Tests: pure rules in `tests/unit` (no I/O); services in `tests/integration` against a real Postgres
  test database (`DATABASE_URL_TEST`). No in-memory adapters (they would double the work and drift).
- D8 UUID v7 ids (time-ordered, index-friendly).

**CRM link**
- D9 Until Stage 8, clients are created by hand in Oppllo One with an optional CRM lead id. In Stage 8 a
  read-only `adapters/crm` (Firestore) plus a "won" webhook from the CRM creates client + engagement + project.
  Moving the CRM itself into Oppllo One is a separate, later decision.
- D10 CRM role mapping when users are linked: sales → bdo, marketing → strategist, admin → owner.

**Roles and permissions**
- D11 Ten roles: owner, strategist, performance_marketer, social_media, designer, video_editor, bdo, hr,
  accountant, intern. A person may hold several roles; permissions are the union. No separate admin.
- D12 Team heads are not a role: each department has one head (`departments.head_person_id`); each person
  has `reports_to`.
- D13 Strategists and performance marketers see all clients. Social media, designer, video editor see clients
  where they are on the client team or own a task, all tasks in those projects, files and content calendar —
  never fees, hours budgets or burn. Interns see only tasks they own, plus the client name and project name.
- D14 "Client contact details" = contact people, phones, emails, WhatsApp, billing address, GSTIN. Visible to
  owner, strategist, performance marketer, bdo, accountant.
- D15 Creatives see hours they logged and hours logged on their own tasks, never budgets.
- D16 No salary stored now (pay stays in Zoho Payroll). Revisit for the owner's cost-per-department view.
- D17 Directory (everyone): name, photo, roles, department, job title, work email, work phone. Private fields
  (personal phone, emergency contact, join date details) visible to the person, HR, owner.
- D18 Team leave calendar shows "On leave" to everyone; leave type only to the person, approver, HR, owner.

**Projects and retainers**
- D19 Services (editable in Settings): Meta ads for admissions, Google ads, Social media management,
  Video production, Landing page / website, Branding & creative. Each has default project stages and
  starter tasks; seeded, editable later.
- D20 Default project stages: Onboarding → Strategy → Production → Live → Reporting (per service, editable).
  Projects copy their stages at creation so later edits do not rewrite old projects.
- D21 Task status (universal): todo, in_progress, in_review, blocked, done. Board columns = status by default;
  within one project you can group by stage. Task stage is optional.
- D22 Retainer budget is in hours (burn) AND deliverable counts (tracked separately). Period = calendar month.
- D23 Mid-month start: first period's hours and fee prorated by calendar days remaining (inclusive).
- D24 Unused hours expire by default. Per-engagement option "rollover": unused hours move to the next month
  only, capped at one month's base budget; rolled hours never roll again. Overage never carries forward.
- D25 Over 100% warns, never blocks logging. Warnings at 80% and 100%, once per period, to the owner and the
  client's lead strategist.
- D26 All time on a client's tasks counts toward burn; entries default billable; strategist/owner can mark
  non-billable (shown separately). Internal work uses an internal "Oppllo" client with no engagement budget.
- D27 One-off engagements: a single hours budget for the whole job, no periods.
- D28 Renewal extends the same engagement; fee changes go into `engagement_fees` with an effective date.
  Fees stored excluding GST.
- D29 Each client has a lead strategist and a team list.
- D30 Overdue: notify the task owner on day 1, the client's lead strategist after 2 more days.
- D31 Task: one owner, optional reviewer, priority (low/normal/high/urgent), one level of subtasks, optional
  estimate (capacity uses 60 min when missing).
- D32 Working week Monday–Saturday, second Saturday off; office 9:30–18:30 IST. Stored as a setting.
- D33 Capacity: a task's estimate is spread evenly over working days from start date to due date; with no start
  date it spreads over the working days of the due date's week up to the due date. Open overdue tasks put their
  load on today. Person capacity per day = weekly hours / working days that week; leave and holidays remove days.
- D34 Time logging: one-tap 30m / 1h / 2h plus custom; past days allowed; own entries editable until the 5th
  of the next month, then locked (owner can still edit).
- D35 Recurring tasks: weekly on a weekday, monthly on day N; generated 14 days ahead by a daily job.
- D36 Settings page (owner): services, stages, starter tasks, leave types, holidays, working week.
- D37 Client page "ad numbers" shows "Not connected yet" until the Meta stage.
- D38 Client fields include GSTIN, billing address, several contacts. ClickUp import: CSV of clients and open
  tasks only (Stage 6), completed history left behind.

**HR and leave**
- D39 Leave types and default yearly quotas (HR must confirm against offer letters before go-live):
  Casual 12 · Sick 12 · Comp-off (granted, expires 60 days) · Unpaid (no quota, needs approval).
  Interns: Casual 6, Sick 6. Part-time: same days as full-time. Freelancers: no leave module.
- D40 Leave year Jan–Dec; full quota available on 1 Jan; joiners prorated by months remaining (join month
  counts if joined on or before the 15th), rounded to the nearest half day.
- D41 Unused leave lapses 31 Dec (carry-forward is Later). A leave crossing the year is charged to each
  year's balance by its own days.
- D42 Approver = `reports_to`; the owner can approve anyone; the owner's own leave auto-approves.
  HR sees all leave and manages types, quotas, holidays and comp-off grants, but does not approve.
- D43 Cancel: pending or approved-not-started → the person cancels, balance restored immediately.
  Approved and started → the person asks to cancel the remaining days; the approver approves.
  Approver or owner may revoke approved future leave with a written reason.
- D44 Half-days (first/second half) on single-day leave = 0.5 day.
- D45 Weekends, off-Saturdays and holidays inside a leave range are not counted.
- D46 No negative balance except unpaid. Pending requests reserve balance.
- D47 Sick leave may be applied up to 7 days back; others from today. HR/owner may record past leave for anyone.
- D48 Clash warning (same department, overlapping) shown to requester and approver; never blocks.
- D49 Holidays: one published list per year by HR; seed has Kerala 2026–27 holidays as dev data.
- D50 Person fields in slice 1: name, roles, department, reports to, employment type, job title, join date,
  capacity hours/week, work location, work + personal phone, emergency contact. No Aadhaar, bank, DOB,
  address yet. People can edit their own phones and emergency contact (logged as events).

**Scope**
- D51 HR slice 2 runs as Stage 6b (after Projects 1–2). HR slice 3, intern engine, Skills and growth: after Stage 9.
- D52 Notifications: in-app list from Stage 5 (approvals inbox); email (Resend) in Stage 8.
- D53 PWA (installable, My Day + approvals mobile-first) in Stage 6.
- D54 AI monthly limit default ₹2,000 (setting). Owner creates the API key.
- D55 Meta ad results, Drive folder per client, Zoho Books: Stage 10, after Stage 9.
- D56 Subagent review runs once per completed slice (a group of tasks that forms one usable piece), not
  per micro-task — same rigour, less repeated context loading.

---

## Stage 1 — Foundation
- [x] 1.1 Next.js + TypeScript strict skeleton in `one/` with the folder structure. Done: `npm run dev` serves a page.
- [x] 1.2 Tailwind + shadcn/ui base. Done: a shadcn Button renders.
- [x] 1.3 docker-compose Postgres 16 + `.env.example`. Done: `docker compose up -d` gives a DB on 5432.
- [x] 1.4 Scripts dev, build, test, lint, typecheck, check; Vitest configured. Done: `npm run check` passes.
- [x] 1.5 Boundary lint: drizzle/postgres/storage/API imports outside `adapters/`/`db/` fail; `adapters/` imports
  outside the container fail. Done: a deliberate violation fails `npm run lint` (tested).
- [x] 1.6 `lib/result.ts`, `lib/id.ts`, `lib/format.ts` (IST, paise, minutes) with unit tests. Commit.

## Stage 2 — Data model
- [x] 2.1 Drizzle schema: departments, people, person_roles, clients, client_contacts, client_members,
  services, service_stages, service_task_templates, engagements, engagement_fees, engagement_periods,
  projects, project_stages, tasks, time_entries, assets, asset_versions, deliverables, events.
  All with `deleted_at` where deletable. Done: `npm run db:generate` emits `0000_*.sql`.
- [x] 2.2 Migration runner script. Done: `npm run db:migrate` on an empty DB creates all tables.
- [x] 2.3 Seed: 8 clients, 10 people in real roles + 3 interns, services, engagements with periods and fee
  history, ~40 projects, ~600 tasks, ~6 months of time entries, assets, events. Done: `npm run db:seed`
  is repeatable (truncate + insert) and counts print.

## Stage 3 — Auth, roles, permissions, first slice
- [x] 3.1 Permission model: roles → capabilities table as data (`services/permissions.ts`) + unit tests.
- [x] 3.2 Repository interfaces + Postgres adapter for people and clients; `lib/server/container.ts`.
- [x] 3.3 Client service (list, get) with role-based redaction; integration tests: intern cannot read client
  contacts; designer cannot see fees; designer sees only their clients.
- [x] 3.4 Auth.js Google sign-in (JWT), Person lookup on sign-in, dev login, `getActor()` for server code,
  sign-in page, signed-out redirect. Done: dev login as each role works; unknown email is refused.
- [x] 3.5 Client list screen through all four layers with loading/empty/error states. Subagent review. Commit.
- [ ] 3.6 (Owner action) Throwaway deploy: Vercel + Neon, login screen only. Owner creates the accounts and
  Google OAuth client. Steps written: `docs/deploy-test.md`. Waiting on the owner.

## Stage 4 — Design system  **STOP for approval of the look**
- [x] 4.1 Tokens (colour, type scale, spacing, radius, shadow) light + dark; app shell (sidebar, header, mobile nav).
- [x] 4.2 State components: loading skeleton, empty, error, success toast; Badge, Table, Card, Stat.
- [x] 4.3 Client list restyled as the example screen; design rules written into CLAUDE.md. Living style guide at
  `/design` (owner only) shows every token, component and state, light and dark.
- **STOP** — owner reviews the look.

## Stage 5 — HR slice 1  (re-read plan/4-hr-module.md first)  **STOP after**
- [x] 5.1 Schema: leave_types, leave_quotas (by employment type), leave_requests, leave_grants (comp-off,
  adjustments), holidays, settings (working week). Migration.
- [x] 5.2 Pure rules: working days, leave day count (half-days, holidays, year split), proration, balance.
  Exhaustive unit tests (year boundary, cancellations, comp-off expiry, joiners).
- [x] 5.3 People: directory, profile (private fields by permission), HR create/edit, self-edit of phones.
- [x] 5.4 Leave apply (with balance shown first, clash warning), approve/reject, cancel, revoke.
- [x] 5.5 Approvals inbox (in-app) for approvers.
- [x] 5.6 Team leave calendar (month grid) + holiday list (HR publishes).
- [x] 5.7 Self-service page: my profile, balances, requests, holidays, upcoming team leave.
- [x] 5.8 HR settings: leave types, quotas, comp-off grants. Subagent review. Commit.
- [x] 5.9 Subagent review of slice 1; 6 must-fix + 5 should findings fixed (see log).
- **STOP** — team uses HR before Projects continues. → Owner said "continue" (14 Oct). The team trial needs a hosted
  app, so it happens after the hosting decision; it stays the first thing to do once deployed.

Decisions taken while building Stage 5 (owner may override):
- D57 The self-service page is `/me` ("My page") and is the home page until My Day exists (Stage 6).
- D58 Pending leave shows on the team calendar only to the person, their approver, HR and the owner.
- D59 Approving re-checks the balance (quotas may change after a request). HR and the owner may record leave for
  anyone with no backdating limit; it is approved at once only when recorded by the owner or already taken —
  HR recording future leave sends it to the approver (D42). HR can't grant leave to themselves; only the owner can.
- D63 Only the owner may edit or record the exit of people holding the Owner or HR role, change anyone's sign-in
  email, or make themselves someone's manager. HR edits its own record only through My details.
- D64 Leave can be booked up to the end of next year. Past holidays can't be removed.
- D65 When someone leaves: their leave after the last day is cancelled, and requests waiting on them go to the owner.
- D60 Viewing someone else's private fields writes `person.private_viewed` (DPDP audit). HR editing a profile counts.
- D61 Roles: nobody edits their own roles; only the owner grants or removes Owner and HR; one owner must remain.
- D62 Leave counts are whole half-days in the database (1 day = 2) — no decimals anywhere.

Decisions taken while building Stage 6 (owner may override):
- D66 Engagement terms (fee, hours, dates, deliverables) are set by `engagements.write` (owner, BDO — the BDO sells
  the hours). Seeing burn stays `budget.read`. A retainer's new fee starts on the 1st of a month, this month or later;
  one from this month re-prices the open month. A one-off has one total fee, corrected in place (history kept).
  Before an engagement starts, its first agreed fee is the one shown.
- D67 A retainer renews a year after its start unless another date is given. One-off jobs don't renew.
- D68 Periods open for the current month only: when a retainer is created or made active, and by the daily job.
  Months before Oppllo One are not backfilled. Changing hours, fee or dates updates the open month; closed months never
  change, so a retainer's start date is fixed once a month has closed.
- D69 A client's lead must be a strategist, performance marketer or owner; the lead joins the team and can't be taken
  off it while lead. Client names are unique (ignoring case). Clients are never deleted: mark them Churned.
- D70 One-off jobs burn against the whole budget (all time logged, ever); their deliverables count for the whole job.
- D71 Recurring tasks: a due date on a day off moves to the working day before; the task starts N working days
  earlier (default 1). Tasks are never made for past days. Changing a rule applies from today: open tasks nobody has
  touched (to do, no time, comments or subtasks) follow the change, or are replaced when the dates move; pausing or
  removing a rule removes them. A leaver's rule makes unassigned tasks. Rules are set by `projects.write`.
- D72 Time gaps: a day's expected time = weekly project hours over the week's working days, less holidays and leave
  (as in the Week view). A past day with nothing logged is a gap (red); under 75% is short (amber); today and later
  are never flagged. On the Friday screen a cell is the day's total for that task: lowering it removes your newest
  entries for that day (soft) and re-adds the rest. Only your own time; leads (`time.read.all`) can view anyone's week.
- D73 The working week (Settings, owner) applies to every date, past ones too: booked leave is recounted, so a change
  is refused if it would take anyone below zero this year or next. Effective-dated working weeks are Later. A new
  service starts with the D20 stages. Stage positions stay 0…n-1 and starter tasks follow their stage.
- D74 PWA without a service worker: installable from the browser, always online. Offline caching of private, live data
  isn't worth the stale-data risk now; revisit with push notifications (Stage 8).
- D76 Attendance: one record per person per day; office, home or client site all count as working. Late = checked
  in after 9:45 (15 minutes' grace on 9:30); short = under 7 hours between in and out (half with half-day leave).
  Flags only for full-time staff and interns, shown to the person first, never used to cut pay or leave. Freelancers
  don't check in. Location is optional, kept to ~100 m, seen only by the person, HR and the owner. Everyone sees
  the presence board (in/home/client site/on leave/not in yet), like the leave calendar (D18). HR and the owner record
  or correct days with a reason; HR can't correct their own (the owner can). After review (6b.4): the board shows
  check-in/out times only on your own row and to HR and the owner (times would show who was late); late and short
  apply only on working days, and a morning of leave means no "late"; a part-timer's day without a record is "not in",
  never counted as absent; freelancers have no month and HR can't record days for them or outside someone's time here.
- D77 Access register and checklists are kept by HR and the owner (`access.manage`); a person sees their own. No
  passwords are ever stored. Exit checklists list every open access first, then client teams to hand over, open tasks
  to reassign, then HR's template; they start by themselves when an exit is recorded. Templates: defaults in
  `services/rules/checklists.ts` until HR edits them; existing checklists keep their steps.
- D78 Files sit behind the storage interface (`repositories/storage.ts`: upload, getLink, delete, list, plus read for
  the app's own route). Until Drive or R2 is set up, the `postgres` adapter keeps HR documents in the database (3.5 MB
  each; PDF, JPEG, PNG, WebP, .docx, type read from the bytes). Links are HMAC-signed with `AUTH_SECRET`, work for
  five minutes and also need a signed-in person. Document locker: HR and the owner (`hr.documents`) upload, rename,
  set expiry and remove (soft; the file is kept, marked deleted); a person sees and opens their own. Every open is a
  `document.viewed` event, the person's own included. ID proofs are masked copies only (UIDAI masked Aadhaar): the
  uploader must confirm only the last four digits show. Expiry shows on the document (expired / within 30 days);
  reminders come with Stage 8 notifications. After review (6b.4): a link is signed for the person who opened it (a
  copied link fails for anyone else), with a key derived from `AUTH_SECRET` for links only; photos and downloads are
  served with a sandboxing Content-Security-Policy (PDFs aren't, because Chrome won't show a sandboxed PDF; its viewer
  already runs apart from the app).
- D79 Google Drive is a second storage adapter (`adapters/google-drive/storage.ts`, plain fetch and a service-account
  JWT, no googleapis package). It is switched on with `FILE_STORAGE=google_drive` once the owner has a service account
  and a shared-drive folder (`docs/google-drive.md`); until then PostgreSQL stays the store. A router sends new files
  to the active store and reads each file where it is, so switching needs no copy. Links still go through the app
  (sign-in, permission, audit), so nobody needs Drive access to open a file; removing trashes the Drive file. Each
  signed link names its store. No local-disk adapter: the PostgreSQL one already works in development and on Vercel
  (no disk). Google, Meta and Zoho API URLs are lint errors outside `adapters/`.
- D80 Creative approval: makers (assets.write, or the owner of the creative's task, so interns too) add a creative on
  a task with a file (JPEG, PNG, WebP, PDF, Word up to 3.5 MB) or a link (videos, big files, Canva, Figma) and send it
  for review; a strategist or the owner (assets.approve) sends it to the client or asks for changes. Clients don't
  sign in: the reviewer records the client's answer with a note (who, where). Oppllo's own work (internal client)
  is approved at the internal review. A note is required when asking for changes. A new version restarts review; the
  last approved version stays the approved one until a newer one is approved; every version is kept. Comments sit on
  a version; for video they can carry a moment (1:05). Who sees creatives: strategists, performance marketers and the
  owner all; designers, video editors and social media their clients' (plus their own tasks'); interns their own
  tasks'; the BDO, HR and the accountant none. Creative file links last an hour and aren't logged as views (unlike HR
  documents). My Day shows approvers how many wait for review.
- D81 Content calendar: one per client; anyone with assets.read who sees the client sees it, assets.write plans it.
  Items carry a day (and optional time, India), channel, status idea → in production → ready → scheduled →
  published, an optional creative, an owner, caption and live link. Only approved creatives can be scheduled or
  published; approving a creative makes its earlier-stage items ready. Removing is soft.
- D82 Notifications: `commit()` passes each change's events to `services/notify.ts`, whose rules write in-app
  notifications in the same transaction (never to the person who acted): leave asked (approver), leave decided
  (person), task given (new owner), creative sent for review (client's lead strategist), changes asked or approved
  (the creative's makers), calendar item ready (its owner). Bell with unread count in the shell; `/notifications`.
  The daily job emails each person one digest of what they haven't read (Resend when `RESEND_API_KEY` is set;
  logged otherwise). Automations set a dedupe key so repeating a run never notifies twice.
- D83 Automations (daily job, `services/automations.ts`; all notifications with dedupe keys): overdue tasks ping
  the owner from day 1 and the client's lead strategist from day 3 (D30); retainers at 80% and 100% of the month's
  hours notify the lead strategist and the owner; renewal within 30 days notifies the BDOs (the owner if none). The
  plan says "creates a task for the BDO": a notification for now, since a renewal has no project to hold a task;
  revisit with the CRM link (8.3). Approved leave tells the leads of clients whose tasks fall due during it.
  New retainer months already open in the same job (6.1); approved creatives already move calendar items (7.3).
- D84 The prospect CRM (crm.oppllo.com, Firebase `oppllo-crm`) is Oppllo's sales pipeline and the source of new
  clients. Oppllo One reads it only (no webhook, so the CRM app stays untouched): won leads land in a list and the
  BDO or owner sets each up (fee and hours aren't on a lead), as the owner chose. Moving the CRM onto Oppllo One's
  host and database is a later discussion.
- D85 AI engine (Stage 9): Claude through `adapters/ai/anthropic.ts` behind the `AiModel` port, so another provider
  is one adapter (12.3 added ChatGPT and Gemini and a router that picks the model per job: D-12.3a–e; `AI_MODEL` now only
  adds one more Claude model). Default model `claude-opus-5-5`, adaptive
  thinking with effort set per feature, strict tools, prompt caching, and Anthropic's server-side safety fallback
  (`fallbacks: "default"`). Every question goes through `services/ai.ts ask()`: refused before the call when the month's
  spending (IST calendar month, whole team) has reached the owner's limit (setting `ai_limit`, ₹2,000 default per D54,
  ₹0 = off) or the person has asked 40 today. The check and a reserved row (counted at the question's ceiling cost, ₹36
  at default settings, until the real cost is in) happen under one lock, so questions sent together can't all pass, and
  a question stops starting tool rounds once it reaches its ceiling. Each question logs one `ai_usage` row (tokens, cost in micro-dollars and paise at `AI_INR_PER_USD`, default 90). The
  question text is not stored. The owner sees spending and sets the limit in Settings → AI.
- D86 Assistant (Stage 9.2, **Ask** in the menu, everyone): Claude with 13 read-only tools, each a service call with the
  asker's own Actor (clients, client overview, projects, tasks, task details, my day, team week, time, who is off,
  directory, creatives, content calendar, owner dashboard). Tool results are compacted (rupees, hours, IST dates;
  links, storage locations and internal ids left out). The chat lives in the browser tab only; nothing about questions
  is stored except their cost. Answers are WhatsApp-ready plain text in the asker's language. Changes (creating tasks
  from notes, etc.) are left to the screens for now; write tools come with the MCP (9.3). Only the owner sees costs.
- D87 Oppllo MCP (Stage 9.3): Streamable HTTP at `/api/mcp` (stateless, JSON responses), OAuth 2.1 run by Oppllo One
  itself: discovery metadata under `/.well-known/`, dynamic client registration (https or localhost redirects only),
  an approval screen at `/oauth/authorize` (sign-in first; PKCE S256 required), one-hour access tokens and 30-day
  rotating refresh tokens, stored only as SHA-256 hashes. A connection acts as the approving person: tools are built
  from their Actor (the 13 assistant read tools plus create task, set status, comment, log time), so roles are checked
  by the same services as the screens; a person who leaves is cut off. Events: `mcp.connected`, `mcp.disconnected`
  and `mcp.tool_used` (app, tool, ok) per call. People disconnect on My page; the owner sees all in Settings → AI.
  MCP use spends nothing from the AI limit (it runs on each person's own Claude plan). No page may be framed.
  The approval screen shows where access goes and warns when that isn't Claude's address (names are self-chosen).
  Backlog: revoke a connection when an old refresh token is reused; tidy unused app registrations.
- D88 The CRM moves into Oppllo One in steps (owner chose option B, 15 Oct 2026). Leads get typed columns for what the
  screens use; every other source field is kept untouched in `leads.details`, so nothing is lost. CRM money (rupees)
  becomes paise. CRM roles map per D10 (sales → BDO, marketing → strategist, admin → owner): `leads.read` for owner,
  BDO, strategist and performance marketer; `leads.write` for BDO and owner.
- D89 Lead intake keeps the CRM's addresses and rules (`/api/lead/<key>`, `/api/meta-webhook`, `/api/google-lead`), so
  switch day only changes the domain. Landing-page keys are copied from the CRM's sources. A lead sent twice by Meta or
  Google is saved once (`external_id` meta_<id> / google_<id>, as the CRM's document ids). Secrets are env vars on the
  host, never in the database. Each new lead writes `lead.received`.
- D90 Conversions work like the CRM's: contact details are SHA-256 hashed before Meta sees them; Google gets a daily CSV
  of click ids behind a long key; each lead and stage is reported once, counting what the CRM already reported (copied
  in `details.conversions`), and Meta's event id stays `<crm id>_<stage>` for copied leads, so nothing counts twice.
- D91 Switch day is one owner switch (`sales_live`): before it, Sales is a read-only mirror and edits are refused. Sources
  are repointed first, then the last copy, then the switch. After it, the daily copy only inserts leads that still
  reach the CRM and never changes ours. Until the switch, leads deleted in the CRM are soft-deleted here; a Meta or
  Google lead received here directly is adopted by the CRM's copy (same external id). Editing follows the CRM: moving an
  unowned lead makes it yours; lost needs a reason; every change is locked, on the timeline and an event; stage changes
  report to the ads after the commit (a failure there never undoes it). Meta intake errors are reported and the last
  one shows on Lead sources. Public intake refuses bodies over 64 KB; thank-you redirects only go to the page's own site.
- D92 Ad results: an ad account is linked per client by anyone with ads.read (the people who run the ads). Numbers use
  Meta's date presets in the account's time zone and default attribution; leads are Meta's combined "lead" action
  (or its parts, never both); reach is per period, never summed; money stays in the account currency. Results are cached
  3 hours per client and period (a cache, so it may be deleted); when Meta fails, the last numbers show with their time.
- D93 One lead = one phone (last 10 digits) or one email (any case). Imports never create duplicates (against Oppllo One
  and within the file); adding by hand warns with the existing lead's name and needs "Add anyway". Imports need the
  switch (`sales_live`) like every other change, and record `lead.imported` per lead with the file and row.
- D94 The owner made ClickUp-level task features mandatory (15 Oct 2026), replacing plan/3's "adequate at tasks, not a
  better ClickUp". Stage 9b adds them before Stage 10, keeping the agency layer and speed on My Day and the Board first.
- D75 ClickUp import (owner): a ClickUp folder is a client and a list a project by default (changeable per import);
  unmatched clients are created with status Active; imported projects get simple stages (To plan, Doing, Wrapping up);
  a task's first assignee that matches a person becomes owner. Completed/closed tasks stay in the export file.

## Stage 6 — Projects slices 1 and 2  (re-read plan/3-projects-module.md)  **STOP after**
- [x] 6.1 Clients CRUD + contacts + team; engagements CRUD with fee history and periods. Screens: `/clients/new`,
  `/clients/[id]/edit` (details, billing, contacts, team), `/clients/[id]/engagements/new`, `/engagements/[id]`
  (burn, month by month, fee history + change, deliverables), `/engagements/[id]/edit`, `/clients/[id]/projects/new`.
  Daily job `/api/jobs/daily` (CRON_SECRET, `vercel.json`) closes ended months and opens/updates this month.
  One-off jobs now burn against their whole budget on the client page (was "no budget"). Browser-checked as BDO,
  strategist, accountant, designer. Tests: `engagements.test.ts`, `client-admin.test.ts`.
- [x] 6.2 Projects from an engagement: stages copied from the service, starter tasks owned by team members with the
  template role (service + tests). Screens for creating projects come with the client page (6.10).
- [x] 6.3 Tasks: create/edit/complete, subtasks, comments, priority; fast keyboard-friendly. (Task page `/tasks/[id]`.)
- [x] 6.4 My Day: due today + overdue, one-click done, one-tap 30m/1h/2h log, approvals. Under 300 ms server time on seed data.
  (Measured 150–300 ms in dev on ~1,400 seeded tasks. Home page `/`. Browser-checked: log, done, comment, subtask.)
- [x] 6.5 Board: by status, filters (client, project, person) in the URL, drag between/within columns (optimistic,
  fractional ranks), quick add. Browser-checked drag + reload. ~420 ms warm for a strategist (all clients).
  Perf follow-up if needed: replace per-card count subqueries with grouped joins. Group-by-stage view: later.
- [x] 6.6 Recurring tasks + daily generation job. Rules (`services/rules/recurrence.ts`, unit-tested) and service
  (`services/recurrences.ts`); project page `/projects/[id]` (stage + status, recurring tasks: add, edit, pause, remove);
  `/api/jobs/daily` fills every live rule two weeks ahead. Migration 0003: the one-task-per-date index ignores deleted
  tasks. Browser-checked; tests in `recurrences.test.ts`.
- [x] 6.7 Time entries: Friday fill screen with gaps; edit lock after the 5th. `/time` (my week: tasks × days, type
  hours, saves on Tab/Enter as the day's total for that task; gaps marked; locked months read-only) and `/time/team`
  (leads: everyone's week, most gaps first, click through to a person's week). `services/time.ts`, rule `dayFill`.
  Browser-checked; tests in `time.test.ts`.
- [x] 6.0 Schema 0002 (comments, recurring rules), capacity + time-lock rules with tests, repositories and
  adapters for tasks/time/projects, tasks service.
- [x] 6.8 Retainer burn rules (proration, rollover, warnings) + unit tests; client page burn bar.
  (Rules + tests from Stage 2: `services/rules/retainer.ts`. Burn bar with 80%/100% levels on the client page.
  The warning *notifications* are Stage 8.)
- [x] 6.9 Capacity rules + unit tests (`services/rules/capacity.ts`); Week view `/week` (people × days, assigned /
  capacity hours, red over, pale under, leave and holidays). Managers (tasks.read.all) see everyone; others see
  their own row. ~330 ms in dev.
- [x] 6.10 Client page: engagements (fee, burn per retainer with days left, non-billable, rollover, deliverables this
  month, renewal soon), projects with stage pipeline, latest creatives, ad results placeholder (D37), team, history.
  Each part shaped by role in the service (tested: owner / designer / intern).
- [x] 6.11 Deliverable counting; Settings page (services, stages, templates, working week). Tasks get a "Counts as"
  link to their engagement's deliverables (task page; recurring rules too). `/settings` (owner): services (add, rename,
  retire, order), stages (add, rename, move, remove — starter tasks follow their stage), starter tasks (add, edit,
  move, remove); `/settings/week`: working days and Saturdays off. Design system moved under Settings.
  Also fixed: editing a task now refuses a stage from another project. Tests: `catalog.test.ts`, `tasks.test.ts`.
- [x] 6.12 ClickUp CSV import (clients + open tasks); PWA manifest. `/settings/import` (owner): the CSV is read in the
  browser (`lib/csv.ts`, `lib/clickup.ts`), the server previews and suggests a mapping (client/project levels,
  statuses, people), then imports in one transaction (`services/import.ts`, planner `services/rules/import.ts`).
  Closed work stays behind; subtasks keep one level; owners join client teams; re-importing adds nothing
  (`tasks.external_id`, migration 0004). Server actions accept 4 MB (the screen checks first). PWA: `app/manifest.ts`,
  icons, Apple touch icon, theme colour; no service worker (D74). Browser-checked with a sample export.
- [x] 6.13 Subagent review of Stage 6 (three reviewers: permissions, business rules, screens); fix findings:
  - [x] Periods can be reopened after their dates moved off and back (partial unique index, migration 0006).
  - [x] Recurring tasks keyed on a fixed occurrence date, so moving a due date never clashes (`tasks.recurrence_date`).
  - [x] Fee changes and engagement edits lock the engagement; one live fee per start date (unique index).
  - [x] The end date can't cut into closed months; closing months records events; the daily job re-reads under lock.
  - [x] Interns see only their own recurring rules; project counts hidden from own-task roles.
  - [x] BDO sees projects (projects.read.all honoured); accountant gets no Projects card.
  - [x] Contact names hidden from history without contact access; creative work hidden from history for BDO/accountant.
  - [x] Friday screen keeps non-billable flags and notes (shrinks entries in place); locks against double saves; 16h.
  - [x] Import: duplicate refs de-duplicated; subtasks follow their parent's project; no "done" mapping; levels differ.
  - [x] Recurrence job re-reads the rule under lock; generatedUntil only moves when tasks are made.
  - [x] Malformed ids → not found (tasks, projects, time); D15: creatives see only their own hours on others' tasks.
  - [x] Screens: add-task controls only for those who can; client page at 390px; labels tied to inputs; My Day
    fetched once; undo restores the previous status; task form at 390px; time form keeps hours on error; Settings
    grid stacks; Settings errors visible; import levels in step; Board keyboard moves; completed project on Board;
    nits (tokens, copy, tap size). 273 tests; browser-checked as owner, strategist, designer, intern, BDO, accountant
    at 390/1024/1280px.
  Then STOP. → Owner said "continue" (14 Oct): Stage 6 report given; owner + two-person trial waits for hosting.
- **STOP** — owner + two people trial.

## Later additions discovered while building
- [ ] Playwright suite for the critical paths (sign-in, apply → approve leave, My Day done/log time). A scripted
  browser check of apply → approve passed in Stage 5; make it a repeatable `npm run test:e2e`.
- [ ] Email or WhatsApp nudge to the approver when leave is requested (Stage 8 notifications).
- [ ] Optional holidays (pick 2 of N) if HR wants them (not in D49).
- [ ] Document expiry reminders to HR and the person 30 days ahead (Stage 8 notifications; D78).
- [ ] Letter generation (offer letter, internship certificate, experience letter) from templates (plan/4 "Should").
- [ ] Move `stored_files` to Drive or R2 when Stage 7's adapter lands: copy each file, update the pointers.

## Stage 6b — HR slice 2  (re-read plan/4-hr-module.md)
- [x] 6b.1 Attendance: check-in/out with work-location tag (office, home, client site), optional rough location;
  today's presence board (in, home, client site, on leave, not in yet); late and short-day flags shown to the person
  first; HR/owner corrections with a reason; monthly summary per person (self; HR and owner for all).
  Check-in card on My Day (steps aside once the day is closed) and `/attendance` (Today, My month, Team); a forgotten
  check-out is closed by the person within a week, then by HR. Attendance in the phone tab bar. Seed: four weeks.
  Tests: `attendance.test.ts`, `tests/unit/attendance.test.ts`. Browser-checked at 390px and as HR.
- [x] 6b.2 Access register (who has which tool or client account) and joining/exit checklists. The exit checklist
  lists every open access, client team and open task to hand over. On the person page (HR/owner; the person sees their
  own): Access (add, mark removed) and checklists (tick, add, remove steps). Joining starts with the person; exit
  starts when HR clicks or when the exit is recorded. Ticking an access step revokes it (unticking restores it);
  revoking in the register ticks the step. HR edits the templates at `/people/checklists`. Migration 0007. Seed: 43
  grants and the newest joiner's checklist. Tests: `access.test.ts`, `tests/unit/checklists.test.ts`. Browser-checked.
- [x] 6b.3 Storage interface (upload, getLink, delete, list) with a PostgreSQL adapter for now (D78); document locker
  per person with signed expiring links and every view logged (DPDP). Migration 0008 (`stored_files`,
  `person_documents`). Locker on the person page and on My page; upload with a masked-ID confirmation and a size check
  in the browser. `/api/documents/<id>` logs the view and redirects to `/api/files/<id>?exp&name&sig`, which serves the
  bytes (`private, no-store`, `nosniff`, inline for PDFs and photos). Seed: 27 sample PDFs (offer letters, agreements,
  two masked IDs, one expired and one soon-to-expire internship agreement). Tests: `documents.test.ts`,
  `tests/unit/documents.test.ts`, `tests/unit/signed-links.test.ts`. Browser-checked as HR, an intern (390px) and the
  accountant (no access).
- [x] 6b.4 Subagent review of slice 2 (backend/security and screens); every finding fixed: board times private,
  checklist remove visible and confirmed on phones, links bound to the viewer, file reads verified in the service,
  row locks on grant/check-out/remove, leavers kept in the team month, late/short only on working days, part-timers
  not marked absent, My Day asks to check in only on working days, today's row fixable by HR, check-out confirmed,
  note before the check-in buttons, visible month hints, team month as cards on phones, people page loads documents
  and access alongside the profile. Tests: 303 passing. Browser-checked as an intern and HR at 390px.

## Stage 7 — Files and creative
- [x] 7.1 Google Drive adapter for the storage interface (D79), a storage router (new files to the active store, reads
  wherever a file is), `FILE_STORAGE` switch, owner guide `docs/google-drive.md`, lint rule for API URLs outside
  adapters. Tests: `tests/unit/drive-storage.test.ts` against a fake Drive (JWT checked with the public key, folder
  reuse, multipart upload, trash, query quoting). **Owner:** a live check needs the service account (guide step 4).
- [x] 7.2 Creatives: versions (file or link), a thread per version (comments, review steps with notes, video moments),
  approval flow (D80), `/creatives` queue with state filters, the creative page (preview, review panel, new version,
  earlier versions), creatives on the task page with "Add creative", client page links, My Day "waiting for your
  review", nav item. Migration 0009 (`asset_comments`, `assets_task_idx`). Seed: 457 creatives (stills as PNGs in
  the database, videos as Drive links) with threads that match their state. Tests: `assets.test.ts`,
  `tests/unit/assets.test.ts`. Browser-checked: intern adds on a phone, strategist reviews to approval, BDO sees none.
- [x] 7.3 Content calendar per client (D81): migration 0010 `content_items`; `services/content.ts` (month, upcoming,
  create, update, remove); `/clients/[id]/calendar` (month grid on desktop, day list on phones, inline editor);
  "Content coming up" on the client page. Approving a creative moves its idea/in-production items to ready in the
  same transaction; scheduled/published refused until the creative is approved. Seed: 128 items over 8 clients.
  Tests: `content.test.ts`. Browser-checked at 1280/390 as social media; BDO refused.

## Stage 8 — Dashboard and automations
- [x] 8.1 Event bus over the events table (D82): rules in `services/notify.ts` run inside `commit()`; migration 0011
  `notifications`; bell in the shell; `/notifications`; daily email digest via `adapters/email/resend.ts` (log mailer
  until a key is set). Tests: `notifications.test.ts`. **Owner:** a Resend account and `RESEND_API_KEY`, `MAIL_FROM`,
  `APP_URL` when you want email.
- [x] 8.2 Automations (D83): overdue escalation, 80/100% burn, renewal notice, leave cover; run by the daily job
  before the email digest. Tested; run on seed data (26 overdue, 10 escalated, 1 renewal).
- [x] 8.3 Prospect CRM link (D84): `adapters/crm/firestore.ts` reads `oppllo-crm` Firestore read-only (REST, a
  Cloud Datastore Viewer service account; no write is ever sent; the CRM app is not changed). The daily job and a
  "Check now" button copy won leads into `crm_won_leads` (migration 0012); **Clients → Won in the CRM** lists them
  for the BDO and the owner; "Set up as client" opens the new-client form filled from the lead (name, segment,
  CRM lead id, phone in notes); a lead leaves the list once a client carries its id, or when dismissed. The
  dashboard shows the live pipeline. Tests: `tests/unit/crm.test.ts`, notifications integration. **Owner:** one
  read-only key, `docs/crm-link.md` (about 10 minutes).
- [x] 8.4 Owner dashboard `/dashboard` (`dashboard.read`, owner only): counts, budgets running hot (hours used vs
  days gone), late projects, this week's load, away this week, renewals in 30 days; "Sales from the CRM" waits on
  8.3. Test: `dashboard.test.ts`. Browser-checked at 1280/390.

## Stage 9 — AI assistant and Oppllo MCP
- [x] 9.1 AI adapter (Claude first, switchable), monthly spending limit and usage view. Done: Settings → AI shows
  the month's spending against the limit; `ask()` refuses past it (tests with a fake model); docs/ai.md is the owner's setup.
- [x] 9.2 Assistant answers over services using the asker's own Actor (same permissions). Done: /ask; tests show a
  designer gets only their clients and no money, an intern only their tasks, HR no client work.
- [x] 9.3 Oppllo MCP server: OAuth sign-in, tools mapped to services, role checks, audit events. Done: end-to-end run
  (register → sign in → Allow → token → initialize, tools/list, tools/call) on the dev server; docs/mcp.md.

## Stage 10a — The CRM moves into Oppllo One (owner chose this on 15 Oct 2026, option B)
Goal: one login; sales works leads in Oppllo One; the AI and the MCP see leads. The old CRM is never changed or
deleted from here: it becomes a read-only backup only when the owner says so (STOP before that).
- [x] 10a.1 Leads and their history in PostgreSQL (`leads`, `lead_activities`), copied one way from the CRM's Firestore
  (repeatable: re-running updates, never duplicates). CRM users matched to people by email. Done in tests; runs daily
  (`crmLeadsCopy`) and reports CRM count vs ours. First live count check when the owner opens Sales (10a.2).
- [x] 10a.2 Sales screens: Leads list (search, filters), Pipeline board, lead page (stage, owner, follow-up, notes,
  lost reason, edit, timeline), Today (overdue, due today, unassigned, no next step), New lead. Read-only mirror until
  the switch (10a.6), so the two systems never disagree. Done: /sales (Today, Leads, Pipeline, lead page) read-only, with the
  owner's "Copy from the CRM now"; `leads.read` for owner, BDO, strategist, performance marketer; `leads.write` (BDO,
  owner) ready for the switch. Editing (stage, owner, notes, follow-ups, new lead) comes with switch day.
- [x] 10a.3 Sales dashboard (leads per day, by channel, campaign, landing page, owner; won/lost) + leads in the
  assistant and MCP tools (sales roles only). Done: /sales/dashboard (7/30/90 days, all time, same counting as the
  CRM); `list_leads`, `lead_details`, `sales_dashboard` tools, offered only with `leads.read`.
- [x] 10a.4 Lead intake in Oppllo One: landing-page forms, Meta lead ads webhook, Google lead form webhook (adapters).
  Done: /api/lead/<key>, /api/meta-webhook, /api/google-lead (same paths and rules as the CRM; tested with signatures,
  keys, spam and repeats); Sales → Lead sources (owner) lists the addresses; docs/lead-intake.md.
- [x] 10a.5 Conversions back to Meta (Conversions API) and Google Ads (offline import CSV), once per lead and stage.
  Done: `services/conversions.ts onStage` (runs from stage changes once editing is on, 10a.6), /api/google-conversions,
  the owner's settings form under Sales → Lead sources (first copied from the CRM).
- [~] 10a.6 Switch day (owner steps, guide): final copy, point landing pages / Meta / Google at Oppllo One, sales starts
  here, CRM read-only. The landing page's voice assistant stays on Netlify until it moves separately.
  Built: editing (stage + lost reason, owner, follow-up, notes, details, new lead) behind the owner's "Switch Sales to
  Oppllo One" (setting `sales_live`); docs/switch-day.md. Waiting on the owner to run switch day; making the CRM
  read-only afterwards is a STOP (it changes the CRM app) until the owner says so.

## Stage 9b — ClickUp parity (owner, 15 Oct 2026: "mandatory at least all features of ClickUp")
This replaces plan/3's "adequate at tasks" (D94). Built in this order, most daily value first:
- [x] 9b.1 List/table view of tasks (sortable columns, filters), saved views, task tags, bulk edit. `/tasks` (nav
  "Tasks"): search, status, owner, client, project, priority, due (overdue/today/7 days/none) and tag filters in the
  address; sort by task, client, status, priority (by weight), owner, due (empty last); up to 1,000 rows; cards on
  phones. Tags on tasks (team casing kept, 10 per task, GIN index; the tag list shows only tags on tasks you can see).
  Bulk status/owner/priority/due/add or remove tag on up to 200 tasks, loaded in one query; tasks you can't change are
  skipped and counted; one event each (reassign still notifies). Saved views per person (12, list settings only).
  Migration 0021. Same fixes on the leads list: ticks clear after a change and filters follow saved views. Reviewed;
  browser-checked at 390/1280 as owner and designer. Tests in `tasks.test.ts`.
- [x] 9b.2 Several assignees and watchers, @mentions, checklists inside tasks, file attachments on tasks. Owner plus up
  to 10 more assignees (they see, change and get the task on My Day, the list's owner filter and the Board's person
  filter; capacity stays on the owner); watchers (anyone who sees a task may watch; editors add others) hear every
  comment and status change. @mentions in comments: suggestions after "@", "@Full Name" or a unique first name; the
  mentioned get their own notification and start watching (so a mention shares the task). Checklist inside the task
  (paste lines to add many, tick at once, rename, move, remove; 100 steps). Files and links on tasks (bytes sniffed:
  PDF, photos, GIF, Word, Excel, PowerPoint, CSV, text saved as text; 3.5 MB, bigger via a Drive link; opened through
  `/api/task-files/[id]` with a 5-minute personal link; removed files stay stored). Migration 0022. `services/task-collab.ts`,
  rule `mentions.ts` (unit-tested). Browser-checked at 1280/390 as designer and intern. Tests in `task-collab.test.ts`.
- [x] 9b.3 Calendar and timeline (Gantt) views, task dependencies. One switch between List, Board, Calendar and
  Timeline. `/tasks/calendar`: month grid by due day (whole Monday-first weeks, 4 per day then "more"), a list of days
  on phones. `/tasks/timeline`: start-to-due bars by project for 2/4/8/12 weeks, today line, status colours, overdue
  ringed, sideways scroll inside its box. Both filter by person (incl. extra assignees), client, project, open/all;
  over 3,000 tasks the page says so. Dependencies ("waits on", same client, 20 per task, loops refused) on the task
  page with what it holds up; tasks you can't see are only counted. When the last blocker is done, the waiting task's
  owner and assignees get "Ready to start" (no blocker title). Migration 0023. Reviewed; browser-checked at 1280/390.
  Tests in `planning.test.ts`, rules in `tests/unit/planning.test.ts`.
- [x] 9b.4 Global search, custom fields, project and task templates. Search box in the sidebar ("/" or Ctrl/⌘+K) and
  a phone icon; `/search` finds tasks, clients, projects, leads (BDO/owner), creatives and people, each within the
  person's rights. Custom fields (text, number, date, dropdown, yes/no, link) for every client or one client, set by
  strategists/owner at Tasks → Fields and templates, filled on the task page by whoever can change the task. Templates:
  "Save as template" on a task or project (strategists/owner); new task from a template on the project page; new
  project from a template on the client's "Start a project" page (stages, tasks, checklists, subtasks, tags, field
  values; dates moved to the new start). A template is only seen by people who can see the client it came from.
  Migration 0024. Reviewed; browser-checked at 1280/390. Tests in `task-setup.test.ts`.
- [x] 9b.5 Automation builder, docs/wiki, request forms, start/stop timer. Timer: one per person, live in the sidebar
  and phone header, Start/Stop on the task, logs on stop (day it started; <1 min nothing; 12 h cap), discard.
  Requests: lead-built forms (7 question kinds, title question, "Needed by" → due), each request a task for the
  form's owner tagged Request; public link /r/<code> (no sign-in, bot field, 50/day under a row lock, 5/hour per
  sender hash). Docs: team and client pages, nesting, safe Markdown (linear parser, in-app links can't leave the
  site), every version kept, stale saves refused, restore, trigram search index, in global search. Automations:
  6 triggers, client/project/tag/form conditions, 9 actions, run inside the same commit, never chain, act as
  "automation", stop when the author leaves; leads keep to their clients. Migrations 0025–0029. Reviewed (10
  findings fixed); browser-checked at 1280/390.

## Stage 10 — Later (after Stage 9)
- [x] 10.1 Meta ad results on the client page (D92): link an ad account per client; spend, leads, cost per lead, click
  rate, campaigns and spend per day for four periods; cached 3 hours; `ad_results` tool in Ask and the MCP; docs/meta-ads.md.
- [x] 10.2 HR slice 3 (plan/4): intern engine at People → Interns (batch, mentor, planned end, focus; days left;
  what they produced from Projects: tasks done, on-time %, hours; end review by mentor or HR with hire-again and
  talent pool; past interns and the pool), training library (team docs marked training for a department or
  everyone, listed on the intern page), letters (offer, internship certificate, experience, relieving: templates
  HR edits with fill-ins, drafted from the record, editable, frozen on issue with a reference OPD/yyyy/nnn,
  printable page, the person sees theirs), one-to-ones on the profile (lead and HR write; the person reads; "last
  N days ago"; HR's six-week nudge list), payroll CSV on Team attendance (working days, present, paid/unpaid leave on
  working days, absent, loss-of-pay days, late). Migration 0030. Tests `talent.test.ts`, `letters.test.ts`.
- [x] 10.3 Skills and growth, stages 1–3 (plan/5): Growth in the menu. Skills matrix (HR keeps it and sets the level
  each position needs; team heads add their department's skills), levels 0–5 set by a coach (HR, the person's lead or
  team head, never yourself) with evidence to move up, history kept; up to three live goals (the person or a coach
  sets; only a coach marks done); learning with work time and cost (the person marks progress, a coach marks it
  shown in work); score 0–100 with its workings (delivery, skills, growth; the 360 part left out and re-weighted
  until stage 4), monthly snapshot by the daily job and the trend; team grid for heads; HR's view (needs support,
  ready for more, thin skills, learning given). Migration 0032. Tests `growth.test.ts` (unit and integration).
- [x] 10.4 Ops extras. Leads shared in turn: Sales → Lead sources switch; each form lead goes to the next active BDO
  (round robin under a lock, noted on the lead, BDO notified). Drive folder per client: made when a client is added,
  button for older ones, link on the client page (`GOOGLE_DRIVE_CLIENTS_FOLDER_ID`, docs/google-drive.md). Zoho Books:
  accountant/owner make a draft invoice from the client page; contact made once (or reused by name), double clicks
  refused under a per-client lock, list kept here (docs/zoho-books.md). Morning summary: Settings → AI switch; the
  daily job sends each owner a short AI write-up of the dashboard as a notification, within the AI limit. All off
  until their keys are added. Migration 0033. Tests `billing`, `daily-summary`, `zoho-books`, lead auto-assign.
- [x] 10b CRM upgrades (owner asked 15 Oct 2026 for "the best CRM"). Done A: tags (team casing kept, filter by tag),
  more filters (follow-up due, score, channel, district, type), bulk stage/owner/tag/follow-up on up to 200 leads,
  CSV export (BDO/owner, formula-safe, recorded). Done B: CSV import (auto-matched columns, check first, 2,000 rows,
  owner/stage/tag/source for all, notes, duplicates skipped) and the duplicate warning on new leads. Done C: WhatsApp
  templates (English + Malayalam defaults, BDO/owner edit, sends noted after switch day), Today's "waiting for a first
  call" (new over 2 h) and "going cold" (7 days untouched), saved views per person. Original plan: tags and categories, bulk actions, CSV import with
  column mapping and duplicate checks, CSV export, saved filters, duplicate warning on new leads, WhatsApp message
  templates, speed-to-lead and stale-lead flags.
Owner's brainstorm priorities (18 Oct 2026, planning doc): Must — Proposal generator, Smarter My Day. Should — Meeting
notes to tasks, Creative checker, Profit per client, Voice for staff. The rest are undecided.
Meta ad results on client page · Drive folder per new client · Zoho Books invoice from won deal · HR slice 3 and
intern engine · Skills and growth · client kit work for the CRM.

## Stage 11 — Results and AI layer (owner's order, from "Oppllo One — Status, AI Roadmap and Product Review")
What clients pay for is admissions, so the next stage shows results next to the work, then lets AI do routine work
under a person's eye. One slice at a time, each a full vertical slice (data, rules, service, screens, AI tools, tests).
- [x] 11.1 Results per client. Goal: every client's month in numbers, and which clients are slipping. In: monthly
  leads, ad spend, counselling calls booked, admissions and optional lead/admission targets, per engagement (or per
  client); leads and spend pre-filled from Meta (10.1) when linked; cost per lead and per admission, lead→admission
  rate, a health level (on track / at risk / off track) from results vs target and retainer burn; Results card on the
  client page, entry form, "Clients at risk" on the dashboard, `client_results` tool in Ask and the MCP. Out: Google
  Ads numbers, admissions pulled from the client's own systems, charts.
  Done: `client_results` (migration 0036), one row per client per month, tied to the client's retainer when there is
  exactly one (D-11.1a: not split per engagement until a client runs two lead-generating engagements). Blank ≠ 0.
  `results.read` (owner, strategist, performance marketer, accountant), `results.write` (not the accountant). Meta
  fills leads and spend only where empty, for this or last month, rupee accounts only; a number is "meta" only while
  it equals Meta's. Health (rule `services/rules/results.ts`, D-11.1b, owner may change): pace vs target for the
  share of the month gone, judged on last month in days 1–7; under 80% of pace at risk, under 50% off track; a target
  with no number at risk; retainer hours ≥100% at risk (only for people with budget.read); targets carry forward.
  /clients/[id]/results, Results card, dashboard "Clients at risk", `client_results` tool. Browser-checked at 390/1280.
- [x] 11.2 Client knowledge base. Goal: everything the team (and the AI) needs to work on a client in one place. In:
  brand kit (logos, colours, fonts as files), tone of voice, do's and don'ts, past campaigns and what worked, SOP links,
  all per client, editable by strategists, searchable by the assistant and MCP. Out: auto-extracting brand kits from
  websites, version comparison.
  Done: migration 0037 — `client_knowledge` (tone, do's, don'ts; one row per client; a save from a stale page is
  refused), `client_campaigns` (name, when, what worked, what to avoid), `client_files` (brand kit / SOP / other: files
  checked by their bytes like task files, up to 3.5 MB, or https links). The client's own Docs pages are listed, not
  copied. Everyone who sees the client reads it (designers, interns on its tasks, accountant); strategists and the
  owner keep it (`knowledge.write`, D-11.2a). Knowledge card on the client page, /clients/[id]/knowledge,
  /api/client-files/[id], `client_knowledge` tool (one client, or a search across the asker's clients; the assistant
  is told to follow tone and do's and don'ts). Not in global search yet. Browser-checked at 390/1024.
- [x] 11.3 AI teammates. Goal: hand routine tasks (captions, first drafts, report prep) to an AI agent. In: assign a
  task to an AI teammate with a fixed, limited set of rights; its output waits for a person's approval; every action
  and its rupee cost logged on the task and in AI usage. Out: AI changing money, people or client data on its own;
  agents starting work without a task.
  Done: migration 0038 `ai_drafts` (caption, creative brief, first script, report prep) on a task, pointing at its
  `ai_usage` row (feature "teammate": who asked, model, cost, outcome; inside the monthly limit and daily cap). The AI
  gets no tools, only the task and the client's 11.2 knowledge base read as the asker (rule `services/rules/ai-drafts.ts`);
  it can't change status, owners, dates or anything else. Whoever can change the task asks and decides: approve
  (edited) or reject, once; each step is in the task's Activity. Cost shows to the owner only. With no AI key the panel
  says so and what happens once it's added. Approved text stays on the task with a Copy button (D-11.3a: it is not
  posted or sent anywhere). Tests use a fake model.
- [x] 11.4 AI monthly client report. Goal: the month's report written for the owner, not by them. In: a draft from
  tasks done, time, creatives, ad results and 11.1 results; owner edits, then sends (email/WhatsApp link) and the sent
  copy is kept. Out: sending without a person's click, custom report designers.
  Done: migration 0039 `client_reports` (one per client per month, draft → final, version check). Starting a report
  snapshots the month from the data: 11.1 results with costs, Meta ads (rupee accounts, this or last month),
  deliverables, top-level tasks done, creatives approved, posts published; hours logged and retainer burn are kept as
  an internal note for Oppllo only (D-11.4a: never in the report or the AI's question). The AI (feature
  "client_report", same limit and log) writes only summary / went well / next month around those numbers (rule
  `services/rules/reports.ts`); with the AI off the boxes start empty. Strategists and the owner write
  (`reports.write`); results readers read. Final = frozen. /clients/[id]/report, printable /reports/<client>/<month>.
  Nothing is sent anywhere. "Creatives approved" counts approved creatives last changed that month (shortcut noted).
  Owner confirmed (18 Oct 2026): no hours in client reports, since nothing is sold by the hour at this stage; the
  approximate "creatives approved" count is fine; "Make final" uses the last saved text.
- [ ] 11.5 Speed-to-lead. Goal: every new lead hears from us within a minute. In: on a new lead, a WhatsApp template
  and an AI voice call in Malayalam (reusing the landing assistant's design: provider switching, short turns, handover
  to a BDO), outcome noted on the lead. Out: outbound campaigns to old leads, buying numbers or providers here.
- [x] 11.6 Client portal. Goal: clients see progress without asking. In: a client sign-in showing their results,
  creatives to approve or comment on, and a request form; only that client's data. Out: hours, fees, internal notes,
  comments between staff.
  Done (19 Oct 2026). Migration 0044: `portal_users` (one invited contact of one client; one live invite per email),
  `portal_link_tokens` (sha-256 hash only, single use; 30 minutes, or 7 days for an invite), `asset_comments.
  portal_user_id` (author is a staff person or a client contact, never both), "client_contact" as a consent subject.
  D-11.6a identity: a portal user is a client contact, never a person at Oppllo. Sign-in: the one-time link (pressed on
  its page, so email link-checkers can't use it) or Google with the invited email; no passwords, no auth tables (the
  JWT carries only portalUserId). Every request re-checks: invite not revoked, contact not removed and still the same
  email, client live and not an internal space. Owner and strategists invite (`portal.invite`) and revoke in one step.
  Without email sending the inviter is told and gets the link to pass on; in development links are also printed.
  D-11.6b separation: a portal session never yields an Actor, so no staff capability can apply; `requireActor` sends
  it to /portal and every API that needs an Actor refuses it; file links are signed for "portal:<id>". The proxy only
  sees that a session cookie exists (it can't read the encrypted token), so staff routes stream an immediate redirect
  with the app's static frame only, never data. All portal reads go through `services/portal.ts`, whose session has a
  fixed client; it never reads people, spaces, leads, money, hours or other clients.
  D-11.6c what clients see: Home (this month's results vs target, cost per lead, health from results only, delivered,
  coming up, creatives waiting), Creatives in client review with their own team's comments only (never staff
  comments), approve or ask for changes (note needed) recorded as their own decision (approvedById null, comment by
  the contact, event `asset.client_approved/changes` with byClient), Requests → a Request-tagged task for the lead
  strategist in the client's newest active project (refused politely when there is none), final Reports without
  Oppllo's internal note. Terms first: agreeing is a DPDP consent record (11.7). Every invite, sign-in, consent,
  decision, comment and request is an event; sign-ins show in the audit log. Owner guide: docs/client-portal.md.
  Tests: `tests/integration/portal.test.ts` (two clients, a private space and an internal space; invites, single-use
  links, consent, isolation, no staff comments/hours/fees, approval, request → task, revoke/removal/email change).
  Browser-checked at 390: invite (link shown when email is off), link → terms → home, staff URLs send the client back.
- [x] 11.7 Trust layer. Goal: nothing lost, everything traceable, consent on record. In: daily database backups with a
  restore check, an audit log screen over events (owner), DPDP consent records for leads and staff (what, when, how,
  withdrawn). Out: legal review itself, data-residency move (separate decision).
  Done (19 Oct 2026, every outside account deferred: the owner decides storage and alerts after talking to an expert).
  Audit log: Settings → Audit log (audit.read), every event newest first, 50 a page, filter by person, type, client,
  India day, plain words from lib/event-text. Consent: migration 0040 `consent_records` (lead or person; what, how,
  when; withdrawal when, how, by whom on the same row; never edited or deleted; events "consent.*"); leads: sales team
  reads, leads.write records/withdraws; staff: HR/owner keep, the person sees and may withdraw their own; a landing
  form's ticked consent box (consent, agree, privacy_consent… with optional consent_text) is saved with the lead in
  the same commit. Panel on lead and person pages. Backups: `BackupStore` port (put, list, get, deleteOlderThan) with
  a not-connected adapter (default; nothing runs) and a memory one for tests; the daily job exports every table in one
  read-only snapshot to gzip JSON (`services/rules/backups.ts`), reads it back and compares row counts, keeps 30 days,
  logs runs (migration 0041 `backup_runs`). Limits (D-11.7a): file bytes in stored_files are not in the backup (their
  details are); a Vercel run has time and memory limits (fine at today's few MB; move to a streaming export past a few
  hundred MB); restore is a developer job (migrations, then load the rows), no button. Error alerts: `ErrorReporter`
  port, lib/server/report-error.ts still the one place, server log by default, useErrorReporter() for Sentry later;
  the log is never skipped. Settings → Trust shows all of it. docs/backups.md for the owner's expert talk.
  Owner note (18 Oct 2026): AI voice calls may not be used; 11.5 may become WhatsApp only or wait behind Stage 12.

## Stage 12 — Team chat and AI co-workers (owner asked for it on 18 Oct 2026; 12.1–12.6 done)
Replace client and team WhatsApp groups with chat inside Oppllo One, then let AI help in it like a co-worker. Rules
for every slice: AI messages are labelled as AI; AI proposes and a person approves before anything reaches a client,
changes money, people or HR, or is deleted; every AI action is an event with its cost in AI usage, inside the monthly
limit; one switch turns all AI off. "Trained on Oppllo" means the AI reads our data each time (11.2 knowledge, tasks,
chat), not a model we train ourselves: no own GPU server or fine-tuning until a narrow job has thousands of examples.
- [x] 12.1 Chat. Goal: the team talks where the work is. In: channels per client (internal), per team, task chat (on
  top of today's task comments) and direct messages; mentions, unread counts, notifications, search; who sees what
  follows existing permissions. New messages by checking every few seconds first (shortcut; a live-message service
  such as Supabase Realtime, Pusher or Ably only if that feels slow). Out: AI, voice/video, clients in chat.
  Done (19 Oct 2026). Migration 0045: `chat_channels` (client, team or direct; one per client or space, made the first
  time someone opens it), `chat_members` (team and direct only; leaving keeps the row), `chat_reads` (last read per
  person), `chat_messages` (indexed by channel and time, by channel and change time for polling, trigram on the text
  for search; a removed message keeps its text, only marked removed). Events: `chat_channel` entity.
  Who sees a channel: a client or space channel exactly who sees that client today (`clientScope`, so a private space
  only its live members and the owner, never through clients.read.all; a 14.2 "view" member reads but can't post,
  "comment" and above post); team channels and direct messages only their members. Checked on every read, so leaving
  the company, an access end date or being taken out of a space removes the chat at once, unread counts and search
  included. Client chats are staff only and never reach the portal (D-11.6b: a portal session has no Actor).
  D-12.1a task chat: a task's chat is its comments, unchanged; no second copy in the client channel. Chat lists "your
  tasks with comments" linking to them, and a link to a task in any message shows as a chip.
  D-12.1b new messages: the open conversation asks `/api/chat/[id]?since=` every 4 seconds while the tab is visible
  (and at once when it becomes visible), for new, changed and removed messages, asking 5 seconds further back so none
  is missed. Shortcut: move to a live-message service behind a port if the team feels a delay or the checks cost too
  much. The menu's unread total refreshes on each page.
  D-12.1c messages: edit your own for 15 minutes (shows "edited"); remove your own any time ("Message removed"); 4,000
  characters; files through the storage interface with the task-file checks and the 3.5 MB limit (bigger by link);
  history 50 at a time. Every send, change and removal is an event for the owner's audit log (a change keeps the earlier
  wording), without the client id so client histories stay about the work. Links into Oppllo One (tasks, clients,
  projects, docs) become chips saying what they open, never the title, so nobody sees a title they couldn't open.
  D-12.1d notifications: an @mention notifies only people who can see the channel (otherwise nothing, and the message
  doesn't record them), and goes into the daily email digest like any notification. Direct messages tell the others
  once a day per chat; the unread count shows the rest. Team channels: the owner and strategists start them, choose
  the people, rename and archive them (the starter or the owner). Direct messages: up to 8 people; the same people
  reopen the same chat.
  Screens: Chat in the menu with the unread total (a dot on More on phones); the list (direct messages, clients and
  spaces, team channels, your tasks with comments, archived); a conversation (Enter sends, Shift+Enter a new line, @
  suggests people, two-step remove); a Chat button on each client and space page; messages in global search.
  Tests: `tests/integration/chat.test.ts` (two clients, two private spaces, a strategist with every client, an intern on
  one client, a view-only member, a portal user who isn't a person; mentions, unread, edit window, removal, paging,
  files, team channels, direct messages, events, losing access) and `tests/unit/chat.test.ts`. Checked at phone width.
- [x] 12.2 AI in chat. Goal: help without leaving the conversation. In: @AI questions answered with Ask's read tools,
  "catch me up" summaries of a channel or task chat, "make tasks from this" (shown as proposals to approve). Out: the AI
  writing anything without a person's click.
  Done (19 Oct 2026). Migration 0046: `chat_messages.ai_reply_to` (an AI answer points at its @AI question; unique, so
  one answer per question). Feature names in AI usage: chat_answer, chat_catchup, chat_tasks. Service
  `services/chat-ai.ts`, rules `services/rules/chat-ai.ts`.
  D-12.2a what @AI reads: the answer is posted for everyone in the chat, so it reads with the chat's shared view, not
  the asker's. Readers are everyone who can open the chat right now (12.1 rules). The AI may look up only clients
  every reader sees (each reader's own scope, intersected; a private space only when every reader is a member), with
  only the permissions every reader has (fees, hours budgets, ads, results… intersected), read-only and with no roles.
  Projects and tasks only when every reader sees a client's whole work; when one reader sees only their own tasks (an
  intern on the client), the AI gets no tools and answers from the conversation everyone there has read. Its tools are
  Ask's client tools pinned to those clients (a tool must name one; a project id is ignored) plus chat_clients;
  nothing personal (my day, leave, directory, leads, owner dashboard). Like Ask, it doesn't look up spaces yet.
  D-12.2b what the asker alone sees: Catch me up (a chat since they last read it, or a task's last 30 comments; "Nothing
  new" without an AI call) and Suggest tasks (from the latest 30 messages or one message's "Make tasks"). Proposals
  live only on the asker's screen: title, owner (only from the chat's readers), due date (only from today on) and the
  project (a client chat's newest active project first) can be changed, then Approve creates an ordinary task through
  the task service with all its checks (14.1/14.2), or Dismiss drops it. Nothing is stored for a proposal.
  D-12.2c safety: the AI never posts by itself (only after its asker sends @AI, once), never sends anything outside,
  never writes. Chat and comments reach it as data: one JSON line per message inside <chat>, "<" escaped so no message
  can close the block, and its rules sit in a fixed system prompt that says chat text is never an instruction. An AI
  answer shows an "AI" badge and "answer for <asker>", is authored by the asker, can be removed by them and never
  edited; sending it is a chat.message_sent event (ai: true). All calls go through ai.ask(): monthly limit, daily cap,
  usage log; cost shows to the owner only. With no key, the chat says the AI isn't on yet and what happens once it is.
  The owner's switch: Settings → AI → AI in chat (on unless turned off; a setting.changed event).
  Tests: `tests/integration/chat-ai.test.ts` with a fake model (a private space never reaches a wider chat; shared
  permissions only; no tools with an intern; one answer per question, asker only, an event, not editable; an "ignore
  your rules" message; catch-up private and logged; proposals created only on approval and through the task rules;
  no key and the owner's switch) and `tests/unit/chat-ai.test.ts`. Checked at phone width without an AI key (the
  not-on note, an AI answer's look); with a key, @AI, catch-up and proposals still need a first real try.
- [x] 12.3 AI router. Goal: the right model for each job, cheaper. Owner's decisions (19 Oct 2026) replace the first
  plan: Sarvam dropped (the owner didn't like its Malayalam); Claude, Gemini (paid API) and ChatGPT (OpenAI API) behind
  the `AiModel` port; a decision helper (TypeSafe Jev) for small questions; a Compare screen. Out: own GPU server.
  Done (19 Oct 2026). Migration 0047: `ai_usage.escalated_from`, `lead_ai_scores` (the helper's read of a lead, kept
  apart from the lead). Adapters `adapters/ai/openai.ts` (Chat Completions, tool rounds, strict tools) and
  `adapters/ai/gemini.ts` (generateContent), plain fetch, no new dependency; every model's price in
  `adapters/ai/prices.ts` (checked 19 Oct 2026; a price due to rise is entered at the higher figure). Keys only from
  env: OPENAI_API_KEY, GEMINI_API_KEY, TYPESAFE_API_KEY; a provider with no key isn't there. Rules
  `services/rules/ai-router.ts`; `services/ai.ts` runs them.
  D-12.3a tiers: each feature has a tier (Fast: catch-up, morning summary, router hint, lead score; Standard: AI
  teammate, client update, suggested tasks, comparison; Best: Ask, MCP, @AI answers, client reports), each tier a list
  cheapest-first (Fast GPT-5 nano → Claude Haiku 5.5 → Gemini 3.5 Flash-Lite; Standard GPT-5 mini → Gemini 3.8 Flash →
  Claude Sonnet 5.5; Best Claude Opus 5.5 → Gemini 4 Argon (Pro) → GPT-5.5). Escalation: the next model tries after an
  error or outage, a refusal, an empty answer, or a failed format check (`AiRequest.accept`, used by suggested tasks'
  JSON). Every attempt is its own usage row (provider, model, cost, outcome, escalated from) and counts against the one
  monthly limit and daily cap, checked before each attempt. Routing by rules costs nothing.
  D-12.3b Malayalam (Malayalam script in the question, or the word asking for it) goes to Gemini or ChatGPT only, in the
  owner's order (Gemini first by default), never Claude; with neither connected the job stops with "Malayalam needs
  Gemini or ChatGPT connected". General writing rules ("captions for a Malayalam-first client are Malayalam first")
  live in system prompts, so they don't turn every job into a Malayalam job; a client whose tone says Malayalam first
  does route that way.
  D-12.3c tools and personal data: tool jobs (Ask, @AI) only go to adapters that run tools; Gemini's tool rounds aren't
  built yet (shortcut comment in its adapter), so they skip it. Each provider has "may receive personal data", on by
  default (all three paid APIs don't train on it; free tiers are never used); off, every job with personal data (the
  default for every request) skips it.
  D-12.3d decision helper: a `DecisionModel` port (Choice, Score, Yes/No questions → value + probability), TypeSafe Jev
  (POST api.typesafe.ai/v1/systemone, jev-latest, early access, shortcut comment) and a fallback that asks Claude Haiku
  the same questions and checks its JSON. Used for exactly two things: (a) a difficulty hint for Ask and @AI questions
  (easy moves a tier down, hard a tier up; "Malayalam" adds to the script check; under 70% sure → the plain rules);
  whether a job needs tools comes from the feature, so it isn't asked; (b) a hint on new leads (hot/warm/cold, a 1–10
  fit, "looks like junk") read after the Leads list or a lead page is sent, as the person viewing, shown beside the
  team's own score and never changing the lead. The helper reads the institution, district, segment, need, timeline,
  seats, source, form answers and notes: never the person's name, phone or email (phones and emails in free text are
  blanked too). Its calls are logged ("Router hint", "Lead score") inside the limit. Each use can be switched off.
  D-12.3e the owner's controls (Settings → AI → "Which model does what"): providers with their personal-data switch,
  Malayalam order, each tier's order (arrows), per feature a model to try first or "only this one" (lock), the helper's
  two switches; every change a setting.changed event. Compare (Settings → AI → Compare): 2–3 models, up to 30 examples
  (the editable Malayalam starter set: a nursing-college ad caption, a WhatsApp follow-up to a parent, an English brief
  in Malayalam, a reel script; recent tasks; or pasted), answers side by side with cost, "Use first for …" per model.
  Tests: `tests/unit/ai-router.test.ts` (tier order, missing keys, tools, Malayalam, locks and order, personal data,
  tier shifts, what the helper reads, the OpenAI, Gemini and Jev adapters against a fake fetch, the Haiku JSON check)
  and `tests/integration/ai-router.test.ts` (fake models for every provider: escalation on each failure kind with its
  log, limits shared across providers, Malayalam, the owner's settings, comparison, hints and the fallback, lead hints
  that never change the lead). No real API calls. Checked at phone width with placeholder keys (no provider called):
  the settings section, a reorder, Compare's form, the lead hints. Not yet run against the real providers.
- [x] 12.4 Personal assistant per person. Goal: everyone has an assistant that knows their work. In: a morning plan
  from my tasks, deadlines, leave and mentions; draft replies; reminders of what I promised in chat; help with my
  reports. Sees only what that person may see. Out: acting for the person without their click.
  Done (20 Oct 2026). Migration 0048: `assistant_promises` (one per message or comment, the writer's own),
  `assistant_day_summaries` (the plan's AI line, one per person per day). Service `services/my-assistant.ts`, rules
  `services/rules/assistant.ts`. AI features (router tiers): assistant_plan (Fast), assistant_draft (Standard),
  assistant_promise (the decision helper), assistant_summary (Standard).
  D-12.4a morning plan: on top of My Day, built by rules and free (works with no AI key): Do first (due today by
  priority), Late (count and oldest), Waiting for you (creatives to review, leave to decide, unread mentions, unread
  chat, space access to confirm), Heads-up (a teammate on leave today or in the next two days who owns open work due
  within three days, only among tasks this person's own scope sees, so private spaces and other clients stay out), and
  promises due today or missed. It reuses My Day's lists (one read per request) and adds one query per list, all in
  parallel. With the AI on, one or two sentences stream in on their own (never holding up the page), written on the
  first open of the day and kept for the day. Someone who turns the plan off sees the old "waiting for you" banners.
  D-12.4b draft reply: a button in chat, task comments and the current creative version's thread writes into the
  person's own box; nothing is sent. The thread and the client's 11.2 tone, do's and don'ts go in as data; a thread in
  Malayalam takes the router's Malayalam path (never Claude). Runs as the person: a thread they can't see gets nothing.
  D-12.4c promises: after the person's own chat message, task comment or creative comment is saved (after the reply,
  never slowing it), a free word check (English, Manglish, Malayalam) and then the decision helper: "is this a promise
  by the writer" (yes at ≥ 70%) and its pick of when. The day is worked out in code in India time (a weekday is the next
  one; a non-working day or holiday moves to the next working day). It becomes a suggestion on My page: Remind me (a
  personal notification from the daily job on that day), Make it a task (through the task service, owner the writer),
  Done or Not a promise; missed and due-today ones show in the morning plan. Only the writer ever sees them: every read
  is by their own id. Settling one is an event that names the choice only, never the words; spotting one isn't an
  event (it is a private suggestion, like a notification).
  D-12.4d report help: "What did I do this week?" on My page lists the person's own done tasks and logged time by
  client (rules), with "Write it up" for a paragraph; Growth (own page only) drafts a monthly self-review from done
  tasks, time, skills and goals. Both are drafts to edit and copy; never saved or submitted.
  D-12.4e Ask "My work" (the default, a switch on Ask): a line telling the model to read the question as about the
  asker's own work, plus a `my_mentions` tool over the asker's own notifications. Same tools and permissions otherwise.
  Switches: each person turns parts off on My page (plan, drafts, promises, reports); the owner turns the AI parts off
  for everyone in Settings → AI (rule parts keep working). The owner sees the cost totals in AI usage, never what
  anyone asked or drafted. With no AI key the AI parts say so and the rest works.
  Tests: `tests/integration/my-assistant.test.ts` (plan by rules with no AI, heads-up within scope and a private-space
  title never in it, the summary written once a day, drafts with tone and the Malayalam rule sending nothing, promises
  as suggestions with the date in code, reminders and tasks only on a click and through the task rules, private to the
  writer, missed ones in the plan, the week's scope, switches), `tests/unit/my-assistant.test.ts`, and Ask's mode in
  `tests/integration/assistant.test.ts`. Checked at phone width without an AI key (the plan, My page, a reminder).
- [x] 12.5 AI co-worker. Goal: the AI studies the board itself and suggests the next step. In: a daily run that reads
  overdue, blocked and unassigned work and posts proposals in the right channel (reassign, move a date, create a
  task), each with Approve / Dismiss; a spending cap per agent. Out: changes without approval.
  Done (20 Oct 2026), with the owner's additions 1–7. Migration 0049: `coworker_suggestions` (a card: client or space,
  its chat, kind, the keys of what it's about, title, why, actions, wording, status, results, snooze),
  `coworker_digests`, `chat_messages.coworker_id`, events entity `coworker_suggestion`. Rules
  `services/rules/coworker.ts`, service `services/coworker.ts`, run by the daily job before the email digest.
  D-12.5a what it notices (rules, free, no AI key needed), each with its facts ("Why?") and exactly one action: late
  task → move its date (2 working days on); blocked 3+ days → ping its owner in the chat; no owner and due within a week
  → give it to the least-loaded teammate on that client; owner on leave while it's due → give it to a teammate who
  isn't away; someone above 130% this week (6.9) with a teammate on the same client below 70% → give one of their tasks
  there to that teammate; a creative waiting 5+ days on the client → ping the team to nudge; no activity for 10 days →
  flag to the owner; 11.1 results at risk or off track → flag to the owner (results only: hours budgets never go in a
  card, because everyone in the chat reads it; a client behind only on hours gets no card); nothing planned next week
  for a client that plans posts → create that many planning tasks (their usual weekly number, 1–7).
  D-12.5b approval: the cards are ordinary chat messages labelled AI co-worker in that client's or space's chat, so a
  private space's cards are seen by its members only. Approve runs each change as the approver through the ordinary
  services (task bulk changes and task creation with every 14.1/14.2 guard, chat send, notifications to the owner): a
  person who couldn't make the change gets "You can't change …" and the card stays open for someone who can. Change
  lets them pick another person, date, title or wording, never another task, project or kind of change. Approve all on
  a grouped card runs each change and reports each result (approved, partly approved, or still open). It never touches
  money, HR, access or the portal and never messages a client.
  D-12.5c not noisy, and learning: one card per kind per chat (three late tasks = one card), at most three a day per
  chat, the rest in one "Also worth a look" card; nothing still open or snoozed, or dismissed in the last 7 days, comes
  back. Of the last 10 answers for a kind and client, 8 or more dismissed → that kind goes quiet there, says so once in
  the chat, and the owner can turn it back on (Settings → AI shows each kind's approval rate). Simple counting.
  D-12.5d snooze: "Remind me Monday", "In 3 days" (to a working day), "After the client replies" (wakes on the next
  client comment in the portal for that client, or after a week); a woken card is posted again.
  D-12.5e the owner: Monday digest (one line per client: results health, hours burn, late count, last activity, the
  client's mood from their recent portal comments when the decision helper is there; 🟢🟡🔴), on the owner's My Day on
  Mondays and as a notification, owners only because of the hours. Setup nudges to the lead strategist (the owner when
  none): no lead target this month, empty knowledge base, no ad account, no active project, at most once a week per
  client. Flags to the owner show in "Waiting for you". Switches in Settings → AI: on/off for everyone, per client or
  space, per kind, the digest, the nudges, and the co-worker's own monthly cap for wording (₹300 default, inside the
  overall limit).
  D-12.5f AI: with a key, one call per chat per day (Fast tier, feature "coworker") rewords the cards; the rules decide
  what is suggested and the AI never adds an action or a fact. The co-worker's calls count in the monthly limit but not
  in anyone's 40-a-day questions. Without a key, or over its cap, cards use the rules' plain words.
  Tests: `tests/unit/coworker.test.ts` (each rule finds its problem and not look-alikes, cards per chat, learning,
  snoozes, the digest light) and `tests/integration/coworker.test.ts` (right chat and private-space privacy, approval
  only by someone allowed and through the task rules, Change, Approve all with one failure, Dismiss's 7 days, snooze
  wake-ups by date and client reply, learning, the Monday digest with hours for the owner only, weekly nudges, the
  calendar gap, switches and the cap, nothing changed without approval, no AI key, no hours in cards). Checked at
  phone width on the dev database: a real run (8 cards), Why?, Change and Approve, and the owner's settings.
  Later (owner's list, not built): 8 late-risk warning before a task is late; 9 renewal risk; 10 nudging the client for
  approvals; 11 a weekly workload balance; 12 meeting prep.
- [x] 12.6 Client chat. Goal: clients off WhatsApp too. In: a client channel inside the client portal (11.6), shared
  with that client only, separate from the internal client channel; AI may draft replies for staff to send. Out:
  a WhatsApp bridge (later, paid per message), voice/video, AI replying to clients by itself.
  Done (20 Oct 2026). Migration 0050: chat kind "shared" (one per client, "<client> – with client", made on first
  use, never for Oppllo's own spaces), `chat_messages.portal_user_id` (the author is a person or the client's portal
  user, exactly one), `chat_portal_reads` (what a portal user has read; when they were last emailed). Services
  `services/client-chat.ts` (the portal side, alerts) and `services/chat.ts` (the staff side); rules
  `services/rules/client-chat.ts`. Owner guide and move-over messages: docs/client-chat.md.
  D-12.6a @AI in the shared chat is staff-only: "@AI …" typed there is never posted (the client would read it); it
  goes to a private answer for the asker, with the asker's own Ask tools (it's theirs alone, like Ask), and a
  posted @AI question is refused rather than answered in the chat. Catch me up, Suggest tasks and Draft reply work as
  in 12.2/12.4 (drafts follow the client's tone; Malayalam goes to Gemini or ChatGPT).
  D-12.6b what the client sees: only their own shared chat (their portal session is re-checked on every request, so
  revoking them or removing the contact closes it at once); staff names on replies; links into Oppllo One only when
  the portal can open them (a creative waiting for them → Creatives, a final report → that report, one of their
  requests → Requests), every other one as "internal link" with no address; never the staff channel, other clients,
  spaces, hours, fees or AI costs. Cards on top: creatives waiting, the latest report, open requests.
  D-12.6c the "Send to the client?" check: before a staff message goes to the shared chat, a cheap check of the words
  (hours, fees, rupee amounts, budgets, invoices, another client's name the writer can see) asks first; "Send anyway"
  sends. A warning, never a block.
  D-12.6d who writes: the owner, the client's lead strategist and its members at comment level or above; everyone else
  who sees the client reads only. The client's live portal users write as themselves (15-minute edit, "Message
  removed").
  D-12.6e alerts: the client's team gets a notification when the client writes (once an hour per chat; bell, unread,
  daily email as 12.1). A client gets "You have a new message from Oppllo" by email at most once an hour, only while
  they haven't read it, only with email set up; the shared chat says "Client email alerts are off until email is set up"
  otherwise. No WhatsApp. Chat shows "Clients waiting for a reply" (oldest first, from their first message after the
  last staff one) and the co-worker (12.5) suggests a teammate answer after a working day, in the team's own channel.
  Every message from either side is an event without the client id (a client's have no actor, data names them).
  The portal terms now include messaging the team. The client page has "Chat with client" and a move-over checklist
  (invited, signed in, first message from the data; closing the WhatsApp group is a person's) with invite and
  WhatsApp-group messages in English and Malayalam to copy (the Malayalam to be read once by a native speaker).
  Tests: `tests/integration/client-chat.test.ts` (own chat only, never the staff channel, other clients or spaces;
  internal links hidden; who writes and reads; client messages, edits and removal; revoking and removing the contact;
  the waiting list; @AI never posted with a private answer; email once an hour, only unread, none without email;
  events) and `tests/unit/client-chat.test.ts` (links, the warning, the co-worker's waiting rule). Checked at phone
  width on the dev database: the warning, a real portal sign-in, the client's reply, the waiting list.

## Stage 13 — Idea Board and Notion-style docs (owner asked for it on 18 Oct 2026; 13.0–13.2 done)
Bring creative thinking (today in FigJam) next to the work, and grow Docs (9b.5) towards Notion. "Board" in the menu
stays the task Kanban; this is a separate Idea Board. Reuse open source, don't build editors: Excalidraw (MIT) for the
canvas, BlockNote or Tiptap for the block editor; check licences before choosing (tldraw needs a paid licence for
commercial use). Boards and pages live in our database behind the usual services and permissions. Same AI rules as
Stage 12 (labelled, proposals need approval, costs logged).
- [x] 13.0 Client sheets, Google files and artifacts (owner, 20 Oct 2026: the performance team works in Google Sheets
  per client full of formulas and automations; they need a place here, the AI must read them, and so must the owner's
  own Claude through the MCP; plus Claude artifact pages like the setup guides). Decision (option A): Google stays the
  editor; connect, don't rebuild; no spreadsheet engine of our own. In: a "Files & sheets" card and page per client
  and space (paste a link, pick a type: Media plan, Workbook, Calendar, Clarity sheet, Doc, Slides, Artifact, Other;
  type, title, tabs, last changed and by whom from Drive), same visibility as the client or space (view reads, edit
  adds and removes); reading through the Drive service account (Drive metadata, Sheets values, Docs text, plain
  fetch), with "Share this file with <service account>" when it can't; Google's editor in a frame where Google
  allows it, always "Open in Google"; values cached 15 minutes, listed tabs or named ranges only, big sheets in parts
  with a cap; a Media plan summary from named ranges with "can't find <name>" instead of wrong numbers; a
  `client_files` tool for Ask, @AI (shared view), the monthly report draft and the MCP, with a per-file "AI may read"
  switch; a once-a-day "Media plan updated by <name>" note in the client's team chat; Claude artifacts as links or as
  uploaded .html/.md pages shown in a sandboxed frame, readable by the AI under the same switch. Out: our own
  spreadsheet engine, Apps Script, editing Google files from here.
  Done 20 Oct 2026. Migration 0051 (`client_links`, `client_link_cache`). Google sits behind one adapter
  (`adapters/google-drive/files.ts`, plain fetch: Drive v3 metadata and export, Sheets v4 values); without keys links
  still open and the page says Google isn't connected. Setup: docs/google-drive.md (enable the Sheets API, share each
  file with the service account as Viewer).
  D-13.0a framing: Google sends no X-Frame-Options or frame-ancestors on a sheet's /edit page, so the frame is allowed,
  but it only shows the editor for someone signed in to Google with access in that browser (and whose browser lets the
  frame use Google's cookies); otherwise it's blank or asks to sign in. So "Open in Google" is always next to it and
  the page says why it may be blank. Frame URL: `/edit?rm=minimal`.
  D-13.0b reading: 15-minute cache per range ("Check with Google" reads now); only listed tabs (empty = all) or named
  ranges; 200 rows × 26 columns per part, at most 5,000 cells, docs and artifacts 20,000 characters per part. The
  media-plan summary comes only from named ranges set by the owner or a strategist ("Label = NamedRange"), and a
  missing one shows "can't find <name>". The AI tool `client_files` (Ask, @AI in the shared view, MCP) and the monthly
  report draft (as data in a `<sheets>` block) see only files whose "AI may read" switch is on (default on).
  D-13.0c change notice: the daily job posts "Media plan updated by <name>" in the client's staff channel, once a day
  per file at most, only when Drive's modified time moved.
  D-13.0d write-back: off by default, the owner or a strategist turns it on per sheet; fills only an "Oppllo data" tab
  (made if missing) with the monthly results from 11.1 (month, leads, spend, cost per lead, calls, admissions). Daily
  ad numbers would need Meta calls, which this slice doesn't touch. The service account must be Editor on that sheet.
  D-13.0e artifacts: a claude.ai link opens in a new tab; an upload (.html/.md, real
  UTF-8 text, up to 3.5 MB) shows .md through MarkdownView and .html in `<iframe sandbox="allow-scripts allow-popups"
  srcdoc>`: no same origin, so its scripts run but can't reach Oppllo One's page, cookies or session (checked in the
  browser). The AI reads its text (scripts and styles stripped) under the same switch.
  Not built: the optional co-worker pacing card (media plan vs results); later if the team asks.
  Tests: `tests/unit/client-links.test.ts` (links, ranges, caps, artifact checks) and
  `tests/integration/client-links.test.ts` with a fake Google (visibility of clients and private spaces, the
  not-shared message, cache, parts and tabs, summary, the AI tool and its switch, the daily notice and write-back,
  artifacts, no keys).
- [x] 13.1 Idea Board (owner, 20 Oct 2026: "build it on Excalidraw with the full world-class feature set"). Goal:
  brainstorm without leaving Oppllo One. In: A. a board library per client, project and space (sections, tags,
  favourites, recently opened, search by name and by the words on boards, thumbnail, maker, last change and who,
  archive and restore; cards on client, space and project pages); B. the canvas (stickies in colours and sizes, text,
  shapes, connectors that follow shapes, pen, images, frames, mind-map Tab, align/distribute/group/lock, snap to grid,
  the client's brand colours as a sticky palette); C. facilitation (timer with an end chime, voting rounds hidden until
  revealed, reactions, stamps, presenting frames as slides, a frames outline); D. comments on stickies with @mentions,
  version history (automatic and named) with restore, safe saving; E. a List view and phone use (view, zoom, vote,
  react, comment) and FigJam-like keys; F. PNG/SVG of a frame or the board, frames as PDF slides; G. templates
  (Campaign plan, Content month, SWOT, Student journey, Admission funnel, Retro, Blank); H. scale and permissions.
  Out (later): sticky → task, live cards, saved links, Sheets cards (13.2); AI (13.3); live cursors, private mode,
  follow, client sharing (13.5); template gallery and MCP tools (13.6); tables on the board.
  Done 20 Oct 2026. Migration 0052 (`boards`, `board_people`, `board_versions`, `board_votes`, `board_reactions`,
  `board_comments`, `board_files`; `client_knowledge.brand_colours`).
  D-13.1a engine: `@excalidraw/excalidraw` 0.18.1, MIT (checked in its package.json; it lists React 17–19, works with
  this app's React 19.3 and Next 16). It is a browser-only component loaded with next/dynamic (ssr off) on the board
  page alone, so no other page carries it; its CSS ships only in that chunk. Its fonts are served from
  `public/excalidraw/fonts` (480 KB; the 12 MB Chinese fallback font is left out), not a CDN. Boards are stored as
  Excalidraw's scene JSON (elements and a few lasting settings: background, grid, snap) in `boards.scene`, with
  everything else ours (sections, tags, votes, reactions, comments, versions, images), behind `BoardsRepository` and
  `services/boards.ts`; a move to tldraw is a scene conversion, not a rebuild. Restyled to Oppllo purple through
  Excalidraw's CSS variables (globals.css); its dark theme follows the system.
  D-13.1b levels (14.2 words): a space member gets the space level; others get their role's: the owner and
  strategists (clients.write + projects.write) manage, the board's maker manages it, people who make work
  (projects.write or assets.write, or the client's team) draw, and everyone else who sees the client comments.
  view = look and vote; comment = also react and comment; edit = draw, run votes, the timer and snapshots;
  manage = archive and restore. A board on a project also needs the project to be visible. Private spaces stay
  private (two-space tests). Boards are never in the client portal.
  D-13.1c saving: the browser saves 1.5 s after the drawing stops changing, gzipped to `/api/boards/[id]` (a 1 MB scene
  is ~45 KB on the wire; Vercel caps a request at 4.5 MB, the service caps a scene at 12 MB). Every save names the
  version it started from; a save from an older one is refused (409) with "someone else changed this board — reload",
  and an open board checks every 5 s and shows "<name> changed this board. Reload". Nothing is overwritten silently.
  Saving starts only after Excalidraw has loaded the scene (found in the browser check: a remount could otherwise save
  a half-loaded board). Versions: the state before a save is kept automatically every 15 minutes, always before a
  save that removes over half of a board of 10+ objects (a cleared canvas can be restored), and before any restore;
  named snapshots on request. Every save, vote, reaction, comment, snapshot and restore is an event.
  D-13.1d stickies are Excalidraw rectangles with their text inside, marked `customData.kind = "sticky"`; stamps are
  small labelled shapes grouped with the sticky (`customData.stamp`, `on`); template headings are marked "heading".
  `services/rules/boards.ts` reads a scene into items (sticky, labelled shape, loose text; frame, colour, stamp) for
  the List view, votes, reactions and comments, and into the search text. Votes, reactions and comments only accept
  items that are on the saved board.
  D-13.1e voting: the facilitator (edit level) starts a round with N votes per person (1–20; several on one sticky
  allowed), reveals it (closes it) or clears it. Until revealed, people see only their own votes and how many people
  voted; after, the results list with the top three highlighted on the board.
  D-13.1f images go through the storage interface (`board_files`, key = Excalidraw's file id): PNG, JPEG, WebP or GIF
  (no SVG: it can carry scripts), resized in the browser to 1,600 px and under 3.5 MB, loaded after the board opens,
  served with a sandbox CSP. Export is in the browser (PNG/SVG of the board or the selected frame; the PDF opens the
  print window with one frame per page, "Save as PDF").
  D-13.1g size: past 3,000 objects or 5 MB a board shows "getting very big" and editors get "Move to a new board"
  (the selection, with its text, arrows and frame contents, becomes a new board in the same section; a link stays).
  Measured: a board with 2,020 objects (1,000 stickies with text in 20 frames) opens in 0.51–0.85 s (4 runs,
  headless Chrome on the dev server on this Mac; navigation start to "board loaded"; a production build is faster).
  Keys: S sticky (ours), Tab connected child (ours), Enter writes on the selected sticky, and Excalidraw's own
  T text, R rectangle, D diamond, O ellipse, A arrow, L line, P pen, F frame, I image, E eraser, H hand, Ctrl+G group,
  Ctrl+Shift+L lock; align and distribute in its panel. Brand colours: a new "Brand colours" field in the client's
  knowledge base (11.2), offered next to the sticky colours.
  Phone: Excalidraw's mobile layout; view and comment levels open read-only; the List view (a bottom sheet) votes,
  reacts and comments; the sticky tools start folded.
  Tests: `tests/unit/boards.test.ts` (levels, items and search text, stamps and headings, vote tally, word wrap,
  every template makes a valid scene) and `tests/integration/boards.test.ts` (client levels, two private spaces and
  the owner, the version check, automatic and named versions, restore, the big-drop version, comments pinned to
  stickies with mentions only for people who can see the board, reactions, library search by title, tag and words
  with scope, archive and restore, favourites per person, voting rules, templates, images, the timer).
  Not done: dragging stickies between boards; global search (the top bar) doesn't include boards yet, the library
  search does.
- [x] 13.1b Board power tools (owner, 20 Oct 2026: "mind map is very important to me… sections and sub-sections…
  converting or creating list options and connectors… exactly like FigJam, and full screen"). Goal: FigJam-level
  structure on Idea Boards. In: mind maps several ways (a Mind map tool and template, "Make mind map" on any sticky or
  text; Tab child, Enter sibling, Shift+Tab up a level, Delete asks before removing a node with children; auto-layout
  that re-arranges as you type: right, left, both sides, top-down, radial, per map; collapse/expand with a count; branch
  colours and node styles (sticky, pill, plain text); drag to re-order or drop on a node to re-parent; parent–child
  connectors kept automatically; the tree kept in our own metadata, not guessed from positions); sections and
  subsections (named, coloured, nested, collapsible, moved with everything inside, an Outline with jump and rename,
  sections as slides); list ↔ board (paste a bullet or indented list, also from Google Docs → mind map or sticky grid;
  stickies or a mind map → a Markdown list to copy or a Docs page in the board's client or space; an outline editor
  beside the board that edits a mind map as an indented list, both ways); FigJam-like connectors (straight, elbow,
  curved; labels; arrowheads; attached to shape sides; quick-connect handles to make a connected sticky); full screen
  (board area, Esc exits; a focus mode where the browser can't) and full-screen presenting; every shortcut in the
  board's Keys panel. Must keep: voting, comments, versions, List view, live cards, sticky → task, search; mind-map
  nodes and sections show in List view, search and exports; a 300-node map re-lays out in under 300 ms. Out: AI on
  the board (13.3), live cursors (13.5).
  Done 20 Oct 2026. Migration 0054 (the Mind map template).
  D-13.1b-a mind maps: the tree is ours, on each node's Excalidraw element as `customData.mm` (map, parent, order,
  folded; the root also holds layout, node style and colour switch), in `services/rules/mind-map.ts` (pure, tested).
  Layout, folding, lists and the outline editor read the tree, never positions. A node is a rectangle with its text
  inside, so votes, reactions, comments, sticky → task, List view (as "mind map"), search and exports keep working.
  Connectors between parent and child are arrows we own (`customData.mmEdge`, bound to both nodes, rebuilt by each
  layout); a folded branch stays on the board invisible and locked (still in search and the List view) with a "+N"
  badge. Layouts: right, left, both sides (branches split to balance height), top-down, radial (rings sized to the
  leaves); every layout is tested for no overlaps. Keys: typing in a node, Enter = sibling, Tab = child, Shift+Tab =
  up a level (FigJam's flow); on a selected node Tab = child, Shift+Tab = up, Delete (asks when ideas hang under it),
  Ctrl/⌘+. folds; Enter on a selected node edits it, like any sticky. Dragging a node onto another re-parents it,
  elsewhere re-orders it among its siblings, dragging the main topic moves the map. Re-layout as you type runs
  150 ms after typing stops and isn't its own undo step. Measured: a 300-node map re-lays out in 3.8–7.9 ms (unit
  test on this Mac: tree read + layout + writing 899 elements, alone and under the full test run); small maps
  0.5–1.9 ms in the browser ("mind-map layout" in DevTools → Performance).
  D-13.1b-b sections: Excalidraw frames can't hold other frames, so sections are our own: a coloured rectangle
  (`customData.section`) grouped with its name (`customData.sectionLabel`), in `services/rules/sections.ts`. Nesting
  comes from geometry (a section inside another is its subsection); everything inside belongs to it, so moving a
  section moves its contents on release, and folding shrinks it to its name bar with the contents invisible and
  locked (a mind map inside stays hidden through its own re-layouts). The Outline panel lists frames and sections
  (subsections indented) with jump, rename and fold; presenting and the PDF use frames and sections as slides and
  pages; the List view shows "Section › Subsection" and filters by it. Frames still work as before.
  D-13.1b-c lists: pasting a list (Markdown, plain indents, numbers, checkboxes, Google Docs bullets ●○■ or its HTML
  with aria-level) asks "mind map, sticky grid (a column per top item) or text". "Copy as list" turns the selection
  into Markdown (a map from the selected node down; stickies grouped by their sections); "Make a Docs page" puts it
  in the board's client or space through the docs service (its checks apply; comment level on the board). The
  outline editor edits a map as an indented list: the map follows 400 ms after typing, the list follows the map while
  it isn't being typed in, and node ids are kept in reading order so votes and comments stay put.
  D-13.1b-d connectors: Excalidraw 0.18 already attaches arrows to shapes, labels them (double-click) and has
  arrowheads and an arrow-type picker; we add one-click Straight / Curved / Elbow and — → ← ↔ for a selected
  connector (elbow uses Excalidraw's elbow arrows with fixed side points; it re-routes when shapes move), and "+"
  handles around a selected sticky or shape: click for a connected one on that side, drag to drop it anywhere.
  D-13.1b-e full screen: the board area in the browser's full screen (Esc leaves); where that's refused (iPhone, or
  some browsers) a focus mode covers the app's menus instead, Esc or the button leaves it. Presenting stays full
  screen too. All shortcuts are in the board's Keys panel.
  Found and fixed in the browser check: an editor that mounted again (Fast Refresh, a re-render) started from the
  scene the page first loaded and could save it over newer work (the 13.1 big-drop version caught it); it now
  continues from the latest drawing. Opening a board no longer saves a version.
  Tests: `tests/unit/mind-map.test.ts` (child, sibling, Shift+Tab, re-parent refusing its own branch, fold, delete
  with children, every layout without overlaps on a small and a 60-node uneven tree, nodes/connectors/badge on the
  board, List view and search, the 300-node timing, Markdown/indents/numbers/Google Docs text and HTML, list
  detection, board → list → board and the outline editor keeping ids), `tests/unit/sections.test.ts` (nesting,
  contents, paths, fold and unfold, moving, rename, a map inside a folded section), `tests/unit/connectors.test.ts`,
  and the "Make a Docs page" permissions in `tests/integration/board-work.test.ts`. Browser-checked at 1280 and 390
  (headless Chrome): typing a map with Enter/Tab/Shift+Tab, drop to re-parent, fold with "+2", all five layouts,
  pill style, sections around a selection moved and folded, a Google Docs list pasted as a map, the outline editor
  both ways, a Docs page made, quick-connect, elbow connectors staying attached, focus mode, Keys.
  Not done: dragging a branch shows the branch following only on release (Excalidraw moves the node alone while
  dragging); sections move their contents on release too; folding a branch hides it rather than removing it.
- [x] 13.2 Board connected to the work. Goal: ideas become work. In: sticky → task in one click (owner, due date);
  live cards for tasks, creatives and 11.1 results that stay current; links to Docs pages and the 11.2 knowledge base.
  References on the board: paste any link → preview card (title, picture, description); YouTube plays in place;
  Instagram/Facebook through Meta's official embed (needs the Meta app's oEmbed access); screenshots and images by
  paste, drag or upload; own video upload (needs files on R2 or Drive first, past the 3.5 MB database limit). Each
  saved item gets notes and tags and lands in a searchable "swipe file" across clients. "Share to Oppllo" from the
  phone share menu (Android web share target; iPhone: paste the link, or a one-time Shortcut). Never download other
  people's Instagram videos: keep link, embed or screenshot for inspiration only. Out: two-way editing of tasks on
  the canvas, pulling posts automatically from accounts.
  Done 20 Oct 2026 (owner: "start 13.2"). Migration 0053 (`board_task_links`, `swipe_items`, `link_previews`,
  `share_inbox`).
  D-13.2a live cards are Excalidraw embeddables whose link is `https://cards.oppllo.invalid/<kind>/<id>` (a reserved
  name that never resolves, so a scene holds no deployment address). The canvas only accepts those links
  (validateEmbeddable) and draws each one as a frame of Oppllo One's own `/board-cards/<kind>/<id>` page
  (renderEmbeddable), which reads the thing fresh with the viewer's own rights through its owning service
  (`services/board-cards.ts`): task (status, owner, due), creative (approval state, version), this month's 11.1
  results, a 13.0 sheet with its summary, a Docs page, the 11.2 knowledge base, and a reference. Anything the viewer
  can't open is "No access", never its title; portal users are sent to the portal. Each card has refresh and Open
  (in the whole window). Only `/board-cards/*` may be framed, and only by Oppllo One itself (frame-ancestors 'self';
  every other page still refuses all framing). Chosen over images + an overlay: Excalidraw moves, zooms, groups and
  exports them like any element, and they are current whenever drawn.
  D-13.2b references: a pasted link (or "Add card → A link") is saved to the client's swipe file and drawn as a card.
  The preview is read by `adapters/web/public-web.ts`, the only code that fetches arbitrary addresses: https on 443,
  no user info, public host names only; every DNS answer must be public (private, loopback, CGNAT, link-local and
  cloud metadata 169.254.169.254, IPv6 loopback/ULA/link-local, IPv4-mapped and NAT64 forms included); the connection
  is pinned to the checked address (no DNS rebinding); redirects are followed by hand, re-checked, three at most;
  5 s and 512 KB; HTML or JSON only; no cookies. Previews are kept a day (`link_previews`). Preview pictures are shown
  from their own site with no referrer, never copied. YouTube plays from youtube-nocookie.com. Instagram/Facebook use
  Meta's official oEmbed when `META_OEMBED_TOKEN` (or `META_ACCESS_TOKEN`) has oEmbed Read, shown in a sandboxed frame
  without same origin; otherwise a card with "Open on Instagram". Other people's media is never downloaded.
  D-13.2c sticky → task: "Make it a task" on a selected sticky (title from it, a project of the board's client or
  space, owner, due date) goes through the task service's own create, so every 14.1/14.2 guard applies (who may add
  tasks, space levels, owners outside a private space); the sticky gets a small live task badge (status, owner, due)
  grouped with it, and the link is kept in `board_task_links` (one task per sticky). Events: task.created and
  board.sticky_to_task.
  D-13.2d swipe file (`/swipe`): every reference (link, YouTube, Instagram, Facebook, screenshot, video) with notes
  and tags, across the clients and spaces the person sees (private spaces stay private); filters: words, client,
  tag, type, who saved, dates; "Add to board" appends a card to that board's saved scene as a new version (an open
  editor of it gets the usual "reload" notice). Comment level saves and edits; whoever saved it or a manager removes
  it. Pictures on a board: "Save to swipe file". The team's own videos only with `FILE_STORAGE=google_drive`, and up to
  4 MB for now: requests through Oppllo One's server stop at 4.5 MB on Vercel, so bigger ones need a direct-to-Drive
  upload (later); otherwise "save a link to the video".
  D-13.2e share to Oppllo: the PWA manifest's share_target posts to `/api/share` (signed in only, same site, fields
  checked, link taken from shared text when needed, pictures only); it waits in the person's `share_inbox` until they
  pick the client or space and, optionally, a board on `/share`. iPhone: paste on `/share`, or a one-time Shortcut
  that opens `/share?url=…` (docs/share-to-oppllo.md, which also covers Meta oEmbed setup).
  Also: ChatGPT's OAuth callback hosts (chatgpt.com, chat.openai.com) are known apps on the MCP Allow screen.
  Tests: `tests/unit/references.test.ts` (addresses incl. IPv6 loopback and mapped forms, links, redirects to private
  hosts, too many redirects, rebinding pinned to the checked address, size and type limits, preview parsing, card
  links, oEmbed without a token), `tests/unit/share-route.test.ts` (sign-in, other sites, fields),
  `tests/unit/mcp-auth.test.ts`, and `tests/integration/board-work.test.ts` (sticky → task and its guards, live card
  visibility with "No access" and private spaces, swipe search scope and privacy, oEmbed with and without access,
  video refused without Drive, Add to board, the share inbox). Browser-checked at 1280 and 390 (headless Chrome).
  Not done: dragging a card's task status from the canvas (out: two-way editing); bigger video uploads (direct to
  Drive); global search doesn't include the swipe file yet.
- [ ] 13.3 AI on the board. Goal: faster, better brainstorms. In: "give ideas" in the client's tone and do's and
  don'ts; group and summarise stickies (themes, top votes); board → plan of tasks with dates and owners as proposals;
  an AI critic ("what's missing, what could fail"); Malayalam through the 12.3 router; "ideas like this for <client>"
  on a saved post or reel (reads caption and screenshot, not the video); AI-made boards from a prompt using the
  client's knowledge, checked by a person before saving as a template. Out: the AI creating tasks without approval.
- [x] 13.4 Docs upgrade. Goal: Notion-like writing. In: block editor with a "/" menu (headings, checklists, tables,
  toggles, callouts, images, embeds), database tables inside a page (status, owner, date; table, board and calendar
  views), page templates (client onboarding, meeting notes, SOP, campaign brief, monthly review), @mentions of people,
  tasks and clients, comments on a line, meeting notes → tasks (owner's "Should" priority), AI write/shorten/
  translate, Ask across all docs. Keep version history, stale-save refusal and search. Existing Markdown pages move
  over unchanged in meaning. Meetings library: one place for all meeting notes (table and calendar views; filter by
  client, type, date), meeting template (attendees, agenda, notes, decisions, action items), action items → tasks
  (AI suggests, a person approves), linked to the client and project, recurring meetings, AI summary and "what did we
  decide with <client>?". Recording or voice note → transcript → notes (Malayalam to test first) only with the
  client's consent, recorded in 11.7.
  Done 20 Oct 2026 (owner's order 13.4 → 13.6 → 14.3–14.5 → 13.3 → 13.5). Migration 0055 (`docs.table_text`,
  `doc_files`, `doc_tables`, `doc_table_rows`, `doc_comments`, `meetings`, `meeting_actions`; the search trigram
  index now covers title, text and table words). Tiptap 3.32 core and free extensions only (MIT; no Pro). Audit 8.
  D-13.4a pages stay Markdown ("Markdown+", a superset of the 9b.5 dialect): callouts `:::note|tip|warning`, toggles
  `:::toggle Title`, GFM tables, nested lists, `![alt](/api/doc-files/<id>)` pictures, `::embed[https://…]`,
  `::card[kind/id]` live cards, `::table[id]` database tables and mentions `@[Name](person:id)`, `@[](task:id)`,
  `@[](client:id)`. Tiptap is only the editing surface (`lib/doc-format.ts` converts both ways), so old pages need no
  conversion, versions stay readable and restorable, stale saves are still refused (autosave 1.5 s with a "someone
  saved first" banner), and search keeps working. "Edit as Markdown" stays. Task and client titles are never
  stored in the text: chips are drawn per viewer ("No access" otherwise).
  D-13.4b database tables live in their own tables (columns text, person, date, status, select, number, checkbox,
  link; up to 20 columns, 500 rows), with a saved table/board/calendar view, sort and filter. They follow the page's
  rights (client, private space, 14.2 levels: view reads, edit changes). Their words are copied into the page's
  search text, so Docs search and global search find rows (people by name). Pictures go through storage (3.5 MB,
  png/jpeg/webp/gif, served with a sandbox CSP). YouTube plays from youtube-nocookie.
  D-13.4c @mentions tell only people who can open the page (newly mentioned ones on each save); comments sit on the
  page or on quoted words, with @mentions under the same rule, resolve/reopen, view level reads only. Templates:
  client onboarding, meeting notes, SOP, campaign brief, monthly review, blank ("Start from" on a new page).
  D-13.4d meetings: a meeting is a page made from the Meeting template plus kind (client call, internal, review),
  date, time, attendees and repeat (`/meetings`: list or month calendar, filters by client or space, kind, date and
  attendee; a card on the client page; a panel on the meeting's page). Rules, not AI, read it
  (`services/rules/meetings.ts`): Decisions are the items under "Decisions"; action items are the checklist lines
  under "Action items", owner = first @person, due date from words (by Friday, 25 Oct, 30/10, tomorrow, in 3 days,
  next week, end of month; naale/നാളെ, mattannaal, velli/വെള്ളി…), counted from the meeting day in India time and moved
  to the next working day (work week and holidays). Approve makes the task through the task service (project,
  level and space guards; once per item, `meeting_actions`). A weekly or monthly meeting gets its next page the day
  after it was held (daily job, as the person who set it up; "Make the next meeting now" too) with the open items
  carried over. "What did we decide?" searches Decisions across the meetings the person can see.
  D-13.4e AI: write, shorten, translate (Malayalam by asking for it, so the router sends it to Gemini or ChatGPT) on
  a selection; meeting summary; suggested action items (lines to paste; Approve still makes tasks); notes from a
  transcript. Each has its own feature name (doc_write, doc_shorten, doc_translate, meeting_summary, meeting_actions,
  meeting_transcript) through ai.ask, so logs, prices and the monthly limit apply; without keys each says the AI
  isn't switched on yet. Notes from a transcript need a live consent record (subject person, purpose mentioning
  recording or transcript) for every attendee; the transcript isn't stored. Audio upload → speech-to-text waits
  for a speech model in the router (the router is text-only today): paste a transcript from the phone's dictation or
  a recorder app for now.
  D-13.4f Ask and the MCP gain search_docs, read_doc (with its tables), list_meetings, meeting_decisions and
  meeting_action_items, with the asker's own rights (private spaces are never named); they need no AI key.
  Tests: conversion round trip and old pages, versions and stale saves, table views/sort/filter and privacy,
  search and global search of rows, mention and chip privacy, pictures, templates, comments, due-date parsing
  (English, Malayalam, Manglish, working days), approval through the task guards, repeating meetings, decisions
  scope, tool permissions, AI refusing without keys and a fake model when on. Browser-checked at 1280 and 390.
  Not done: live cursors (13.5); speech-to-text from audio; a client's contacts as meeting attendees (team only).
- [ ] 13.5 Together and shared. Goal: remote sessions feel like one room; clients approve ideas in one place. In: live
  editing with cursors (Yjs plus a small sync service, since Vercel can't hold live connections: Liveblocks, Y-Sweet
  or Hocuspocus, chosen on price), sharing a board or page with a client through the 11.6 portal (view, comment,
  approve), export to PDF and image. Out: public links without sign-in.
- [x] 13.6 Template gallery and MCP. Goal: the best boards and pages become the company standard, like Figma's
  community gallery but for Oppllo. In: "Save as template" on any board or page (company-wide or mine), presets
  (colours, sticky styles, layouts), a gallery with thumbnails, tags (sales, content, HR) and "most used", an
  "approved" label kept by strategists or the owner; MCP tools (create board, add stickies, save template, list
  templates) so anyone can build boards from their own Claude, on their own plan, with the usual permission checks.
  Out: a public marketplace.
  Done 21 Oct 2026 (owner: "then start 13.6"). Migration 0056 (`gallery_templates`, `gallery_uses`, `presets`). No new
  packages; audit 8.
  D-13.6a one gallery (`/templates`, nav "Templates") with Boards, Pages and Presets tabs: search (name, description,
  preview, tags), tag chips, "Most used" (from `gallery_uses`) or "New"; approved company templates and the built-in
  13.1 board and 13.4 page templates (listed as approved) first, then the person's own, then company ones waiting
  for approval. "Mine" is seen only by its owner. Strategists and the owner approve or take back approval, and can
  remove company templates; owners remove their own (soft delete). A template opens to a preview (board picture or
  its stickies by frame; a page rendered, tables as their columns) and "Use template": name, client or space (and a
  project for boards), presets for boards. Built-in templates stay in code (not copied into the table).
  D-13.6b templates never carry another client's data (`services/rules/gallery.ts`, unit-tested): on save, live
  cards, task badges, references and pictures become dashed placeholder boxes of the same size (bound arrows stay
  attached), element links are dropped, the client's name becomes "{client}" (also when wrapped across lines; filled
  with the new client's name on use), dates become "[date]" and Indian phone numbers and emails "[contact]". Pages:
  person mentions become plain names, task chips "[task]", client chips "{client}", cards, embeds and pictures
  placeholders, table rows only when "Keep the rows" is ticked (person cells always emptied). Comments, votes,
  reactions and task links live outside the scene or page, so they are never copied. "Save as template" first shows
  the list of what will be taken out ("1 live card, 2 client names, 1 date"), then saves; the source stays as it is.
  Board templates get a picture drawn in the browser from the cleaned scene (no files). Saving needs edit on the
  board or page; a company template from a private space needs manage there (otherwise "Save it as yours").
  D-13.6c presets: a colour palette (maps the board's sticky colours in order), a sticky style (one colour and a
  handwritten or clean font), a layout (mind-map layout, re-laid out on use, and section colours). Mine for anyone;
  company presets by strategists and the owner. The client's 11.2 brand colours are always offered as a palette.
  Pickable on "Use template" and on the New board form (then made through the gallery).
  D-13.6d MCP (`services/mcp-boards.ts`, Oppllo MCP only, no AI key needed): list_boards, read_board (frames and
  sections with their stickies, mind maps as indented lists), create_board (blank or from a template), add_stickies
  (into a frame or section by name, which grows to fit, or to the right of the content), create_mind_map (indented
  outline or JSON tree, layout right/left/both/down/radial), add_section, list_templates, use_template,
  create_page_from_template, save_as_template (replies with what was taken out). Inputs are zod-checked; 300
  stickies or ideas per call. Every change goes through the boards or gallery service with the person's own level
  (view can't change anything; private spaces aren't even named) and is an event (board.stickies_added,
  board.mind_map_added, board.section_added, gallery_template.*). Server-side board changes use the same version
  check and History as the canvas (someone with the board open gets "reload" on their next save). Guide with things
  to ask Claude or ChatGPT: docs/mcp.md.
  Tests: cleaning words, boards and pages (unit); save and use for boards and pages, client data gone, presets and
  brand colours, company vs mine, approval, search and tags, private spaces (integration); MCP tools with levels,
  private spaces, caps and events. Browser-checked at 1280 and 390 (gallery, template page, Save as template on a
  board, a board built by the MCP tools).
  Not done: editing a saved template's content (save a new one instead); thumbnails for templates saved through the
  MCP (they show their text preview); presets applied to an existing board.

## Stage 14 — Spaces, access approvals and company goals (owner asked for it on 18 Oct 2026; plan only)
Today all non-client work sits under one internal "Oppllo" client, which everyone with clients.read.all sees, so
finance, HR and founder plans must not go into Oppllo One until 14.1 and 14.2 are done. **14.1–14.2 come before
Stage 12**, so chat channels and boards start with the right privacy.
- [x] 14.1 Spaces. Goal: every team works here, privately where needed. In: internal spaces (Founder office, Finance,
  HR, Sales, Oppllo Marketing, Operations; keep to 6–8) next to client spaces, each with members and a private switch;
  projects, tasks, board, docs, recurring tasks and automations work the same as for clients; seeing all clients never
  means seeing private spaces; today's "Oppllo" internal work moves into a space. Out: per-task privacy.
  Done (19 Oct 2026). D-14.1a: a space is an internal client (`is_internal`) with a new `is_private` flag (migration
  0042) and `client_members` as its members, so projects, tasks, board, list, calendar, timeline, docs, recurring
  tasks, templates and automations work unchanged. Today's "Oppllo (internal)" is already a non-private space; nothing
  moved and nothing became private. D-14.1b: the privacy rule lives in the database scopes: every client, task,
  project and creative scope except the owner's excludes private spaces the person isn't in (`notHiddenFrom` in
  adapters/postgres/sql.ts; scope "all" now carries the viewer). Leak paths closed where lists are built in memory or
  shortcut "all": docs, global search, request forms, templates and custom fields, Week, someone else's Time, intern
  pages (counts stay, titles go), automations (list, edit, and the runner never acts for an author outside the space),
  notifications and so the email digest. Covered by the same scopes: My Day, board, task pages, projects, creatives,
  calendar/timeline, Ask and MCP tools, AI teammates, results, knowledge, reports, comments. Owner-only screens
  (dashboard, audit, daily summary) show everything to the owner. Capabilities: `spaces.private.all` (owner),
  `spaces.manage` (owner: add, rename, private, archive = status churned), `spaces.members` (owner and HR: add/remove,
  each an event; HR manages members without opening private work). Suggested set: Founder office, Finance, HR
  (private), Sales, Oppllo Marketing, Operations, added by the owner's button. 14.2 adds level, expiry, granted/
  approved by and confirmed-at columns to `client_members` and a separate requests table; no reshaping.
  Review fix (main session): one guard, `spaceGuard` in services/spaces.ts (owner never outside), now runs before
  anyone is put on or told about a private space's work: notifications (dispatch), the daily job's overdue, "still
  overdue" (spaces' leads now included), burn and renewal notes; task owner/reviewer on create, edit and bulk;
  assignees and watchers; @mentions (no watcher made); recurring rules; tasks from templates; request-form owners;
  automation actions (assign, watch, notify, follow-up owner). Message: "Add them to the space first". Making a space
  private names anyone on its open work who isn't a member, instead of cutting them off. Spaces can't be changed from
  the client team/edit screens (a member could otherwise add people or set a lead). Nothing to migrate: no space is
  private until the owner makes one so, and that step now checks. Other `{ kind: "all" }` reads checked: talent
  (counts only; titles filtered), reports (client already checked visible), access (real clients only), assets and
  timers (lookups after the person's own access check).
  Tests: `tests/integration/spaces.test.ts` (two private spaces, a strategist who sees every client, HR, members).
- [x] 14.2 Access approvals. Goal: nobody gets access by accident, and everyone knows what they were given. In:
  levels per space in plain words (view / comment / edit / manage); a grant shows a preview before sending ("Anu will
  be able to …; will not be able to …"); two steps: the owner or HR asks (who, space, level, reason, until when) and
  the other one approves; nobody approves their own request; sensitive spaces (Founder, Finance, HR, anything with
  salaries) always need both; the member gets a clear message (what they can see and do, what they can't, who gave
  and approved it, until when) and confirms they understood before the space opens; "My access" page lists all of a
  person's access in plain words; access ends on its date, owner reviews every space's members every 90 days,
  leaving removes everything (D77 exit checklist); removing access is one step and instant; every request, approval,
  refusal and removal is an event, and the owner is told about sensitive grants. Google 2-step sign-in required for
  sensitive spaces (checked through Google Workspace). Builds on D61 (nobody changes their own roles). Out: approval
  chains longer than two people.
  Done (19 Oct 2026). Migration 0043: `space_access_requests` (who, space, level, reason, last day, Google 2-step
  answer, status pending → approved/refused → confirmed, or cancelled), `client_members.level/expires_on/request_id`,
  `clients.is_sensitive/access_reviewed_at`, and a `space.access_carried_over` event for every 14.1 member (kept at
  "edit"; those event ids are random UUIDs, not v7, as a migration can't call lib/id.ts).
  D-14.2a levels (`services/rules/access.ts`, enforced by `levelBlocks` in services/spaces.ts on every change inside a
  space: tasks, comments, time, files, checklists, people, dependencies, fields, templates, timers, AI drafts, docs,
  creatives, calendar, projects, recurring tasks, request forms, knowledge): view reads only; comment adds comments,
  mentions and watching; edit does the work as far as the role allows; manage also asks for others' access to that
  space and renames or archives it. Never approval, never private/sensitive (owner only). A member's level wins over
  their role inside the space; non-members keep their role's rights; client teams count as edit; the owner does all.
  D-14.2b approvals: the owner, HR or the space's managers ask; a different person of owner/HR approves or refuses
  (a refusal needs a note); sensitive spaces (every private one, plus any marked sensitive) need one owner and one HR;
  with no active HR person the owner decides alone, even their own request, and the request and event say so.
  Membership is made only when the member presses "I understand" after reading what they can and can't do, who asked
  and approved, why, and until when (in-app, so also the email digest). Only live memberships count anywhere:
  `liveMember` in adapters/postgres/sql.ts (not removed, not past the last day by the database's India date; the app
  clock is used everywhere else). The nightly job ends access on its day (member told), warns owner and HR 7 days
  before, cancels unconfirmed approvals past their day, and tells the owner when a space's 90-day review is due;
  the owner marks a space reviewed after removing whoever goes. Removal is one step by owner or HR (member told).
  Leaving (people.markLeft) ends every space membership and open request. Owners hear of every sensitive grant.
  Google 2-step sign-in can't be checked by Oppllo One: the asker answers yes / not sure (needed for sensitive
  spaces) and the approver sees it. Access events carry no clientId so the person still hears about their own access.
  Screens: Spaces → Access and approvals, My access (also from My page). Tests: `space-access.test.ts` (flow,
  self-approval, sensitive needs both, owner alone, closed until "I understand", guard with only confirmed and
  unexpired members across two private spaces, carry-over, removal, expiry with warning, leaving, review, levels),
  `tests/unit/access.test.ts`. Browser-checked at 390: HR asks, owner approves, member confirms, space opens.
- [x] 14.3 Company and team goals. Goal: the whole company on one screen. In: company goals (founder) → team goals →
  projects and tasks, with on track / at risk / off track like 11.1, a founder dashboard; goals in private spaces
  stay private. Out: performance reviews from goals.
  Done 21 Oct 2026 (owner: "go to next stage"). Migration 0057 (`goals`, `goal_checkins`, `goal_projects`). No new
  packages; audit 8.
  D-14.3a where a goal's number comes from: typed in at each check-in (manual), or live from data already in Oppllo
  One: revenue = invoices raised in the period (billing, clients only, not spaces); won_leads = Sales leads won in
  the period; new_leads = Sales leads created; client_leads and client_admissions = 11.1 results summed across clients
  for the months of the period (blank when nobody entered that number: blank isn't zero); active_clients = clients
  active now; hires = people whose join date is in the period. Anything else (hiring pipeline, NPS, cash in bank) is
  manual. Live goals take notes at check-ins, not numbers.
  D-14.3b periods follow India's financial year: year April–March, quarters Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar;
  months are calendar months. A goal is set with a period and any day in it.
  D-14.3c health is 11.1's rule (`services/rules/goals.ts`, thresholds shared from rules/results): x% of the period
  gone → x% of the target expected; below 80% of that pace at risk, below 50% off track; the first tenth of a period
  is too early to call off track. A level, not a total (percent goals, active clients), is judged against the whole
  target. No number yet = at risk ("post a check-in"); target 0 or not started = nothing to judge.
  D-14.3d who: the owner sets company goals; team goals go under one, owned by a space (its managers, strategists or
  the owner set them) or a person (strategists or the owner). Check-ins: the goal's owner, who set it, the owner, or
  anyone with edit in its space. Seeing: company and person-owned goals, everyone on the team (not freelancers);
  "leaders only" company goals and the team goals under them, the owner and strategists; a space's goals, whoever
  sees that space (private spaces: members and the owner). Money amounts (targets, numbers, check-ins) only with
  money.read; others see the percentage and health, and can't post money numbers. Events: goal.created, .changed,
  .archived, .checked_in (money amounts never in the event).
  D-14.3e screens: Goals (`/goals`, nav) is the founder dashboard: company goals with their team goals underneath,
  health chips, progress bars, numbers, last check-in and who; filters running now / year / quarter / month / all.
  A goal's page: the projects behind it (top-level tasks done of total), check-in history, Post a check-in, settings
  and archive (team goals first). The Dashboard has a "Company goals" card; a space's page lists its goals.
  D-14.3f nudges by rule: the morning plan (12.4) lists goals the person owns with no check-in for 14 days; the
  co-worker (12.5) posts "goal off track" for a space's goal in that space's own chat (private spaces' chats are
  members-only; company goals are never posted to a chat), at most once a month per goal.
  D-14.3g MCP: list_goals, goal_details, post_goal_checkin (money in rupees), with the person's rights.
  Tests: periods, health, blanks (unit); live revenue, admissions (blank vs entered) and hires, money hidden,
  private spaces, leaders only, who may set goals and check in, supporting projects, the 14-day reminder, space goals
  off track, the co-worker card, MCP tools (integration). Browser-checked at 1280 and 390.
  Not done: goal history charts; a goal's number from a client's own results (only all clients together).
- [x] 14.4 Team templates. In: ready spaces for finance (GST filing, invoice follow-up, payroll check, linked to
  Zoho rather than copying it), HR (hiring, onboarding, reviews), sales, marketing and founder (weekly review).
  Done 21 Oct 2026 (owner: "then start 14.4"). Migration 0058 (`space_kit_items`). No new packages; audit 8.
  D-14.4a six kits in code (`services/rules/space-kits.ts`): Finance (TDS by the 7th, GSTR-1 by the 11th, GSTR-3B by
  the 20th, invoice run as Zoho drafts that are never sent from here, weekly payment follow-ups, payroll check, expense
  review; Month-end close checklist; goal "Collections ≥ 95%", manual), HR (Hiring pipeline project with stages
  sourcing → screening → interview → offer → joined; monthly attendance review, policy updates, quarterly reviews;
  Onboarding checklist from the D77 joining list; goal "Hire N", live from People joins, target to set), Sales
  (weekly pipeline review, follow-up hygiene, monthly targets; goal "Won deals this month", live; Objection handling
  board), Oppllo Marketing (content calendar month, case-study pipeline; goal "Oppllo leads this month", live
  new_leads; Content month and Campaign plan boards), Founder office (weekly review with a Weekly review page from
  the meeting template, investor/partner update, quarterly goals review), Operations (tool renewals, vendor payments,
  SOP upkeep; Tools and renewals page). Each kit has one starter project, a board and a suggested member level.
  Nothing is given to a person: projects have no lead, tasks and recurring rules no owner, goals no owner; live
  goals with no number to aim for start with target 0 ("no target") until the owner sets it. "Quarterly" work is a
  one-off task (6.6 recurrences are weekly or monthly).
  D-14.4b applying makes every item as an ordinary record with its own event (project.created, task_recurrence.
  created, task.created, doc.created, goal.created, board.created, space_kit.applied) in one transaction, and
  remembers each item per space (`space_kit_items`), so applying again makes nothing already made (also if it was
  removed since: deleting is a choice, not something to undo). A preview lists what it will make and what is already
  there before anything happens. A space's goal is a team goal even before it's put under a company goal.
  D-14.4c who: the owner or HR apply kits (HR to spaces they may see: open ones and those they belong to); only the
  owner adds a space or changes privacy (14.2). Finance, HR and Founder office make the space private and sensitive,
  said in the preview; not when people outside the space have open work in it (the same rule as Spaces), and not
  when HR applies (the preview says to ask the owner). The owner can change a kit (leave items out, move recurring
  days, set goal targets; kept in settings, used from then on; spaces already set up keep what they have).
  D-14.4d where: Spaces (Add a space → Start with a kit; a Space kits list), each kit's page (`/spaces/kits/<kit>`:
  what it makes, where it's applied, Apply it with a preview, Change the kit), the template gallery's Space kits
  tab (approved, built in), and the MCP: list_space_kits, apply_space_kit (preview with confirm false, make with
  confirm true; owner or HR). docs/mcp.md updated.
  Tests: each kit's contents (unit); each kit makes valid unowned projects, recurring rules, tasks, pages, goals
  and boards with events, and nothing the second time; preview, privacy defaults and who may; the owner's changes;
  MCP tools (integration). Browser-checked at 1280 and 390.
  Not done: kits saved from an existing space (they're built in); applying a kit to a client.
- [x] 14.5 Oppllo as its own client, and links to Stages 12–13. In: Oppllo Marketing gets results, content calendar,
  creative approval and a monthly self-report like a client; each space gets a chat channel, Idea Board and an
  assistant that follows the space's privacy.
  Done 21 Oct 2026 (owner: "then start 14.5"). Migration 0059 (`clients.is_self`). No new packages; audit 8.
  D-14.5a reuse the internal-client path (a space is an internal client, D-14.1a) and add one flag: `is_self` marks
  the one space that is Oppllo's own marketing (a check keeps it internal; a unique index keeps it to one; marking
  another clears the first). Only the owner sets it (Edit space → "Oppllo's own marketing"), or the Oppllo Marketing
  kit does on apply when no space has it yet. Everything client-like already works on spaces (content calendar,
  creatives with internal review only, knowledge base, files, boards, docs, meetings, goals, chat); the flag adds
  results, Meta ad results and the monthly report on its page. Never billed: engagements and invoices refuse any
  space ("Spaces have no fees or retainers"), Billing and the portal card stay off space pages, and the portal
  already refuses internal clients, so no report or anything else of it can reach a portal.
  D-14.5b Oppllo's own results (11.1 columns, its own words): Sales leads = new Sales leads in the month, Demos =
  leads moved to "audit booked" in the month (lead activity), Colleges won = leads won in the month, all India time
  and read live; spend from a linked Meta ad account (the usual Meta prefill) or typed. A typed number always wins
  over the live one; targets are typed (or set by the kit) and carry forward; health is 11.1's rule. This month's
  leads by channel show under the card.
  D-14.5c the monthly self-report is the 11.4 flow on that space: "Oppllo – <month>", the same live numbers in its
  facts, words typed (or the AI's, once on), final = frozen and printable.
  D-14.5d the Oppllo Marketing kit now also marks the space as Oppllo's own (owner only, never taking over another
  self space), sets this month's results targets (40 Sales leads, 2 colleges won; the leads target can be changed in
  the kit) and puts next month's four content ideas on the calendar; all once (space_kit_items).
  D-14.5e every space page already had Chat (its staff channel), Knowledge base (with its Docs pages), Meetings,
  Goals, Files & sheets, Idea boards, Projects, Content coming up and Creatives, each following the space's privacy;
  the co-worker posts only in the space's own chat and the assistant uses the person's own scope. Added: the "Lately"
  feed now words Stage 13–14 events (pages, boards, meetings, goals, kits) instead of "made a change".
  D-14.5f tools: oppllo_results (Ask and the MCP, results.read); the client lookup behind client_files,
  client_knowledge and client_overview now finds spaces by name too (private ones only for members), so a space's
  files, knowledge and pages are reachable; boards, docs and meetings tools already covered spaces.
  Tests: live self results (manual wins, targets carry, by channel; other spaces unchanged), the self-report
  (Oppllo, live numbers, final frozen), portal and engagement refusals, the kit (marks, targets, calendar, once,
  no takeover), spaces through the tools and oppllo_results, event wording. Browser-checked at 1280 and 390.

---

## Log
- What's left (21 Oct 2026), all waiting on something outside the code:
  - 13.3 AI on the board: built when the AI keys are added (the router already refuses cleanly).
  - 13.5 Together and shared: live editing with cursors needs a small sync service (Liveblocks, Y-Sweet or Hocuspocus,
    chosen on price), since Vercel can't hold live connections; sharing through the portal comes with it.
  - 11.5 Speed-to-lead: WhatsApp only (no AI voice calls, owner note 18 Oct); needs the WhatsApp Business API.
  - 12.5 co-worker extras 8–12.
  - 10a.6 Switch day: the owner's steps in docs/switch-day.md (point landing pages, Meta and Google at Oppllo One).
  - Backups: the owner picks the storage (R2, Drive or S3) in Settings → Backups (docs/backups.md).
- 21 Oct 2026: 14.5 Oppllo as its own client built (see the slice). Migration 0059. 844 tests. Not pushed.
- 21 Oct 2026: 14.4 Team templates (space kits) built (see the slice). Migration 0058. 839 tests. Not pushed.
- 21 Oct 2026: 14.3 Company and team goals built (see the slice). Migration 0057. 828 tests. Not pushed.
- 21 Oct 2026: 13.6 Template gallery and MCP built (see the slice). Migration 0056. 818 tests. Not pushed.
- 20 Oct 2026: 13.4 Docs upgrade built (see the slice). Migration 0055. 805 tests. Not pushed.
- 20 Oct 2026: 13.1b Board power tools built (see the slice). Migration 0054. 770 tests. Not pushed.
- 20 Oct 2026: 13.2 Board connected to the work built (see the slice). Migration 0053. 743 tests. Not pushed.
- 20 Oct 2026: 13.1 Idea Board built (see the slice). Migration 0052. 719 tests. Not pushed.
- 20 Oct 2026: 13.0 Client sheets, Google files and artifacts built (see the slice). Migration 0051. 699 tests. Not
  pushed.
- 20 Oct 2026: 12.6 Client chat built (see the slice). Migration 0050. 689 tests. Not pushed.
- 20 Oct 2026: 12.5 AI co-worker built (see the slice; additions 1–7, 8–12 later). Migration 0049. 678 tests. Not pushed.
- 20 Oct 2026: 12.4 Personal assistant built (see the slice). Migration 0048. 659 tests. Not pushed.
- 19 Oct 2026: 12.3 AI router built (see the slice). Migration 0047. 648 tests. Not pushed.
- 19 Oct 2026: 12.2 AI in chat built (see the slice). Migration 0046. 627 tests. Not pushed.
- 19 Oct 2026: 12.1 Chat built (see the slice). Migration 0045. 615 tests. Not pushed.
- 19 Oct 2026: 11.6 Client portal built (see the slice). Migration 0044. 601 tests. Not pushed.
- 19 Oct 2026: 14.2 Access approvals built (see the slice): requests, two-step approval, "I understand", levels
  enforced inside spaces, expiry, review, leaving. Migration 0043. 595 tests. Not pushed.
- 19 Oct 2026: 14.1 Spaces built (see the slice): private spaces enforced in the database scopes, leak paths closed,
  Spaces screen. Migration 0042. 576 tests. Not pushed.
- 19 Oct 2026: 11.7 Trust layer built (see the slice): audit log, consent records, backups behind a port (not set up),
  error-alert port, Settings → Trust. No provider accounts, keys or SDKs. 569 tests. Not pushed.
- 18 Oct 2026: 11.4 uploaded (live). Stage 12 (team chat and AI co-workers) added as a plan; nothing built. Hosting
  and cost options discussed with the owner (Vercel Pro + Neon Launch suggested first); no hosting decision yet.
  Stage 13 (Idea Board and Notion-style docs) added as a plan, then widened with emoji, saved posts/videos/links,
  the meetings library and 13.6 template gallery + MCP; nothing built. Stage 14 (spaces for every team, two-step
  access approvals with a clear message to the member, company goals) added as a plan; 14.1–14.2 before Stage 12.
- 18 Oct 2026: 11.4 AI monthly client report built (see the slice). 553 tests. Not pushed: the owner decides when.
- 18 Oct 2026: 11.3 AI teammates built (see the slice). Brainstorm priorities noted under Stage 10. 544 tests. Not pushed.
- 18 Oct 2026: 11.2 Client knowledge base built (see the slice). 537 tests. Not pushed: the owner decides when.
- 18 Oct 2026: Stage 11 planned (11.1–11.7). 11.1 Results per client built (see the slice). Removed the old "Ad
  results — not connected" placeholder on the client page. 527 tests. Not pushed: the owner decides when.
- 17 Oct 2026: QA Sessions 5–8 fixes (S5-B1…B3, S6-B1…B3, S8-B1…B5), one commit each. Task Details refuse a save
  from a stale tab (updatedAt check). Task Activity also shows time, creatives and calendar posts. Win rate back to
  the spec: "—" until 5 closed leads. Migration 0035 adds person_documents.id_last4 (exactly 4 digits). The proxy
  answers 404 for impossible record ids; well-formed unknown ids still stream a not-found inside a 200. Long forms
  warn before leaving (UnsavedGuard). 511 tests.
- 17 Oct 2026: QA Sessions 2–4 fixes (S2-B1…B7, S3-B1…B3, S4-B1…B5), one commit each. Board mouse dragging moved
  from native drag-and-drop to pointer events with edge auto-scroll (needs a hand check with a mouse). Task history
  now stores before/after for every changed field, bulk edits and automations. Dashboard burn uses the shared
  retainer rule. Clients get an optional Drive folder link (existing drive_folder_url column). 505 tests.
- 17 Oct 2026: QA session S9 fixes, one commit per bug (S9-01 … S9-24, S1-01, S1-04, S1-05; follow-up sweeps for
  S9-01/02/06/09/15). Decisions: S9-03 warns and asks to confirm Done (doesn't block); S9-07 shows the win rate
  with "from N closed leads" under 5; S9-04 a done task frees today and later days but keeps past days, and Week's
  count reads "open this week". Task creates treat the same title from the same person in the same place within 10 s
  as one task. 501 tests.
- 16 Oct 2026: Test report fixes (medium and low), redone on the owner's Mac after the cloud session ran out of
  usage before pushing them. M2 dashboard tiles link to the filtered lists; M9 dashboard sales read the same leads as
  Sales (with "as of" the last CRM copy); M3 hours take 1:30 and 1h30 with plain messages; M4 Activity history on each
  task (before/after for due, start, priority, title); M5 leads whose CRM owner has no login listed apart from
  unassigned; M6 programs and scripts refused by name and bytes; M8 scheduled/published needs an approved creative;
  M10 ClickUp people matched by email first. Lows: L1 growth empty state, L2 one join-date capacity rule for Week and
  Time, L3, L4 links with brackets, L5 board card names, L6 no internal notes in the UI, L7 Copy link and a not-found
  page for request links (status stays 200 because the page streams), L8 lists stay still after Done/Undo and the bulk
  bars float, L9, L10 template projects keep their length (owners and dependencies still not copied), L11 request
  answers at the top of the task, L12 Ask hidden until an AI key is set, L13 every live client in filters, L14/L18
  "Client approved" needs who and where, L15 letters default to the likely kind and warn about blanks, L16 Teams
  manager (People → Teams), L17 labels (years, plurals, spacing, win rate from 5 closed leads, only over-burning
  retainers under "running hot"). M11 is a process rule: deploy outside office hours. 491 tests.
- 15 Oct 2026: **Live** at https://oppllo-one.vercel.app (Vercel Hobby, Neon Postgres, both US East iad1). Production
  tracks branch `claude/zealous-bell-hxgttc`; `vercel-build` migrates and bootstraps the owner. CRM link works
  (pipeline shows on the dashboard). Owner added the team by hand. Open: merge to main, Resend, consent-screen name,
  move app + database to an India-near region before the whole team relies on it.
- 14 Oct 2026: plan saved, decisions D1–D56 taken, CLAUDE.md written.
- 14 Oct 2026: Stage 1 done (Next.js 16.4 with Cache Components; vitest pinned 4.0.18 because 4.1 trips an npm bug;
  shadcn components hand-written because ui.shadcn.com is blocked in the cloud sandbox — `npx shadcn add` works locally).
- 14 Oct 2026: Stage 3 done. Lessons: Drizzle leaves single-table columns unqualified, so correlated subqueries
  silently self-compare — use joins (test now covers two engagements). Services must not be cached on globalThis
  (only the DB pool), or hot reload serves stale code. Auth reads need `await connection()` under Cache Components.
- 14 Oct 2026: Stage 5 review fixed: HR account takeover via email edit, HR approving future leave, no locking
  (balances overspent by concurrent requests), empty form values failing validation, double-submit, holiday removal
  going negative, leavers' leave, audit gaps, swallowed errors, forms losing typed values. 164 tests.
- 14 Oct 2026: Stage 5 (HR slice 1) built: schema `0001_hr_leave.sql`, leave rules (29 unit tests), people and
  leave services (34 integration tests), 12 screens. Review findings from stages 1–3 fixed first (interns' fields,
  burn counts non-billable, soft-deletable roles and team membership, sign-in crash, commit() for events).
- 14 Oct 2026: Stage 4 built; STOP for the owner to approve the look. Owner replied "ok continue" → look
  approved as shown (screenshots of /clients, /design, phone, dark). Stage 5 started.
- 14 Oct 2026: Stage 2 done. 20 tables, migration `0000_core_objects.sql`, CHECK constraints from `lib/types.ts`.
  Seed is relative to today: 13 people, 9 clients (8 + internal), 15 engagements, 76 periods, 37 projects,
  ~1,040 tasks, ~940 time entries, 238 assets, ~1,950 events. Working-calendar rule (`services/rules/working-days.ts`)
  and retainer rules written early because the seed needs them.
