import type { Lead, LeadStore, LeadSaveResult } from "./types";

/**
 * D1 (SQLite) LeadStore — the CRM source of truth (ADR 0016).
 *
 * Same dedup behaviour as the Sheets version (one lead per phone, first 5
 * messages), but in a real database: strongly consistent (no race), queryable,
 * with status/notes for the CRM. The UNIQUE(business_id, phone) constraint is
 * the safety net against duplicate lead rows.
 */

const MAX_MESSAGES_PER_LEAD = 5;

export interface D1LeadOptions {
  db: D1Database;
  businessId: string;
}

export function createD1LeadStore(opts: D1LeadOptions): LeadStore {
  return {
    async save(lead: Lead): Promise<LeadSaveResult> {
      const { db, businessId } = opts;
      const phone = normalizePhone(lead.phone);
      const now = new Date().toISOString();

      const existing = await db
        .prepare("SELECT id, messages, message_count FROM leads WHERE business_id = ? AND phone = ?")
        .bind(businessId, phone)
        .first<{ id: number; messages: string; message_count: number }>();

      if (!existing) {
        await db
          .prepare(
            `INSERT INTO leads (business_id, phone, name, messages, message_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind(businessId, phone, lead.name ?? "", lead.message, now, now)
          .run();
        return "created";
      }

      if (existing.message_count >= MAX_MESSAGES_PER_LEAD) {
        return "skipped";
      }

      const combined = `${existing.messages}\n${lead.message}`;
      await db
        .prepare(
          "UPDATE leads SET messages = ?, message_count = message_count + 1, updated_at = ? WHERE id = ?",
        )
        .bind(combined, now, existing.id)
        .run();
      return "appended";
    },
  };
}

/** Keep only digits, so "+91 80…" and "9180…" collapse to one lead. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
