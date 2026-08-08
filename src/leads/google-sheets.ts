import type { Lead, LeadStore } from "./types";

/**
 * Google Sheets LeadStore, via a SERVICE ACCOUNT.
 *
 * The agency owns one "robot" Google account (a service account). Each client's
 * sheet is shared with the robot's email. To write a row we:
 *   1. Build a JWT (a signed statement of who we are + what access we want).
 *   2. Sign it with the service account's private key (RS256, via Web Crypto).
 *   3. Swap the signed JWT for a 1-hour access token at Google's token endpoint.
 *   4. Call the Sheets API to append the row.
 *
 * This is the "hard part" the crypto lives in — but it's written once and every
 * client reuses it. See ADR 0009.
 */

export interface GoogleSheetsOptions {
  /** Service account email, e.g. bot@project.iam.gserviceaccount.com */
  clientEmail: string;
  /** Service account private key (PEM), real newlines. */
  privateKey: string;
  /** The spreadsheet ID for THIS business. */
  sheetId: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
// The tab + columns we append to. The sheet must have a tab named "Sheet1".
const RANGE = "Sheet1!A:E";

export function createGoogleSheetsLeadStore(opts: GoogleSheetsOptions): LeadStore {
  if (!opts.clientEmail || !opts.privateKey) {
    throw new Error(
      "Google service account not configured — set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  return {
    async save(lead: Lead): Promise<void> {
      const token = await getAccessToken(opts.clientEmail, opts.privateKey);
      await appendRow(token, opts.sheetId, [
        lead.timestamp,
        lead.business,
        lead.name ?? "",
        lead.phone,
        lead.message,
      ]);
    },
  };
}

// --- OAuth: sign a JWT, swap it for an access token -------------------------

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600, // tokens are valid for 1 hour
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google returned no access_token.");
  }
  return data.access_token;
}

// --- Sheets API: append one row --------------------------------------------

async function appendRow(token: string, sheetId: string, row: string[]): Promise<void> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    `${encodeURIComponent(RANGE)}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    throw new Error(`Sheets append error ${res.status}: ${await res.text()}`);
  }
}

// --- small crypto/encoding helpers -----------------------------------------

/** base64url-encode a string or ArrayBuffer (JWT-safe: no +, /, or =). */
function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert a PEM private key into the raw bytes Web Crypto wants (PKCS#8). */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
