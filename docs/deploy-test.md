# Throwaway deploy test (Build guide, challenge 4)

Goal: put the current app on one real host for a day, learn what deployment involves, then delete it.
Nothing here is the final hosting decision. Steps marked **You** need your login or card; Claude does the rest.

## 1. Google sign-in client (needed for any real deploy)
1. **You:** open https://console.cloud.google.com → create a project "Oppllo One" (or use an existing one).
2. **You:** APIs & Services → OAuth consent screen → Internal if Oppllo uses Google Workspace, otherwise External
   with your team's emails as test users.
3. **You:** Credentials → Create credentials → OAuth client ID → Web application.
   Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google` and, after step 3,
   `https://<your-vercel-url>/api/auth/callback/google`.
4. **You:** copy the client ID and secret into `.env.local` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
   Never paste them into chat or code.

## 2. Database: Neon (free tier, Singapore region is closest to Kerala)
1. **You:** sign up at https://neon.tech, create a project, region `aws-ap-southeast-1`.
2. **You:** copy the connection string (it starts with `postgres://`, ends with `sslmode=require`).
3. Claude runs migrations and a seed against it: `DATABASE_URL=<neon url> npm run db:migrate`.
   (The seed refuses non-local databases on purpose; for the test, sign in with a person you add by hand.)

## 3. Host: Vercel (free Hobby plan)
1. **You:** sign up at https://vercel.com with GitHub and import the `oppllo-admissions` repository.
2. Root directory: `one`. Framework: Next.js (detected).
3. **You:** environment variables: `DATABASE_URL`, `AUTH_SECRET` (any long random string), `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `CRON_SECRET` (another long random string; Vercel sends it to the daily job). Do NOT set
   `AUTH_DEV_LOGIN`.
4. Deploy. Add the Vercel URL's callback to the Google client (step 1.3).

## What to note while testing
- Cold start: how long the first page takes after 10 minutes idle.
- Mumbai vs Singapore latency: Neon has no Mumbai region; check the client list loads in under a second.
- Anything that worked locally and not there (time zone, env vars, file sizes).

## What would be different elsewhere
- **Cloudflare (Workers + Hyperdrive or D1):** cheapest at scale, but Next.js runs through an adapter and
  PostgreSQL needs Hyperdrive; more moving parts.
- **A plain server (Hetzner / DigitalOcean Bangalore, ~₹500–1,000/month):** Mumbai/Bangalore region, Postgres
  on the same box, no cold starts; you own backups and updates (Claude can script both).
- **Supabase:** Mumbai region Postgres with built-in backups; pair it with Vercel or a server for the app.

When done: delete the Vercel project and the Neon project. Record what you learned in BUILD-PLAN.md.
