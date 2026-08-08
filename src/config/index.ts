import type { BusinessConfig } from "./types";
import { sunshinePreschool } from "./businesses/sunshine-preschool";

/**
 * THE TENANT REGISTRY.
 *
 * Every business the engine serves is listed here. To add a client, write their
 * config file and add it to this array — that's the "little change" that
 * replicates the whole system for a new business.
 *
 * (For a handful of clients an array is perfect. If this ever grows to hundreds,
 * we'd move tenants into a database — but that's a future decision, not now.)
 */
const BUSINESSES: BusinessConfig[] = [sunshinePreschool];

/**
 * Given the WhatsApp phone number ID from an incoming message, find which
 * business it belongs to. Returns `undefined` if no tenant matches — the caller
 * must handle that (a message to a number we don't recognise).
 */
export function findBusinessByPhoneNumberId(
  phoneNumberId: string,
): BusinessConfig | undefined {
  return BUSINESSES.find((b) => b.whatsappPhoneNumberId === phoneNumberId);
}

export type { BusinessConfig };
