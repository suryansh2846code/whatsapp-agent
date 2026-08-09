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

/** What happened when we saved a booking (deduped by phone). */
export type BookingSaveResult =
  | "created" // first visit request from this phone
  | "updated" // existing request, the time changed
  | "unchanged"; // existing request, same time (e.g. a follow-up "ok thanks")

export interface BookingStore {
  /**
   * Save a visit request, deduped by phone (one row per parent). Returns
   * created / updated / unchanged. Throws if the store can't be reached.
   */
  save(booking: Booking): Promise<BookingSaveResult>;
}
