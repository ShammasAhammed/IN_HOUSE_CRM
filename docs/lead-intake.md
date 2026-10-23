# New leads straight into Oppllo One (switch day, about 30 minutes)

Until switch day, new leads still go to the CRM and are copied into Oppllo One every morning. On switch day, each
source is pointed at Oppllo One instead. Do these steps in one sitting, ideally in the evening, so few leads arrive
in between. The full switch-day checklist (sales starting work here, the CRM turning read-only) is a separate guide.

All the addresses below are listed in **Sales → Lead sources**, ready to copy.

## 1. Add the keys in Vercel (once)
Vercel → project **oppllo-one** → **Settings → Environment Variables**. Add each one for **Production**, marked
**Sensitive**, then **Deployments → ⋯ → Redeploy**.

| Name | Where to find it |
|---|---|
| `META_APP_SECRET` | developers.facebook.com → your app → **App settings → Basic → App secret** → Show |
| `META_VERIFY_TOKEN` | Make one up: any long random text, for example from https://www.uuidgenerator.net. You type it into Meta in step 2. |
| `META_ACCESS_TOKEN` | business.facebook.com → **Settings → Users → System users** → your system user → **Generate new token**. Pick your app; tick `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` and `ads_management`. |
| `META_PAGE_ID` | Optional. Your Facebook Page → **About → Page transparency → Page ID**. |
| `GOOGLE_LEAD_WEBHOOK_KEY` | Make one up: any long random text. You type it into Google Ads in step 3. |

After the redeploy, **Sales → Lead sources** shows **Set up** next to Meta and Google.

## 2. Meta lead ads
1. developers.facebook.com → your app → **Webhooks** (or **Use cases → Webhooks**) → object **Page**.
2. **Edit subscription**: Callback URL `https://oppllo-one.vercel.app/api/meta-webhook`; Verify token: the same text
   as `META_VERIFY_TOKEN`. Press **Verify and save**.
3. Make sure the field **leadgen** is subscribed.
4. Test: open https://developers.facebook.com/tools/lead-ads-testing, pick your Page and a form, then press
   **Create lead**. Within a minute it shows under **Sales → Leads** as a Meta lead form lead.

## 3. Google Ads lead forms
For each lead form asset in Google Ads: **Assets → Lead forms → (the form) → Lead delivery → Webhook**.
- Webhook URL: `https://oppllo-one.vercel.app/api/google-lead`
- Key: the same text as `GOOGLE_LEAD_WEBHOOK_KEY`
- Press **Send test data**. The test lead shows under **Sales → Leads**.

## 4. Landing pages
Each landing page keeps its key; only the start of the address changes:
`https://crm.oppllo.com/api/lead/<key>` becomes `https://oppllo-one.vercel.app/api/lead/<key>`.
Change it wherever the form's action or webhook is set (the page's HTML, Elementor → Form → Actions → Webhook,
Framer, and so on). Then send one test entry from each page and check that it appears under **Sales → Leads**.

The spam trap (hidden `_hp` or `_gotcha` fields) and thank-you redirects (`_redirect`) work as before.

## 5. Results back to the ads
What gets reported is in **Sales → Lead sources → Send results to ads**, copied from the CRM. Check it there.
- **Meta:** nothing more to do if `META_ACCESS_TOKEN` is set. To use a separate Conversions API token, add it as
  `META_CAPI_TOKEN`. The dataset (pixel) id is in the form.
- **Google:** in Vercel add `GOOGLE_CONVERSIONS_UPLOAD_KEY` (any long random text) and redeploy. Then in Google Ads go to
  **Goals → Conversions → Uploads → Schedules**, open the existing HTTPS schedule (or make one) and change its address to
  `https://oppllo-one.vercel.app/api/google-conversions?key=<that key>`.
