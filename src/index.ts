/**
 * WhatsApp Agent — Worker entry point.
 *
 * This is the ONE door into our backend. Cloudflare hands every incoming HTTP
 * request to `fetch()` below. It routes to a health check, a test-only debug
 * endpoint (for trying the brain without WhatsApp), and — in a later step — the
 * real WhatsApp webhook.
 */
import type { Env } from "./env";
import { findBusinessByPhoneNumberId } from "./config";
import { createLlmProvider } from "./llm";
import { answerQuestion } from "./brain/answer";
import { decideAndRespond } from "./brain/booking";
import { createLeadStore } from "./leads";
import { createBookingStore } from "./bookings";
import { createWhatsAppClient, parseIncomingMessages, verifyMetaSignature } from "./whatsapp";
import type { IncomingMessage } from "./whatsapp";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check — confirms the Worker is up.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("whatsapp-agent — alive", {
        headers: { "content-type": "text/plain" },
      });
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
      const business = findBusinessByPhoneNumberId(msg.businessPhoneNumberId);
      if (!business) {
        // A message to a number we don't manage — ignore it.
        console.warn(`No business for phoneNumberId ${msg.businessPhoneNumberId}`);
        continue;
      }

      // Decide: answer a question, or capture a visit request.
      const decision = await decideAndRespond(llm, business, msg.text);
      await whatsapp.sendText(msg.businessPhoneNumberId, msg.from, decision.reply);

      // Every message is also a lead (deduped by phone).
      const store = createLeadStore(env, business);
      const result = await store.save({
        timestamp: new Date().toISOString(),
        business: business.displayName,
        name: msg.senderName,
        phone: msg.from,
        message: msg.text,
      });
      console.log(`lead ${result}: ${msg.from} (${business.displayName})`);

      // If it was a visit request with a time, record it.
      if (decision.booking) {
        const bookings = createBookingStore(env, business);
        await bookings.save({
          timestamp: new Date().toISOString(),
          business: business.displayName,
          name: decision.booking.name ?? msg.senderName,
          phone: msg.from,
          requestedTime: decision.booking.requestedTime,
          message: msg.text,
        });
        console.log(`booking requested: ${msg.from} -> ${decision.booking.requestedTime}`);
      }
    } catch (err) {
      console.error("failed to process message:", err);
    }
  }
}

async function handleDebugAsk(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      phoneNumberId?: string;
      message?: string;
    };

    const business = findBusinessByPhoneNumberId(body.phoneNumberId ?? "");
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

    const business = findBusinessByPhoneNumberId(body.phoneNumberId ?? "");
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
    return Response.json({ result, sheetId: business.leadSheetId });
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

    const business = findBusinessByPhoneNumberId(body.phoneNumberId ?? "");
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
    const decision = await decideAndRespond(llm, business, body.message);

    let bookingSaved = false;
    if (decision.booking) {
      const bookings = createBookingStore(env, business);
      await bookings.save({
        timestamp: new Date().toISOString(),
        business: business.displayName,
        name: decision.booking.name,
        phone: body.phone ?? "+910000000000",
        requestedTime: decision.booking.requestedTime,
        message: body.message,
      });
      bookingSaved = true;
    }

    return Response.json({ reply: decision.reply, booking: decision.booking, bookingSaved });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
