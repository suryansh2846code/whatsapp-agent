import type { Env } from "../env";

/**
 * Google OAuth (server-side authorization-code flow) for owner sign-in.
 *
 * We trust the id_token because we receive it directly from Google's token
 * endpoint over TLS (server-to-server), so we can read its email claim without
 * separately verifying the signature.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The URL we send the owner to, to pick their Google account and consent. */
export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the callback code for the (verified) email. */
export async function exchangeCodeForEmail(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<{ email: string; emailVerified: boolean } | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) return null;

  const payload = decodeJwtPayload(data.id_token);
  const email = typeof payload.email === "string" ? payload.email : "";
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!email) return null;
  return { email, emailVerified };
}

/** Read a JWT's payload (no signature check — token came straight from Google). */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) return {};
  let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return {};
  }
}
