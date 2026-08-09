/**
 * The LLM adapter interface — the "switch anytime" seam.
 *
 * The brain talks to THIS, never to Groq/Claude/anyone directly. Each provider
 * is a small module that implements `LlmProvider`. Swapping providers means
 * writing one new adapter and changing a setting — the brain is untouched.
 *
 * This is the same loose-coupling idea we used for WhatsApp (ADR 0003): hide the
 * vendor behind our own interface so the vendor becomes a cheap thing to change.
 */

/** A single chat message, in the shape every major LLM API understands. */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompleteOptions {
  /** Ask the provider to return strict JSON (used for structured decisions). */
  json?: boolean;
}

export interface LlmProvider {
  /** Send messages, get back the assistant's text reply. */
  complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<string>;
}
