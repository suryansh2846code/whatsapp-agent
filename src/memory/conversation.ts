import type { LlmMessage, LlmProvider } from "../llm/types";
import type { BusinessConfig } from "../config/types";
import { runAgent, type AgentResult, type Pending } from "../brain/agent";

/**
 * Per-parent conversation memory (ADR 0013 + 0022). Stores a short rolling
 * history PLUS a small `pending` action state (which action is being filled and
 * the fields collected so far), in Cloudflare KV with a TTL. Each turn: load →
 * run the agent → save.
 */

const MAX_MESSAGES = 8;
const TTL_SECONDS = 60 * 60 * 24; // 1 day

interface Memory {
  history: LlmMessage[];
  pending?: Pending;
}

/** One turn: load memory, run the agent with it, persist, return the result. */
export async function runConversationTurn(
  kv: KVNamespace,
  llm: LlmProvider,
  business: BusinessConfig,
  phone: string,
  message: string,
): Promise<AgentResult> {
  const key = conversationKey(business, phone);
  const mem = await loadMemory(kv, key);
  const result = await runAgent(llm, business, message, mem.history, mem.pending);
  await saveMemory(kv, key, mem.history, message, result.reply, result.pending);
  return result;
}

function conversationKey(business: BusinessConfig, phone: string): string {
  return `${business.id}:${phone.replace(/\D/g, "")}`;
}

async function loadMemory(kv: KVNamespace, key: string): Promise<Memory> {
  const raw = await kv.get(key);
  if (!raw) return { history: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { history: parsed as LlmMessage[] }; // old format
    return {
      history: Array.isArray(parsed.history) ? (parsed.history as LlmMessage[]) : [],
      pending: parsed.pending as Pending | undefined,
    };
  } catch {
    return { history: [] };
  }
}

async function saveMemory(
  kv: KVNamespace,
  key: string,
  prior: LlmMessage[],
  userMessage: string,
  assistantMessage: string,
  pending: Pending | undefined,
): Promise<void> {
  const messages: LlmMessage[] = [
    ...prior,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantMessage },
  ];
  const value: Memory = { history: messages.slice(-MAX_MESSAGES) };
  if (pending) value.pending = pending;
  await kv.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS });
}
