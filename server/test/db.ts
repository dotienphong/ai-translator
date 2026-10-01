import { env } from "cloudflare:workers";

/** Cho một câu INSERT hỏng (trigger RAISE) trong lúc chạy `run`, để kiểm các câu ghi cùng batch có quay lui cùng nhau không. */
export async function withFailingInsert<T>(table: string, when: string, run: () => Promise<T>): Promise<T> {
  await env.DB.prepare(`CREATE TRIGGER test_fail BEFORE INSERT ON ${table} WHEN ${when} BEGIN SELECT RAISE(ABORT, 'ghi hỏng'); END`).run();
  try {
    return await run();
  } finally {
    await env.DB.prepare("DROP TRIGGER test_fail").run();
  }
}

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

/**
 * D1 bọc lại cho test: câu SQL đầu tiên khớp `match` dừng ở lúc chạy (`first`, `run`, `all`) cho tới khi gọi `release()`.
 * `reached` xong khi câu đó đã tới chỗ dừng. Dùng để dựng đúng một thứ tự chen nhau giữa hai request.
 */
export function gateDb(db: D1Database, match: RegExp) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let arrive!: () => void;
  const reached = new Promise<void>((r) => (arrive = r));
  let used = false;
  const hold = (stmt: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(stmt, {
      get(target, prop) {
        if (prop === "bind") return (...args: unknown[]) => hold(target.bind(...args));
        if (prop === "first" || prop === "run" || prop === "all") {
          return async (...args: unknown[]) => {
            arrive();
            await gate;
            return (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        const v: unknown = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  const wrapped = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (q: string) => {
          const stmt = target.prepare(q);
          if (used || !match.test(q)) return stmt;
          used = true;
          return hold(stmt);
        };
      }
      const v: unknown = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { db: wrapped, release, reached };
}
