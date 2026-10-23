# Oppllo One

Oppllo Digital's internal work system. Rules for contributors (and Claude Code): `CLAUDE.md`.
Progress and decisions: `BUILD-PLAN.md`. The plan itself: `plan/`.

## Run it on your Mac

```
cd one
cp .env.example .env.local      # once
npm install                     # once
npm run db:up                   # starts PostgreSQL in Docker
npm run db:migrate              # creates the tables
npm run db:seed                 # fills them with realistic test data
npm run dev                     # open http://localhost:3000
```

With `AUTH_DEV_LOGIN=1` in `.env.local` the sign-in page lets you pick any seeded person, so you can
see the app as an intern, a designer or the owner without Google.

`npm run check` runs lint, typecheck, tests and a production build — everything must pass before a commit.

## The daily job

Once a day the host calls `/api/jobs/daily` (scheduled in `vercel.json`, just after midnight IST). It closes last
month's retainer periods, opens this month's, and makes recurring tasks two weeks ahead. It needs `CRON_SECRET` in the
environment. To run it by hand locally:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/daily
```

## Moving off ClickUp

Settings → Import from ClickUp (owner only). Export everything from ClickUp as CSV first and keep the file: only
clients and open tasks come across. Pick the file, check how folders, lists, statuses and people map, then import.
Importing the same file again adds nothing twice.
