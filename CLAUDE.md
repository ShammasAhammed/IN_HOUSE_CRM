# Oppllo One

Internal work system for Oppllo Digital (admissions-growth agency for education businesses):
Projects (replaces ClickUp), HR and, later, dashboards, AI and an MCP — one login, one database.
The live CRM in `../crm` is a separate Firebase app; never change it from here.
Plan: `plan/` (3–6 are current and win over 1; 2 is the feature list; 7 is the owner's checklist).
Progress, decisions and next task: `BUILD-PLAN.md`. Update it after every task.
Integration how-tos (Drive, Meta, Zoho, MCP, portal, backups, deploy): `docs/`.
Next.js is 16 and differs from older versions: read `node_modules/next/dist/docs/` before using a Next API (see `AGENTS.md`).

## Stack — do not deviate
TypeScript strict · Next.js App Router · PostgreSQL + Drizzle (migrations = numbered SQL in `db/migrations`) ·
Tailwind + shadcn/ui (components in `components/ui`) · Zod (shared by forms and services) ·
Auth.js Google sign-in, JWT sessions · Vitest. Local DB: `docker compose up -d` (or any Postgres 16).
Never Firestore, never Firebase Auth.

## Architecture rule (most important)
Nothing above `adapters/` knows which database, storage or API is underneath.
`app/` screens → `services/` business rules → `repositories/` interfaces → `adapters/` implementations.
- `app/` and `components/` call services only via `lib/server/container.ts`; never SQL, never `db/`.
- `services/` take repositories as arguments; no `next/*`, no adapters, no db. Pure rules live in `services/rules/`.
- Only `adapters/` and `db/` may import drizzle, postgres, googleapis or any storage/API client.
  `lib/server/container.ts` is the only file outside them that imports `adapters/`. `npm run lint` enforces this.
- Swapping Postgres, or Drive for R2, = one new adapter + one line in the container.

## Never
Firestore/Firebase Auth · db or storage clients outside `adapters/` · Drive/Meta/Zoho calls outside their adapter ·
secrets in code (use `.env.local`, document in `.env.example`) · full Aadhaar or bank numbers (last four only) ·
hard deletes (set `deleted_at` and write an event) · permission checks only in the UI.

## Conventions
- Timestamps `timestamptz` UTC; calendar days are `date` in Asia/Kolkata. Format only via `lib/format.ts`.
- Money: integer paise (`*_paise`). Durations: integer minutes (`*_minutes`). Never floats.
- IDs: UUID v7 from `lib/id.ts`, generated in the app.
- Files: DB stores a pointer (provider, location, file id). Storage interface: upload, getLink, delete, list.
- Services return `Result<T>` (`lib/result.ts`); never throw for expected failures. Each error has a
  human `message`. Unexpected errors go through `lib/server/report-error.ts` (Sentry later).
- Every service call starts from an `Actor`; permission check first (`services/permissions.ts`).
- Every state change goes through `commit()` (`services/change.ts`): writes plus at least one Event, one transaction.
- Every screen ships loading, empty and error states (`components/states.tsx`).
- Names: files kebab-case, types PascalCase, DB snake_case, enums as text unions in `lib/types.ts`.
- Tests: pure rules in `tests/unit`, services against real Postgres in `tests/integration`.
- Adapters: Drizzle leaves columns unqualified in single-table selects, so a correlated subquery there compares a
  column with itself. Use joins, and test with at least two parents so a wrong sum shows.
- Speed on My Day and the Board beats any extra feature. Server components, one query per list, no waterfalls.

## Commands
`npm run dev` · `npm run build` · `npm test` · `npm run lint` · `npm run typecheck` ·
`npm run check` (all of them — must pass before every commit) · `npm run db:migrate` · `npm run db:seed` ·
`npm run db:generate` (new migration after a schema change) · `npm run db:up` (Postgres in Docker) ·
`npm run db:reset` (wipe, migrate, seed) · `npm run test:unit` (no DB needed).
`AUTH_DEV_LOGIN=1` in `.env.local` lets you sign in as any seeded person without Google. There is no Prettier setup: never run `prettier --write`
(it rewraps everything at 80 columns); match the surrounding code by hand.

## Design system (see it all at `/design`)
- Tokens live only in `app/globals.css`; use token classes (`bg-card`, `text-muted-foreground`, `bg-success-soft`).
  No hex values or Tailwind palette colours (`bg-purple-600`) in components. Dark mode follows the system.
- Purple (`primary`) marks only what matters: the main action, the active page, selected filters, key numbers.
- Status = text + soft background pairs via `Badge` tones: success, warning, danger, info, neutral, brand.
- Type: body `text-sm`; page title `text-xl font-semibold`; section `text-sm font-semibold`; meta `text-xs
  text-muted-foreground`. Numbers get `tabular`. Spacing on a 4px grid; cards `p-4`, table rows `py-2.5`.
- Radius: controls `rounded-md`, cards and tables `rounded-lg`, people round (`Avatar`), clients square.
- Reuse before creating: `components/ui/*` (shadcn), `states.tsx` (LoadingRows, EmptyState, ErrorState,
  SuccessNotice), `PageHeader`, `BurnMeter`, `Avatar`. Icons: lucide-react at `size-4`.
- Every data block: `<Suspense fallback={<LoadingRows/>}>`, then `ErrorState` when not ok, `EmptyState` when empty.
- Phones (390px): My Day, approvals, check-in and the client page must work well; tables become cards below `md`.
