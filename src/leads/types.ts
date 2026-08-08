/**
 * The LeadStore adapter — where captured enquiries go.
 *
 * Same loose-coupling idea as the LLM and WhatsApp: the app saves a `Lead` to
 * this interface, and doesn't care whether it lands in a Google Sheet, Airtable,
 * or a database. Today it's Google Sheets (ADR 0005 / 0009); swapping later =
 * one new adapter.
 */

/** One captured enquiry. `phone` always comes from WhatsApp; `name` may be blank. */
export interface Lead {
  /** ISO timestamp of when the enquiry came in. */
  timestamp: string;
  /** The business this lead belongs to (display name, for the sheet). */
  business: string;
  /** The parent/customer's name, if we know it. May be empty in v1. */
  name?: string;
  /** The parent/customer's WhatsApp number. */
  phone: string;
  /** What they asked / their message. */
  message: string;
}

export interface LeadStore {
  /** Append/save one lead. Throws if it can't be saved. */
  save(lead: Lead): Promise<void>;
}
