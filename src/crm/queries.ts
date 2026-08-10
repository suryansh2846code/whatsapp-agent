/**
 * CRM data access (D1), always scoped by business_id so an owner only ever
 * touches their own tenant's rows.
 */

export const LEAD_STATUSES = ["new", "contacted", "converted", "lost"] as const;

export interface LeadRow {
  id: number;
  phone: string;
  name: string;
  messages: string;
  message_count: number;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export async function listLeads(db: D1Database, businessId: string): Promise<LeadRow[]> {
  const res = await db
    .prepare(
      `SELECT id, phone, name, messages, message_count, status, notes, created_at, updated_at
       FROM leads WHERE business_id = ? ORDER BY updated_at DESC LIMIT 500`,
    )
    .bind(businessId)
    .all<LeadRow>();
  return res.results ?? [];
}

export async function updateLead(
  db: D1Database,
  businessId: string,
  id: number,
  fields: { status?: string; notes?: string },
): Promise<boolean> {
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (fields.status !== undefined) {
    sets.push("status = ?");
    binds.push(fields.status);
  }
  if (fields.notes !== undefined) {
    sets.push("notes = ?");
    binds.push(fields.notes);
  }
  if (sets.length === 0) return false;
  sets.push("updated_at = ?");
  binds.push(new Date().toISOString());
  binds.push(id, businessId);
  const res = await db
    .prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ? AND business_id = ?`)
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

