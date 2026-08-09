import type { Env } from "../env";

/**
 * Transcribe an audio clip (a WhatsApp voice note) to text with Groq Whisper.
 *
 * Same provider/key as the chat LLM. Whisper auto-detects the language, so mixed
 * Hindi/English voice notes work. The transcript then flows through the normal
 * question/booking logic exactly as if the person had typed it.
 */
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(
  env: Env,
  data: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const model = env.STT_MODEL || "whisper-large-v3";

  const form = new FormData();
  form.append("file", new Blob([data], { type: mimeType }), `audio.${extFor(mimeType)}`);
  form.append("model", model);

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    // No content-type header — fetch sets the multipart boundary for FormData.
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Groq transcription error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** A file extension Whisper accepts, derived from the WhatsApp mime type. */
function extFor(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  return "ogg"; // WhatsApp voice notes are ogg/opus by default
}
