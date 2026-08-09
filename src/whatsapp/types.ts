/**
 * WhatsApp adapter interfaces.
 *
 * The rest of the app deals in these neutral shapes, never Meta's raw payload.
 * Swapping Meta for a BSP later (ADR 0003) = a new implementation of these.
 */

/** A normalised inbound message — Meta's nested payload flattened to what we need. */
export interface IncomingMessage {
  /** The business number that RECEIVED this — our routing key (which tenant). */
  businessPhoneNumberId: string;
  /** The sender's WhatsApp number (we reply to this, and log it as the lead). */
  from: string;
  /** The sender's WhatsApp profile name, if provided. */
  senderName?: string;
  /** The text the person sent (empty for a voice note — see `audioId`). */
  text: string;
  /** For a voice note / audio message: the media id to download + transcribe. */
  audioId?: string;
}

export interface WhatsAppClient {
  /** Send a plain text reply from `phoneNumberId` to `to`. */
  sendText(phoneNumberId: string, to: string, text: string): Promise<void>;
  /** Download a media file (e.g. a voice note) by its media id. */
  getMedia(mediaId: string): Promise<{ data: ArrayBuffer; mimeType: string }>;
}
