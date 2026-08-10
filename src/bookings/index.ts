import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";
import type { BookingStore } from "./types";
import { createD1BookingStore } from "./d1";

/**
 * BookingStore factory. Bookings now live in D1 — the CRM source of truth
 * (ADR 0016). The Google Sheets adapter is kept parked for a possible export.
 */
export function createBookingStore(env: Env, business: BusinessConfig): BookingStore {
  return createD1BookingStore({ db: env.DB, businessId: business.id });
}

export type { Booking, BookingStore } from "./types";
