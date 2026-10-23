# Backups: choosing where they go

Oppllo One can now back itself up every night. It copies the whole database into one file, reads the file back to check it is whole, keeps 30 days of copies, and shows the result in **Settings → Trust**. All that is missing is the place the copies go. You want that place to be **yours** and **separate from Neon** (the database host), so that losing Neon, or the Neon account, doesn't lose the copies.

Until a place is chosen, Settings → Trust says "Backups: not set up yet". Nothing is copied.

## What is in a backup

- **In it:** every table: clients, projects, tasks, time, leads, HR records, results, reports, consent, the audit trail, and everything else.
- **Not in it:** the *contents* of files uploaded into Oppllo One (photos, PDFs and documents kept in the database). Their names and details are in the backup; the files themselves are not. If you move uploads to Google Drive (already possible), those files live in Drive anyway.
- **Size today:** small (a few megabytes compressed). Even years of growth should stay well under 1 GB.

## The choices to discuss with your expert

Prices are approximate and change; check the provider's page before deciding. At our size, every option costs a few rupees a month or nothing.

| | Cloudflare R2 | Google Drive (your Workspace) | Backblaze B2 | Amazon S3 |
|---|---|---|---|---|
| Cost at our size | Free (first 10 GB free each month) | Included in your Workspace storage | Free (first 10 GB), then about $7 per TB a month | About $0.025 per GB a month, plus fees to download |
| Fees to get data back | None | None | Free up to a generous limit | Yes (per GB downloaded) |
| Built for backups | Yes (object storage) | No: it's a file drive, but it works for one file a day | Yes | Yes, the industry standard |
| "Can't be deleted" lock (protects against a hacked key) | Bucket lock rules | No | Object Lock | Object Lock |
| Where the data sits | Cloudflare chooses (you can ask for a region) | Google chooses | US or EU only | You choose, including Mumbai |
| Setup effort | Small: an account, a bucket, one key | Smallest: we already use a Google service account for Drive | Small | Medium: AWS accounts are more complex |
| Good fit if… | You want simple, free and no download fees | You want everything inside Google, with no new account | You want the cheapest object storage at scale | Your expert prefers AWS or wants data kept in India |

Questions worth asking the expert:

1. Does any rule (DPDP, or a client contract) require the copies to stay **in India**? If yes, S3 Mumbai is the clear choice.
2. Should old copies be **locked so nobody can delete them** for 30 days (protects against ransomware or a leaked key)? If yes, avoid Google Drive.
3. Who should hold the **account login**: you personally (recommended), not a staff member or agency.
4. How often should someone **practise a restore** (for example, once a quarter, into a spare database)?

## After you choose

1. Create the account in **your own name** and a storage place for backups (a "bucket", or a Drive folder for Google).
2. Create a key that can only write to and read from that place. Share it with the developer safely (never on WhatsApp in plain text).
3. The developer adds one small connector file and one line of setup, and the next nightly run copies the database there. Settings → Trust then shows the last good backup, its size and its check.

## Known limits (honest)

- **The nightly job runs on Vercel**, which limits how long one run can take and how much memory it can use. At our size that is far from a problem; if the database ever grows past a few hundred megabytes, the backup should move to a streaming export or the provider's own tools.
- **Restoring is a developer job:** build an empty database from the migrations, then load the file's rows. The file is plain JSON, so any tool can read it, but there is no one-click "restore" button yet.
- **Neon's own history** (point-in-time restore for a short window) still exists and is the fastest way back from a mistake made today. The backups here cover what that doesn't: losing the account, or needing something from weeks ago.
