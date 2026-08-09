/**
 * BookingStore adapter — where visit requests go.
 *
 * Walk-v1 (ADR 0012): the bot captures a *visit request* (not a confirmed slot);
 * the human team finalises it. Append-only — each request is meaningful.
 */
export interface Booking {
  /** ISO timestamp of when the request came in. */
  timestamp: string;
  /** The business this booking is for (display name). */
  business: string;
  /** The parent/customer's name, if known. */
  name?: string;
  /** The parent/customer's WhatsApp number. */
  phone: string;
  /** The day/time the parent asked for, as free text (e.g. "Saturday 11am"). */
  requestedTime: string;
  /** The original message that triggered the booking. */
  message: string;
}

export interface BookingStore {
  /** Append one visit request. Throws if it can't be saved. */
  save(booking: Booking): Promise<void>;
}
