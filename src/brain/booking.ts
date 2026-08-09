import type { BusinessConfig } from "../config/types";
import type { LlmProvider, LlmMessage } from "../llm/types";

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
  history: LlmMessage[] = [],
): Promise<Decision> {
  const raw = await llm.complete(
    [
      { role: "system", content: buildSystemPrompt(business) },
      // Recent conversation so the model has context — e.g. it can tell that
      // "Saturday" answers its own earlier "what day and time?" question.
      ...history,
      { role: "user", content: userMessage },
    ],
    { json: true },
  );

  const parsed = safeParseObject(raw);
  const intent = parsed.intent === "visit" ? "visit" : "question";
  const name = asText(parsed.name);

  if (intent === "visit") {
    const date = asText(parsed.visit_date);
    const time = asText(parsed.visit_time);
    if (date && time) {
      const when = `${date} at ${time}`;
      const who = name ? ` ${name}` : "";
      return {
        reply:
          `Thanks${who}! I've noted your visit request for ${when}. ` +
          `Someone from ${business.displayName} will call you to confirm.`,
        booking: { requestedTime: when, name: name || undefined },
      };
    }
    // Missing a piece — ask specifically for what's missing (nothing recorded).
    const reply = date
      ? `Great — what time on ${date} works for you?`
      : `I'd be happy to arrange a visit to ${business.displayName}. ` +
        `What day and time works best for you?`;
    return { reply, booking: null };
  }

  // Question — use the grounded answer, or the fallback if the model gave none.
  const answer = asText(parsed.answer);
  return { reply: answer || business.fallbackMessage, booking: null };
}

function buildSystemPrompt(business: BusinessConfig): string {
  const preferredLanguage = business.languages[0] ?? "English";
  const today = istTodayString();

  return `
You are a warm, helpful WhatsApp assistant for ${business.displayName}.
Today is ${today} (timezone: India / IST).

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
  "answer": string,      // if intent=question: a short answer using ONLY the FACTS. If not in the FACTS, use exactly: "${business.fallbackMessage}". Empty string if intent=visit.
  "visit_date": string,  // if intent=visit AND a day is given: resolve it to an ABSOLUTE date using today's date above (e.g. "Saturday, 16 August 2026"). Empty string if no day is given.
  "visit_time": string,  // if intent=visit AND a time is given: that time (e.g. "11:00 AM"). Empty string if no time is given.
  "name": string         // the person's name if they mention it, else empty string.
}

Rules:
- Resolve relative days ("today", "tomorrow", "this Saturday", "next Sunday") to
  a real calendar date using today's date above.
- Only fill visit_date / visit_time from what the person has actually said. A
  plain acknowledgement like "ok" or "thanks" is NOT a new visit request.
- Answer questions ONLY from the FACTS. Never invent fees, timings, or dates.
- Keep "answer" short and friendly (1-3 sentences), suitable for WhatsApp.
- Reply in the language the person used; prefer ${preferredLanguage}.
- Output ONLY the JSON object — no extra text, no code fences.
`.trim();
}

/** Today's date in IST. India has no DST, so a fixed +5:30 offset is exact. */
function istTodayString(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const days = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const day = days[ist.getUTCDay()] ?? "";
  const month = months[ist.getUTCMonth()] ?? "";
  return `${day}, ${ist.getUTCDate()} ${month} ${ist.getUTCFullYear()}`;
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
