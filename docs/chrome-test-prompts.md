# Oppllo One: full test with Claude in Chrome

A ready-to-paste test plan for the Claude in Chrome extension, written the way a senior QA lead would run an
acceptance test before a company-wide rollout. It covers every module, every role's view, the bugs fixed on
16 Oct 2026 (re-checks), and edge cases.

---

## How to use this (5 minutes to set up)

1. **Sign in first, yourself.** In Chrome, open https://oppllo-one.vercel.app and sign in with your owner Google
   account. The extension can't type passwords or do Google sign-in for you.
2. **Open the Claude in Chrome side panel** on that tab.
3. **Paste Part A (the rules) first**, then paste **one session prompt** (Session 1, then 2, and so on). The plan is too long
   for one go. Each session takes 20–60 minutes.
4. When a session ends, Claude gives you a report. **Save each report** (copy into a Claude Doc or a .md file).
5. After all sessions, paste **Part C** to get one combined report, then give that report to Claude Code to fix.
6. Do the **manual checks in Part D** yourself (things the extension can't do), and the **clean-up in Part E**.

Tip: start a new chat in the extension for each session, and paste Part A again each time. The rules matter more
than anything else in this file.

---

## Part A: rules for the tester (paste at the start of every session)

```markdown
You are a senior QA engineer running a formal acceptance test of "Oppllo One", an internal company system
(projects like ClickUp, HR like Zoho People, a sales CRM, creatives and client work) for Oppllo Digital, an
education-marketing agency in Kerala. The app is live at https://oppllo-one.vercel.app and real staff use it.
I am the owner, already signed in. You test in this Chrome tab, as the owner, by hand: click, type, read the
screen. Be thorough, sceptical and precise, like a test lead signing off a release for 15 people.

## Safety rules (break none of these)
1. Only create or change data whose name starts with "TEST " (e.g. "TEST Client Alpha", "TEST T1 Script").
   Create your own TEST clients, projects, tasks, forms, docs and so on as you need them.
2. NEVER change real records: real clients, real tasks, real leads, real people, real leave, real attendance.
   Reading them is fine. If a step would need you to change a real record, skip it and note "skipped: real data".
3. Attendance: NEVER check in, check out or correct attendance for anyone (including me). Only look at the screens.
   (A previous test changed my real attendance; that must not happen again.)
4. NEVER click any of these: "Switch Sales to Oppllo One", "Copy from the CRM now", "Issue" on a letter for a real
   person, "Record exit", "Create draft invoice" (Zoho Books), "Import" on a real ClickUp file, anything that
   sends email or WhatsApp to a real person, or "Remove"/"Delete" on anything that doesn't start with "TEST ".
5. Don't enter passwords, API keys, tokens, bank or Aadhaar numbers. If a form asks for one, stop and tell me.
6. If a confirm pop-up or "Are you sure?" appears, read it out to me and only accept it for TEST data.
7. If the page says "A new version is ready", click Reload and note it (a deploy happened while you tested).
8. If you get stuck for more than 3 tries on one step, record it as "blocked" with what you saw, and move on.

## How to test each feature
For every test case:
- Do the happy path first, then at least 2 edge cases: empty values, too-long text (300+ characters), wrong format,
  double-click, going back and saving again, refreshing the page mid-way, special characters
  (`<b>x</b>`, `"quotes"`, `%`, emoji, Malayalam text: "പരീക്ഷണം").
- After every Save: check the success message, reload the page, and confirm the value really stuck.
- After a refused Save (validation error): confirm EVERY other field kept what you typed or picked (dropdowns,
  checkboxes, dates). Losing a choice after an error is a High bug.
- Check the empty state (no data), the loading state, and that error messages say what's wrong in plain words.
- Look at it at desktop width, then use your window-resize tool at 390 x 844 (phone), for the screens marked 📱.
- Watch for: wrong numbers, numbers that disagree between two screens, raw codes on screen (like "audit_booked",
  "docs/xyz.md", "undefined", "NaN", "Invalid input"), missing plurals ("1 tasks"), dates without a year where it
  matters, buttons that jump under the cursor, lists that move after a click, text cut off, things you can't
  reach on a phone.

## Severity
- High: loses or corrupts data, a module can't be used, security or privacy leak, wrong money or hours.
- Medium: a feature works but misleads, a rule can be got around, or it gets in the way of daily work.
- Low: wording, polish, layout, accessibility.

## Bug format (one row per bug)
| ID | Severity | Screen | What happens | Steps to reproduce | Expected | Evidence |
IDs: use the session letter and a number, e.g. S3-04. Evidence = a screenshot you took, or the exact text seen.

## Report at the end of the session
1. Verdict in one line (ready / ready with issues / not ready).
2. Results table: Test ID | Feature | Pass / Fail / Partial / Blocked / Skipped | One-line note.
3. All bugs in the bug format above, most severe first.
4. Re-checks of previously fixed bugs (if this session lists any): Fixed / Still broken / Couldn't check.
5. "Needs a human": anything you couldn't test and why.
6. Every TEST item you created (so it can be deleted later).
Write in plain, simple English.
```

---

## Part B: the session prompts

Paste Part A, then one of these.

### Session 1: Login, security, navigation, search, notifications, phone layout

```markdown
SESSION 1: foundations. Test IDs start with S1-.

S1-01 Logged-out security: open a private (incognito) window if you can; otherwise skip and note it. Visit
  /tasks, /people, /sales, /dashboard, /settings, and one file link: each must send you to /sign-in.
S1-02 Menu: list every item in the left menu as the owner. Expected sections: My Day, Dashboard, Tasks, Board,
  Week, Time, Requests, Docs, Automations, Attendance, My page, Leave, Clients, Sales, Creatives, Growth, People,
  Settings. "Ask" should be HIDDEN unless an AI key is set (re-check of L12). Every item must open without error.
S1-03 Global search: press "/" and then Ctrl+K (Cmd+K on Mac): both should focus search. Search a real client name,
  a task word, a person, a lead. Results must be grouped (Tasks, Clients, Projects, Leads, People). Search "%",
  "<script>", "zzzzqqq" (should say "Nothing matches"), Malayalam text.
S1-04 Notifications: open the bell. Mark one as read, check the counter changes, open its link.
S1-05 New-version notice (re-check of H4): just note whether a "new version" banner appeared during your session.
S1-06 Phone layout 📱 (re-check of H5): resize to 390 x 844. The bottom bar must have a "More" button that opens
  EVERY section you saw in S1-02, plus Sign out. Sign out must NOT sit right next to the bell. Open Tasks, Board,
  Time, Requests, Docs, Sales, Creatives, Settings from "More". Tables must turn into cards. Note anything cut off or
  needing sideways scrolling. Then resize back to desktop.
S1-07 Dark mode: if you can switch the system or browser to dark, check My Day, a task, the Dashboard for
  unreadable text. If you can't, mark Skipped.
S1-08 Style guide: open /design. Note anything broken.
S1-09 Speed: for My Day, Board, Tasks and a client page, note roughly how long until the content shows
  (instant / 1–3 s / slow). Anything over 3 s is a Medium bug.
```

### Session 2: Tasks (list, board, calendar, timeline, task page, templates, fields)

```markdown
SESSION 2: tasks, like ClickUp. Test IDs start with S2-.
First create: client "TEST Client Alpha" (Clients → Add), client "TEST Client Beta" (with NO projects or tasks),
a project "TEST Project Launch" for Alpha, then tasks TEST T1 to TEST T6 with different due dates
(yesterday, today, +3 days, +10 days, none), priorities and owners (owner = me).

S2-01 My Day: overdue / today / coming up / done today sections. Tick T1 Done: the list must NOT jump and the
  next row must stay under your mouse (re-check L8). Press Undo: status goes back exactly. +30m / +1h quick time
  buttons add time.
S2-02 Tasks list: sort by every column both ways; tasks with no due date go last. Filters: Overdue, Today, Next 7
  days, No due date, client, owner, priority, tag, words. "Clear" resets. The client filter must list
  TEST Client Beta even though it has no tasks (re-check L13).
S2-03 Saved views: save "TEST High only", re-apply, remove. Try a duplicate name.
S2-04 Bulk edit: tick 3 tasks quickly. The bulk bar must float at the bottom and NOT push rows down (re-check
  BUG-11). Set status, assign, priority, due date, add tag, remove tag. Then add tag "Edit, Final" (comma):
  refused with a clear message, and afterwards "Final" alone must work (re-check BUG-04 and H1).
S2-05 Board: drag a card between columns; with keyboard, focus a card and press Shift+Arrow keys. Use your
  accessibility tree: a card's name must be "task title, status", not "Drag, or Shift + arrow keys" (re-check L5).
S2-06 Calendar: tasks on their due days, overdue in red, ‹ › Today, "+N more" on a busy day; phone view 📱 is a
  list of days.
S2-07 Timeline: 2w/4w/8w/12w, purple line for today, red outline on overdue bars, click a bar opens the task.
S2-08 Task page, Details (re-check H1, the most important re-check): change Priority to Low and Stage, Save,
  then Save again WITHOUT changes, reload: values must stick. Change due date to before the start date: refused,
  and every other field keeps its value.
S2-09 Task page, Activity card (new, re-check M4): after S2-08, the Activity list must show who changed the due
  date, priority and owner, with before → after values and times, newest first.
S2-10 Checklist: add 3 steps in one go (one per line, plus a blank line that should be skipped), tick, untick,
  rename ✏️, move ↓, remove ×. The tick box must always match the real state (re-check M7/BUG-05). Counter updates.
S2-11 People on a task: add an assignee and a watcher, remove them. "Watch" / "Stop watching".
S2-12 Comments: write one with @ and pick a person (the name shows in purple). Try `<script>alert(1)</script>`:
  shown as plain text.
S2-13 Files: attach a small PDF or image (if your file tool can), a Google Drive link, and try a link
  "javascript:alert(1)" (refused). If you can upload files, try a file named "setup.exe" (refused with
  "Programs and scripts can't be attached", re-check M6). Files over 3.5 MB are refused with the size.
S2-14 Dependencies: make T2 wait on T1, then try T1 waits on T2 (refused), then a 3-task loop (refused). Tasks
  from TEST Client Beta must not be offered on an Alpha task.
S2-15 Timer: Start timer on T3, check the running timer in the top bar, Stop: time is logged.
S2-16 Subtasks: add one, complete it, check the counter.
S2-17 Tags on the task: add "Shoot, shoot, SHOOT,  , Reel": saved once each, existing spelling kept.
S2-18 Custom fields (Tasks → Fields and templates): add a Dropdown "TEST Language" with no choices (refused) →
  the Type must STAY Dropdown (re-check BUG-02/H1), then add choices "English, Malayalam" → created as Dropdown.
  Add a Number field "TEST Budget" only for Alpha. On T1: pick Malayalam + type "abc" in Budget → Save refused,
  Malayalam must still be picked (re-check BUG-03). Fix to 5000 → saved. On a Beta task the Alpha-only field
  must not show. The "Only <client>" list must include TEST Client Beta (re-check L13).
S2-19 Templates: save T1 as task template "TEST Template Script"; create a task from it in another week: dates
  keep the same gap. Save TEST Project Launch as project template; create "TEST Beta from template" for Beta
  starting next month: tasks shift by the same offset, AND the project's end date shifts too (re-check L10).
  Note whether owners and dependencies came across (known: they don't yet).
S2-20 Recurring tasks: on a project page, add a weekly recurring TEST task, check the next copies appear.
S2-21 Week view: capacity per person per day, over/under colours, someone on leave shows less capacity.
S2-22 Phone 📱: My Day and a task page at 390 px: everything reachable and readable.
```

### Session 3: Time, requests, docs, automations, notifications between features

```markdown
SESSION 3: time, requests, docs, automations. Test IDs start with S3-. Reuse the TEST tasks from Session 2
(create them again if they're gone).

S3-01 Time → My week: type hours in cells for past days on TEST tasks: "1.5", "1:30", "1h30", "45m" all accepted
  (re-check M3). Then "-1" → "Hours can't be negative.", "30" → "Hours must be between 0 and 16 for one day.",
  "abc" → "Write hours like 1.5, 1:30 or 1h30." The error must name the task AND the day. A future day can't be
  filled. Clearing a cell removes the time. Totals per day and week add up.
S3-02 Week vs Time agree (re-check L2): for the same person and days, capacity on Week and "expected" on Time must
  match, including days before their joining date (zero on both).
S3-03 Time → Team: the team's grid, red for empty past days, short days marked.
S3-04 Requests → New form "TEST Design request": pick a project, add Q1 short answer (used as title), Q2 Dropdown
  WITHOUT a label, tick "Must be answered" and "Public link", then Create → refused "Every question needs a label"
  and the project, "Must be answered", the question type and "Public link" must all still be set (re-check H1).
  Fix the label → created.
S3-05 Request form page: the public link has a "Copy link" button (re-check L7). Fill in the form yourself → a task
  is created for the form's owner; open that task: the answers must be at the TOP of the task page as a card
  (re-check L11).
S3-06 Public link: open the copied link in a new tab. Note: you are signed in, so this isn't a true outside test
  (see Part D). Change one letter of the link → "Form not found" page.
S3-07 Docs: create "TEST SOP Reel production" with headings, a list, bold, a link, a link with brackets
  "[Wiki](https://en.wikipedia.org/wiki/Kerala_(state))" → the whole address works, no stray ")" (re-check L4).
  Edit it twice → versions v1, v2, v3. "Bring back" v1 → becomes a new version, history kept. Mark "In the training
  library". Search docs. Type `<script>` and `javascript:` links: shown as text / stripped.
S3-08 Automations: create "TEST Review gets High priority" (when status becomes In review on TEST Client Alpha →
  set priority High). The checkbox label must read "Rule is on" (re-check L5). Test with one task, then with a
  bulk change of 2 tasks (one Alpha, one Beta: only Alpha changes). Run count goes up. Then switch the rule OFF.
S3-09 Notifications from actions: after S2/S3 actions, check the bell for anything that should have appeared to
  you. (Most notifications go to OTHER people; see Part D.)
```

### Session 4: Clients, projects, engagements, creatives, content calendar

```markdown
SESSION 4: client work. Test IDs start with S4-. Use TEST Client Alpha and Beta only.

S4-01 Clients list: status, open tasks, money columns (owner sees fees). Search and filters. Empty state.
S4-02 TEST Client Alpha page: team, contacts (add a TEST contact, mark primary), projects, engagements, history,
  creatives, content calendar, ad results card, billing card, Drive folder link. Wording must have no file paths
  like "docs/…md" (re-check L6). "1 open task" vs "2 open tasks" plural (re-check L17).
S4-03 Settings → Services: add service "TEST Meta Ads Management" with 5 stages and starter tasks (one with due
  day -1 → refused). Working week settings: look only, don't change.
S4-04 Engagement: add a monthly retainer "TEST Retainer" to Alpha: ₹25,000 a month, 20 hours, a renewal date.
  On the engagement page the fee reads "₹25,000 a month" WITH a space and the renewal shows the YEAR
  (re-check L17). End before start → refused on the right field, other values kept. Add a deliverable
  "12 reels a month". New project from the engagement: starter tasks go to the right roles, skip Sundays.
S4-05 Retainer burn: log 2 h on an Alpha task → burn shows 10% used. On the Dashboard, "Budgets running hot" must
  list only retainers using hours FASTER than the month is passing (re-check L17), with a sensible empty message.
S4-06 Creatives: on a TEST task, add a creative (image or link), send for internal review, "Ask for changes"
  without a note (refused) and with a note, upload version 2, approve internally, Send to client. Now "Client
  approved" WITHOUT a note must be refused with "Say who approved it, and where." (re-check L14/L18); with
  "TEST Principal on WhatsApp" it's approved. Double-click on Send to client must not approve by accident. History
  keeps every step. Tab order on Creatives: Draft, In progress, Internal review, With client, Changes asked,
  Approved (re-check L9). Video creative: comment at a time code "1:05".
S4-07 Content calendar: add "TEST Diwali post" as Scheduled with NO creative → refused, asking for an approved
  creative (re-check M8). With an unapproved creative → refused. With the approved creative from S4-06 → saved.
  Published needs a link. Month navigation. Phone view 📱.
S4-08 Clients → Won: leads won in the CRM listed (read only).
S4-09 Project page: stages, progress, recurring tasks, template button, the project lead.
```

### Session 5: HR (people, leave, attendance screens, documents, interns, letters, teams, checklists)

```markdown
SESSION 5: HR. Test IDs start with S5-. Remember the rules: never touch real attendance, real leave or real
people's records. You may create "TEST Designer B" as a person.

S5-01 People directory: search, filters, people who left (owner sees them), phone cards 📱.
S5-02 Add person "TEST Designer B" (email test.designer.b@example.com, role Designer, team "TEST Team Video"
  after S5-03). Validation: no role → refused, 90 hours a week → refused, other fields kept after errors.
S5-03 Teams (new, re-check L16): People → Teams. Add "TEST Team Video" with a head, rename it, change the head, try
  a duplicate name in different capitals (refused). Put TEST Designer B in it; "Remove team" must not be offered /
  must be refused while someone is in it. Move B out → remove works.
S5-04 Person page for TEST Designer B: private fields, joining checklist (ticks stick), access register (add a
  TEST access), one-to-one note, document locker (upload only if you can; check that only the last 4 digits of
  any ID number can be entered).
S5-05 Letters (re-check L15): open Issue a letter for TEST Designer B with no kind picked → it must start on
  "Offer letter", not Experience. Experience letter for someone still working → a warning lists the empty
  fill-ins (e.g. "last working day") instead of quietly printing "from 16 Oct to 16 Oct" or "—". Don't press
  Issue unless it's for TEST Designer B; if you do issue one, open its print page.
S5-06 Leave settings (re-check H2): leave types exist (Casual, Sick, Earned, Comp-off or similar); add
  "TEST Leave" type, edit quotas, retire it. Holidays: add "TEST Holiday" on a future date → "1 holiday"
  singular (re-check L17), then remove it.
S5-07 Ask for leave as yourself: open the form but DON'T send. Pre-filled dates must show the day count at once,
  or a clear "Pick the type of leave…" message (re-check L3). Half day only for one day. Weekends/holidays not
  counted. Then press Back.
S5-08 Leave approvals, team calendar: read only.
S5-09 Attendance (READ ONLY): Today board, Month view, Team view, Payroll CSV link exists; the text under the team
  table mentions Payroll CSV, not "HR slice 3" (re-check L6). Open the "Correct" form only to read it: DON'T save.
S5-10 Interns: intern list, intern page (days left, work produced, end review form: read only).
S5-11 Checklists: People → Checklists, read the joining and exit templates (don't change).
S5-12 Growth (re-check L1): Skills matrix: add skill "TEST Meta lead campaigns", set a level for TEST Designer B
  with evidence, add a goal and a learning item. HR view: "Thin skills" must say "No skills set up yet" when
  there are none, and must list the TEST skill as thin. Score page shows the workings.
```

### Session 6: Sales (the CRM inside Oppllo One)

```markdown
SESSION 6: sales. Test IDs start with S6-. Real leads are real customers: READ them, never edit them. Only
create leads named "TEST Lead …", and only if editing is switched on (after switch day). If Sales is a
read-only mirror (before switch day), test reading only.

S6-01 Sales → Today: sections Waiting for a first call, Overdue, Due today, New and unassigned, "Owner has no
  Oppllo login" (re-check M5: leads owned by CRM users without an account show HERE with the owner's name,
  not as unassigned), Going cold, No next step.
S6-02 Leads list: search, every filter (stage, owner, tag, channel, district, type, score, follow-up due), saved
  views, CSV export (only if allowed, don't open real data outside the browser).
S6-03 Pipeline board: columns per stage; old closed leads hidden.
S6-04 Lead page (open 3 real leads, READ only): timeline must show "Audit call booked", never the raw code
  "audit_booked" (re-check L17). Facts, stage, owner, follow-up.
S6-05 Dashboard vs Sales (re-check M2/M9): on Dashboard, each sales stage number is a link to that stage's lead
  list; open each and compare the count. The "Overdue tasks" tile opens Tasks filtered to overdue. A line says
  "As of the last copy from the CRM, <time>" before switch day.
S6-06 Sales dashboard: 7/30/90 days/all time; numbers add up; Win rate shows "—" until 5+ leads are closed
  (re-check L17).
S6-07 Templates (WhatsApp messages): read; edit only a TEST template if you add one.
S6-08 Lead sources: read the page; no "docs/…md" file paths in the text (re-check L6). DON'T press "Switch Sales".
S6-09 Import (Sales → Import): open the wizard only, don't import.
S6-10 If editing is on: create "TEST Lead One", duplicate warning when creating "TEST Lead One" again, change
  stage (lost needs a reason), owner, follow-up, note, tags; bulk change on TEST leads only.
```

### Session 7: Dashboard, AI, settings, ClickUp import, MCP, installable app

```markdown
SESSION 7: owner tools. Test IDs start with S7-.

S7-01 Dashboard: every card (Budgets running hot, Late projects, This week's load, Away this week, Renewals in
  30 days with the YEAR shown, Sales). Every tile and row link opens the right place. Numbers match the screens
  they come from.
S7-02 Settings → AI: read the status, the monthly limit, usage. If no key: Ask is hidden in the menu
  (re-check L12) and the page says how to switch it on, with no file paths.
S7-03 Settings → Import from ClickUp: open it and READ ONLY unless I've given you a TEST CSV. With a TEST CSV:
  people are matched by exact email first (shammasahammed169@gmail.com → Shammas), re-check M10; wrong file → clear
  message; re-import adds nothing twice.
S7-04 Settings → Week: read the working week (don't change).
S7-05 Connected apps / MCP: open the page that lists connected AI apps; read only.
S7-06 Installable app: check whether Chrome offers "Install Oppllo One" in the address bar; note it.
S7-07 My page (/me): my own record, my leave, my growth.
```

### Session 8: Cross-module "day in the life" and abuse tests (do this last)

```markdown
SESSION 8: end-to-end flows and abuse. Test IDs start with S8-.

S8-01 A full client job, all TEST data: new client → retainer → project from service with starter tasks →
  creative made, reviewed, approved by client (with note) → content calendar post Scheduled → time logged →
  burn on the Dashboard → task Activity shows the whole story.
S8-02 A request from outside: request form → task → owner works it → done. Answers on top of the task.
S8-03 Double-submit everything: double-click Save / Create / Apply on 5 different forms. Nothing must be created
  twice.
S8-04 Back button and refresh: fill a long form, press Back, then Forward; refresh in the middle of a save.
S8-05 Two tabs: open the same TEST task in two tabs, change priority in one, then save details in the other.
  Note what happens (the second save shouldn't silently undo the first without a sign).
S8-06 Long and odd input: 1,000-character titles, emoji, Malayalam, leading/trailing spaces, only spaces.
S8-07 URL tampering: change a TEST task's id in the address bar to a random one, to a real client's task you
  shouldn't edit, and to garbage text: you get a clean "not found", never a crash page.
S8-08 Every page once at phone width 📱: list any page that needs sideways scrolling or hides a button.
S8-09 Accessibility: use your accessibility tree on My Day, a task page and a form: every button and field has a
  real name (no unnamed buttons, no checkboxes named just "on").
```

---

### Session 9: re-test the fixes not yet confirmed (added 18 Oct 2026)

```markdown
SESSION 9: re-test only. Test IDs start with S9R-. These fixes went live after your last test rounds and no report
has confirmed them yet. For each one: Pass / Fail (with steps) / Couldn't check. Use TEST data only.

Tasks
S9R-01 Task page: change priority, stage AND owner in one Details save → Activity shows ONE entry with all three,
  "from X to Y" for each, owner included. Bulk-change priority and due date → Activity shows before → after.
  Watch then Stop watching → "started watching" / "stopped watching".
S9R-02 Same task in two tabs: tab A change priority, Save; tab B change only the title, Save → tab B is refused with
  "This task changed since you opened it…", and priority stays as tab A set it.
S9R-03 On a TEST task: log 1 h, add a creative, send it to the client, record "Client approved" with a note, put it
  on the content calendar as Scheduled → the task's Activity lists every one of these with who and when.
S9R-04 Task waiting on an unfinished task (plus open checklist) → set Done → a warning with "Mark done anyway".
S9R-05 Board: drag a card with the MOUSE to another column, and to a column off screen (the board should scroll
  when you drag near its edge). The click that ends a drag must not open the task.
S9R-06 My Day: tick an overdue task → "Overdue" count drops at once; Undo → it comes back.
S9R-07 Saved views: a second view with the same name (any capitals) is refused; after a good save the box closes.
S9R-08 Tasks list: tick tasks → the bulk bar floats at the bottom and does NOT cover the sidebar's bell / Sign out.
S9R-09 Time › My week: type "abc" → the cell stays red WITH "abc" in it. Log 1 minute → cell and total both "0.02".

Clients and content
S9R-10 Clients list: search by name, city, contact; filter by status; "Nothing matches" when empty.
S9R-11 Client page: Notes show (owner); "Lately" lines are plain sentences ("sent a creative to the client").
S9R-12 Client edit: add a Drive folder link (https only) → the client page shows "Open in Google Drive".
S9R-13 Content calendar: Published without a link is refused on the link field (new post and edit).
S9R-14 Board client filter and Automations "Only if › client" list TEST Client Beta (no projects).

Sales
S9R-15 Leads › Owner "Unassigned" = only leads nobody owns; "Owner has no Oppllo login" lists CRM-owned ones;
  each owner is in the menu. District menu shows one "Kozhikode" for Kozhikode / Kozhikkodu.
S9R-16 Sales dashboard: Win rate "—" with "Needs 5 closed leads (N so far)" until 5 are closed.

People
S9R-17 Teams: "Remove team" asks "Remove team X?" first.
S9R-18 Person › One-to-ones: a note made today reads "last met today".
S9R-19 Person › Documents (TEST Designer B only): ID last-4 box refuses 12 digits, accepts 4; a title with a long
  number like "Aadhaar 1234 5678 9012" is refused; a dated title "Agreement 15-10-2026" is fine.

Everywhere
S9R-20 Docs › New page: type text, click a menu link → "You have unsaved changes. Leave without saving?" with
  Leave / Stay. (The browser Back button is a known gap.)
S9R-21 Open /tasks/garbage-text → "Not found" page. Notifications: "Mark read" on one item works.
S9R-22 Accessibility: the List/Board/Calendar/Timeline switch and the logo have names in your accessibility tree.
```

---

## Part C: the final combined report (paste after all sessions)

```markdown
Here are the reports of all test sessions (pasted below). Combine them into ONE final report:
1. Verdict: ready for the whole team / ready with known issues / not ready, with the reason.
2. Module scorecard: Module | Status (Works / Works with issues / Broken in part / Blocked) | Bug IDs.
3. All bugs, de-duplicated, numbered H1… / M1… / L1…, in the bug table format, most severe first.
4. Re-check table of the 16 Oct fixes: H1–H5, M1–M10, L1–L18, BUG-02/03/04/05/11 → Fixed / Still broken / Not
   checked.
5. A fix guide for Claude Code: one short paste-ready prompt per High bug, then one prompt for all Mediums and one
   for all Lows. Each prompt asks Claude Code to confirm the cause first and add a test.
6. What still needs a human (from every session).
7. Every TEST item created, by screen, for clean-up.
```

---

## Part D: what the extension can't do, and how you do it

| # | Check | Why the extension can't | How you do it (step by step) |
|---|---|---|---|
| 1 | **Signing in** (Google) | It isn't allowed to type passwords or approve Google sign-in. | Sign in yourself in Chrome before each session. If it logs you out mid-test, sign in again and tell it to continue. |
| 2 | **Second person's view** (designer, intern, HR, BDO) | It can only use your signed-in session, and can't sign in as someone else. | 1. People → TEST Designer B → Edit → change the email to a second Google account you own. 2. Open a new Chrome profile (or an Incognito window), sign in with that account. 3. Check: they see only their own clients' tasks, can't see money or HR pages, can't see your saved view, can bulk-edit only their own tasks (others "skipped"), search shows only their clients. 4. Repeat with a role of Intern and HR if you can. |
| 3 | **Notifications to others** (assigned, @mention, watched task, "Ready to start", new request) | Notifications go to the other person, whom it can't sign in as. | With the second login from row 2: as you, add B to a TEST task, @mention B, change a task B watches, mark done a task B's task waits on. As B, check the bell for each one. |
| 4 | **Email digests** (daily unread summary) | It can't read your inbox safely, and emails send once a day from the daily job. | Next morning, check the inbox of the account that has unread notifications. If nothing arrives, email isn't set up yet (Resend key missing in Vercel). |
| 5 | **Real phone** | Resizing the browser isn't the same as a phone (touch, keyboard, small screen, slow network). | On your Android/iPhone: open the site, sign in, try My Day, check-in screen (look only), a task, Leave, the More menu. Add it to the home screen ("Install app") and open it from there. |
| 6 | **Attendance check-in / check-out and location** | Rule 3 forbids it (it would change real attendance), and location needs your phone's permission. | Do one real check-in on your phone at office with "share location" ticked, then check out in the evening. Next day, look at Attendance → Month and Team for a correct record. Try "Check in again" after checking out (M1 fix). |
| 7 | **Public request form as an outsider** | It's always signed in as you, so it can't see what a client sees. | Copy the TEST form's public link, open it on your phone with mobile data (not signed in), send one request, then find the new task in Oppllo One. Also open a wrong link: you should see "Form not found". |
| 8 | **Uploading files from your computer** (PDF, photos, .exe test) | The extension may not be able to pick files from your disk. | On a TEST task → Files and links → Attach a PDF and a photo; then try renaming any file to `setup.exe` and attaching it: it must be refused. |
| 9 | **AI assistant (Ask) and Morning summary** | Needs the Anthropic API key added in Vercel (a secret it must not handle). | 1. In Vercel → oppllo-one project → Settings → Environment Variables, add `ANTHROPIC_API_KEY`, then Redeploy (or ask Claude Code to guide you). 2. "Ask" appears in the menu. 3. Ask in English: "What's overdue for TEST Client Alpha?" and in Malayalam. 4. Check Settings → AI shows the spend. |
| 10 | **Claude / MCP connection** (Claude acting in Oppllo One) | Connecting an AI app needs your approval on a sign-in screen. | Ask Claude Code: "help me connect Oppllo One's MCP to Claude" (docs/mcp.md has the steps). Then in Claude, ask "list my overdue tasks". |
| 11 | **Meta lead ads, Google lead forms, landing page forms** (switch day) | Needs Meta/Google admin screens, tokens, and real form submissions. | Follow the switch-day guide with Claude Code (docs/switch-day.md). Test with Meta's "Lead Ads Testing Tool" and a test submission on the landing page, then check the lead appears in Sales. |
| 12 | **Conversions back to Meta and Google Ads** | Needs Meta Events Manager and Google Ads, and only happens after switch day. | After switch day, move a TEST lead to Won; next day check Meta Events Manager → Test events / Google Ads → Conversions → Uploads. |
| 13 | **Zoho Books draft invoice** | Creates a real document in your accounts; needs Zoho keys. | When Zoho keys are added: on TEST Client Alpha → Billing → Create draft invoice, then check Zoho Books → Invoices → Drafts, and delete the draft there. |
| 14 | **Google Drive folders and Drive file storage** | Needs the Drive service account set up in Vercel. | After setup (docs/google-drive.md): add a new TEST client → a Drive folder appears in your shared drive, and the client page links to it. |
| 15 | **Meta ad results on a client page** | Needs a Meta token and a real ad account. | Link a real client's ad account (Client → Ad results), check spend and leads match Ads Manager for "last 7 days". |
| 16 | **Daily job** (recurring tasks, overdue alerts, burn alerts, renewals, morning summary, CRM copy) | Runs at night on Vercel's schedule; can't be started from the browser. | Next morning, check: new recurring task copies, overdue notifications, the Dashboard's CRM "as of" time is from the night. If nothing changed, ask Claude Code to check the cron job in Vercel. |
| 17 | **Deploy during work** (H4/M11) | It can't deploy. | Next time Claude Code uploads a change, keep a task page open; when the "new version is ready" banner shows, press Reload: anything typed should come back. Rule: upload outside office hours. |
| 18 | **Payroll CSV correctness** | It can download but can't judge your payroll. | Attendance → Team → Payroll CSV for last month; open in Excel/Sheets and check 2–3 people's present days, leave and loss-of-pay against what you know. |
| 19 | **Printing letters** | Printing needs the system print dialog. | Issue a letter for TEST Designer B, open it, press Ctrl/Cmd+P → Save as PDF, and check it fits one page with your letterhead details. |
| 20 | **Speed from Kerala on a real network** | The app and database are in the US for now. | On your phone with mobile data, time My Day and the Board. If it feels slow, ask Claude Code about moving to an India-near region (it's in the open items). |
| 21 | **Old CRM untouched** | It shouldn't open the old CRM's admin. | Open crm.oppllo.com and check leads still arrive and nothing changed there. |

---

## Part E: clean-up after testing

Ask the extension (or do it by hand) to remove every TEST item listed in the reports:

- [ ] TEST tasks, projects, templates, saved views, custom fields
- [ ] TEST Client Alpha and Beta (and their contacts, engagements, content posts, creatives)
- [ ] TEST service (retire it), TEST holiday, TEST leave type (retire)
- [ ] TEST request form (switch off its public link, then delete)
- [ ] TEST doc (archive), TEST automation (switch off, then remove)
- [ ] TEST skill, goals and learning items
- [ ] TEST Team Video (after moving people out)
- [ ] TEST Designer B → Record exit (only after the second-login tests in Part D)
- [ ] Your own attendance: check Attendance → Month that nothing was changed by a test
