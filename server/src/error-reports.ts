// Báo cáo lỗi gửi từ app (spec 2026-10-17-diagnostics-reports-design.md §2, §3): kiểu, kiểm schema, lưu và dọn.
// Dùng chung giữa Worker API (POST /v1/diagnostics, cron) và Worker admin (đọc, xóa), nên không nhập gì từ ./admin* hay ./app.
import { findSensitive, type SensitiveRule } from "./diagnostics-scan";
import { isRecord, parseDeviceIdHash } from "./http";
import { PLAN_CODES } from "./plans";

export const REPORT_KINDS = ["crash", "session_error", "sidecar_died", "manual"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_PLANS = ["free", ...PLAN_CODES] as const;
export type ReportPlan = (typeof REPORT_PLANS)[number];
export const UI_LANGS = ["vi", "en", "ja", "zh", "ko"] as const;
export type UiLang = (typeof UI_LANGS)[number];
export const GPU_BACKENDS = ["metal", "vulkan", "cpu"] as const;
export type GpuBackend = (typeof GPU_BACKENDS)[number];
export const BUILDS = ["release", "debug"] as const;
export type Build = (typeof BUILDS)[number];

/** Trần thân request của /v1/diagnostics (app giữ báo cáo ≤ 64 KB; phần dư cho cách escape JSON). */
export const MAX_BODY_BYTES = 80 * 1024;
/** Trần từng log, tính theo byte UTF-8. */
export const LOG_LIMITS = { app: 24 * 1024, asr: 16 * 1024, llama: 16 * 1024 } as const;
export const MAX_MESSAGE_CHARS = 500;
/** Giờ máy (`at`) được lệch giờ server tối đa ngần này. */
export const CLOCK_SKEW_SECONDS = 7 * 86400;
/** Dấu vân tay của báo cáo `manual`: báo cáo gửi tay không thuộc nhóm lỗi nào. */
export const ZERO_FINGERPRINT = "0000000000000000";
export const REPORT_ID = /^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const FINGERPRINT = /^[0-9a-f]{16}$/;

const CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,32})?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface ErrorReport {
  id: string;
  kind: ReportKind;
  code: string | null;
  fingerprint: string;
  /** Giờ máy lúc xảy ra (giây Unix). */
  at: number;
  message: string;
  build: Build;
  app_version: string;
  os_name: string;
  os_version: string;
  arch: string;
  chip: string | null;
  ram_mb: number | null;
  gpu_backend: GpuBackend | null;
  model_pack: string | null;
  plan: ReportPlan | null;
  ui_lang: UiLang;
  device_id_hash: string;
  logs: { app: string; asr: string; llama: string };
}

export type ParseResult = { ok: true; report: ErrorReport } | { ok: false; field: string };

const bad = (field: string): ParseResult => ({ ok: false, field });

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/** Chuỗi thông tin máy: 1 đến `max` ký tự, không có ký tự điều khiển. */
function meta(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length >= 1 && v.length <= max && !CONTROL.test(v) ? v : null;
}

type Optional<T> = { ok: true; value: T | null } | { ok: false };

/** Trường tùy chọn: null hay vắng là hợp lệ (giá trị null); có mà sai thì không hợp lệ. */
function optional<T>(v: unknown, parse: (x: unknown) => T | null): Optional<T> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const parsed = parse(v);
  return parsed === null ? { ok: false } : { ok: true, value: parsed };
}

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

/**
 * Kiểm thân request của POST /v1/diagnostics. Sai thì trả tên khóa cấp trên của trường sai (kể cả lỗi ở khóa con, ví dụ
 * `os.arch` sai thì `os`). Không chạy bộ phát hiện dữ liệu nhạy cảm: việc đó ở findReportSensitive.
 */
export function parseReport(body: Record<string, unknown> | null, now: number): ParseResult {
  if (body === null) return bad("body");
  if (body.v !== 1) return bad("v");
  const id = typeof body.id === "string" && REPORT_ID.test(body.id) ? body.id : null;
  if (id === null) return bad("id");
  const kind = oneOf(body.kind, REPORT_KINDS);
  if (kind === null) return bad("kind");
  let code: string | null = null;
  if (kind === "manual") {
    if (body.code !== null && body.code !== undefined) return bad("code");
  } else {
    code = typeof body.code === "string" && CODE.test(body.code) ? body.code : null;
    if (code === null) return bad("code");
  }
  const fingerprint = typeof body.fingerprint === "string" && FINGERPRINT.test(body.fingerprint) ? body.fingerprint : null;
  if (fingerprint === null || (kind === "manual") !== (fingerprint === ZERO_FINGERPRINT)) return bad("fingerprint");
  const at = body.at;
  if (typeof at !== "number" || !Number.isSafeInteger(at) || Math.abs(at - now) > CLOCK_SKEW_SECONDS) return bad("at");
  const message = typeof body.message === "string" && body.message.length <= MAX_MESSAGE_CHARS ? body.message : null;
  if (message === null) return bad("message");
  const build = oneOf(body.build, BUILDS);
  if (build === null) return bad("build");

  const app = isRecord(body.app) ? body.app : null;
  const versionRaw = app?.version;
  const appVersion = typeof versionRaw === "string" && versionRaw.length <= 40 && VERSION.test(versionRaw) ? versionRaw : null;
  if (appVersion === null) return bad("app");

  const os = isRecord(body.os) ? body.os : null;
  const osName = meta(os?.name, 32);
  const osVersion = meta(os?.version, 64);
  const arch = meta(os?.arch, 16);
  if (osName === null || osVersion === null || arch === null) return bad("os");

  const hw = isRecord(body.hw) ? body.hw : null;
  if (hw === null) return bad("hw");
  const chip = optional(hw.chip, (x) => meta(x, 128));
  const ram = optional(hw.ram_mb, (x) => (typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= 4_194_304 ? x : null));
  const gpu = optional(hw.gpu_backend, (x) => oneOf(x, GPU_BACKENDS));
  if (!chip.ok || !ram.ok || !gpu.ok) return bad("hw");

  const modelPack = optional(body.model_pack, (x) => meta(x, 64));
  if (!modelPack.ok) return bad("model_pack");
  const plan = optional(body.plan, (x) => oneOf(x, REPORT_PLANS));
  if (!plan.ok) return bad("plan");
  const uiLang = oneOf(body.ui_lang, UI_LANGS);
  if (uiLang === null) return bad("ui_lang");
  const deviceIdHash = parseDeviceIdHash(body.device_id_hash);
  if (deviceIdHash === null) return bad("device_id_hash");

  const logs = isRecord(body.logs) ? body.logs : null;
  const appLog = logs?.app;
  const asrLog = logs?.asr;
  const llamaLog = logs?.llama;
  if (
    typeof appLog !== "string" ||
    typeof asrLog !== "string" ||
    typeof llamaLog !== "string" ||
    utf8Length(appLog) > LOG_LIMITS.app ||
    utf8Length(asrLog) > LOG_LIMITS.asr ||
    utf8Length(llamaLog) > LOG_LIMITS.llama
  ) {
    return bad("logs");
  }

  return {
    ok: true,
    report: {
      id,
      kind,
      code,
      fingerprint,
      at,
      message,
      build,
      app_version: appVersion,
      os_name: osName,
      os_version: osVersion,
      arch,
      chip: chip.value,
      ram_mb: ram.value,
      gpu_backend: gpu.value,
      model_pack: modelPack.value,
      plan: plan.value,
      ui_lang: uiLang,
      device_id_hash: deviceIdHash,
      logs: { app: appLog, asr: asrLog, llama: llamaLog },
    },
  };
}

/** Quy tắc nhạy cảm đầu tiên khớp trong các chuỗi tự do của báo cáo (không tính id, dấu vân tay, mã máy đã băm), hoặc null. */
export function findReportSensitive(r: ErrorReport): SensitiveRule | null {
  const strings = [r.message, r.chip, r.model_pack, r.os_name, r.os_version, r.app_version, r.logs.app, r.logs.asr, r.logs.llama];
  for (const s of strings) {
    if (s === null) continue;
    const rule = findSensitive(s);
    if (rule !== null) return rule;
  }
  return null;
}

/**
 * Hai câu ghi của một báo cáo, để đặt trong một batch. Câu thứ hai chỉ ghi khi câu đầu thật sự thêm một dòng (`changes() = 1`),
 * nên gửi lại cùng mã báo cáo (app thử lại sau lỗi mạng) không đổi gì. Câu đầu cho `meta.changes` để biết báo cáo có mới không.
 */
export function insertReportStatements(db: D1Database, r: ErrorReport, receivedAt: number): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO error_reports (id, received_at, occurred_at, kind, code, fingerprint, build, app_version, os_name, os_version,
                                              arch, chip, ram_mb, gpu_backend, model_pack, plan, ui_lang, device_id_hash, message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
      )
      .bind(
        r.id,
        receivedAt,
        r.at,
        r.kind,
        r.code,
        r.fingerprint,
        r.build,
        r.app_version,
        r.os_name,
        r.os_version,
        r.arch,
        r.chip,
        r.ram_mb,
        r.gpu_backend,
        r.model_pack,
        r.plan,
        r.ui_lang,
        r.device_id_hash,
        r.message,
      ),
    db
      .prepare("INSERT INTO error_report_logs (id, app_log, asr_log, llama_log) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1")
      .bind(r.id, r.logs.app, r.logs.asr, r.logs.llama),
  ];
}

/** Thời gian giữ một báo cáo (spec §3). */
export const RETENTION_SECONDS = 30 * 86400;
/** Số báo cáo tối đa trong D1: trần dung lượng khi bị gửi tràn (≤ 192 MB nếu mọi log đầy). */
export const MAX_STORED_REPORTS = 3000;
/** Số dòng xóa tối đa mỗi lượt cho mỗi lý do, để một lần cron không chạy quá lâu. */
export const PRUNE_BATCH = 500;

/**
 * Dọn báo cáo quá hạn, rồi báo cáo cũ nhất vượt trần `maxStored`. Mỗi lần xóa tối đa PRUNE_BATCH dòng cho mỗi lý do (cron chạy mỗi
 * 5 phút nên đuổi kịp). Bảng log xóa trước bảng cha; cả bốn câu trong một batch (một transaction).
 */
export async function pruneErrorReports(db: D1Database, now: number, maxStored: number = MAX_STORED_REPORTS): Promise<void> {
  const expired = "SELECT id FROM error_reports WHERE received_at < ?1 ORDER BY received_at, id LIMIT ?2";
  const overflow = "SELECT id FROM error_reports ORDER BY received_at DESC, id DESC LIMIT ?1 OFFSET ?2";
  const cutoff = now - RETENTION_SECONDS;
  await db.batch([
    db.prepare(`DELETE FROM error_report_logs WHERE id IN (${expired})`).bind(cutoff, PRUNE_BATCH),
    db.prepare(`DELETE FROM error_reports WHERE id IN (${expired})`).bind(cutoff, PRUNE_BATCH),
    db.prepare(`DELETE FROM error_report_logs WHERE id IN (${overflow})`).bind(PRUNE_BATCH, maxStored),
    db.prepare(`DELETE FROM error_reports WHERE id IN (${overflow})`).bind(PRUNE_BATCH, maxStored),
  ]);
}
