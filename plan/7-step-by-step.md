# Step by step

Oct 14, 2026 · @ahammed shammas p

The exact order of work to build Oppllo One with Claude Code, from an empty folder to the team using it. Prompts in boxes can be pasted as they are. Do the phases in order — each one depends on the last being right.

## Phase A — Day 0, about two hours

Nothing here is building. It is the ground everything else stands on, and skipping any of it causes trouble later.

**1. Install Node.js.** Download the LTS version from nodejs.org and install it. Then check it worked:

```
node --version
```

**2. Install Claude Code.** In Terminal on your Mac:

```
curl -fsSL https://claude.ai/install.sh | bash
```

Open a new Terminal window and confirm:

```
claude --version
```

It needs a Pro, Max, Team or Enterprise plan — the free plan does not include Claude Code. The first time you run `claude`, it opens a browser to log in.

**3. Install Docker Desktop.** From docker.com. This runs PostgreSQL on your Mac so you have a real database while the hosting decision stays open.

**4. Create the GitHub account and repository.** This is the urgent one — your CRM code still exists only on your Mac. Sign up at github.com, then create a new private repository called `oppllo-one`. Do the same for the existing CRM afterwards.

**5. Make the project folder and start Claude Code in it:**

```
mkdir ~/oppllo-one
cd ~/oppllo-one
claude
```

**6. Save the plan documents into the folder.** Export the Plan, Projects module, HR module, Skills and growth, and Build guide tabs as Markdown, and put them in a `docs/` folder inside `oppllo-one`. Claude Code can then read your actual decisions instead of being told them again each session. This single step improves everything that follows.

**Checklist before moving on:** Node works, `claude --version` prints a number, Docker is running, the private repository exists, and the plan documents are in `docs/`.

## Phase B — The foundation, two or three sessions

**Session 1: the skeleton.** Paste this:

```
Read everything in docs/ first. That is the plan for this system.

Set up a new project with this stack: Next.js with the App Router,
TypeScript in strict mode, PostgreSQL via Drizzle ORM, Tailwind CSS
with shadcn/ui, Zod for validation, Vitest for tests.

Use this folder structure: /app for screens, /components for shared UI,
/services for business rules, /repositories for interfaces only,
/adapters for implementations (postgres, storage, meta, zoho),
/db for schema and migrations, /lib for helpers and types, /tests.

The architecture rule: nothing above the adapter layer may know which
database, storage or API is underneath. Screens call services, services
call repository interfaces, adapters implement them.

Set up docker-compose for a local PostgreSQL. Add npm scripts for dev,
build, test, lint and typecheck. Do not build any feature yet.
```

When it finishes, run `npm run dev` yourself and see the starter page in the browser. Nothing else matters until that works.

**Session 2: CLAUDE.md and the rules.** Paste this:

```
Write a CLAUDE.md at the repository root for this project. Keep it under
one page. Include: what Oppllo One is in three lines, the architecture
rule, the stack and what not to use (no Firestore, no raw SQL outside
adapters, no direct Google Drive calls outside the storage adapter),
naming and folder conventions, how dates, money and IDs are stored, the
error handling pattern, and the commands to run for build, test, lint
and typecheck.

Then add a check that fails if database or storage imports appear
outside the /adapters folder, and wire it into the lint script.
```

That last check is what stops the architecture decaying when you are busy.

**Session 3: the data model.** Paste this:

```
From docs/, build the database schema for the nine core objects: client,
engagement, project, task, person, time entry, asset, deliverable, event.
Write it as Drizzle schema plus a numbered migration file.

Before writing anything, ask me the questions you need answered about
how these relate and what each field should hold. Do not guess.
```

Answer its questions carefully. This is the most valuable half hour in the project — the questions it asks will surface decisions you have not made yet, and fixing them now is free.

**Then commit and push to GitHub.** From this point, commit after every working piece.

## Phase C — First slice and the deploy test, week 1

**Session 4: one slice through all four layers.** This is the pattern every future feature copies, so review it properly.

```
Build one complete vertical slice: a screen that lists clients.

Go through all four layers: a postgres adapter, a repository interface,
a service, and the screen. Include the loading state, the empty state
and the error state. Add tests for the service.

Use plan mode first and show me the plan before writing code.
```

Read the plan before approving it. Then when the code is done:

```
Now review this slice with a subagent, with fresh eyes. Check it against
the architecture rule in CLAUDE.md and tell me anything that would make
the next twenty features harder.
```

**Session 5: login and roles.**

```
Add Google sign-in using a standard auth library, not Firebase Auth.
Add the role system from docs/: owner, strategist, performance marketer,
social media, designer, video editor, BDO, HR, accountant, intern.

Permissions must be enforced in the service layer, not only hidden in
the UI. Add tests proving an intern cannot read client contact details.
```

**Session 6: the design system.** Before building more screens, settle the look once.

```
Set up the design system: colour tokens, type scale, spacing, border
radius, and the standard loading, empty, error and success states as
reusable components. Write the rules into CLAUDE.md so every future
screen follows them. Show me the client list restyled with it.
```

Give it screenshots of interfaces you like. Iterate here until you are happy — this is the one place where going back and forth pays for itself across every screen later.

**Session 7: the throwaway deploy.** One day, and it de-risks the whole hosting question.

```
Deploy the current app to Vercel with a Neon PostgreSQL database, as a
test. Walk me through each step I need to do myself. Then tell me what
would be different if we used Cloudflare or a plain server instead.
```

Do it again with a second option if you want a real comparison. Then throw both away. You now know what deployment actually involves, and the decision at the end of the month will be informed rather than guessed.

## Phase D — Building the modules, weeks 2 to 10

Order matters here. HR slice 1 comes first because it is small, independent of the hosting decision, and if it goes wrong nobody loses client work. Projects is the bigger and riskier build, and it goes better once the team has already used the system for something small and liked it.

| Week | What to build | Why this order |
| --- | --- | --- |
| 2 | HR slice 1: people records, leave types and quotas, apply and approve, leave calendar, holiday list, self-service page | Small, safe, removes the loudest daily pain |
| 3 | Put HR in front of the team. Fix what annoys them | Real use teaches more than more building |
| 4–5 | Projects slice 1: clients, engagements, projects, tasks, My Day, Board | The ClickUp replacement proper |
| 6 | Projects slice 2: time logging, retainer burn, Week capacity view, client page | The features ClickUp never had |
| 7 | HR slice 2: attendance, documents, joining and exit checklists, access register |  |
| 8 | Projects slice 3: assets, creative approval, content calendar, Drive storage adapter |  |
| 9 | Dashboard, Meta ad results on the client page | Needs the other data to exist first |
| 10 | AI assistant and the Oppllo MCP | Needs everything else to be real |
| Later | HR slice 3, intern engine, Skills and growth | After the daily system is solid |

**The prompt shape for every slice.** Use this each time, changing only the first line:

```
From docs/, build HR slice 1: people records, leave types with quotas,
apply and approve leave, leave balance, team leave calendar, holiday
list, and the self-service page.

Follow the pattern of the client list slice exactly — same layer
structure, same design system, same error handling.

Use plan mode first. Ask me any business-rule questions before you
start: what happens when leave is cancelled, how balances work across
a year boundary, who can approve what.

Include tests for the balance calculation.
```

Then, every time, the same three closing steps: run it yourself in the browser, have a subagent review the diff against CLAUDE.md, and commit.

**One rule for this phase:** finish a slice before starting the next. A half-built feature left for a week is worse than no feature, because you will have forgotten the context and so will the next session.

## Phase E — Getting the team onto it

The build is the easy half. Getting ten people to change habits is the hard half, and it is where most internal systems quietly die.

**Decide hosting at the end of week 5**, once Projects slice 1 works. You will have deployed twice by then and will know what you are choosing between. Do not let this slip past week 6.

**Then, in order:**

1. **Deploy properly** on the chosen host, with the real domain, backups on, Sentry connected, and daily database backups verified by restoring one.
2. **Put your own data in.** Your 8 clients, your 10 people, real engagements. Not test data — the system has to be true before anyone trusts it.
3. **Use it yourself alone for a week.** Every annoyance you find is one the team would have found, and you fixing it first is worth more than any training.
4. **Bring in two people**, probably the strategist and the HR person. Leave on the system, not WhatsApp. Watch where they get stuck and fix those things before anyone else sees it.
5. **Train the whole team in 15 minutes.** If it needs more, the system is too complicated and the fix is in the system, not the training.
6. **Export ClickUp first**, then move two calm clients across, then the rest. Set ClickUp read-only for a month before cancelling.
7. **Watch one signal above all:** is anyone still opening ClickUp or asking for leave on WhatsApp? If yes, something in your system is slower or more confusing than the old way. Fix that before building anything new.

## Every session, and when things go wrong

**The six steps, every time:** explore, plan (read the plan), build one slice, verify yourself in the browser, subagent review, commit.

**Rules worth keeping:**

- One feature per session. Start fresh for the next.
- Correct the moment it drifts. Never let a wrong direction continue "to see where it goes".
- Make it ask you questions before building anything with business rules.
- Never accept code you have not run yourself.
- Commit every working piece. Push to GitHub daily.
- Update CLAUDE.md whenever you correct the same thing twice. A repeated correction means a missing rule.

**When something goes wrong:**

| Problem | What to do |
| --- | --- |
| Output is drifting from what you wanted | Stop, rewind to the last checkpoint, restate the goal more specifically |
| It keeps breaking the same thing | The rule is missing from CLAUDE.md. Add it rather than repeating yourself |
| A screen feels wrong but you cannot say why | Screenshot it and say what you expected instead. Pictures beat adjectives |
| A change feels unexpectedly hard | Ask why, and whether a boundary is in the wrong place. Do not solve it with an exception |
| The session is confused or slow | It has too much context. Finish, commit, start a new one |
| You are unsure whether something is right | Ask a subagent to review it against the plan documents |

**The honest failure mode to watch for:** not bad code, but building for three months and never putting it in front of anyone. The schedule above puts something real in the team's hands in week 3 for exactly that reason. If you find yourself in week 6 with nobody using anything, stop building and ship whatever works.
