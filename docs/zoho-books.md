# Zoho Books draft invoices (optional)

The accountant and the owner can make a draft invoice in Zoho Books from a client page (Invoices card). The first
invoice also makes the client's contact in Zoho (with their GSTIN and billing address); later ones reuse it. Every
invoice is a **draft**: check the tax and the item in Zoho, then send it from there. Oppllo One keeps the number,
amount and link, so the client page shows what was billed. The same invoice twice within five minutes is refused.

## Set up (about 15 minutes, owner)

1. **You:** go to https://api-console.zoho.in → Add Client → **Self Client** → Create.
2. **You:** in the Self Client, "Generate Code": scope `ZohoBooks.contacts.CREATE,ZohoBooks.invoices.CREATE`,
   time 10 minutes, description "Oppllo One". Copy the code.
3. **You:** exchange the code for a refresh token (once). In a terminal:
   `curl -X POST "https://accounts.zoho.in/oauth/v2/token?grant_type=authorization_code&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code=CODE"`
   The answer has `refresh_token`. Keep it secret.
4. **You:** Zoho Books → Settings → Organisation profile: copy the **Organisation ID**.
5. **You:** Vercel → Settings → Environment Variables: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`,
   `ZOHO_ORGANIZATION_ID` (and `ZOHO_DC` only if your Zoho is not the India one: `com`, `eu` …). Redeploy.
6. Check: open a client as the owner → Invoices → "Draft an invoice in Zoho" → ₹1, "Test". It opens in Zoho as a
   draft; delete it there.

If Zoho refuses, the message says what Zoho said (for example an expired token: make a new code and refresh token).
