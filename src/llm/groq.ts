import type { LlmProvider, LlmMessage } from "./types";

/**
 * Groq adapter.
 *
 * Groq is a fast, cheap inference host that serves open models (Llama, etc.)
 * through an OpenAI-compatible API. We only talk to it here — the rest of the
 * app sees the neutral `LlmProvider` interface.
 */

export interface GroqOptions {
  apiKey: string;
  model: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function createGroqProvider(opts: GroqOptions): LlmProvider {
  if (!opts.apiKey) {
    throw new Error("GROQ_API_KEY is missing — set it in .dev.vars (local) or as a Worker secret.");
  }

  return {
    async complete(messages: LlmMessage[]): Promise<string> {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          // Low temperature = faithful, not creative. For a grounded FAQ we want
          // it to stick to the facts, not embellish.
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Groq API error ${res.status}: ${detail}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq returned no content.");
      }
      return content.trim();
    },
  };
}
