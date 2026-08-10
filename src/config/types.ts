/**
 * The shape of a TENANT.
 *
 * In this system, one codebase (the "engine") serves many businesses. Each
 * business is a `BusinessConfig` — this is the ONLY thing that differs between
 * clients. Onboarding a new preschool = writing one of these objects.
 *
 * Keep this type small and boring on purpose: the more fields a client has to
 * fill, the harder each onboarding is. Most of the per-client work should live
 * in ONE field — `knowledge`.
 */
export interface BusinessConfig {
  /** Internal slug, e.g. "sunshine-preschool". Never shown to customers. */
  id: string;

  /** The business name as customers should see it, e.g. "Sunshine Preschool". */
  displayName: string;

  /**
   * THE ROUTING KEY.
   *
   * When WhatsApp delivers a message, its payload says which business number
   * received it (Meta calls this the `phone_number_id`). We use that to look up
   * *which tenant this message belongs to*. This is how one engine serves many
   * businesses without mixing them up.
   */
  whatsappPhoneNumberId: string;

  /**
   * Languages the bot should be comfortable replying in, most-preferred first,
   * e.g. ["English", "Hindi"]. This is a hint to the brain's tone — small
   * Indian businesses often get mixed English/Hindi enquiries.
   */
  languages: string[];

  /**
   * THE GROUNDING SOURCE — the single most important field.
   *
   * This is the business's real facts (fees, timings, ages, address, admissions
   * process, etc.) as a plain-text / markdown sheet. The brain is only allowed
   * to answer from THIS. If an answer isn't in here, it must NOT invent one —
   * it uses `fallbackMessage` instead. Getting this field right per client is
   * ~90% of onboarding.
   */
  knowledge: string;

  /**
   * What the bot says when the answer isn't in `knowledge`. This is the safety
   * net against the bot making things up. Keep it warm and action-oriented,
   * e.g. "I'm not sure about that — I'll have someone from our team call you."
   */
  fallbackMessage: string;

  /**
   * Legacy: the Google Sheet ID for leads. Optional now that leads live in D1
   * (the Sheets adapters are parked). Kept for the config demo business.
   */
  leadSheetId?: string;

  /**
   * The owner's email — gets an instant alert on a new booking so they can call
   * back while the lead is warm. Optional; no email = no alert. (ADR 0015.)
   */
  ownerEmail?: string;
}
