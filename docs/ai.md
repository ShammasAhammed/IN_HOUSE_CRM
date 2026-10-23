# Switching on the AI: about 10 minutes per provider, once

The AI answers questions about clients, projects, tasks, hours and the team, writes drafts and reports, and helps in
chat. Each person only gets answers from what they could already open themselves. It can use three providers:
**Claude** (Anthropic), **ChatGPT** (OpenAI) and **Gemini** (Google). One key is enough to start; each extra key gives
the router a cheaper or better model for some jobs, and Malayalam needs Gemini or ChatGPT (Claude is never used for
Malayalam). You pay each provider directly. Oppllo One stops asking once the one monthly limit you set in
**Settings → AI** is reached (₹2,000 until you change it), whichever providers were used.

## 1. Create an Anthropic account and key
1. Open https://console.anthropic.com and sign up with the Oppllo Google account. If it asks, choose
   **Organization** and name it "Oppllo Digital".
2. **Settings → Billing**: add a card and buy credits. Start with **$25** (about ₹2,200). Leave **auto-reload off**:
   when the credit runs out, the assistant stops. Nothing is charged beyond what you bought.
3. **Settings → Limits**: set the **monthly spend limit** to the same $25. This is a second safety net, on
   Anthropic's side.
4. **Settings → API keys → Create key**. Name it `oppllo-one`, workspace **Default**. Copy the key, which starts
   with `sk-ant-`. It is shown only once; treat it like a password, and don't paste it into chats or emails.

## 2. Give it to Oppllo One (Vercel)
1. Open https://vercel.com → project **oppllo-one** → **Settings → Environment Variables**.
2. **Add new**: Key `ANTHROPIC_API_KEY`, Value: the key, Environments: **Production** (and Preview if you use it).
   Mark it **Sensitive**. **Save**.
3. **Deployments** → the top one → **⋯ → Redeploy**. Wait until it says Ready (about 2 minutes).

Optional, in the same place: `AI_INR_PER_USD`, the rupee rate used for the spending figures. The default is 90.
Which model does which job is set in **Settings → AI**, not here.

## 2b. ChatGPT (OpenAI), optional
1. Open https://platform.openai.com and sign in with the Oppllo Google account; create an organisation "Oppllo Digital".
2. **Billing**: add a card and buy **$10** of credit; leave auto-recharge off. Set a monthly **usage limit** of $10.
3. **API keys → Create new secret key**, named `oppllo-one`. Copy it (it starts with `sk-`); it is shown only once.
4. In Vercel, add `OPENAI_API_KEY` with that key (Production, Sensitive), then redeploy as in step 2.
OpenAI doesn't train on what is sent through its paid API.

## 2c. Gemini (Google), optional
1. Open https://aistudio.google.com with the Oppllo Google account and choose **Get API key → Create API key**, in a
   new Google Cloud project named "Oppllo One".
2. Switch on **billing** for that project (the paid tier). This matters: on the free tier Google may use what is
   sent to improve its products, so Oppllo One must only ever use a key on a project with billing on.
3. In Google Cloud, set a **budget** of ₹1,000 a month with an email alert.
4. In Vercel, add `GEMINI_API_KEY` with that key (Production, Sensitive), then redeploy.

## 2d. The decision helper (TypeSafe Jev), optional
Jev answers small questions cheaply: how hard a question is (so an easy one uses a cheaper model) and whether a new
lead looks hot, warm or cold. Without it, Claude Haiku answers the same questions. Jev is in early access:
1. Ask for access at https://docs.typesafe.ai and create an API key.
2. In Vercel, add `TYPESAFE_API_KEY` with that key (Production, Sensitive), then redeploy.
Phone numbers and emails are never sent to it.

## 3. Check it
1. Open **Settings → AI**. It should say **Switched on**, with the providers, and each provider you added shows
   **Connected** under "Which model does what".
2. Open **Ask** in the menu and ask "Which clients are over their hours this month?"
3. Back in **Settings → AI**, the question appears with what it cost (usually ₹2–₹20).

If **Ask** says "The AI key isn't working", the key was pasted with a space or was deleted in the Anthropic console.
Make a new one, then repeat step 2.

## Good to know
- **Data.** Questions and the records the AI looks up are sent to the provider that answers (Anthropic, OpenAI or
  Google). None of them trains on paid API data. Oppllo One keeps only what each question cost, not the question itself.
- **Safety.** If Claude's safety checks decline a question, Anthropic retries it on a fallback model it chooses
  (`fallbacks: "default"`), so ordinary work questions aren't blocked by an over-cautious check. A declined
  question shows as "Declined" in the usage list.
- **Limits.** The whole team shares the monthly limit, and each person can ask up to 40 questions a day.
  Setting the limit to ₹0 switches the assistant off until you raise it.
- **AI in chat.** In any chat, typing @AI gets an answer posted there for everyone to read, so it only uses what
  *everyone* in that chat can see (in a chat with an intern, only the conversation itself). Catch me up and Suggest
  tasks are shown only to the person who asks, and a suggested task is created only when someone approves it.
  It counts against the same limit. Switch it off in **Settings → AI → AI in chat**.

## Which model does what (Settings → AI)
- **Levels.** Each job has a level: *Fast* (catch-up, summaries, the morning summary), *Standard* (captions, briefs,
  scripts, suggested tasks) or *Best* (Ask, @AI answers, monthly reports). Each level tries its cheapest connected
  model first: Fast GPT-5 nano → Claude Haiku → Gemini Flash-Lite; Standard GPT-5 mini → Gemini Flash → Claude Sonnet;
  Best Claude Opus → Gemini Pro → GPT-5.5. You can reorder each list with the arrows.
- **When a model fails** (an outage, a refusal, an empty or badly shaped answer) the next one tries. Every try is in
  the usage list ("after … didn't answer") and counts against the limit.
- **Per job** you can pick a model to try first, or tick "only this one" to lock the job to it.
- **Malayalam** goes to Gemini or ChatGPT, in the order you choose, never Claude. With neither connected, the AI says
  that Malayalam needs one of them.
- **Ask and @AI look things up**, and Gemini can't do that in Oppllo One yet, so those jobs skip it.
- **Personal data.** Each provider has "May receive personal data", on by default (all three paid APIs don't train
  on it). Turn it off and jobs with names, phones, chats or client details skip that provider.
- **Compare models side by side**: run the same examples (the Malayalam starter set, recent tasks, or your own) on two
  or three models, read the answers with their cost, and press "Use first for …" on the one you like.
- **Lead hints.** New leads get a quiet "AI: Warm · 6/10" (and "looks like junk" when it seems so) on the Leads list
  and the lead page, for the sales team. It never changes the lead. Both helper uses can be turned off here.
