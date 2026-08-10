import type { Env } from "../env";

/**
 * Sessions (in D1) + OAuth CSRF state (in a cookie).
 *
 * We use D1 for sessions and a cookie for the OAuth `state` because KV is only
 * eventually consistent — a brand-new key written in /auth/login wasn't reliably
 * readable in /auth/callback, which broke logins (ADR 0017 update). D1 is
 * strongly consistent; the cookie lives in the browser, so both are reliable.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const STATE_MAX_AGE = 600; // 10 minutes

export interface Session {
  email: string;
  businessId: string;
}

// --- sessions (D1) ----------------------------------------------------------

export async function createSession(env: Env, email: string, businessId: string): Promise<string> {
  const sid = crypto.randomUUID();
  const now = new Date();
  await env.DB.prepare(
    "INSERT INTO sessions (id, email, business_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(sid, email, businessId, new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString())
    .run();
  return sid;
}

export async function readSession(env: Env, request: Request): Promise<Session | null> {
  const sid = getCookie(request, "session");
  if (!sid) return null;
  const row = await env.DB.prepare(
    "SELECT email, business_id, expires_at FROM sessions WHERE id = ?",
  )
    .bind(sid)
    .first<{ email: string; business_id: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return null;
  }
  return { email: row.email, businessId: row.business_id };
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const sid = getCookie(request, "session");
  if (sid) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
}

export function sessionCookie(sid: string, secure: boolean): string {
  return `session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

// --- OAuth CSRF state (cookie) ---------------------------------------------

export function stateCookie(state: string, secure: boolean): string {
  // SameSite=Lax so it IS sent on the top-level GET redirect back from Google.
  return `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${STATE_MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearStateCookie(secure: boolean): string {
  return `oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function getStateCookie(request: Request): string | null {
  return getCookie(request, "oauth_state");
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
