import type { Env } from "../env";

/**
 * Razorpay payment links (ADR 0024) — the first "tool handler": an action/CRM
 * step that reaches an external service. Create a hosted payment link, and
 * verify the webhook Razorpay calls when it's paid.
 */

export async function createPaymentLink(
  env: Env,
  opts: { amountRupees: number; description: string; phone: string; name?: string; notes?: Record<string, string> },
): Promise<{ id: string; shortUrl: string }> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const contact = opts.phone.startsWith("+") ? opts.phone : "+" + opts.phone.replace(/\D/g, "");

  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(opts.amountRupees * 100), // paise
      currency: "INR",
      description: opts.description,
      customer: { contact, name: opts.name || "" },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: opts.notes ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string; short_url?: string };
  if (!data.id || !data.short_url) throw new Error("Razorpay returned no link.");
  return { id: data.id, shortUrl: data.short_url };
}

/** Verify a Razorpay webhook: HMAC-SHA256 (hex) of the raw body with the secret. */
export async function verifyRazorpaySignature(
  secret: string | undefined,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(toHex(mac), signature);
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
