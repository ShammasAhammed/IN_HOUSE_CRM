# Connecting the prospect CRM (crm.oppllo.com) — about 10 minutes, once

Oppllo One reads the CRM; it never changes it. With this done, every morning:
- leads marked **Won** in the CRM appear under **Clients → Won in the CRM**, ready to set up as a client
  (name, type and the CRM lead id are filled in for you);
- your **Dashboard** shows the pipeline: new, contacted, audit booked, proposal sent, won, lost.

You only create one read-only key. Nothing in the CRM changes.

## 1. Make a read-only key (Google Cloud console, project `oppllo-crm`)
1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=oppllo-crm
   (sign in with the Google account that owns the CRM's Firebase project).
2. **Create service account** → name `oppllo-one-reader` → **Create and continue**.
3. Role: type **Cloud Datastore Viewer** and pick it (read-only) → **Continue** → **Done**.
4. Click the new account → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**.
   A file downloads. Treat it like a password.

## 2. Give it to Oppllo One (host settings, then redeploy)
From the JSON file:
- `CRM_FIREBASE_CLIENT_EMAIL` = `client_email`
- `CRM_FIREBASE_PRIVATE_KEY` = `private_key`, exactly as it appears (one line with `\n`s)
- `CRM_FIREBASE_PROJECT_ID` = `oppllo-crm` (the default; only needed if it differs)

## 3. Check it
Open **Clients → Won in the CRM** and press **Check the CRM now**. Your won leads appear. The Dashboard's
"Sales from the CRM" card shows the pipeline counts.

If it says the CRM couldn't be read: the role in step 1.3 is missing, or the key was pasted without its
`-----BEGIN PRIVATE KEY-----` line.
