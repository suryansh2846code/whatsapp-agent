import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";
import type { BookingStore } from "./types";
import { createGoogleSheetsBookingStore } from "./google-sheets";

/**
 * BookingStore factory. Bookings go to a "Bookings" tab in the same sheet as the
 * business's leads (reuses the shared Google service-account credentials).
 */
export function createBookingStore(env: Env, business: BusinessConfig): BookingStore {
  return createGoogleSheetsBookingStore({
    clientEmail: env.GOOGLE_CLIENT_EMAIL,
    privateKey: (env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    sheetId: business.leadSheetId,
  });
}

export type { Booking, BookingStore } from "./types";
