/**
 * WhatsApp Agent — Worker entry point.
 *
 * This is the ONE door into our backend. Cloudflare hands every incoming HTTP
 * request to `fetch()` below. It routes to a health check and test-only debug
 * endpoints (for trying the brain and lead capture without WhatsApp). The real
 * WhatsApp webhook comes in a later step.
 */
import type { Env } from "./env";
import { findBusinessByPhoneNumberId } from "./config";
import { createLlmProvider } from "./llm";
import { answerQuestion } from "./brain/answer";
import { createLeadStore } from "./leads";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check — confirms the Worker is up.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("whatsapp-agent — alive", {
        headers: { "content-type": "text/plain" },
      });
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

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

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
    await store.save({
      timestamp: new Date().toISOString(),
      business: business.displayName,
      name: body.name,
      phone: body.phone,
      message: body.message,
    });
    return Response.json({ saved: true, sheetId: business.leadSheetId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
