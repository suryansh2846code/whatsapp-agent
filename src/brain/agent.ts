import type { BusinessConfig, ActionDef } from "../config/types";
import type { LlmProvider, LlmMessage } from "../llm/types";

/**
 * The generic agent (ADR 0022). One structured LLM call per message decides
 * between answering a question and carrying out a configurable ACTION (booking,
 * order, quote…), extracting its fields. The CODE owns the rules — which fields
 * are still required, when it's complete, and the templated confirmation — so
 * the LLM only does what it's good at (understand, extract, phrase questions).
 *
 * Multi-turn field collection is driven by a small `pending` state (which action
 * + fields collected so far), persisted in the conversation memory.
 */

export interface Pending {
  action: string;
  collected: Record<string, string>;
}

export interface AgentResult {
  reply: string;
  /** Set when an action just completed → record it + alert the owner. */
  submission?: { actionKey: string; actionLabel: string; data: Record<string, string> };
  /** The pending state to persist (undefined = cleared). */
  pending?: Pending;
}

export async function runAgent(
  llm: LlmProvider,
  business: BusinessConfig,
  userMessage: string,
  history: LlmMessage[],
  pending: Pending | undefined,
): Promise<AgentResult> {
  const actions = business.actions ?? [];

  const raw = await llm.complete(
    [
      { role: "system", content: buildPrompt(business, actions, pending) },
      ...history,
      { role: "user", content: userMessage },
    ],
    { json: true },
  );
  const parsed = safeParseObject(raw);

  // Which action is in play (a newly-detected one, or the pending one)?
  const requestedKey = asText(parsed.action);
  const activeKey = requestedKey || pending?.action || "";
  const action = actions.find((a) => a.key === activeKey);

  // No action → it's a question. Answer from knowledge (or fallback).
  if (!action || asText(parsed.type) === "answer") {
    const answer = asText(parsed.answer) || business.fallbackMessage;
    return { reply: answer, pending: undefined };
  }

  // Merge collected fields. If continuing the SAME action, keep prior; if the
  // customer switched to a different action, start fresh.
  const base = pending && pending.action === action.key ? { ...pending.collected } : {};
  const fields = (parsed.fields ?? {}) as Record<string, unknown>;
  for (const f of action.fields) {
    const v = fields[f.key];
    if (typeof v === "string" && v.trim()) base[f.key] = v.trim();
  }

  // CODE decides what's still required and whether we're done.
  const missing = action.fields.filter((f) => f.required && !base[f.key]);
  if (missing.length === 0) {
    return {
      reply: fillTemplate(action.confirmation, base, business),
      submission: { actionKey: action.key, actionLabel: action.label, data: base },
      pending: undefined,
    };
  }

  const ask = asText(parsed.ask) || `Could you tell me your ${missing[0]!.label}?`;
  return { reply: ask, pending: { action: action.key, collected: base } };
}

// --- prompt -----------------------------------------------------------------

function buildPrompt(business: BusinessConfig, actions: ActionDef[], pending: Pending | undefined): string {
  const preferredLanguage = business.languages[0] ?? "English";
  const actionList = actions
    .map((a) => {
      const fields = a.fields
        .map((f) => `${f.key} (${f.label}${f.required ? ", required" : ""})`)
        .join(", ");
      return `- key "${a.key}": ${a.description}. Fields: ${fields || "none"}.`;
    })
    .join("\n");

  const pendingLine = pending
    ? `The customer is in the middle of action "${pending.action}". Already collected: ${JSON.stringify(pending.collected)}. Extract any NEW field values from their message.`
    : `No action is in progress yet.`;

  return `
You are a warm, helpful WhatsApp assistant for ${business.displayName}.
Today is ${istTodayString()} (timezone: India / IST).

FACTS — the ONLY source of truth for answering questions:
"""
${business.knowledge}
"""

ACTIONS you can carry out for the customer:
${actionList || "(none)"}

${pendingLine}

Respond with a SINGLE JSON object and nothing else:
{
  "type": "answer" | "action",
  "answer": string,   // if type=answer: a short reply using ONLY the FACTS, else exactly "${business.fallbackMessage}". Empty if type=action.
  "action": string,   // if type=action: the action key in play. Empty otherwise.
  "fields": { },       // field key -> value, for any action fields present in the message (resolve dates to absolute using today's date).
  "ask": string        // if type=action and info is still missing: a short, friendly question for the next missing field. Empty otherwise.
}

Rules:
- Pick "action" when the message matches an action's description OR continues the pending action; otherwise "answer".
- Only put values in "fields" that the customer actually gave. Never invent them.
- Resolve relative dates ("tomorrow", "this Saturday") to a real calendar date.
- A plain acknowledgement ("ok", "thanks") is NOT a new action.
- Answer questions ONLY from the FACTS. Keep replies short and friendly.
- Reply in the language the customer used; prefer ${preferredLanguage}.
- Output ONLY the JSON object.
`.trim();
}

// --- helpers ----------------------------------------------------------------

/** Fill a confirmation template: {fieldKey} -> value, {business} -> name. */
function fillTemplate(tpl: string, data: Record<string, string>, business: BusinessConfig): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, key: string) => {
    if (key === "business") return business.displayName;
    return data[key] ?? "";
  });
}

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

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Today's date in IST. India has no DST, so a fixed +5:30 offset is exact. */
function istTodayString(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const day = days[ist.getUTCDay()] ?? "";
  const month = months[ist.getUTCMonth()] ?? "";
  return `${day}, ${ist.getUTCDate()} ${month} ${ist.getUTCFullYear()}`;
}
