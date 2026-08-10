import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";
import {
  findBusinessById,
  findBusinessByPhoneNumberId,
  findBusinessByOwnerEmail,
} from "../config";

/**
 * Businesses (tenants) store — D1 first, config fallback (ADR 0020).
 *
 * Reads look in the D1 `businesses` table; if absent, fall back to the code
 * config (so un-migrated businesses keep working). Editing any field upserts the
 * D1 row, promoting a config business into the database. New self-serve
 * businesses live only in D1.
 *
 * The returned `BusinessConfig` is the EFFECTIVE business (D1 override else
 * config), so callers use it directly — including `knowledge`/`fallbackMessage`.
 */

interface BusinessRow {
  id: string;
  display_name: string;
  owner_email: string | null;
  whatsapp_phone_number_id: string | null;
  languages: string;
  knowledge: string;
  fallback_message: string;
}

const COLS =
  "id, display_name, owner_email, whatsapp_phone_number_id, languages, knowledge, fallback_message";

function rowToConfig(row: BusinessRow): BusinessConfig {
  let languages: string[] = ["English"];
  try {
    const parsed = JSON.parse(row.languages);
    if (Array.isArray(parsed) && parsed.length) languages = parsed as string[];
  } catch {
    /* keep default */
  }
  return {
    id: row.id,
    displayName: row.display_name,
    ownerEmail: row.owner_email ?? undefined,
    whatsappPhoneNumberId: row.whatsapp_phone_number_id ?? "",
    languages,
    knowledge: row.knowledge,
    fallbackMessage: row.fallback_message,
  };
}

export async function getBusinessById(env: Env, id: string): Promise<BusinessConfig | undefined> {
  const row = await env.DB.prepare(`SELECT ${COLS} FROM businesses WHERE id = ?`)
    .bind(id)
    .first<BusinessRow>();
  return row ? rowToConfig(row) : findBusinessById(id);
}

export async function getBusinessByPhoneNumberId(
  env: Env,
  phoneNumberId: string,
): Promise<BusinessConfig | undefined> {
  const row = await env.DB.prepare(`SELECT ${COLS} FROM businesses WHERE whatsapp_phone_number_id = ?`)
    .bind(phoneNumberId)
    .first<BusinessRow>();
  return row ? rowToConfig(row) : findBusinessByPhoneNumberId(phoneNumberId);
}

export async function getBusinessByOwnerEmail(
  env: Env,
  email: string,
): Promise<BusinessConfig | undefined> {
  const e = email.trim().toLowerCase();
  const row = await env.DB.prepare(`SELECT ${COLS} FROM businesses WHERE lower(owner_email) = ?`)
    .bind(e)
    .first<BusinessRow>();
  return row ? rowToConfig(row) : findBusinessByOwnerEmail(email);
}

/** Insert or update a business (all editable fields). */
export async function upsertBusiness(env: Env, b: BusinessConfig): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO businesses
       (id, display_name, owner_email, whatsapp_phone_number_id, languages, knowledge, fallback_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       owner_email = excluded.owner_email,
       whatsapp_phone_number_id = excluded.whatsapp_phone_number_id,
       languages = excluded.languages,
       knowledge = excluded.knowledge,
       fallback_message = excluded.fallback_message,
       updated_at = excluded.updated_at`,
  )
    .bind(
      b.id,
      b.displayName,
      b.ownerEmail ?? null,
      b.whatsappPhoneNumberId,
      JSON.stringify(b.languages),
      b.knowledge,
      b.fallbackMessage,
      now,
      now,
    )
    .run();
}
