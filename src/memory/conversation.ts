import type { LlmMessage, LlmProvider } from "../llm/types";
import type { BusinessConfig } from "../config/types";
import { decideAndRespond, type Decision } from "../brain/booking";

/**
 * Per-parent conversation memory (ADR 0013).
 *
 * A Worker is stateless, so on its own the bot forgets a parent between
 * messages. We store a short rolling history in Cloudflare KV, keyed by
 * business + phone, with a TTL so old chats auto-expire (privacy by default).
 * Each turn: load history → decide (the LLM sees it) → save the turn back.
 */

// How many messages we keep per parent (user+assistant). Bounded token cost.
const MAX_MESSAGES = 8;
// Auto-expire a conversation after this much inactivity (1 day).
const TTL_SECONDS = 60 * 60 * 24;

/** One turn: load memory, decide with it, persist, return the decision. */
export async function runConversationTurn(
  kv: KVNamespace,
  llm: LlmProvider,
  business: BusinessConfig,
  phone: string,
  message: string,
): Promise<Decision> {
  const key = conversationKey(business, phone);
  const history = await loadHistory(kv, key);
  const decision = await decideAndRespond(llm, business, message, history);
  await saveTurn(kv, key, history, message, decision.reply);
  return decision;
}

function conversationKey(business: BusinessConfig, phone: string): string {
  return `${business.whatsappPhoneNumberId}:${phone.replace(/\D/g, "")}`;
}

async function loadHistory(kv: KVNamespace, key: string): Promise<LlmMessage[]> {
  const raw = await kv.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LlmMessage[]) : [];
  } catch {
    return [];
  }
}

async function saveTurn(
  kv: KVNamespace,
  key: string,
  prior: LlmMessage[],
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const messages: LlmMessage[] = [
    ...prior,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantMessage },
  ];
  const trimmed = messages.slice(-MAX_MESSAGES);
  await kv.put(key, JSON.stringify(trimmed), { expirationTtl: TTL_SECONDS });
}
