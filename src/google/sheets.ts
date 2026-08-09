/**
 * Shared Google Sheets client (service-account auth + basic value ops).
 *
 * Both leads and bookings write to Sheets, so the auth (JWT signing → access
 * token) and the read/append/update calls live here once. See ADR 0009 for the
 * auth model, ADR 0002 for why we use Web Crypto in the Workers runtime.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// --- OAuth: sign a JWT, swap it for an access token -------------------------

export async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
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

// --- Sheets values API ------------------------------------------------------
// NOTE: writes use valueInputOption=RAW, not USER_ENTERED. RAW stores text
// literally; USER_ENTERED would let a message like "=SUM(A:A)" become a live
// formula (a "formula/CSV injection"). Lead/booking content is user input.

/** Read a range, returning rows of string cells (empty array if none). */
export async function readRange(
  token: string,
  sheetId: string,
  range: string,
): Promise<string[][]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    `${encodeURIComponent(range)}`;

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Sheets read error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

/** Append one row to the end of a range (e.g. "Sheet1!A:E"). */
export async function appendRow(
  token: string,
  sheetId: string,
  range: string,
  row: string[],
): Promise<void> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    `${encodeURIComponent(range)}:append?valueInputOption=RAW`;

  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    throw new Error(`Sheets append error ${res.status}: ${await res.text()}`);
  }
}

/** Overwrite a single cell (e.g. "Sheet1!E7") with a value. */
export async function updateCell(
  token: string,
  sheetId: string,
  range: string,
  value: string,
): Promise<void> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    `${encodeURIComponent(range)}?valueInputOption=RAW`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!res.ok) {
    throw new Error(`Sheets update error ${res.status}: ${await res.text()}`);
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
