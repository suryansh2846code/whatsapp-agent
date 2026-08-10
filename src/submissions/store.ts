/**
 * Submissions (D1) — completed actions (bookings, orders, quotes…), all in one
 * table, scoped by business (ADR 0022). `data` is the JSON of collected fields.
 */

export const SUBMISSION_STATUSES = ["new", "in_progress", "done", "cancelled"] as const;

export interface SubmissionRow {
  id: number;
  action_key: string;
  action_label: string;
  phone: string;
  name: string;
  data: string; // JSON
  status: string;
  created_at: string;
  updated_at: string;
}

export async function createSubmission(
  db: D1Database,
  businessId: string,
  input: { actionKey: string; actionLabel: string; phone: string; name?: string; data: Record<string, string> },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO submissions (business_id, action_key, action_label, phone, name, data, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    )
    .bind(
      businessId,
      input.actionKey,
      input.actionLabel,
      input.phone,
      input.name ?? "",
      JSON.stringify(input.data),
      now,
      now,
    )
    .run();
}

export async function listSubmissions(db: D1Database, businessId: string): Promise<SubmissionRow[]> {
  const res = await db
    .prepare(
      `SELECT id, action_key, action_label, phone, name, data, status, created_at, updated_at
       FROM submissions WHERE business_id = ? ORDER BY updated_at DESC LIMIT 500`,
    )
    .bind(businessId)
    .all<SubmissionRow>();
  return res.results ?? [];
}

export async function updateSubmissionStatus(
  db: D1Database,
  businessId: string,
  id: number,
  status: string,
): Promise<boolean> {
  const res = await db
    .prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ? AND business_id = ?")
    .bind(status, new Date().toISOString(), id, businessId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
