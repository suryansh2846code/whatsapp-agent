/**
 * Owner accounts in D1 (ADR 0017). One account per email, linked to a business.
 * Created/refreshed on Google sign-in.
 */
export async function upsertAccount(
  db: D1Database,
  email: string,
  businessId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO accounts (email, business_id, created_at, last_login_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at`,
    )
    .bind(email, businessId, now, now)
    .run();
}
