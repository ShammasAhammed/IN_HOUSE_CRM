# Projects module

Oct 14, 2026 · @ahammed shammas p

Oppllo One Projects replaces ClickUp. It wins by answering four questions ClickUp cannot: which client is being over-serviced, who is overloaded this week, whether the creative was approved, and what the ads actually did.

## Where generic tools fail an agency

ClickUp, Asana and Monday treat every project as a thing with a start and an end. Agency work is not that. It is the same eight clients, every month, forever. That mismatch creates four blind spots, and agency platforms exist only to fill them.

| Blind spot | The question nobody can answer today | What it costs |
| --- | --- | --- |
| Retainer burn | Has this client already used more hours than they pay for, this month? | Over-servicing. The quiet killer of agency margin |
| Capacity | Who is overloaded this week, and who has room for the new client? | Burnout on one side, idle time on the other |
| Creative approval | Which version is approved, by whom, and when? | Wrong file goes live. Rework. Client arguments |
| Result linkage | Did the work we did actually move this client's numbers? | You manage tasks, not outcomes |

Two more that matter specifically for Oppllo. First, the work lives in three places — tasks in ClickUp, creative thinking in FigJam, conversation in WhatsApp — so no one place tells the truth. Second, nothing connects a won lead in your CRM to the project that follows it.

So the target is not "a better ClickUp". Matching ClickUp on generic task features is neither realistic nor needed. The target is a system that is adequate at tasks and unbeatable at the six things above, because it already holds your CRM, your people and your client data.

## Core objects

Nine objects. Everything else is a view over them. Get these right and HR, invoicing or a client portal plug in later without a rebuild.

| Object | Holds | Links to |
| --- | --- | --- |
| Client | Company, contacts, services bought, start date, status | Created from a won lead in the CRM |
| Engagement | One retainer or one-off job: service, monthly fee, hours budget, period, renewal date | Client |
| Project | A piece of delivery inside an engagement, with stages | Engagement, client |
| Task | The unit of work: owner, due date, estimate, stage, status | Project, person |
| Person | Team member, role, capacity hours per week | Tasks, time entries, HR record |
| Time entry | Hours against a task, date, billable or not | Task, person |
| Asset | A creative file: version, approval state, where it is stored | Project, task, storage location |
| Deliverable | A promised output (12 reels, 1 landing page) with a count and a due date | Engagement, project |
| Event | Every change, as a record: who, what, when | Everything |

Three rules keep it future-proof.

1. **Engagement sits between client and project.** This is the piece generic tools miss, and the one that makes retainer burn and renewals possible. Skip it now and you rebuild everything later.
2. **Every change writes an Event.** Automations, the AI, the audit trail and notifications all read from the event stream rather than hard-wiring into each other. New modules subscribe to events instead of being stitched into old code.
3. **An Asset stores a pointer, not a file.** The record says which provider, which bucket or folder, and which file id. Swapping Google Drive for Cloudflare R2 then changes one setting, not the data.

## Daily working views

A team leaves a familiar tool only if the first screen is better. Build these five, in this order.

**My Day** — the default screen for everyone. Tasks due today and overdue, in one list, with a one-click "done" and a one-click "log 30 min". Nothing else. The video editor and interns should never need to understand projects, engagements or clients to use this.

**Client page** — everything about one client on a single screen: active engagements, hours used this month against budget, live projects by stage, latest creatives with approval state, recent ad numbers, and the last five things that happened. This is the screen that makes the system worth opening, and it is the one no other tool can build for you, because only your system holds the CRM, the files and the ad data together.

**Board** — the task board by stage, per project or across all clients, filterable by person. This is the ClickUp replacement proper. Keep it fast and keyboard-friendly; slowness is the single most common reason teams drift back.

**Week** — a grid of people down the side and days across the top, showing assigned hours against each person's capacity. Red when someone is over, pale when under. This is how you decide who takes the ninth client.

**Calendar** — deadlines, shoot days, publishing dates, client calls. Needed because shoots and posting dates are real-world fixed points, unlike ordinary tasks.

On the phone, only My Day, the client page and creative approval need to work well. Nobody plans capacity on a phone.

## The agency layer

**Retainer burn.** Each engagement has a monthly budget, in hours or in deliverables. The client page shows a bar: agreed, used, remaining, days left in the period. A warning fires at 80 percent and again at 100. Unused time either rolls over or expires, set per client. This one feature alone is why agencies pay for Scoro and Productive.

**Time tracking, kept painless.** The honest problem: creative teams hate timers and will not use them. So do not build a timer as the main path. Build a one-tap "log 30 min / 1 hr / 2 hr" button on each task, plus a Friday screen showing the week with gaps highlighted, fillable in two minutes. Rough hours that people actually enter beat precise hours nobody enters.

**Capacity and utilisation.** Each person has capacity hours per week (an intern may be 15, a designer 40). Assigned estimates against capacity gives the Week view. Over a month it gives utilisation per person, which tells you who is stretched and whether you need to hire before the ninth client, not after.

**Creative approval.** A proper review flow, because this is where agency time leaks. An asset is uploaded as version 1, goes to internal review, then to client review, and ends approved or in changes-requested. Comments attach to the version. The approved version is marked and is the only one anyone can publish. Keep every version. For video, a link with a timestamped comment is enough — do not build a Frame.io clone.

**Content calendar per client.** Planned posts and ads with date, channel, the asset attached, and status from idea through to published. Your social media marketer lives here, and clients can later be shown this one screen instead of a WhatsApp thread of files.

**Deliverable counting.** "12 reels and 8 statics a month" tracked as a count, not a vague feeling. Shows what has been delivered against what was promised, mid-month, while there is still time to fix it.

**Ad results on the project.** Pull Meta (and later Google) numbers per client onto the client page, using the accuracy rules already documented for the Meta MCP. Work and outcome end up on the same screen, which is something no project tool on the market does for you.

## AI, automation and permissions

Automations that run without being asked:

- Won lead in the CRM creates the client, the engagement and the starter tasks for that service
- New month opens a fresh retainer period and resets the burn counter
- Task overdue pings the owner, then the strategist if still open after two days
- Approved creative moves the content calendar item to "ready to publish"
- Renewal date 30 days away creates a task for the BDO
- Leave approved flags that person's tasks in that period for cover

What the AI assistant does here, using the MCP so it sees everything:

- Answers in plain words: "which clients are over their hours this month", "what is pending for Verveox", "who is free next week"
- Writes the weekly client status update from tasks completed, creatives approved and ad numbers, ready to send on WhatsApp
- Flags risk before you ask: a client with no activity for ten days, a project stuck in one stage, a person at 130 percent load
- Turns a meeting note or a voice note in Malayalam into tasks with owners and dates
- Reads the FigJam board on a schedule and records what moved in the project record

Permissions, set from day one rather than added later:

| Role | Sees | Cannot see |
| --- | --- | --- |
| Owner | Everything | — |
| Strategist, performance marketer | All clients, projects, hours, ad results | HR records, salaries |
| Social media, designer, video editor | Their assigned tasks, project files, content calendar | Fees, hours budgets, other clients' money |
| BDO | Leads, clients, engagements, renewals | Creative files in progress, HR |
| HR | People, attendance, leave, documents | Client work and client money |
| Accountant | Engagements, fees, invoices | Creative work, HR documents |
| Intern | Only tasks assigned to them | Client contact details, everything else |

## Build order and moving off ClickUp

Four slices. Each one is usable on its own, so the team moves across gradually instead of on one risky day.

| Slice | What ships | Team can stop using ClickUp for |
| --- | --- | --- |
| 1 | Clients, engagements, projects, tasks, My Day, Board | Day-to-day task work |
| 2 | Time logging, retainer burn, Week capacity view, client page | Hours spreadsheets and month-end guessing |
| 3 | Assets, creative approval, content calendar, file storage | WhatsApp file threads and version confusion |
| 4 | Ad results, AI assistant, automations, MCP | — |

The migration itself, once slice 1 is live:

1. Export everything from ClickUp first, and keep the file. Do this before anything else.
2. Import clients and open tasks only. Leave completed history behind — it is dead weight, and the export file keeps it if anyone ever asks.
3. Run both systems for two weeks with two clients only. Pick your two calmest clients, not the biggest.
4. Watch for the real signal: is anyone still opening ClickUp out of habit? If yes, something in My Day or the Board is slower or more confusing than ClickUp's version. Fix that before moving further.
5. Move the remaining clients, then set ClickUp to read-only for one month before cancelling.

One honest warning. The risk is not that the system gets built badly. It is that the team quietly keeps using WhatsApp and ClickUp because the new screens are half a second slower or need one extra click. Speed and fewer clicks on My Day and the Board matter more than any feature in this document.
