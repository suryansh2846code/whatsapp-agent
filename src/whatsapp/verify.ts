/**
 * Verify that a webhook POST really came from Meta.
 *
 * Meta signs each webhook with HMAC-SHA256 over the RAW request body, keyed by
 * the app secret, and sends it as `X-Hub-Signature-256: sha256=<hex>`. We
 * recompute the same HMAC and compare. Only someone who knows the app secret
 * (i.e. Meta) can produce a matching signature, so forged POSTs are rejected.
 *
 * IMPORTANT: this must run against the exact raw body bytes we received — never a
 * re-serialised JSON, which could differ byte-for-byte and break the match.
 */
export async function verifyMetaSignature(
  appSecret: string | undefined,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  // No secret configured → deny by default (fail closed, not open).
  if (!appSecret) {
    console.warn("WHATSAPP_APP_SECRET not set — rejecting webhook.");
    return false;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const provided = signatureHeader.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = toHex(mac);

  return timingSafeEqual(computed, provided);
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Constant-time string compare — avoids leaking info via timing differences. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
