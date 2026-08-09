/**
 * Env — what Cloudflare injects into the Worker at runtime.
 *
 * Secrets (API keys) and settings live here, NOT in code. Locally they come
 * from a `.dev.vars` file (git-ignored); in production from
 * `wrangler secret put <NAME>`. See `.dev.vars.example` for the list.
 */
export interface Env {
  /** API key for the LLM host. Required. (For Groq: from console.groq.com.) */
  GROQ_API_KEY: string;

  /**
   * Which LLM provider to use, e.g. "groq". Optional; defaults to "groq".
   * This is the "switch anytime" knob — change it (and add an adapter) to move
   * to a different provider without touching the brain.
   */
  LLM_PROVIDER?: string;

  /**
   * The model name to ask the provider for, e.g. "llama-3.3-70b-versatile".
   * Kept as a setting because hosts rename/retire models over time.
   */
  LLM_MODEL?: string;

  /**
   * Speech-to-text model for voice notes (Groq Whisper). Optional; defaults to
   * "whisper-large-v3". Uses GROQ_API_KEY.
   */
  STT_MODEL?: string;

  /**
   * Google service account credentials — shared across ALL clients. The agency
   * owns one "robot" Google account; each client's sheet is shared with this
   * email. Used to write leads to Google Sheets.
   */
  GOOGLE_CLIENT_EMAIL: string;
  /** The service account's private key (PEM). Newlines stored escaped as \n. */
  GOOGLE_PRIVATE_KEY: string;

  /**
   * A random string WE choose. Meta echoes it back when verifying the webhook;
   * we check it matches. Proves the webhook subscription is really ours.
   */
  WHATSAPP_VERIFY_TOKEN: string;
  /** Meta Graph API access token, used to SEND replies. Shared across clients. */
  WHATSAPP_TOKEN: string;
  /**
   * The Meta app secret. Used to verify the X-Hub-Signature-256 on inbound
   * webhooks, proving they really came from Meta. Without a valid signature we
   * reject the request.
   */
  WHATSAPP_APP_SECRET: string;
  /** Graph API version, e.g. "v21.0". Optional; defaults in the adapter. */
  GRAPH_API_VERSION?: string;

  /**
   * KV store for per-parent conversation memory (recent messages, with a TTL).
   * This is the "state" a stateless Worker otherwise lacks (see ADR 0013).
   */
  CONVERSATIONS: KVNamespace;

  /** Resend API key for sending owner alert emails on new bookings (ADR 0015). */
  RESEND_API_KEY: string;
  /** From-address for alert emails. Optional; defaults to Resend's test sender. */
  ALERT_FROM_EMAIL?: string;

  /**
   * When "true", enables local test-only routes like POST /debug/ask.
   * Leave unset in production so these aren't exposed.
   */
  ENABLE_DEBUG_ROUTES?: string;
}
