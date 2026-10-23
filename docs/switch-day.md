# Switch day: sales moves from the CRM to Oppllo One (about 1 hour)

Pick a quiet evening. Tell the sales team the day before: "From tomorrow morning, leads are in Oppllo One → Sales."
Nothing in the old CRM is deleted. If anything goes wrong, sales can keep working in the CRM while it's fixed.

## Before the day (any time)
1. Everyone in sales has an Oppllo One login (People → Add person) with the **same email** they use in the CRM.
   Give the BDO role to anyone who works leads.
2. Press **Sales → Copy from the CRM now**. It should say **"All N leads are here."** If it lists unmatched CRM
   users, add them as people with that email and press again.
3. Look through **Sales → Today, Leads, Pipeline and Dashboard**. The numbers should match the CRM's.
4. Add the keys from `docs/lead-intake.md` step 1 in Vercel and redeploy. **Sales → Lead sources** should show
   **Set up** for Meta and Google.

## On the evening
1. Point the lead sources at Oppllo One, following `docs/lead-intake.md` steps 2–5: the Meta webhook, Google lead
   forms, landing pages and Google's conversion import. Send one test lead from each and check it appears in
   **Sales → Leads**. From now on new leads arrive here directly.
2. Ask the team to stop changing leads in the CRM.
3. **Sales → Copy from the CRM now** one last time. Check it says "All N leads are here."
4. **Sales → Lead sources → Switch Sales to Oppllo One**, then confirm. From now on:
   - the BDO and you change stages, owners, follow-ups and notes, edit details and add new leads here;
   - stage changes are reported to Meta and Google, as the CRM did;
   - the morning copy from the CRM keeps running but only adds leads that still reach the CRM (from a source someone
     forgot to repoint). It never changes a lead in Oppllo One.
5. Tell the team: "Sales is in Oppllo One now." Keep the CRM open for a week, for looking things up only.
6. Next morning, check **Sales → Lead sources**. If a red message says a lead couldn't be saved, the Meta token needs
   renewing (lead-intake.md step 1).

## After a week
If nothing is missing, tell me and I'll make the old CRM read-only. That's a change to the CRM app, so I'll only make
it once you say so. Its data stays where it is as a backup.
