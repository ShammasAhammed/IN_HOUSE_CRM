# Meta ad results on client pages (about 15 minutes, once)

With this, each client's page shows its Meta ads for this month, the last 7 or 30 days, or last month: spend, leads,
cost per lead, click rate, each campaign, and spend per day. Ask and Claude can quote the same numbers, for example in
the weekly WhatsApp update. Only the owner, strategists and performance marketers see them.

## 1. A token that can read the clients' ad accounts
1. business.facebook.com → **Settings → Users → System users**. Use the system user you already have for the CRM, or
   **Add** one named `oppllo-one` with the **Admin** role.
2. **Assign assets → Ad accounts**: tick every client ad account Oppllo manages, with **View performance**.
   (Client accounts must be shared with your Business Manager, as they are for running their ads.)
3. **Generate new token**. Pick your app; tick **ads_read** (plus the lead permissions if you use this token for leads
   too); set the expiry to **Never**. Copy the token.
4. Vercel → oppllo-one → **Settings → Environment Variables** → add `META_ADS_TOKEN` = the token (Production,
   Sensitive), then redeploy. If you already set `META_ACCESS_TOKEN` and it has `ads_read`, you can skip this; it's used
   when `META_ADS_TOKEN` is empty.

## 2. Link each client
On the client's page, in the **Meta ads** card, paste the ad account id. It's the number after `act_` in the Ads
Manager address, or under the account name in Ads Manager's account menu. Press **Link**.

The numbers are fetched from Meta when someone opens the page and reused for 3 hours. **Refresh** fetches them again.

## How the numbers are counted
- Meta's own date ranges in the ad account's time zone, and Meta's default attribution (what Ads Manager shows).
- Leads: Meta's combined "Leads" count (lead forms, website and messaging), counted once.
- Reach is for the whole period. It is never added up across days or campaigns.
- Money is in the ad account's currency.
