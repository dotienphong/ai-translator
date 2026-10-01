import { env } from "cloudflare:workers";

/** Storage chỉ tách theo từng file test, nên mỗi test tự xóa dữ liệu (kể cả bộ đếm AUTOINCREMENT). */
export async function resetDb(): Promise<void> {
  await env.DB.batch(
    ["audit_log", "deactivations", "activations", "orders", "licenses", "rate_limits", "ops_alerts", "sqlite_sequence"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
}
