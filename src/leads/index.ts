import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";
import type { LeadStore } from "./types";
import { createD1LeadStore } from "./d1";

/**
 * The LeadStore factory. Leads now live in D1 — the CRM source of truth
 * (ADR 0016). The Google Sheets adapter (`./google-sheets`) is kept parked for a
 * possible export path, but the engine writes to D1.
 */
export function createLeadStore(env: Env, business: BusinessConfig): LeadStore {
  return createD1LeadStore({ db: env.DB, businessId: business.id });
}

export type { Lead, LeadStore } from "./types";
