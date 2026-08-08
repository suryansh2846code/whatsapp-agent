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
   * Google service account credentials — shared across ALL clients. The agency
   * owns one "robot" Google account; each client's sheet is shared with this
   * email. Used to write leads to Google Sheets.
   */
  GOOGLE_CLIENT_EMAIL: string;
  /** The service account's private key (PEM). Newlines stored escaped as \n. */
  GOOGLE_PRIVATE_KEY: string;

  /**
   * When "true", enables local test-only routes like POST /debug/ask.
   * Leave unset in production so these aren't exposed.
   */
  ENABLE_DEBUG_ROUTES?: string;
}
