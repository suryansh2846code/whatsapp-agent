import type { Env } from "../env";
import type { BusinessConfig } from "../config/types";

/**
 * Owner alerts via Resend (ADR 0015).
 *
 * When a new booking comes in, email the business owner so they can call back
 * while the lead is warm. Failures here are non-fatal — the bot has already
 * replied and logged the booking; a missed email shouldn't break anything.
 */

export interface BookingAlert {
  name?: string;
  phone: string;
  requestedTime: string;
  message: string;
}

const RESEND_URL = "https://api.resend.com/emails";

export async function sendBookingAlert(
  env: Env,
  business: BusinessConfig,
  alert: BookingAlert,
): Promise<void> {
  if (!business.ownerEmail) return; // no recipient configured for this client
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping owner alert.");
    return;
  }

  const from = env.ALERT_FROM_EMAIL || "onboarding@resend.dev";
  const subject = `New visit booking — ${business.displayName}`;
  const text = [
    `New visit request for ${business.displayName}:`,
    ``,
    `Name: ${alert.name || "(not given)"}`,
    `Phone: ${alert.phone}`,
    `Requested time: ${alert.requestedTime}`,
    `Their message: ${alert.message}`,
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
