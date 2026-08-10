import type { Booking, BookingStore, BookingSaveResult } from "./types";

/**
 * D1 (SQLite) BookingStore — one visit request per (business, phone), upserted.
 * created (new) / updated (time changed) / unchanged (same time, e.g. a
 * follow-up "ok thanks"). Strongly consistent, so no double-booking race.
 */

export interface D1BookingOptions {
  db: D1Database;
  businessId: string;
}

export function createD1BookingStore(opts: D1BookingOptions): BookingStore {
  return {
    async save(booking: Booking): Promise<BookingSaveResult> {
      const { db, businessId } = opts;
      const phone = normalizePhone(booking.phone);
      const now = new Date().toISOString();

      const existing = await db
        .prepare("SELECT id, requested_time FROM bookings WHERE business_id = ? AND phone = ?")
        .bind(businessId, phone)
        .first<{ id: number; requested_time: string }>();

      if (!existing) {
        await db
          .prepare(
            `INSERT INTO bookings (business_id, phone, name, requested_time, message, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(businessId, phone, booking.name ?? "", booking.requestedTime, booking.message, now, now)
          .run();
        return "created";
      }

      if (existing.requested_time.trim() !== booking.requestedTime.trim()) {
        await db
          .prepare(
            `UPDATE bookings
             SET requested_time = ?, message = ?, name = COALESCE(NULLIF(?, ''), name), updated_at = ?
             WHERE id = ?`,
          )
          .bind(booking.requestedTime, booking.message, booking.name ?? "", now, existing.id)
          .run();
        return "updated";
      }
      return "unchanged";
    },
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
