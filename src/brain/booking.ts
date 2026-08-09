import type { BusinessConfig } from "../config/types";
import type { LlmProvider } from "../llm/types";

/**
 * The BRAIN, walk-v1: decide between answering a question and capturing a visit
 * request, in ONE structured LLM call (ADR 0012).
 *
 * This is the lightweight form of "tool calling": the model returns a small JSON
 * decision (intent + extracted fields), and WE turn that into the reply + an
 * optional booking. Commitment wording (the confirmation) is templated in code,
 * so the bot says "request noted, team will confirm" — never over-promises.
 */

export interface Decision {
  /** The message to send back to the parent. */
  reply: string;
  /** A visit to record, or null (question, or visit with no time given yet). */
  booking: { requestedTime: string; name?: string } | null;
}

export async function decideAndRespond(
  llm: LlmProvider,
  business: BusinessConfig,
  userMessage: string,
): Promise<Decision> {
  const raw = await llm.complete(
    [
      { role: "system", content: buildSystemPrompt(business) },
      { role: "user", content: userMessage },
    ],
    { json: true },
  );

  const parsed = safeParseObject(raw);
  const intent = parsed.intent === "visit" ? "visit" : "question";
  const name = asText(parsed.name);

  if (intent === "visit") {
    const when = asText(parsed.visit_time);
    if (when) {
      const who = name ? ` ${name}` : "";
      return {
        reply:
          `Thanks${who}! I've noted your visit request for ${when}. ` +
          `Someone from ${business.displayName} will call you to confirm.`,
        booking: { requestedTime: when, name: name || undefined },
      };
    }
    // Visit intent but no time yet — ask for one (nothing recorded).
    return {
      reply:
        `I'd be happy to arrange a visit to ${business.displayName}. ` +
        `What day and time works best for you?`,
      booking: null,
    };
  }

  // Question — use the grounded answer, or the fallback if the model gave none.
  const answer = asText(parsed.answer);
  return { reply: answer || business.fallbackMessage, booking: null };
}

function buildSystemPrompt(business: BusinessConfig): string {
  const preferredLanguage = business.languages[0] ?? "English";

  return `
You are a warm, helpful WhatsApp assistant for ${business.displayName}.

Decide whether the person's message is a QUESTION or a VISIT request, then reply.
A VISIT request = they want to come see / tour / visit (e.g. "can I visit",
"I'd like to come see the school", "can I come Saturday at 11").

FACTS — the ONLY source of truth for answering questions:
"""
${business.knowledge}
"""

Respond with a SINGLE JSON object and nothing else, with exactly these fields:
{
  "intent": "question" | "visit",
  "answer": string,     // if intent=question: a short answer using ONLY the FACTS. If the answer isn't in the FACTS, use exactly this text: "${business.fallbackMessage}". Empty string if intent=visit.
  "visit_time": string, // if intent=visit AND they gave a day/time: that text (e.g. "Saturday 11am"). Empty string otherwise.
  "name": string        // the person's name if they mention it, else empty string.
}

Rules:
- Answer questions ONLY from the FACTS. Never invent fees, timings, or dates.
- Keep "answer" short and friendly (1-3 sentences), suitable for WhatsApp.
- Reply in the language the person used; prefer ${preferredLanguage}.
- Output ONLY the JSON object — no extra text, no code fences.
`.trim();
}

/** Parse the model's JSON, salvaging a `{...}` blob if it added stray text. */
function safeParseObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    const blob = match?.[0];
    if (blob) {
      try {
        return JSON.parse(blob) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}

/** Coerce an unknown JSON field to a trimmed string ("" if absent/non-string). */
function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
