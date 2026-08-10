import type { Env } from "../env";

/**
 * Sessions + OAuth CSRF state, stored in the SESSIONS KV (auto-expiring).
 * A session is a random id in an HttpOnly cookie; the KV maps it to the owner's
 * email + business_id, so every request knows which tenant it's for.
 */

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const STATE_TTL = 60 * 10; // 10 minutes

export interface Session {
  email: string;
  businessId: string;
}

// --- sessions ---------------------------------------------------------------

export async function createSession(env: Env, email: string, businessId: string): Promise<string> {
  const sid = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sid}`, JSON.stringify({ email, businessId }), {
    expirationTtl: SESSION_TTL,
  });
  return sid;
}

/** Read + validate the session cookie. Returns null if not logged in. */
export async function readSession(env: Env, request: Request): Promise<Session | null> {
  const sid = getCookie(request, "session");
  if (!sid) return null;
  const raw = await env.SESSIONS.get(`session:${sid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const sid = getCookie(request, "session");
  if (sid) await env.SESSIONS.delete(`session:${sid}`);
}

export function sessionCookie(sid: string, secure: boolean): string {
  const flags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${secure ? "; Secure" : ""}`;
  return `session=${sid}; ${flags}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

// --- OAuth CSRF state -------------------------------------------------------

export async function saveOAuthState(env: Env, state: string): Promise<void> {
  await env.SESSIONS.put(`oauthstate:${state}`, "1", { expirationTtl: STATE_TTL });
}

/** Verify + consume (one-time) the state returned from Google. */
export async function consumeOAuthState(env: Env, state: string): Promise<boolean> {
  const key = `oauthstate:${state}`;
  const value = await env.SESSIONS.get(key);
  if (!value) return false;
  await env.SESSIONS.delete(key);
  return true;
}

// --- helpers ----------------------------------------------------------------

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
