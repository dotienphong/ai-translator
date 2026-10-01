import { env } from "cloudflare:workers";

/** Storage chỉ tách theo từng file test, nên mỗi test tự xóa dữ liệu (kể cả bộ đếm AUTOINCREMENT). */
export async function resetDb(): Promise<void> {
  await env.DB.batch(
    ["audit_log", "deactivations", "activations", "orders", "licenses", "rate_limits", "ops_alerts", "sqlite_sequence"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
}

type BrokenStatement = D1PreparedStatement & { broken: true };

/**
 * D1 bọc lại cho test: ghi lại mọi câu SQL đã prepare, và cho câu nào `fail(sql)` trả true thì ném lỗi khi chạy
 * (giả lập D1 lỗi giữa chừng). `fail` có thể giữ trạng thái, ví dụ chỉ hỏng lần gọi đầu.
 */
export function wrapDb(db: D1Database, fail: (sql: string) => boolean = () => false) {
  const sql: string[] = [];
  const broken = (q: string): BrokenStatement => {
    const err = () => Promise.reject(new Error(`D1 giả lỗi: ${q.trim().slice(0, 40)}`));
    const stmt = { broken: true, bind: () => stmt, run: err, all: err, first: err, raw: err };
    return stmt as unknown as BrokenStatement;
  };
  const wrapped = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (q: string) => {
          sql.push(q);
          return fail(q) ? broken(q) : target.prepare(q);
        };
      }
      if (prop === "batch") {
        return (stmts: D1PreparedStatement[]) =>
          stmts.some((st) => (st as Partial<BrokenStatement>).broken) ? Promise.reject(new Error("D1 giả lỗi (batch)")) : target.batch(stmts);
      }
      const v: unknown = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { db: wrapped, sql };
}
