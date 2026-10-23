# Build guide

Oct 14, 2026 · @ahammed shammas p

How to start building Oppllo One with Claude Code before the database and hosting decision is made — what is safe to build now, what it costs to defer, and how to work so the result is fast to produce, clean to change, and does not rot.

## Verdict: yes, with one condition

You can build roughly 85 percent of Oppllo One without choosing a database or a host. The condition is that the decision must be deferred *deliberately* rather than simply postponed. Deliberately means the code is written so that the choice plugs in at the end. Postponed means the code quietly assumes something, and by the time you decide, the assumption is everywhere.

What can be built now, fully:

| Buildable now | Why it is safe |
| --- | --- |
| Every screen and the whole UI | Screens talk to functions, not to a database |
| All business rules — retainer burn, leave balances, capacity, scoring | Pure logic over data shapes |
| The data model itself | Tables and relationships are the same on Postgres, MySQL or Firestore |
| Permissions and roles | Enforced in your own code |
| Automations and the event flow | Triggered by events, not by a specific database's features |
| Files and storage | Already designed as a switchable interface |
| AI assistant and MCP | Reads through your own data layer |
| Tests | Run against an in-memory store, no database needed |

What genuinely waits: production deployment, real performance tuning, backup configuration, custom domain, and the final database migration scripts. None of those are development work; they are a day of setup once the choice is made.

For development in the meantime, run PostgreSQL locally on your Mac through Docker, or even SQLite. Your laptop is the host until you pick one. Nothing about that is throwaway work.

The trade-off, stated plainly: this approach costs perhaps 10 to 15 percent more effort than committing to Firebase today and writing directly against it. You pay that to keep the ability to change your mind. Given that you have said twice you want that ability, it is the right trade — but it is a real cost, not a free lunch.

## The stack and the architecture rule

**Stack.** Boring, widely used, well understood by Claude Code, and portable:

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript everywhere | One language front and back; types catch errors before running |
| Framework | Next.js (App Router) | Runs on Vercel, Cloudflare, a VPS or a container — host stays open |
| Database | PostgreSQL | Runs on Supabase, Neon, Cloudflare's database layer, or any server. Moving is an export and import |
| Database access | Drizzle ORM | Type-safe queries, migrations as plain SQL files, no vendor lock |
| UI | Tailwind CSS with shadcn/ui components | Components live in your repo, so you own and restyle them |
| Auth | Google sign-in through a standard auth library | Not tied to Firebase Auth |
| Files | Your storage interface, Drive driver first | Already decided |
| Validation | Zod schemas shared by forms and API | One definition of what valid data is |
| Tests | Vitest, plus Playwright for a few critical paths | Fast, standard |

Avoid Firestore specifically. Not because it is bad, but because its query model exists nowhere else — code written against it cannot move without a rewrite, which is exactly the freedom you are trying to keep.

**The architecture rule, which matters more than the stack.** Four layers, and dependencies only ever point downwards:

```
UI (screens, components)
   ↓ calls
Services (business rules: retainer burn, leave balance, scoring)
   ↓ calls
Repositories (interfaces: findClientById, saveTask)
   ↓ implemented by
Adapters (Postgres driver, Drive driver, Meta API driver)
```

The rule in one line: **nothing above the adapter layer may know which database, storage or API is underneath.** A screen never writes SQL. A business rule never calls Google Drive. They call an interface, and an adapter fulfils it.

This is what makes deferring possible. Swapping Postgres for something else means writing one new adapter. Swapping Drive for R2 means writing one new adapter. Nothing else in the codebase changes, because nothing else knows.

The same rule is what lets a new module be added in 2027 without touching the old ones, which is the other thing you have asked for repeatedly.

## The challenges of deferring

Six real ones. Each has a specific handling, and none is a reason not to proceed.

**1. Extra layers slow early progress.** Writing an interface and an adapter takes longer than calling the database directly. Expect the first week to feel slower than it would otherwise. It pays back the first time something changes — and something always changes.

**2. The abstraction leaks under pressure.** Three weeks in, something will be easier to do with one raw query in a screen. That single shortcut is how lock-in starts. Handling: a written rule in the repository that Claude Code reads on every session, and a check that fails if database imports appear outside the adapter folder. Make it mechanical, not a matter of discipline.

**3. Performance problems hide until real data arrives.** Your laptop with 50 test records tells you nothing about 8 clients and two years of tasks. Handling: seed the development database with realistic volume early — a few thousand tasks, hundreds of files — and watch the slow screens from the start.

**4. The real deployment surfaces new problems.** Environment variables, file size limits, cold starts, time zones. These appear only on the real host. Handling: deploy a throwaway version of just the login screen to one candidate host in week two. One day of work that de-risks the whole decision, and may even make it for you.

**5. You delay a decision that gets harder, not easier.** The longer you wait, the more there is to move. Handling: set a deadline. Decide the host once Projects slice 1 works end to end — roughly a month. Not after everything is built.

**6. Costs stay unknown.** You cannot budget a system whose host is undecided. Handling: the stack above lands between roughly ₹500 and ₹2,500 a month for your size on any of the realistic options, which is inside your stated budget whichever you pick. So this is a real unknown, but not a dangerous one.

The one thing that would genuinely go wrong is building for three months and only then thinking about deployment. The two-week throwaway deploy is the protection against that, and it is worth the day it costs.

## Set the repository up before writing any feature

This is the highest-value half-day in the whole project. Claude Code's output quality depends mostly on what it reads at the start of every session.

**CLAUDE.md at the repository root.** This file loads automatically into every session. It should be short and specific — a page, not an essay — and contain only things Claude cannot work out by reading the code:

- What Oppllo One is, in three lines
- The architecture rule, stated as a rule: nothing above the adapter layer knows the database
- The stack, and what not to use
- Project conventions: naming, folder structure, error handling, how dates and money are stored
- The commands to run: build, test, lint, typecheck
- What to never do: no raw SQL in screens, no secrets in code, no direct Drive calls outside the adapter

As the project grows, split rules by area using `.claude/rules/`, including path-specific rules so the file about UI conventions loads when working on UI and not otherwise.

**Verification Claude can run itself.** This matters more than any instruction. Claude Code works far better when it can check its own work, so before building features, make sure these exist and pass: `npm run typecheck`, `npm run lint`, `npm run test`, and a build. Then Claude writes, runs them, sees failures, and fixes them without you being the error-checker.

**Git from the first commit.** Your code is still only on your Mac — fix that before anything else. A private GitHub repository, committed after every working slice. This is also what makes Claude Code safe to use aggressively: anything it breaks is one revert away.

**Useful extras, in order of payoff:**

- **Plan mode** before any non-trivial feature, so you see the approach before code is written
- **Subagents** for investigation and for an adversarial review step — one agent writes, a separate one reviews with fresh eyes
- **Skills** for the repeated procedures of this project: "add a new module", "add a new adapter", "add a screen with permissions". Write each once, then every future module follows the same shape
- **Hooks** to run the formatter after each edit and block edits to protected files
- **Checkpoints** so a bad direction can be rewound rather than argued with

**The structure to ask for on day one**, before any feature:

```
/app          screens and routes
/components   shared UI
/services     business rules
/repositories interfaces only
/adapters     postgres/, storage/, meta/, zoho/
/db           schema and migrations
/lib          shared helpers, types, validation
/tests
```

Ask Claude Code to build this skeleton with one tiny vertical slice through all four layers — one screen that lists clients from the database. Get that working and reviewed before anything else. That one slice becomes the pattern every other feature copies.

## The loop that keeps it fast and clean

Speed with Claude Code does not come from typing bigger requests. It comes from short cycles that each end in something verified.

**The cycle, for every feature:**

1. **Explore** — ask Claude to read the relevant existing code and explain how it will fit. No code yet.
2. **Plan** — use plan mode. Read the plan. This is the cheapest place to catch a wrong approach; correcting a plan takes a minute, correcting built code takes an hour.
3. **Build one vertical slice** — adapter, repository, service, screen. Not "all the repositories", then "all the screens". One thin slice that works end to end.
4. **Verify** — typecheck, lint, tests, and open the screen yourself.
5. **Review** — a separate subagent reviews the diff with fresh eyes, specifically against the architecture rule.
6. **Commit** — small, working, described.

**Habits that make the difference:**

- **Correct early.** The moment output drifts from what you wanted, stop and redirect. Letting it continue and fixing later costs far more.
- **One feature per session.** Long sessions accumulate context and confusion. Finish a slice, start fresh.
- **Give examples, not adjectives.** "Like the client page, but for projects" beats "make it good".
- **Make Claude ask you.** For anything with business rules, ask it to interview you first: what happens when a retainer period ends mid-month, what if leave is approved then cancelled. Those questions surface decisions you have not made, and finding them before the code is written is worth hours.
- **Delegate investigation.** "Why is the capacity view slow" goes to a subagent, so the main session keeps its context for building.
- **Work in parallel carefully.** Separate worktrees let two features be built at once without colliding — useful once you are comfortable, confusing before that.

**What slows people down most**, in order: unclear requirements, so the same screen is built three times; sessions that run too long; skipping the review step and finding the problem a week later; and building wide instead of deep, so nothing is usable for a month.

**A realistic pace**, given you are also running the agency: the skeleton and first slice in a few days, then roughly one usable slice a week. HR slice 1 in about a week. Projects slice 1 in two to three weeks. That is far faster than hiring a developer, and the limiting factor will be your review time, not Claude's build time.

## Good UI, and a foundation that holds

**Getting good UI out of Claude Code.** The common failure is asking for screens one at a time and ending up with ten screens that look like ten different products. Decide the system once, then every screen inherits it.

- Settle the design system before the second screen: colours, type scale, spacing, border radius, shadows, and the standard states — loading, empty, error, success. Write it into CLAUDE.md so it is reread every session.
- Use a component library you own in the repo (shadcn/ui), so Claude restyles components rather than inventing new ones each time.
- Build the empty and loading states at the same time as the real state. Screens that only look right with data are the usual cause of an application feeling unfinished.
- Show Claude pictures. Screenshots of interfaces you like, or of your current ClickUp screens, communicate far more than description.
- Give the three screens people live in — My Day, the client page, the board — several rounds of refinement each. The other twenty screens only need to be clear.
- Mobile matters for My Day, approvals and check-in, and almost nothing else. Say that explicitly so effort is not spread evenly.

**A foundation that does not break.** Five things, in order of how much trouble they prevent:

1. **TypeScript in strict mode, with validation at every edge.** A Zod schema for each input, shared between the form and the API. Most runtime errors become impossible rather than caught.
2. **Tests where the money is.** Not everywhere — on the rules that would hurt if wrong: retainer burn, leave balances, capacity, permissions, score calculation. Ask Claude to write the test alongside the rule.
3. **One way to handle errors.** Every failure returns a typed result rather than throwing randomly; every screen shows a human message; every unexpected error reaches Sentry with enough context to debug. Decide this once, in CLAUDE.md.
4. **Migrations from day one.** Every schema change is a numbered SQL file, applied in order, never an ad-hoc edit. This is what lets the database move hosts later without drama.
5. **An audit log and soft deletes.** Nothing is truly deleted; everything records who changed what. In a system holding HR records and client data, this is both a safety net and a legal protection.

**And the rule that keeps it clean over years:** when a change feels hard, the structure is telling you something. Stop and ask Claude to explain why it is hard, and whether the boundary is in the wrong place. The codebases that rot are the ones where that question is never asked, and every hard change is solved by adding one more exception.
