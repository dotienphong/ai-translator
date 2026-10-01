// Nhật ký thay đổi license và thao tác admin (§6.8, §10.2). Không ghi key đầy đủ, token hay email.

export interface AuditEntry {
  at: number;
  actor: string;
  action: string;
  licenseId?: string | null;
  orderCode?: number | null;
  detail?: Record<string, unknown>;
}

export function auditStatement(db: D1Database, e: AuditEntry): D1PreparedStatement {
  return db
    .prepare("INSERT INTO audit_log (at, actor, action, license_id, order_code, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(e.at, e.actor, e.action, e.licenseId ?? null, e.orderCode ?? null, e.detail ? JSON.stringify(e.detail) : null);
}

/**
 * Như auditStatement, nhưng chỉ ghi khi câu lệnh đứng ngay trước trong cùng batch đổi đúng một dòng (`changes() = 1`).
 * Dùng cho thao tác có điều kiện: lần chạy trùng hay chạy chồng không đổi gì thì cũng không ghi nhật ký.
 */
export function auditIfChanged(db: D1Database, e: AuditEntry): D1PreparedStatement {
  return db
    .prepare("INSERT INTO audit_log (at, actor, action, license_id, order_code, detail) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1")
    .bind(e.at, e.actor, e.action, e.licenseId ?? null, e.orderCode ?? null, e.detail ? JSON.stringify(e.detail) : null);
}

export async function audit(db: D1Database, e: AuditEntry): Promise<void> {
  await auditStatement(db, e).run();
}
