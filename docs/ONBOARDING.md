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
   - Get the Graph API **access token** → store as `WHATSAPP_TOKEN`. (Temporary
     token for testing; a permanent System User token for production.)
   - In the app's WhatsApp → Configuration, set the **Callback URL** to
     `https://<your-worker-url>/webhook` and the **Verify token** to the same
     value as above, then **Verify and Save**. Subscribe to the **messages**
     field.
   - For building/testing, Meta gives a free **test number** you can message from
     your own phone.

4. **Secrets in production** — locally these live in `.dev.vars`; in production
   set them with `wrangler secret put GROQ_API_KEY` (and the Google ones).

---

## Part B — Per-business checklist (repeat per client)

What the client gives you: their **Gmail** and their **WhatsApp number**.

1. **Create their lead sheet**
   - Make a new Google Sheet.
   - Add a header row: `Timestamp | Business | Name | Phone | Message`.
   - **Share it** (Editor) with the service account robot email from Part A.
   - Also **share it** (Viewer) with the **client's Gmail** so they can see their
     leads.
   - Copy the sheet's ID from its URL
     (`.../spreadsheets/d/THIS_IS_THE_ID/edit`).

2. **Write their config** — copy `src/config/businesses/sunshine-preschool.ts`
   to a new file, and edit:
   - `id`, `displayName`
   - `whatsappPhoneNumberId` — the Meta phone number ID for their number
   - `languages`
   - `knowledge` — their real facts (fees, timings, ages, address…). **This is
     ~90% of the work.** Get it reviewed by the client.
   - `fallbackMessage`
   - `leadSheetId` — the sheet ID from step 1

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
