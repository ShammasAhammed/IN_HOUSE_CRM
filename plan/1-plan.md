# Oppllo Tech — Plan & Feature Brainstorm

Oct 12, 2026 · @ahammed shammas p

Oppllo One is one internal system — CRM, Projects and HR with one login, one database, an AI assistant and an MCP connection — built step by step with Claude Code for about ₹1,500–5,000 a month.

## Vision

Oppllo One replaces scattered tools (sheets, WhatsApp groups, Zoho-style apps) with one system the whole team opens every morning.

1. **One place for work:** leads, client projects, tasks and team records live together, with one Google login.
2. **Things move on their own:** a won lead becomes a client project, a new hire gets a login, a leave request moves their tasks.
3. **AI that knows our data:** ask Claude in plain words (English or Malayalam) about sales, projects or the team, and let it act through the Oppllo MCP with each person's own permissions.

Second goal: the same codebase becomes a product. The CRM (and later Projects) is set up for clients on their own accounts, and every update reaches all clients.

## How it fits together

&#91;embedded content: Oppllo One architecture · 4 modules, 1 database, 4 connections\]

Every module reads and writes the same database, so a won lead can open a project, a new hire gets a login, and the AI sees the whole picture. Example automations: Won lead → client + project + starter tasks; new employee → CRM and Projects login; approved leave → their tasks and follow-ups flagged for cover.

## Build vs buy

We build what is simple and used every day; we connect ready-made tools where law or tax rules apply.

| Tool | Decision | Why |
| --- | --- | --- |
| CRM | Built (live at crm.oppllo.com) | Leads from the landing page and Meta, results sent back to Meta |
| Project management | Build | Client projects, tasks, deadlines; links to won leads |
| HR basics | Build | Employees, attendance, leave, holidays, documents, appraisals |
| Dashboard + AI assistant | Build | One view across sales, projects and team |
| Oppllo MCP | Build | Lets Claude and other AI tools read and act on our data |
| Accounting and GST invoices | Connect Zoho Books | Tax rules change; mistakes cost money |
| Payroll (PF, ESI, TDS, payslips) | Connect Zoho Payroll or RazorpayX Payroll | Legal compliance |
| Email and calendar | Google Workspace | Already standard |
| WhatsApp messaging | WhatsApp Business API provider (later) | Needs an approved provider |

## Technical stack

Everything runs on Firebase (Google), the same platform the CRM already uses, so there is one account, one bill and built-in backups.

| Need | Tool | Set up by |
| --- | --- | --- |
| Hosting (app and landing pages) | Firebase Hosting | Claude |
| Database | Firestore, Mumbai region (asia-south1) | Claude |
| Login and roles | Firebase Auth, Google sign-in; roles admin, manager, sales, marketing, employee | Claude |
| Server parts (automations, Meta, AI) | Firebase Cloud Functions | Claude |
| Daily jobs (reminders, reports, backups) | Cloud Scheduler | Claude |
| Files (HR documents, project files) | Firebase Storage | Claude |
| Backups | Firestore daily backups | Claude |
| AI engine | Claude API, switchable to OpenAI, Gemini or Sarvam (Malayalam) | Claude builds; owner creates and pastes the key |
| MCP server | Oppllo MCP with sign-in and role checks | Claude |
| Code storage | GitHub private repository (free) | Owner creates account; Claude connects |
| Error alerts | Sentry (free) | Claude |
| Notifications | Email via Brevo or Resend (free tier); WhatsApp API later | Owner signs up; Claude connects |
| Big reports (later) | BigQuery export | Claude |

Today the code exists only on the owner's Mac, so GitHub is urgent. Netlify (current host) has paused publishing until 5 Nov 2026 because free credits ran out.

## Monthly costs

The core system costs about ₹1,500–5,000 a month for 10–30 people; with every optional add-on, about ₹15,000. These are approximate figures from memory; check each provider's current price before paying.

| Item | Cost per month (approx., INR) | Needed? |
| --- | --- | --- |
| Firebase (hosting, database, functions, storage, backups) | 0–500 | Yes |
| AI usage (Claude API, with a spending limit) | 500–3,000 | Yes, for AI features |
| GitHub, Sentry, email notifications | 0 (free tiers) | Yes |
| Zoho Books (accounting) | 750–2,000 | Recommended |
| Payroll software | 1,000–3,000 | Optional |
| WhatsApp Business API | 2,500–6,000 | Optional |
| Claude plan for building | Current plan | Already paid |

For comparison, Zoho One for 10–30 people usually runs ₹10,000–80,000+ a month. The real cost here is the owner's time to test and decide.

## Roadmap

&#91;embedded content: Roadmap · phases 0–6, top to bottom\]

Phase 0 comes first because it ends the Netlify pause and protects the code and data; the client kit (Phase 6) can move earlier if a paying client is waiting.

## Client kit

Each client gets the same CRM code on their own Firebase account and their own domain, so their data stays private and every update reaches all clients with one command. Setup takes about 1–2 hours per client once the kit is built.

| Step | Claude Code does | Person does |
| --- | --- | --- |
| 0. Build the kit (once) | Remove Oppllo hardcoding, one settings file per client, `client:new` and `deploy:clients` commands, setup checklist page | Approve |
| 1. Collect details | Create the client's settings file | Get name, logo, colours, admin and team emails, stages, deal value, subdomain |
| 2. Accounts | Database, rules, backups, publish, tests | Client creates the Firebase project, adds Oppllo as Owner, upgrades to Blaze with their card, sets a ₹100 budget alert, enables Google sign-in |
| 3. GoDaddy domain | Request the domain in Firebase, give the exact records, check HTTPS | Log in to GoDaddy and add 2–3 DNS records (or let the Chrome extension add them with approval) |
| 4. Team | — | Admin signs in, adds team in Team page |
| 5. Lead sources | Website form snippet, optional landing page, Meta and Google steps | Paste the snippet; log in to Meta, accept terms, paste token and secret in CRM Settings |
| 6. Test and handover | Test leads through every source | Delete test leads, 15-minute team training |

The client's GoDaddy hosting plan cannot run the CRM's server parts; GoDaddy keeps their domain and website, and the CRM runs on Firebase. Each client needs their own Meta app, because one app can send leads to only one CRM address.

## Rules and safety

Claude builds, tests and publishes; a person does anything involving logins, money, legal terms or secrets.

- **Only a person:** logging in, passwords, card and payment details, plan upgrades, accepting terms, granting access in Meta, Google or GoDaddy, pasting secret keys and tokens (inside CRM Settings), deleting real data.
- **Client assets:** never touch client Meta ad accounts, Pixels or Pages shared into the Oppllo business.
- **HR data (India DPDP Act 2023):** only HR and admins see salaries and documents; store the minimum; no full Aadhaar or bank numbers in the app (payroll software keeps them).
- **AI and MCP:** every AI action uses the asking person's own role; AI spending has a monthly limit.
- **Publishing:** check everything with `npm run check` before going live; keep daily backups on.

## Open questions and next steps

The first decision is hosting: confirm the move to Firebase so Phase 0 can start.

- [ ] Confirm Firebase as the platform (reply "start Phase 0")
- [ ] Create a free GitHub account and share the username
- [ ] Delete the CRM test leads (TEST - Meta results check, and Saleem / verveox if they are tests)
- [ ] Write Oppllo's project steps (example: strategy, design, ads live, reporting)
- [ ] Write leave rules, office timings and holiday list
- [ ] Brainstorm features in the Feature brainstorm tab: mark each Must, Should or Later
- [ ] Feature list with priorities: Feature brainstorm
- [ ] Pick the first client for the client kit

Open questions:

- What name will the platform use — Oppllo One or another?
- Will employees check in by phone location, or a simple button?
- Who approves leave — the owner only, or team leads?
- Will clients see their own project progress (a client portal)?
