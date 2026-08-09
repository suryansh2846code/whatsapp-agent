# Onboarding a business (concierge, v1)

How to add a new client to the agent. The model is **concierge** (ADR 0008): the
business gives you their **Gmail** and **WhatsApp number**; you do the wiring.

There are two parts: a **one-time agency setup** (done once, ever), and a
**per-business checklist** (repeated for each client — this is the "little
changes to replicate" part).

---

## Part A — One-time agency setup (done once)

You only do this the very first time.

1. **Groq key** — create an account at console.groq.com, make an API key. This is
   the LLM for now. (Stored as `GROQ_API_KEY`.)

2. **Google service account** (the "robot" that writes to sheets):
   - In Google Cloud Console, create a project.
   - Enable the **Google Sheets API** for it.
   - Create a **Service Account**; under its Keys, add a **JSON key** and
     download it.
   - From that JSON you need two values: `client_email` and `private_key`.
   - Store them as `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`. The private
     key must be on one line with newlines escaped as `\n` (see `.dev.vars`).
   - Note the robot's email — you'll share every client sheet with it.

3. **WhatsApp (Meta)** — set up a Meta Business account + a WhatsApp app.
   - Pick a random **verify token** (any string) → store as
     `WHATSAPP_VERIFY_TOKEN`.
   - Get the Graph API **access token** → store as `WHATSAPP_TOKEN`.
     ⚠️ The token shown on the API Setup page is **temporary (~24h)** and will
     expire — good only for early testing. For anything real, create a
     **permanent System User token** (see Part C). When a token expires you'll
     see `OAuthException code 190 "Session has expired"` and replies stop.
   - Get the **App Secret** (App Settings → Basic) → store as
     `WHATSAPP_APP_SECRET` (used to verify inbound webhook signatures).
   - In the app's WhatsApp → Configuration, set the **Callback URL** to
     `https://<your-worker-url>/webhook` and the **Verify token** to the same
     value as above, then **Verify and Save**. Under **Webhook fields → Manage**,
     subscribe the **messages** field.
   - **CRITICAL — subscribe your app to the WABA.** Subscribing the `messages`
     *field* is not enough: your app must also be subscribed to the specific
     **WhatsApp Business Account (WABA)**, or Meta shows messages in its "Check
     test webhooks" viewer but never delivers them to your Worker. Subscribe with:
     ```
     curl -X POST \
       "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" \
       -H "Authorization: Bearer <ACCESS_TOKEN>"
     ```
     Expect `{"success":true}`. Verify with the same URL using `GET` — your app
     should appear in the list. (See Troubleshooting.)
   - For building/testing, Meta gives a free **test number** you can message from
     your own phone (added as a verified recipient).

4. **Resend** (owner email alerts) — create an account at resend.com, make an API
   key → store as `RESEND_API_KEY`. In test mode emails only reach your own Resend
   account address; **verify a domain** in Resend to alert arbitrary client
   owners in production.

5. **Secrets in production** — locally these live in `.dev.vars`; in production
   set them with `wrangler secret put <NAME>` (Groq, Google, WhatsApp, Resend).

---

## Part B — Per-business checklist (repeat per client)

What the client gives you: their **Gmail** and their **WhatsApp number**.

1. **Create their sheet (two tabs)**
   - Make a new Google Sheet (one **file** per client).
   - Tab **`Sheet1`** (leads): header row
     `Timestamp | Business | Name | Phone | Message`.
   - Add a second **tab named exactly `Bookings`** (visit requests): header row
     `Timestamp | Business | Name | Phone | Requested time | Message`.
     ⚠️ Tab names are case-sensitive; it must be `Sheet1` and `Bookings`.
   - **Share the file** (Editor) with the service account robot email from Part A.
   - Also **share it** (Viewer) with the **client's Gmail** so they can see their
     leads + bookings.
   - Copy the sheet's ID from its URL
     (`.../spreadsheets/d/THIS_IS_THE_ID/edit`). One ID covers both tabs.

2. **Write their config** — copy `src/config/businesses/sunshine-preschool.ts`
   to a new file, and edit:
   - `id`, `displayName`
   - `whatsappPhoneNumberId` — the Meta phone number ID for their number
   - `languages`
   - `knowledge` — their real facts (fees, timings, ages, address…). **This is
     ~90% of the work.** Get it reviewed by the client.
   - `fallbackMessage`
   - `leadSheetId` — the sheet ID from step 1
   - `ownerEmail` — where booking alerts go (the client owner's email)

3. **Register the tenant** — add the new config to the array in
   `src/config/index.ts`.

4. **Connect their WhatsApp number** to the Meta app. Copy that number's
   **phone number ID** from the Meta dashboard and paste it into the config's
   `whatsappPhoneNumberId` (this is the routing key that maps the number to this
   business).

5. **Deploy** — `npm run deploy`.

6. **Smoke test** — message the number: ask something in the facts (should
   answer), and something not in the facts (should offer a callback, not invent).
   Check a lead row appears in the sheet.

That's it. The recurring work per client is really just **step 2's `knowledge`**
plus creating+sharing a sheet.

---

## Part C — Going live (sandbox → real customers)

While in **Development mode** with Meta's **test number**, the bot only talks to
**allow-listed test recipients** (up to 5). That's a Meta limitation, not a code
bug — perfect for testing, useless for real customers. To reply to *anyone*:

1. **Use a real business phone number** (the client's own WhatsApp number)
   connected to the WABA — not the +1 555 test number. Its **phone number ID**
   goes into the client's config.
2. **Permanent access token.** Create a **System User** in Meta Business Settings,
   give it access to the app/WABA, and generate a **non-expiring token**. Store it
   as `WHATSAPP_TOKEN` (replaces the 24h one). No more expiry surprises.
3. **Publish the app + Business Verification.** Switch the app from Development to
   **Live**, and complete Meta **Business Verification** so the app may message
   the public, not just allow-listed testers.

---

## Troubleshooting

**Messages appear in Meta's "Check test webhooks" viewer but nothing hits your
Worker (empty logs).**
Your app isn't subscribed to the **WABA**. Meta only delivers to apps subscribed
to that WhatsApp Business Account; the "Check test webhooks" panel is Meta's
internal capture, *not* proof of delivery. Fix: `POST /<WABA_ID>/subscribed_apps`
(Part A step 3). This was the single biggest gotcha during the first setup.

**Replies stop; logs show `OAuthException code 190 "Session has expired"`.**
The temporary access token expired (~24h). Regenerate it (or switch to a
permanent System User token — Part C) and update the `WHATSAPP_TOKEN` secret.

**The bot only replies to your own number.**
Expected in Development mode with the test number — it only messages allow-listed
recipients. Add up to 5 test numbers, or go live (Part C).

**How to watch what the Worker is doing live:** `npx wrangler tail --format json`
streams every request and log. If a real message produces **no** `POST /webhook`
here, the problem is Meta delivery (WABA subscription / mode), not our code.
