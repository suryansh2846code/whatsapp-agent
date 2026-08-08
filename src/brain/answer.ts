import type { BusinessConfig } from "../config/types";
import type { LlmProvider } from "../llm/types";

/**
 * The BRAIN — grounded answering.
 *
 * Takes a parent's message + a business's config, and returns a reply that is
 * grounded ONLY in that business's `knowledge`. This function is
 * provider-agnostic: it depends on the `LlmProvider` interface, not on Groq.
 *
 * The safety of v1 lives almost entirely in `buildSystemPrompt` below — the
 * rules that stop the bot inventing fees, timings, or promises.
 */
export async function answerQuestion(
  llm: LlmProvider,
  business: BusinessConfig,
  userMessage: string,
): Promise<string> {
  const system = buildSystemPrompt(business);
  return llm.complete([
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ]);
}

/**
 * Build the instructions that turn a generic model into THIS business's
 * assistant. The `knowledge` sheet is injected as the only source of truth.
 */
function buildSystemPrompt(business: BusinessConfig): string {
  const preferredLanguage = business.languages[0] ?? "English";

  return `
You are a warm, helpful WhatsApp assistant for ${business.displayName}.
You reply to parents/customers who message on WhatsApp.

FACTS — the ONLY source of truth you may use:
"""
${business.knowledge}
"""

RULES (follow strictly):
1. Answer ONLY using the FACTS above. Never invent or guess fees, timings,
   dates, availability, policies, or any detail that is not written there.
2. If the answer is not clearly in the FACTS, do NOT make one up. Instead reply
   with exactly this message:
   "${business.fallbackMessage}"
3. Keep replies short and friendly, suitable for WhatsApp — usually 1 to 4
   sentences. No long paragraphs.
4. Reply in the language the person used. If unsure, use ${preferredLanguage}.
   You are comfortable in: ${business.languages.join(", ")}.
5. Never claim to be a human. Never promise anything not supported by the FACTS.
`.trim();
}
