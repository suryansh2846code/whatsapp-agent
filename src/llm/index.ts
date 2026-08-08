import type { Env } from "../env";
import type { LlmProvider } from "./types";
import { createGroqProvider } from "./groq";

/**
 * The provider factory — reads settings and hands back the configured LLM
 * adapter. This is the single place that knows which providers exist.
 *
 * To add Claude (or anything else) later: write `src/llm/claude.ts` implementing
 * `LlmProvider`, then add a `case "claude"` here. The brain never changes.
 */
export function createLlmProvider(env: Env): LlmProvider {
  const provider = env.LLM_PROVIDER ?? "groq";

  switch (provider) {
    case "groq":
      return createGroqProvider({
        apiKey: env.GROQ_API_KEY,
        // Kept configurable because hosts rename/retire models. Verify the
        // current id in Groq's console if this default stops working.
        model: env.LLM_MODEL ?? "llama-3.3-70b-versatile",
      });

    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Add an adapter in src/llm/.`);
  }
}

export type { LlmProvider } from "./types";
