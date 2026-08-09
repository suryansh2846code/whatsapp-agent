import type { Lead, LeadStore, LeadSaveResult } from "./types";

/**
 * Google Sheets LeadStore, via a SERVICE ACCOUNT.
 *
 * The agency owns one "robot" Google account (a service account). Each client's
 * sheet is shared with the robot's email. To write we:
 *   1. Build a JWT (a signed statement of who we are + what access we want).
 *   2. Sign it with the service account's private key (RS256, via Web Crypto).
 *   3. Swap the signed JWT for a 1-hour access token at Google's token endpoint.
 *   4. Call the Sheets API.
 *
 * Leads are DEDUPED by phone (ADR 0011): one row per person. We read the sheet
 * first (read-before-write), and either create a new row, append the message to
 * the existing row's Message cell (up to a cap, to capture the lead's intent),
 * or skip once capped. See ADR 0009 for the auth/crypto.
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
// The tab must be named "Sheet1", columns: A Timestamp | B Business | C Name |
// D Phone | E Message.
const APPEND_RANGE = "Sheet1!A:E";
// We read just Phone (D) + Message (E) to find an existing lead.
const READ_RANGE = "Sheet1!D:E";
// How many messages we keep per lead before we stop logging (enough to read
// their intent without the row growing forever).
const MAX_MESSAGES_PER_LEAD = 5;

export function createGoogleSheetsLeadStore(opts: GoogleSheetsOptions): LeadStore {
  if (!opts.clientEmail || !opts.privateKey) {
    throw new Error(
      "Google service account not configured — set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  return {
    async save(lead: Lead): Promise<LeadSaveResult> {
      const token = await getAccessToken(opts.clientEmail, opts.privateKey);

      // Read existing [phone, message] rows so we can dedupe by phone.
      const rows = await readRange(token, opts.sheetId, READ_RANGE);
      const key = normalizePhone(lead.phone);

      let foundRowNumber = -1; // 1-based sheet row
      let existingMessage = "";
      for (let i = 0; i < rows.length; i++) {
        const phoneCell = rows[i]?.[0] ?? "";
        if (key !== "" && normalizePhone(phoneCell) === key) {
          foundRowNumber = i + 1; // READ_RANGE starts at row 1
          existingMessage = rows[i]?.[1] ?? "";
          break;
        }
      }

      // New person → create their row.
      if (foundRowNumber === -1) {
        await appendRow(token, opts.sheetId, [
          lead.timestamp,
          lead.business,
          lead.name ?? "",
          lead.phone,
          lead.message,
        ]);
        return "created";
      }

      // Existing person → append their message unless we've hit the cap.
      const messageCount = existingMessage.split("\n").filter((m) => m.length > 0).length;
      if (messageCount >= MAX_MESSAGES_PER_LEAD) {
        return "skipped";
      }
      const combined = `${existingMessage}\n${lead.message}`;
      await updateCell(token, opts.sheetId, `Sheet1!E${foundRowNumber}`, combined);
      return "appended";
    },
  };
}

/** Keep only digits, so "+91 80…" and "9180…" compare equal. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
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

// --- Sheets API -------------------------------------------------------------
// NOTE: we write with valueInputOption=RAW, not USER_ENTERED. RAW stores text
// literally; USER_ENTERED would let a message like "=SUM(A:A)" become a live
// formula (a "formula/CSV injection"). Lead content is user input, so RAW.

/** Read a range, returning rows of string cells (empty array if none). */
async function readRange(token: string, sheetId: string, range: string): Promise<string[][]> {
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

/** Append one row to the end of the sheet. */
async function appendRow(token: string, sheetId: string, row: string[]): Promise<void> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    `${encodeURIComponent(APPEND_RANGE)}:append?valueInputOption=RAW`;

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

/** Overwrite a single cell (e.g. "Sheet1!E7") with a value. */
async function updateCell(
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
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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
