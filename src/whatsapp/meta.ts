import type { IncomingMessage, WhatsAppClient } from "./types";

/**
 * Meta WhatsApp Cloud API adapter.
 *
 * Two jobs: (1) parse Meta's incoming webhook payload into our neutral
 * `IncomingMessage`s, and (2) send replies via the Graph API.
 */

export interface MetaWhatsAppOptions {
  /** Access token for the Graph API (a Meta app / system-user token). */
  token: string;
  /** Graph API version, e.g. "v21.0". */
  apiVersion?: string;
}

const DEFAULT_API_VERSION = "v21.0";

// --- Parsing incoming webhooks ---------------------------------------------

/** The (loose) shape of Meta's webhook body — only the bits we read. */
interface MetaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { profile?: { name?: string } }[];
        messages?: {
          from?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

/**
 * Flatten Meta's payload into our messages. Ignores anything that isn't an
 * inbound TEXT message (delivery/read statuses, images, etc. — out of scope
 * for v1).
 */
export function parseIncomingMessages(body: unknown): IncomingMessage[] {
  const b = body as MetaWebhookBody;
  const out: IncomingMessage[] = [];

  for (const entry of b.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value || !phoneNumberId) continue;

      const senderName = value.contacts?.[0]?.profile?.name;

      for (const msg of value.messages ?? []) {
        if (msg.type !== "text") continue; // v1: text only
        const text = msg.text?.body;
        const from = msg.from;
        if (!text || !from) continue;
        out.push({ businessPhoneNumberId: phoneNumberId, from, senderName, text });
      }
    }
  }
  return out;
}

// --- Sending replies --------------------------------------------------------

export function createMetaWhatsAppClient(opts: MetaWhatsAppOptions): WhatsAppClient {
  if (!opts.token) {
    throw new Error("WHATSAPP_TOKEN is missing — set it in .dev.vars or as a Worker secret.");
  }
  const version = opts.apiVersion || DEFAULT_API_VERSION;

  return {
    async sendText(phoneNumberId: string, to: string, text: string): Promise<void> {
      const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      });
      if (!res.ok) {
        throw new Error(`WhatsApp send error ${res.status}: ${await res.text()}`);
      }
    },
  };
}
