// Dữ liệu và API giả của trang Báo cáo lỗi cho `pnpm dev` (spec 2026-10-17-diagnostics-reports-design.md §4). Hình dạng khớp hợp đồng
// ở src/api/types.ts. Sáu nhóm (một nhóm chỉ có báo cáo debug, một nhóm 23 báo cáo để thấy "Tải thêm" ở trang nhóm), năm báo cáo
// gửi tay. Một báo cáo mang log có chữ giống HTML để thấy log chỉ hiện dạng văn bản. Thao tác xóa trả thành công giả (đếm đúng số
// dòng khớp, không đổi dữ liệu). Không dùng mã máy hay log thật.
import type { ErrorGroup, ErrorReportDetail, GroupKind, Page } from "../src/api/types.ts";

interface Reply {
  status: number;
  body: unknown;
}
const ok = (body: unknown, status = 200): Reply => ({ status, body });

const NOW = Math.floor(Date.now() / 1000);
const ID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const code4 = (n: number) => Array.from({ length: 4 }, (_, k) => ID_CHARS[Math.floor(n / 32 ** k) % 32]).join("");
const idOf = (n: number) => `R-${code4(n)}-${code4(n * 31 + 7)}`;
const deviceOf = (n: number) => ((n % 7) + 10).toString(16).repeat(2).padEnd(64, "0");
const VERSIONS = ["0.1.10", "0.1.9", "0.1.8"];
const PLANS: ErrorReportDetail["plan"][] = ["free", "monthly", "six_months", "yearly"];
const LANGS = ["vi", "en", "ja", "zh", "ko"];

const LOGS = {
  app: [
    "[2026-10-17][05:07:12][INFO][pipeline::supervisor] tiến trình phụ: Starting { which: Asr, first_run: false }",
    "[2026-10-17][05:07:13][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr, failures: 2 }",
    "[2026-10-17][05:07:14][ERROR][meeting_translator_lib::session] phiên dịch dừng vì lỗi sidecarFailed: không khởi động được",
  ].join("\n"),
  asr: "ggml_metal_init: error: failed to load the Metal library\nwhisper_init_with_params_no_state: failed to initialize the GPU, falling back to CPU\n",
  llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids - the tokenizer config may be incorrect\n",
};

function make(seq: number, over: Partial<ErrorReportDetail>): ErrorReportDetail {
  const win = seq % 5 === 4;
  const at = NOW - (seq * 3 + 1) * 3600;
  return {
    id: idOf(seq),
    received_at: at,
    occurred_at: at - 90,
    kind: "session_error",
    code: "sidecarFailed",
    fingerprint: "3fa1c09be2d47a55",
    build: "release",
    app_version: VERSIONS[seq % 3] ?? "0.1.10",
    os_name: win ? "windows" : "macos",
    os_version: win ? "11 23H2" : "15.6.1",
    arch: win ? "x86_64" : "aarch64",
    chip: win ? "Intel(R) Core(TM) i7-1185G7 @ 3.00GHz" : "Apple M4 Pro",
    ram_mb: win ? 16384 : 24576,
    gpu_backend: win ? "vulkan" : "metal",
    model_pack: seq % 2 ? "standard" : "light",
    plan: PLANS[seq % 4] ?? null,
    ui_lang: LANGS[seq % 5] ?? "vi",
    device_id_hash: deviceOf(seq),
    message: "tiến trình phụ không khởi động được (exit status: 1)",
    logs: LOGS,
    ...over,
  };
}

interface Seed {
  fingerprint: string;
  kind: GroupKind;
  code: string;
  message: string;
  count: number;
  build?: "release" | "debug";
}

const SEEDS: Seed[] = [
  { fingerprint: "3fa1c09be2d47a55", kind: "session_error", code: "sidecarFailed", message: "tiến trình phụ không khởi động được (exit status: 1)", count: 9 },
  { fingerprint: "91be77d20c5a1e03", kind: "crash", code: "panic", message: "panicked at src/session.rs:412: index out of bounds", count: 4 },
  { fingerprint: "c7d21a4f9e8b3d60", kind: "crash", code: "unclean_exit", message: "lần chạy trước kết thúc không rõ lý do", count: 23 },
  { fingerprint: "5e6f7a8b9c0d4e1f", kind: "sidecar_died", code: "llama", message: "llama-server thoát sớm (exit status: 1)", count: 6 },
  { fingerprint: "0b9e7c1e5f3a4c1d", kind: "session_error", code: "modelBroken", message: "model không nạp được, kể cả bằng CPU", count: 2 },
  { fingerprint: "dddddddddddddddd", kind: "session_error", code: "captureFailed", message: "không mở được nguồn âm thanh", count: 3, build: "debug" },
];

const reports: ErrorReportDetail[] = [];
let seq = 0;
for (const s of SEEDS) {
  for (let i = 0; i < s.count; i++) {
    seq += 1;
    reports.push(make(seq, { fingerprint: s.fingerprint, kind: s.kind, code: s.code, message: s.message, build: s.build ?? "release" }));
  }
}
// Báo cáo gửi tay (không có mã lỗi, dấu vân tay toàn số 0); một báo cáo của bản debug; một báo cáo có log giống HTML.
for (let i = 0; i < 5; i++) {
  seq += 1;
  reports.push(
    make(seq, {
      kind: "manual",
      code: null,
      fingerprint: "0000000000000000",
      build: i === 4 ? "debug" : "release",
      message: i === 0 ? "" : "phụ đề chậm hơn lời nói khoảng 3 giây",
      logs: i === 1 ? { ...LOGS, app: `<b>không phải HTML</b> <img src=x onerror="alert(1)">\n${LOGS.app}` } : LOGS,
    }),
  );
}

function groupsOf(rows: ErrorReportDetail[]): ErrorGroup[] {
  const by = new Map<string, ErrorReportDetail[]>();
  for (const r of rows) if (r.kind !== "manual") by.set(r.fingerprint, [...(by.get(r.fingerprint) ?? []), r]);
  return [...by.entries()]
    .map(([fingerprint, rs]) => {
      const first = rs[0] as ErrorReportDetail;
      return {
        fingerprint,
        kind: first.kind as GroupKind,
        code: first.code,
        reports: rs.length,
        devices: new Set(rs.map((r) => r.device_id_hash)).size,
        release_reports: rs.filter((r) => r.build === "release").length,
        debug_reports: rs.filter((r) => r.build === "debug").length,
        first_at: Math.min(...rs.map((r) => r.received_at)),
        last_at: Math.max(...rs.map((r) => r.received_at)),
        versions: [...new Set(rs.map((r) => r.app_version))].sort(),
      };
    })
    .sort((a, b) => b.last_at - a.last_at);
}

/** Trang 50 dòng theo con trỏ vị trí (giao diện không đọc nội dung con trỏ). */
function paged<T>(rows: T[], url: URL): Page<T> {
  const start = Number(url.searchParams.get("cursor") ?? 0) || 0;
  return { items: rows.slice(start, start + 50), next_cursor: start + 50 < rows.length ? String(start + 50) : null };
}

/** Trả lời các route báo cáo lỗi; null nếu đường dẫn không phải của chúng (để fake-api.ts xử lý tiếp). */
export function errorsReply(method: string, url: URL, body: Record<string, unknown>): Reply | null {
  const path = url.pathname;
  const q = url.searchParams;
  if (method === "POST" && path === "/admin/error-reports/delete") {
    const id = typeof body.id === "string" ? body.id : null;
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : null;
    if ((id === null) === (fingerprint === null)) return ok({ error: "invalid_request", field: "id|fingerprint" }, 400);
    const n = reports.filter((r) => (id !== null ? r.id === id : r.fingerprint === fingerprint)).length;
    return n === 0 ? ok({ error: "not_found" }, 404) : ok({ deleted: n });
  }
  if (method !== "GET") return null;
  if (path === "/admin/error-groups") {
    const kind = q.get("kind");
    const version = q.get("app_version");
    const debug = q.get("include_debug") === "1";
    const rows = groupsOf(reports)
      .filter((g) => (!kind || g.kind === kind) && (!version || g.versions.includes(version)) && (debug || g.release_reports > 0));
    return ok(paged(rows, url));
  }
  if (path === "/admin/error-reports") {
    const debug = q.get("include_debug") === "1";
    const report = q.get("report")?.toUpperCase();
    const rows = reports
      .filter(
        (r) =>
          (!q.get("kind") || r.kind === q.get("kind")) &&
          (!q.get("fingerprint") || r.fingerprint === q.get("fingerprint")) &&
          (!q.get("device") || r.device_id_hash === q.get("device")) &&
          (!report || r.id === report) &&
          (debug || r.build === "release"),
      )
      .sort((a, b) => b.received_at - a.received_at)
      .map(({ logs: _logs, ...meta }) => meta);
    return ok(paged(rows, url));
  }
  const m = /^\/admin\/error-reports\/(R-[0-9A-Z-]+)$/.exec(path);
  if (m) {
    const r = reports.find((x) => x.id === m[1]);
    return r ? ok(r) : ok({ error: "not_found" }, 404);
  }
  return null;
}
