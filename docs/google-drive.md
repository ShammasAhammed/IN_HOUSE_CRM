# Keeping files in Google Drive (optional)

Oppllo One keeps uploaded files (HR documents now, creatives in Stage 7) in its own database until you switch this on.
Switching is safe at any time: new files go to Drive, older ones keep opening from the database.

Nobody needs Drive access to open a file: people open documents from Oppllo One, which checks who they are, logs the
view and streams the file. Drive is where the files live and where you can browse them as an admin.

You need a Google Workspace plan with shared drives (Business Standard or above; check Admin console → Apps → Google
Workspace → Drive and Docs → Sharing settings → Shared drive creation). About 20 minutes.

## 1. A service account (Google Cloud console, the same project as the sign-in client)
1. **You:** console.cloud.google.com → pick the Oppllo One project → APIs & Services → Library → "Google Drive API" →
   Enable.
2. **You:** IAM & Admin → Service accounts → Create service account. Name: `oppllo-one-files`. No roles needed. Done.
3. **You:** open it → Keys → Add key → Create new key → JSON. A file downloads. Keep it private; it is a password.
   If your organisation blocks key creation, an admin can allow it for this project (policy
   `iam.disableServiceAccountKeyCreation`).

## 2. A shared drive and folder
1. **You:** drive.google.com → Shared drives → New → `Oppllo One files`.
2. **You:** Manage members → add the service account's email (it ends in `iam.gserviceaccount.com`, also in the JSON
   as `client_email`) as **Content manager**. Turn off "Notify people".
3. **You:** inside the shared drive, make a folder `Oppllo One`, open it, and copy the id at the end of the address:
   `drive.google.com/drive/folders/<this part>`.

## 3. Tell Oppllo One (host environment variables, then redeploy)
- `FILE_STORAGE` = `google_drive`
- `GOOGLE_DRIVE_CLIENT_EMAIL` = `client_email` from the JSON file
- `GOOGLE_DRIVE_PRIVATE_KEY` = `private_key` from the JSON file, exactly as it appears there (one line with `\n`s)
- `GOOGLE_DRIVE_FOLDER_ID` = the folder id from step 2.3

## 4. Check it
Upload a document to your own locker (People → you → Documents → Upload), then open it. In Drive you should see
`Oppllo One/people/<your id>/` with the file. If the upload fails, the error names what Google refused: usually the
service account isn't a member of the shared drive, or the folder id is wrong.

## Good to know
- Removing a document in Oppllo One moves the Drive file to the shared drive's trash (kept 30 days).
- Folders are by person (`people/<id>`) and, from Stage 7, by client (`clients/<id>`).
- Files already in the database stay there and keep working. Moving them to Drive is a later, one-off task.

## A folder for each client (optional)

New clients get their own Drive folder, linked from the client page. This works whether or not files are kept in Drive.

1. **You:** in the shared drive, make a folder called "Clients" and copy its id from the address bar (the part after
   `/folders/`). The service account above must be a member of the shared drive (Content manager).
2. **You:** in Vercel → Settings → Environment Variables add `GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`
   (as above) and `GOOGLE_DRIVE_CLIENTS_FOLDER_ID` = that id. Redeploy.
3. Check: add a client; its page shows "Open in Google Drive". Older clients get a "Make the Drive folder" button.
   A folder with the client's name already there is reused, never doubled.

## Client sheets and Google files (Stage 13.0, optional)

Clients and spaces have a "Files & sheets" page: paste a media plan, workbook, calendar, clarity sheet, doc or slides
link. Google stays the editor. With the service account above, Oppllo One also reads them (tab names, who changed them,
values for the AI, the MCP, reports and the media-plan summary). Without it, links still open as usual.

1. **You:** console.cloud.google.com → the same project as the service account above → APIs & Services → Library →
   "Google Sheets API" → Enable. (The Drive API from step 1 is also needed; Docs and Slides are read through it.)
2. **You:** in Vercel set `GOOGLE_DRIVE_CLIENT_EMAIL` and `GOOGLE_DRIVE_PRIVATE_KEY` (as in step 3 above; no folder
   needed for this part). Redeploy.
3. **For each file:** Share → add the service account's email as **Viewer** (turn off "Notify people"). Files in the
   shared drive above are already shared. The Files & sheets page shows the address with a copy button whenever a file
   isn't shared yet.
4. **Write-back (optional, off by default):** the owner or a strategist turns it on per sheet. Oppllo One then fills only
   a tab called "Oppllo data" with the monthly results (month, leads, spend, cost per lead, calls, admissions). For that
   sheet, share the service account as **Editor** instead of Viewer. No other tab is ever written.

Good to know: values are kept for 15 minutes, so a change in Google shows within that time ("Check with Google" reads
again now). The editor inside Oppllo One only shows for someone signed in to Google with access to the file in that
browser; "Open in Google" always works.
