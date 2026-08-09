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

/** What happened when we saved a lead (idempotent by phone). */
export type LeadSaveResult =
  | "created" // first time we've seen this phone → a new row
  | "appended" // existing lead, message added to their row (under the cap)
  | "skipped"; // existing lead already at the message cap → nothing written

export interface LeadStore {
  /**
   * Save a lead, idempotently keyed by phone number. Returns what happened
   * (`created` / `appended` / `skipped`). Throws if the store can't be reached.
   */
  save(lead: Lead): Promise<LeadSaveResult>;
}
