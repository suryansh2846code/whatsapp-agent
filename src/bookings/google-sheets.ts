import type { Booking, BookingStore, BookingSaveResult } from "./types";
import { getAccessToken, readRange, appendRow, updateCell } from "../google/sheets";

/**
 * Google Sheets BookingStore — one visit request per parent, in a "Bookings" tab
 * of the business's sheet. DEDUPED by phone (ADR 0012 update): read first, then
 * create / update (if the time changed) / leave unchanged (a follow-up like
 * "ok thanks" won't add a duplicate row).
 */

export interface GoogleSheetsBookingOptions {
  clientEmail: string;
  privateKey: string;
  sheetId: string;
}

// Bookings tab columns:
// A Timestamp | B Business | C Name | D Phone | E Requested time | F Message
const APPEND_RANGE = "Bookings!A:F";
// Read Phone (D) + Requested time (E) to find an existing request.
const READ_RANGE = "Bookings!D:E";

export function createGoogleSheetsBookingStore(opts: GoogleSheetsBookingOptions): BookingStore {
  if (!opts.clientEmail || !opts.privateKey) {
    throw new Error(
      "Google service account not configured — set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  return {
    async save(booking: Booking): Promise<BookingSaveResult> {
      const token = await getAccessToken(opts.clientEmail, opts.privateKey);

      const rows = await readRange(token, opts.sheetId, READ_RANGE);
      const key = normalizePhone(booking.phone);

      let foundRowNumber = -1; // 1-based
      let existingTime = "";
      for (let i = 0; i < rows.length; i++) {
        const phoneCell = rows[i]?.[0] ?? "";
        if (key !== "" && normalizePhone(phoneCell) === key) {
          foundRowNumber = i + 1; // READ_RANGE starts at row 1
          existingTime = rows[i]?.[1] ?? "";
          break;
        }
      }

      // New parent → create their request.
      if (foundRowNumber === -1) {
        await appendRow(token, opts.sheetId, APPEND_RANGE, [
          booking.timestamp,
          booking.business,
          booking.name ?? "",
          booking.phone,
          booking.requestedTime,
          booking.message,
        ]);
        return "created";
      }

      // Existing parent → update only if the requested time actually changed.
      if (existingTime.trim() !== booking.requestedTime.trim()) {
        await updateCell(token, opts.sheetId, `Bookings!E${foundRowNumber}`, booking.requestedTime);
        return "updated";
      }
      return "unchanged";
    },
  };
}

/** Keep only digits, so "+91 80…" and "9180…" compare equal. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
