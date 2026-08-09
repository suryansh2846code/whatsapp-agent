import type { Booking, BookingStore } from "./types";
import { getAccessToken, appendRow } from "../google/sheets";

/**
 * Google Sheets BookingStore — appends visit requests to a "Bookings" tab in the
 * business's sheet (same spreadsheet as leads, different tab). Append-only.
 */

export interface GoogleSheetsBookingOptions {
  clientEmail: string;
  privateKey: string;
  sheetId: string;
}

// Bookings tab columns:
// A Timestamp | B Business | C Name | D Phone | E Requested time | F Message
const BOOKINGS_RANGE = "Bookings!A:F";

export function createGoogleSheetsBookingStore(opts: GoogleSheetsBookingOptions): BookingStore {
  if (!opts.clientEmail || !opts.privateKey) {
    throw new Error(
      "Google service account not configured — set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  return {
    async save(booking: Booking): Promise<void> {
      const token = await getAccessToken(opts.clientEmail, opts.privateKey);
      await appendRow(token, opts.sheetId, BOOKINGS_RANGE, [
        booking.timestamp,
        booking.business,
        booking.name ?? "",
        booking.phone,
        booking.requestedTime,
        booking.message,
      ]);
    },
  };
}
