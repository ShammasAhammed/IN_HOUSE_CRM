# Share to Oppllo, and Instagram embeds (Stage 13.2)

Save ads, reels and pages worth learning from straight from your phone into a client's swipe file (and onto an Idea
Board if you like). Oppllo One keeps the link, the official embed or your own screenshot. It never downloads other
people's Instagram, Facebook or YouTube videos.

## Android (about 1 minute, once per phone)
1. **You:** open Oppllo One in Chrome → menu (⋮) → **Add to Home screen** → Install.
2. In Instagram, YouTube or Chrome, tap **Share** → **Oppllo One**. (If it isn't in the list, tap "More" once and it
   stays there.)
3. Oppllo One opens: pick the client or space, a board if you like, add a note ("good hook") and tags → **Save**.

If you aren't signed in, Oppllo One asks you to sign in first; share again afterwards.

## iPhone
iPhones don't let web apps appear in the share menu. Two ways:

- **Paste:** in Instagram, tap **Share → Copy link**. Open Oppllo One → **Swipe file** (or `/share`) → paste → Save.
- **A one-time Shortcut** (about 3 minutes):
  1. Open the **Shortcuts** app → **+** (new shortcut) → name it **Share to Oppllo**.
  2. Tap the **ⓘ** at the bottom → turn on **Show in Share Sheet** → under "Receives", choose **URLs** and **Text**.
  3. Add the action **URL Encode** (input: **Shortcut Input**).
  4. Add the action **Text** with: `https://oppllo-one.vercel.app/share?url=` followed by the **URL Encoded Text** variable
     (use your Oppllo One address if it is different).
  5. Add the action **Open URLs** (input: the Text above). Done.
  6. Now in Instagram: **Share → Share to Oppllo**. Safari opens the save screen with the link filled in.

## Instagram and Facebook embeds (optional, for the owner)
Without this, Instagram and Facebook links show a card with the post's address and **Open on Instagram**. With it,
the post itself shows in the card (Meta's official embed, closed off from Oppllo One).

1. **You:** developers.facebook.com → My Apps → the Oppllo app (or create a Business app) → **Add product** →
   **oEmbed Read**. Meta may ask for the app to be live and to describe the use ("show public posts our team saves
   as references to our staff"). It can take a few days.
2. Settings → Advanced → copy the **Client token**; Settings → Basic → copy the **App ID**.
3. In Vercel → Settings → Environment Variables add `META_OEMBED_TOKEN` = `APP_ID|CLIENT_TOKEN` (with the `|`).
   Redeploy. (If the token in `META_ACCESS_TOKEN` already has oEmbed Read, nothing else is needed.)
4. Check: save an Instagram post link; its card shows the post. Previews are kept a day, so a link saved before the
   token was added shows the plain card until then.

## Videos
The team's own videos upload to the swipe file only when files are kept in Google Drive (`FILE_STORAGE=google_drive`,
docs/google-drive.md), and up to 4 MB for now (larger uploads need a direct-to-Drive upload, a later step). Otherwise
save a link to the video (YouTube, Drive or Instagram).

## Safety (for the technical reader)
Link previews are read by Oppllo One's server from public https addresses only: names that resolve to private,
loopback, link-local or cloud-metadata addresses are refused, the connection goes to the address that was checked,
redirects are checked again (three at most), and reads stop after five seconds and 512 KB. No cookies are sent.
Preview pictures are shown from their own site with no referrer.
