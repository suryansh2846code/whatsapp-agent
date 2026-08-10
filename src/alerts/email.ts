import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";

/**
 * Owner alerts via Resend (ADR 0015 / 0022). When an action completes (booking,
 * order, quote…), email the owner so they can act while the lead is warm.
 * Failures are non-fatal — the bot already replied and recorded the submission.
 */

const RESEND_URL = "https://api.resend.com/emails";

export async function sendSubmissionAlert(
  env: Env,
  business: BusinessConfig,
  actionLabel: string,
  phone: string,
  data: Record<string, string>,
): Promise<void> {
  if (!business.ownerEmail) return; // no recipient configured
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping owner alert.");
    return;
  }

  const from = env.ALERT_FROM_EMAIL || "onboarding@resend.dev";
  const subject = `New ${actionLabel} — ${business.displayName}`;
  const details = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const text = [
    `New ${actionLabel.toLowerCase()} for ${business.displayName}:`,
    ``,
    `Phone: ${phone}`,
    details,
    ``,
    `Reply to them on WhatsApp to confirm.`,
  ].join("\n");

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: business.ownerEmail, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}
