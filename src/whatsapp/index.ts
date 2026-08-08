import type { Env } from "../env";
import type { WhatsAppClient } from "./types";
import { createMetaWhatsAppClient } from "./meta";

/**
 * WhatsApp client factory. Today it's Meta's Cloud API; to move to a BSP later,
 * add an adapter and branch here — the webhook code never changes.
 */
export function createWhatsAppClient(env: Env): WhatsAppClient {
  return createMetaWhatsAppClient({
    token: env.WHATSAPP_TOKEN,
    apiVersion: env.GRAPH_API_VERSION,
  });
}

export { parseIncomingMessages } from "./meta";
export { verifyMetaSignature } from "./verify";
export type { WhatsAppClient, IncomingMessage } from "./types";
