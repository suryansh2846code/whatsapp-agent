/**
 * WhatsApp Agent — Worker entry point.
 *
 * This is the ONE door into our backend. Cloudflare hands every incoming HTTP
 * request to `fetch()` below. It routes to a health check, a test-only debug
 * endpoint (for trying the brain without WhatsApp), and — in a later step — the
 * real WhatsApp webhook.
 */
import type { Env } from "./env";
import {
  getBusinessById,
  getBusinessByPhoneNumberId,
  getBusinessByOwnerEmail,
  upsertBusiness,
} from "./businesses/store";
import { renderDashboardPage } from "./dashboard/html";
import {
  listLeads,
  updateLead,
  listBookings,
  updateBooking,
  LEAD_STATUSES,
  BOOKING_STATUSES,
} from "./crm/queries";
import { createLlmProvider } from "./llm";
import { answerQuestion } from "./brain/answer";
import { runConversationTurn } from "./memory/conversation";
import { createLeadStore } from "./leads";
import { createBookingStore } from "./bookings";
import { createWhatsAppClient, parseIncomingMessages, verifyMetaSignature } from "./whatsapp";
import type { IncomingMessage } from "./whatsapp";
import { transcribeAudio } from "./voice/transcribe";
import { sendBookingAlert } from "./alerts/email";
import { buildAuthUrl, exchangeCodeForEmail } from "./auth/google";
import { upsertAccount } from "./auth/accounts";
import {
  createSession,
  readSession,
  destroySession,
  sessionCookie,
  clearSessionCookie,
  stateCookie,
  clearStateCookie,
  getStateCookie,
} from "./auth/session";
import type { Session } from "./auth/session";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check — confirms the Worker is up.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("whatsapp-agent — alive", {
        headers: { "content-type": "text/plain" },
      });
    }

    // --- Dashboard auth (Google sign-in) ---
    if (url.pathname === "/auth/login") {
      const state = crypto.randomUUID();
      const authUrl = buildAuthUrl(env.GOOGLE_OAUTH_CLIENT_ID, `${url.origin}/auth/callback`, state);
      const secure = url.protocol === "https:";
      // Stash the state in a cookie (CSRF) and send them to Google.
      return new Response(null, {
        status: 302,
        headers: { location: authUrl, "set-cookie": stateCookie(state, secure) },
      });
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const cookieState = getStateCookie(request);
      const secure = url.protocol === "https:";
      if (!code || !state || !cookieState || state !== cookieState) {
        return new Response("Invalid or expired login. Please try again.", { status: 400 });
      }
      const result = await exchangeCodeForEmail(env, code, `${url.origin}/auth/callback`);
      if (!result || !result.emailVerified) {
        return new Response("Login failed.", { status: 400 });
      }
      const business = await getBusinessByOwnerEmail(env, result.email);
      if (!business) {
        return new Response("No account for this email — contact us to get set up.", { status: 403 });
      }
      const email = result.email.toLowerCase();
      await upsertAccount(env.DB, email, business.id);
      const sid = await createSession(env, email, business.id);
      // Set the session cookie and clear the one-time state cookie.
      const headers = new Headers({ location: "/dashboard" });
      headers.append("set-cookie", sessionCookie(sid, secure));
      headers.append("set-cookie", clearStateCookie(secure));
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/auth/logout") {
      await destroySession(env, request);
      const secure = url.protocol === "https:";
      return new Response(null, {
        status: 302,
        headers: { location: "/auth/login", "set-cookie": clearSessionCookie(secure) },
      });
    }

    // Dashboard (the CRM UI). Requires a session.
    if (url.pathname === "/dashboard") {
      const session = await readSession(env, request);
      if (!session) {
        return new Response(null, { status: 302, headers: { location: "/auth/login" } });
      }
      const business = await getBusinessById(env, session.businessId);
      return new Response(renderDashboardPage(business?.displayName ?? "Dashboard", session.email), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // CRM API — all endpoints require a session and are scoped to its business.
    if (url.pathname.startsWith("/api/")) {
      const session = await readSession(env, request);
      if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
      return handleApi(url, request, env, session);
    }

    // WhatsApp webhook VERIFICATION (Meta calls this once, with a GET, when you
    // register the URL). We echo back `hub.challenge` only if the token matches.
    if (request.method === "GET" && url.pathname === "/webhook") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("verification failed", { status: 403 });
    }

    // WhatsApp INBOUND messages arrive here as POSTs.
    if (request.method === "POST" && url.pathname === "/webhook") {
      // Read the RAW body first — the signature is computed over these exact
      // bytes, so we must not re-serialise before verifying.
      const rawBody = await request.text();
      const signature = request.headers.get("x-hub-signature-256");
      const valid = await verifyMetaSignature(env.WHATSAPP_APP_SECRET, rawBody, signature);
      if (!valid) {
        return new Response("invalid signature", { status: 401 });
      }

      let body: unknown = null;
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
      const messages = parseIncomingMessages(body);
      // Fast-ack: return 200 immediately so Meta doesn't retry, and do the real
      // work (brain → reply → lead) in the background via waitUntil.
      ctx.waitUntil(processMessages(messages, env));
      return new Response("ok", { status: 200 });
    }

    // Test-only: try the brain with a fake message, no WhatsApp needed.
    // Guarded so it's never exposed in production.
    //   curl -X POST localhost:8787/debug/ask \
    //     -H 'content-type: application/json' \
    //     -d '{"phoneNumberId":"PLACEHOLDER_PHONE_NUMBER_ID","message":"what are your fees?"}'
    if (request.method === "POST" && url.pathname === "/debug/ask") {
      if (env.ENABLE_DEBUG_ROUTES !== "true") {
        return new Response("debug routes disabled", { status: 403 });
      }
      return handleDebugAsk(request, env);
    }

    // Test-only: try saving a lead to the business's Google Sheet, no WhatsApp.
    //   curl -X POST localhost:8787/debug/lead \
    //     -H 'content-type: application/json' \
    //     -d '{"phoneNumberId":"PLACEHOLDER_PHONE_NUMBER_ID","phone":"+919999999999","message":"interested in nursery"}'
    if (request.method === "POST" && url.pathname === "/debug/lead") {
      if (env.ENABLE_DEBUG_ROUTES !== "true") {
        return new Response("debug routes disabled", { status: 403 });
      }
      return handleDebugLead(request, env);
    }

    // Test-only: run the question-vs-visit decision (and record a booking if
    // one is extracted), no WhatsApp needed.
    //   curl -X POST localhost:8787/debug/decide \
    //     -H 'content-type: application/json' \
    //     -d '{"phoneNumberId":"1306957939157417","phone":"+910000000042","message":"can I visit this Saturday at 11am?"}'
    if (request.method === "POST" && url.pathname === "/debug/decide") {
      if (env.ENABLE_DEBUG_ROUTES !== "true") {
        return new Response("debug routes disabled", { status: 403 });
      }
      return handleDebugDecide(request, env);
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * The live loop: for each inbound message, route to its business, answer with
 * the grounded brain, reply on WhatsApp, and save the lead. Runs in the
 * background (after we've already 200'd the webhook).
 *
 * Each message is wrapped in try/catch so one failure can't sink the others.
 */
async function processMessages(messages: IncomingMessage[], env: Env): Promise<void> {
  if (messages.length === 0) return;

  const llm = createLlmProvider(env);
  const whatsapp = createWhatsAppClient(env);

  for (const msg of messages) {
    try {
      const business = await getBusinessByPhoneNumberId(env, msg.businessPhoneNumberId);
      if (!business) {
        // A message to a number we don't manage — ignore it.
        console.warn(`No business for phoneNumberId ${msg.businessPhoneNumberId}`);
        continue;
      }

      // Voice note? Download + transcribe it, then treat it as normal text.
      let text = msg.text;
      if (!text && msg.audioId) {
        const media = await whatsapp.getMedia(msg.audioId);
        text = await transcribeAudio(env, media.data, media.mimeType);
        console.log(`voice transcript from ${msg.from}: ${text}`);
      }
      if (!text) continue; // nothing usable (e.g. empty transcription)

      // Decide: answer a question, or capture a visit request — with memory of
      // the recent conversation (so multi-message bookings work). `business` is
      // already the effective record (D1 override else config).
      const decision = await runConversationTurn(
        env.CONVERSATIONS,
        llm,
        business,
        msg.from,
        text,
      );

      // If it was a visit request with a resolved date+time, record it (deduped
      // by phone). Save BEFORE replying so we can soften the reply when nothing
      // changed (e.g. a follow-up "ok thanks" — don't re-confirm or duplicate).
      let replyText = decision.reply;
      let newBooking: { name?: string; requestedTime: string } | null = null;
      if (decision.booking) {
        const bookings = createBookingStore(env, business);
        const bResult = await bookings.save({
          timestamp: new Date().toISOString(),
          business: business.displayName,
          name: decision.booking.name ?? msg.senderName,
          phone: msg.from,
          requestedTime: decision.booking.requestedTime,
          message: text,
        });
        console.log(`booking ${bResult}: ${msg.from} -> ${decision.booking.requestedTime}`);
        if (bResult === "unchanged") {
          replyText =
            `You're all set for ${decision.booking.requestedTime} — ` +
            `our team will call to confirm.`;
        } else {
          // created or updated → worth alerting the owner
          newBooking = {
            name: decision.booking.name ?? msg.senderName,
            requestedTime: decision.booking.requestedTime,
          };
        }
      }

      await whatsapp.sendText(msg.businessPhoneNumberId, msg.from, replyText);

      // Every message is also a lead (deduped by phone).
      const store = createLeadStore(env, business);
      const result = await store.save({
        timestamp: new Date().toISOString(),
        business: business.displayName,
        name: msg.senderName,
        phone: msg.from,
        message: text,
      });
      console.log(`lead ${result}: ${msg.from} (${business.displayName})`);

      // Alert the owner about a new/updated booking (non-fatal if it fails).
      if (newBooking) {
        try {
          await sendBookingAlert(env, business, {
            name: newBooking.name,
            phone: msg.from,
            requestedTime: newBooking.requestedTime,
            message: text,
          });
          console.log(`owner alert sent for ${business.displayName}`);
        } catch (e) {
          console.error("owner alert failed:", e);
        }
      }
    } catch (err) {
      console.error("failed to process message:", err);
    }
  }
}

/** CRM API — always scoped to the logged-in owner's business. */
async function handleApi(
  url: URL,
  request: Request,
  env: Env,
  session: Session,
): Promise<Response> {
  const path = url.pathname;
  const bid = session.businessId;

  if (request.method === "GET" && path === "/api/leads") {
    return Response.json({ leads: await listLeads(env.DB, bid) });
  }
  if (request.method === "GET" && path === "/api/bookings") {
    return Response.json({ bookings: await listBookings(env.DB, bid) });
  }

  if (path === "/api/settings") {
    const business = await getBusinessById(env, bid);
    if (!business) return Response.json({ error: "unknown business" }, { status: 404 });
    if (request.method === "GET") {
      return Response.json({
        knowledge: business.knowledge,
        fallbackMessage: business.fallbackMessage,
      });
    }
    if (request.method === "PATCH") {
      const body = (await request.json().catch(() => ({}))) as {
        knowledge?: string;
        fallbackMessage?: string;
      };
      // Upsert the whole business row (promotes a config business into D1).
      await upsertBusiness(env, {
        ...business,
        knowledge: typeof body.knowledge === "string" ? body.knowledge : business.knowledge,
        fallbackMessage:
          typeof body.fallbackMessage === "string" ? body.fallbackMessage : business.fallbackMessage,
      });
      return Response.json({ ok: true });
    }
  }

  const leadMatch = path.match(/^\/api\/leads\/(\d+)$/);
  if (request.method === "PATCH" && leadMatch) {
    const id = Number(leadMatch[1]);
    const body = (await request.json().catch(() => ({}))) as { status?: string; notes?: string };
    const fields: { status?: string; notes?: string } = {};
    if (typeof body.status === "string") {
      if (!(LEAD_STATUSES as readonly string[]).includes(body.status)) {
        return Response.json({ error: "invalid status" }, { status: 400 });
      }
      fields.status = body.status;
    }
    if (typeof body.notes === "string") fields.notes = body.notes;
    const ok = await updateLead(env.DB, bid, id, fields);
    return Response.json({ ok });
  }

  const bookingMatch = path.match(/^\/api\/bookings\/(\d+)$/);
  if (request.method === "PATCH" && bookingMatch) {
    const id = Number(bookingMatch[1]);
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    if (typeof body.status !== "string" || !(BOOKING_STATUSES as readonly string[]).includes(body.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    const ok = await updateBooking(env.DB, bid, id, body.status);
    return Response.json({ ok });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

async function handleDebugAsk(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      phoneNumberId?: string;
      message?: string;
    };

    const business = await getBusinessByPhoneNumberId(env, body.phoneNumberId ?? "");
    if (!business) {
      return Response.json(
        { error: `No business found for phoneNumberId "${body.phoneNumberId ?? ""}"` },
        { status: 404 },
      );
    }
    if (!body.message) {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const llm = createLlmProvider(env);
    const answer = await answerQuestion(llm, business, body.message);
    return Response.json({ business: business.displayName, answer });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}

async function handleDebugLead(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      phoneNumberId?: string;
      phone?: string;
      name?: string;
      message?: string;
    };

    const business = await getBusinessByPhoneNumberId(env, body.phoneNumberId ?? "");
    if (!business) {
      return Response.json(
        { error: `No business found for phoneNumberId "${body.phoneNumberId ?? ""}"` },
        { status: 404 },
      );
    }
    if (!body.phone || !body.message) {
      return Response.json({ error: "phone and message are required" }, { status: 400 });
    }

    const store = createLeadStore(env, business);
    const result = await store.save({
      timestamp: new Date().toISOString(),
      business: business.displayName,
      name: body.name,
      phone: body.phone,
      message: body.message,
    });
    return Response.json({ result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}

async function handleDebugDecide(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      phoneNumberId?: string;
      phone?: string;
      message?: string;
    };

    const business = await getBusinessByPhoneNumberId(env, body.phoneNumberId ?? "");
    if (!business) {
      return Response.json(
        { error: `No business found for phoneNumberId "${body.phoneNumberId ?? ""}"` },
        { status: 404 },
      );
    }
    if (!body.message) {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const llm = createLlmProvider(env);
    const phone = body.phone ?? "+910000000000";
    const decision = await runConversationTurn(env.CONVERSATIONS, llm, business, phone, body.message);

    let bookingResult: string | null = null;
    let alertSent = false;
    if (decision.booking) {
      const bookings = createBookingStore(env, business);
      bookingResult = await bookings.save({
        timestamp: new Date().toISOString(),
        business: business.displayName,
        name: decision.booking.name,
        phone,
        requestedTime: decision.booking.requestedTime,
        message: body.message,
      });
      if (bookingResult === "created" || bookingResult === "updated") {
        await sendBookingAlert(env, business, {
          name: decision.booking.name,
          phone,
          requestedTime: decision.booking.requestedTime,
          message: body.message,
        });
        alertSent = true;
      }
    }

    return Response.json({ reply: decision.reply, booking: decision.booking, bookingResult, alertSent });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
