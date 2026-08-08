/**
 * WhatsApp Agent — Worker entry point.
 *
 * This is the ONE door into our backend. Cloudflare hands every incoming HTTP
 * request to `fetch()` below. Right now it does nothing but prove the skeleton
 * is alive — no WhatsApp, no Claude, no leads yet. Those arrive in later steps.
 *
 * Mental model: this file is the "engine's front desk". Everything a message
 * goes through (routing to the right business, the brain, lead capture) will be
 * wired in here step by step.
 */
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // A trivial health check so we (and Cloudflare) can confirm the Worker is
    // up. Visiting the deployed URL should return this line.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("whatsapp-agent — alive", {
        headers: { "content-type": "text/plain" },
      });
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
