import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";
import type { LeadStore } from "./types";
import { createGoogleSheetsLeadStore } from "./google-sheets";

/**
 * The LeadStore factory — picks where leads go for a given business.
 *
 * Today every business uses Google Sheets (agency-owned, shared to their Gmail).
 * The service account credentials are shared across all clients (from env); the
 * sheet ID is per-business (from its config).
 *
 * To move a client to a different store later (e.g. a database), add an adapter
 * and branch here — the brain and webhook code never change.
 */
export function createLeadStore(env: Env, business: BusinessConfig): LeadStore {
  return createGoogleSheetsLeadStore({
    clientEmail: env.GOOGLE_CLIENT_EMAIL,
    // In .dev.vars / secrets the key is stored with escaped "\n"; turn those
    // back into real newlines so the PEM parses.
    privateKey: (env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    sheetId: business.leadSheetId,
  });
}

export type { Lead, LeadStore } from "./types";
