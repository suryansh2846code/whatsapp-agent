import type { BusinessConfig } from "../config/types";

/**
 * Per-business editable settings (ADR 0019). The bot reads the D1 override if
 * present and non-empty, otherwise the code config default — so owners can edit
 * their FAQ from the dashboard without a redeploy, and un-edited businesses keep
 * working from config.
 */

export interface BusinessSettings {
  knowledge: string;
  fallbackMessage: string;
}

/** Effective settings = D1 override (if set) else the config defaults. */
export async function getEffectiveSettings(
  db: D1Database,
  business: BusinessConfig,
): Promise<BusinessSettings> {
  const row = await db
    .prepare("SELECT knowledge, fallback_message FROM business_settings WHERE business_id = ?")
    .bind(business.id)
    .first<{ knowledge: string | null; fallback_message: string | null }>();

  const knowledge = (row?.knowledge ?? "").trim() ? (row!.knowledge as string) : business.knowledge;
  const fallbackMessage = (row?.fallback_message ?? "").trim()
    ? (row!.fallback_message as string)
    : business.fallbackMessage;
  return { knowledge, fallbackMessage };
}

/** A business with its effective (possibly owner-edited) knowledge/fallback. */
export async function withEffectiveSettings(
  db: D1Database,
  business: BusinessConfig,
): Promise<BusinessConfig> {
  const s = await getEffectiveSettings(db, business);
  return { ...business, knowledge: s.knowledge, fallbackMessage: s.fallbackMessage };
}

export async function upsertSettings(
  db: D1Database,
  businessId: string,
  settings: BusinessSettings,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO business_settings (business_id, knowledge, fallback_message, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(business_id) DO UPDATE SET
         knowledge = excluded.knowledge,
         fallback_message = excluded.fallback_message,
         updated_at = excluded.updated_at`,
    )
    .bind(businessId, settings.knowledge, settings.fallbackMessage, new Date().toISOString())
    .run();
}
