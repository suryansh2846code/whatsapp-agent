import type { Lead, LeadStore, LeadSaveResult } from "./types";
import { getAccessToken, readRange, appendRow, updateCell } from "../google/sheets";

/**
 * Google Sheets LeadStore, via a SERVICE ACCOUNT (auth lives in ../google/sheets).
 *
 * Leads are DEDUPED by phone (ADR 0011): one row per person. We read the sheet
 * first (read-before-write), and either create a new row, append the message to
 * the existing row's Message cell (up to a cap, to capture the lead's intent),
 * or skip once capped.
 */

export interface GoogleSheetsOptions {
  /** Service account email, e.g. bot@project.iam.gserviceaccount.com */
  clientEmail: string;
  /** Service account private key (PEM), real newlines. */
  privateKey: string;
  /** The spreadsheet ID for THIS business. */
  sheetId: string;
}

// The tab must be named "Sheet1", columns: A Timestamp | B Business | C Name |
// D Phone | E Message.
const APPEND_RANGE = "Sheet1!A:E";
// We read just Phone (D) + Message (E) to find an existing lead.
const READ_RANGE = "Sheet1!D:E";
// How many messages we keep per lead before we stop logging (enough to read
// their intent without the row growing forever).
const MAX_MESSAGES_PER_LEAD = 5;

export function createGoogleSheetsLeadStore(opts: GoogleSheetsOptions): LeadStore {
  if (!opts.clientEmail || !opts.privateKey) {
    throw new Error(
      "Google service account not configured — set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  return {
    async save(lead: Lead): Promise<LeadSaveResult> {
      const token = await getAccessToken(opts.clientEmail, opts.privateKey);

      // Read existing [phone, message] rows so we can dedupe by phone.
      const rows = await readRange(token, opts.sheetId, READ_RANGE);
      const key = normalizePhone(lead.phone);

      let foundRowNumber = -1; // 1-based sheet row
      let existingMessage = "";
      for (let i = 0; i < rows.length; i++) {
        const phoneCell = rows[i]?.[0] ?? "";
        if (key !== "" && normalizePhone(phoneCell) === key) {
          foundRowNumber = i + 1; // READ_RANGE starts at row 1
          existingMessage = rows[i]?.[1] ?? "";
          break;
        }
      }

      // New person → create their row.
      if (foundRowNumber === -1) {
        await appendRow(token, opts.sheetId, APPEND_RANGE, [
          lead.timestamp,
          lead.business,
          lead.name ?? "",
          lead.phone,
          lead.message,
        ]);
        return "created";
      }

      // Existing person → append their message unless we've hit the cap.
      const messageCount = existingMessage.split("\n").filter((m) => m.length > 0).length;
      if (messageCount >= MAX_MESSAGES_PER_LEAD) {
        return "skipped";
      }
      const combined = `${existingMessage}\n${lead.message}`;
      await updateCell(token, opts.sheetId, `Sheet1!E${foundRowNumber}`, combined);
      return "appended";
    },
  };
}

/** Keep only digits, so "+91 80…" and "9180…" compare equal. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
