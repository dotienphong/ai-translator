// Báo cáo tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2): kiểm schema, lưu, dọn, và đánh giá để cảnh báo.
// Đi qua POST /v1/diagnostics với `kind: "speaker_health"` (src/diagnostics.ts). Cam kết: KHÔNG có tên người, không có chữ. Server
// không tin app đã che: mọi trường theo danh sách cho phép (khóa lạ ở bất kỳ cấp nào là từ chối), rồi bộ phát hiện dữ liệu nhạy
// cảm của báo cáo lỗi chạy thêm một lần trên các chuỗi đã nhận.
import { type AlertKind, raiseAlert } from "./alerts";
import { findSensitive, type SensitiveRule } from "./diagnostics-scan";
import { isRecord, parseDeviceIdHash } from "./http";

export const SPEAKER_HEALTH_KIND = "speaker_health";
export const MEETING_APPS = ["teams", "zoom", "meet_chrome", "meet_edge"] as const;
export type MeetingApp = (typeof MEETING_APPS)[number];
export const HEALTH_STATES = ["ok", "no_names", "no_speaking", "no_permission", "blocked"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];
/** Hỏng do công thức hay app họp đổi (khác `no_permission`, là việc của người dùng): tính vào ngưỡng cảnh báo. */
export const BROKEN_STATES: readonly HealthState[] = ["no_names", "no_speaking", "blocked"];

/** Giữ 60 ngày. */
export const HEALTH_RETENTION_SECONDS = 60 * 86400;
export const HEALTH_PRUNE_BATCH = 500;
/**
 * Cảnh báo khi một (app họp, phiên bản app họp) có ≥ chừng này phần trăm MÁY hỏng, từ chừng này báo cáo và có ít nhất DEGRADED_MIN_DEVICES
 * máy khác nhau hỏng (spec §7.2). Đếm máy chứ không đếm báo cáo: một máy hỏng nhiều ngày liền không đủ để gọi là app họp đổi.
 */
export const DEGRADED_SHARE = 0.3;
export const DEGRADED_MIN_REPORTS = 5;
export const DEGRADED_MIN_DEVICES = 3;
/** Số ngày gần nhất xét cho ngưỡng trên và cho "kiểm tra tự động hỏng liền". */
export const DEGRADED_WINDOW_DAYS = 3;
export const CANARY_FAIL_DAYS = 2;
/** Kiểm tra tự động từng có kết quả (trong 14 ngày qua) mà im lặng chừng này ngày thì cũng cảnh báo: máy tắt, bộ chuyển hỏng, lịch tác vụ chết. */
export const CANARY_SILENT_DAYS = 3;
/** Mỗi chủ thể cảnh báo (app họp, phiên bản) chỉ cảnh báo một lần mỗi chừng này. */
export const ALERT_EVERY_SECONDS = 86400;

const APP_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,32})?$/;
const MEETING_VERSION = /^[0-9A-Za-z._+-]{1,40}$/;
const PLAIN = /^[0-9A-Za-z._+ -]+$/;
const TOKEN = /^[A-Za-z0-9_-]{1,32}$/;
const ROLE = /^[A-Za-z]{1,32}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LONG_DIGITS = /\d{5}/;
const UNKNOWN_VERSION = "?";

const TOP_KEYS = ["v", "kind", "day", "canary", "build", "app", "os", "meeting", "recipe_version", "state", "minutes", "learned", "patterns", "device_id_hash"];

export interface SpeakerHealth {
  day: string;
  canary: boolean;
  build: "release" | "debug";
  app_version: string;
  os_name: string;
  os_version: string;
  arch: string;
  meeting_app: MeetingApp;
  meeting_version: string;
  recipe_version: number;
  state: HealthState;
  minutes_ok: number;
  minutes_total: number;
  learned: number;
  /** JSON của mảng mẫu chỉ báo (đã kiểm), '[]' nếu không có. */
  patterns: string;
  device_id_hash: string;
}

export type ParseHealth = { ok: true; report: SpeakerHealth } | { ok: false; field: string };

const bad = (field: string): ParseHealth => ({ ok: false, field });

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
}

/** Chuỗi chỉ có chữ, số, `.`, `_`, `+`, `-` và khoảng trắng, dài 1 đến `max`. */
function plain(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length >= 1 && v.length <= max && PLAIN.test(v) ? v : null;
}

/** Chỉ các khóa cho phép (không thiếu thì thôi, nhưng không thừa). */
function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

function token(v: unknown): boolean {
  return typeof v === "string" && TOKEN.test(v) && !LONG_DIGITS.test(v);
}

/** Mẫu chỉ báo: vai trò, đường đi (≤ 8 chỉ số), ≤ 3 trạng thái, mỗi trạng thái ≤ 6 lớp. Không hợp lệ thì null. */
function patternsOf(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 4) return null;
  for (const p of v) {
    if (!isRecord(p) || !onlyKeys(p, ["role", "path", "states"])) return null;
    if (typeof p.role !== "string" || !ROLE.test(p.role)) return null;
    if (!Array.isArray(p.path) || p.path.length > 8 || !p.path.every((i) => int(i, 0, 65535) !== null)) return null;
    if (!Array.isArray(p.states) || p.states.length > 3) return null;
    for (const s of p.states) {
      if (!isRecord(s) || !onlyKeys(s, ["subrole", "classes"])) return null;
      if (typeof s.subrole !== "string" || (s.subrole !== "" && !token(s.subrole))) return null;
      if (!Array.isArray(s.classes) || s.classes.length > 6 || !s.classes.every(token)) return null;
    }
  }
  return JSON.stringify(v);
}

/** Ngày UTC 'YYYY-MM-DD' có thật và nằm trong [now − 8 ngày, now + 1 ngày]. */
function dayOk(v: unknown, now: number): v is string {
  const m = typeof v === "string" ? DAY.exec(v) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = Date.UTC(y, mo - 1, d) / 1000;
  const back = new Date(at * 1000);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d && at >= now - 8 * 86400 && at <= now + 86400;
}

/**
 * Kiểm thân request `speaker_health`. Sai thì trả tên khóa cấp trên của trường sai. Danh sách cho phép ở mọi cấp: khóa lạ (nơi tên
 * người có thể lọt vào) là từ chối. Không chạy bộ phát hiện dữ liệu nhạy cảm: việc đó ở findSpeakerSensitive.
 */
export function parseSpeakerHealth(body: Record<string, unknown> | null, now: number): ParseHealth {
  if (body === null) return bad("body");
  if (!onlyKeys(body, TOP_KEYS)) return bad("body");
  if (body.v !== 1) return bad("v");
  if (body.kind !== SPEAKER_HEALTH_KIND) return bad("kind");
  if (!dayOk(body.day, now)) return bad("day");
  if (typeof body.canary !== "boolean") return bad("canary");
  const build = oneOf(body.build, ["release", "debug"] as const);
  if (build === null) return bad("build");

  const app = isRecord(body.app) && onlyKeys(body.app, ["version"]) ? body.app : null;
  const appVersion = typeof app?.version === "string" && app.version.length <= 40 && APP_VERSION.test(app.version) ? app.version : null;
  if (appVersion === null) return bad("app");

  const os = isRecord(body.os) && onlyKeys(body.os, ["name", "version", "arch"]) ? body.os : null;
  const osName = plain(os?.name, 32);
  const osVersion = plain(os?.version, 64);
  const arch = plain(os?.arch, 16);
  if (osName === null || osVersion === null || arch === null) return bad("os");

  const meeting = isRecord(body.meeting) && onlyKeys(body.meeting, ["app", "version"]) ? body.meeting : null;
  const meetingApp = oneOf(meeting?.app, MEETING_APPS);
  const rawVersion = meeting?.version;
  const meetingVersion =
    rawVersion === null || rawVersion === undefined
      ? UNKNOWN_VERSION
      : typeof rawVersion === "string" && MEETING_VERSION.test(rawVersion) && rawVersion !== UNKNOWN_VERSION
        ? rawVersion
        : null;
  if (meetingApp === null || meetingVersion === null) return bad("meeting");

  const recipeVersion = int(body.recipe_version, 0, 1_000_000);
  if (recipeVersion === null) return bad("recipe_version");
  const state = oneOf(body.state, HEALTH_STATES);
  if (state === null) return bad("state");
  const minutes = isRecord(body.minutes) && onlyKeys(body.minutes, ["ok", "total"]) ? body.minutes : null;
  const total = int(minutes?.total, 0, 1500);
  const ok = int(minutes?.ok, 0, 1500);
  if (total === null || ok === null || ok > total) return bad("minutes");
  const learned = int(body.learned, 0, 64);
  if (learned === null) return bad("learned");
  const patterns = patternsOf(body.patterns);
  if (patterns === null) return bad("patterns");
  const deviceIdHash = parseDeviceIdHash(body.device_id_hash);
  if (deviceIdHash === null) return bad("device_id_hash");

  return {
    ok: true,
    report: {
      day: body.day as string,
      canary: body.canary,
      build,
      app_version: appVersion,
      os_name: osName,
      os_version: osVersion,
      arch,
      meeting_app: meetingApp,
      meeting_version: meetingVersion,
      recipe_version: recipeVersion,
      state,
      minutes_ok: ok,
      minutes_total: total,
      learned,
      patterns,
      device_id_hash: deviceIdHash,
    },
  };
}

/** Quy tắc nhạy cảm đầu tiên khớp trong các chuỗi tự do đã nhận (phiên bản, hệ điều hành, mẫu chỉ báo), hoặc null. */
export function findSpeakerSensitive(r: SpeakerHealth): SensitiveRule | null {
  for (const s of [r.app_version, r.os_name, r.os_version, r.arch, r.meeting_version, r.patterns]) {
    const rule = findSensitive(s);
    if (rule !== null) return rule;
  }
  return null;
}

/** Câu ghi một báo cáo. Gửi lại cùng khóa (app thử lại sau lỗi mạng) không đổi gì: `meta.changes` là 0. */
export function insertSpeakerHealthStatement(db: D1Database, r: SpeakerHealth, receivedAt: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO speaker_health (device_id_hash, day, meeting_app, meeting_version, canary, received_at, build, app_version,
                                             os_name, os_version, arch, recipe_version, state, minutes_ok, minutes_total, learned, patterns)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    )
    .bind(
      r.device_id_hash,
      r.day,
      r.meeting_app,
      r.meeting_version,
      r.canary ? 1 : 0,
      receivedAt,
      r.build,
      r.app_version,
      r.os_name,
      r.os_version,
      r.arch,
      r.recipe_version,
      r.state,
      r.minutes_ok,
      r.minutes_total,
      r.learned,
      r.patterns,
    );
}

/** Dọn báo cáo quá hạn (mỗi lượt tối đa HEALTH_PRUNE_BATCH dòng; cron chạy mỗi 5 phút nên đuổi kịp). */
export async function pruneSpeakerHealth(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(
      `DELETE FROM speaker_health WHERE (device_id_hash, day, meeting_app, meeting_version, canary) IN
         (SELECT device_id_hash, day, meeting_app, meeting_version, canary FROM speaker_health WHERE received_at < ?1 ORDER BY received_at LIMIT ?2)`,
    )
    .bind(now - HEALTH_RETENTION_SECONDS, HEALTH_PRUNE_BATCH)
    .run();
}

export interface Degraded {
  meeting_app: MeetingApp;
  meeting_version: string;
  reports: number;
  broken: number;
  devices: number;
  broken_devices: number;
}

/**
 * Các (app họp, phiên bản app họp) của người dùng thật (bản release, không phải canary) trong DEGRADED_WINDOW_DAYS ngày gần nhất có từ
 * DEGRADED_MIN_REPORTS báo cáo, ít nhất DEGRADED_MIN_DEVICES máy hỏng và ≥ DEGRADED_SHARE số máy hỏng. Một máy tính là hỏng nếu có ít nhất
 * một báo cáo hỏng trong cửa sổ; máy gửi nhiều báo cáo (nhiều ngày) chỉ tính một lần ở cả tử và mẫu. `no_permission` không tính là hỏng
 * (việc của người dùng). `device_id_hash` do app tự khai nên đây vẫn là tín hiệu không xác thực.
 */
export async function findDegraded(db: D1Database, now: number): Promise<Degraded[]> {
  const { results } = await db
    .prepare(
      `SELECT meeting_app, meeting_version, COUNT(*) AS reports,
              SUM(state IN ('no_names', 'no_speaking', 'blocked')) AS broken,
              COUNT(DISTINCT device_id_hash) AS devices,
              COUNT(DISTINCT CASE WHEN state IN ('no_names', 'no_speaking', 'blocked') THEN device_id_hash END) AS broken_devices
       FROM speaker_health
       WHERE canary = 0 AND build = 'release' AND received_at >= ?1
       GROUP BY meeting_app, meeting_version
       HAVING COUNT(*) >= ?2
          AND COUNT(DISTINCT CASE WHEN state IN ('no_names', 'no_speaking', 'blocked') THEN device_id_hash END) >= ?4
          AND COUNT(DISTINCT CASE WHEN state IN ('no_names', 'no_speaking', 'blocked') THEN device_id_hash END) * 1.0 / COUNT(DISTINCT device_id_hash) >= ?3
       ORDER BY meeting_app, meeting_version`,
    )
    .bind(now - DEGRADED_WINDOW_DAYS * 86400, DEGRADED_MIN_REPORTS, DEGRADED_SHARE, DEGRADED_MIN_DEVICES)
    .all<Degraded>();
  return results;
}

export interface CanaryFailing {
  meeting_app: MeetingApp;
  os_name: string;
}

/**
 * Các (app họp, hệ điều hành) có kiểm tra tự động hỏng CANARY_FAIL_DAYS ngày liền (hôm nay và các ngày trước đó, theo giờ UTC): mỗi
 * ngày đều có kết quả và không có lượt nào `ok`. Hai máy cùng app và cùng hệ điều hành chung một chủ thể.
 */
export async function findCanaryFailing(db: D1Database, now: number): Promise<CanaryFailing[]> {
  const days = Array.from({ length: CANARY_FAIL_DAYS }, (_, i) => new Date((now - i * 86400) * 1000).toISOString().slice(0, 10));
  const { results } = await db
    .prepare(
      `SELECT meeting_app, os_name, day, SUM(state = 'ok') AS oks
       FROM speaker_health WHERE canary = 1 AND day IN (${days.map(() => "?").join(",")})
       GROUP BY meeting_app, os_name, day`,
    )
    .bind(...days)
    .all<{ meeting_app: MeetingApp; os_name: string; day: string; oks: number }>();
  const failed = new Map<string, { row: CanaryFailing; days: number }>();
  for (const r of results) {
    if (r.oks !== 0) continue;
    const key = `${r.meeting_app}|${r.os_name}`;
    const entry = failed.get(key) ?? { row: { meeting_app: r.meeting_app, os_name: r.os_name }, days: 0 };
    entry.days++;
    failed.set(key, entry);
  }
  return [...failed.values()].filter((e) => e.days === CANARY_FAIL_DAYS).map((e) => e.row);
}

/**
 * Các (app họp, hệ điều hành) từng có kết quả kiểm tra tự động trong 14 ngày qua nhưng không có kết quả nào trong CANARY_SILENT_DAYS ngày
 * gần nhất. Không có kết quả cũng là hỏng: nếu chỉ chờ kết quả `hỏng`, kiểm tra chết lặng im sẽ không bao giờ báo.
 */
export async function findCanarySilent(db: D1Database, now: number): Promise<CanaryFailing[]> {
  const { results } = await db
    .prepare(
      `SELECT meeting_app, os_name FROM speaker_health WHERE canary = 1 AND received_at >= ?1
       GROUP BY meeting_app, os_name HAVING MAX(received_at) < ?2 ORDER BY meeting_app, os_name`,
    )
    .bind(now - 14 * 86400, now - CANARY_SILENT_DAYS * 86400)
    .all<CanaryFailing>();
  return results;
}

/**
 * Cron: đánh giá và cảnh báo. Mỗi chủ thể (`degraded:<app>:<phiên bản>` hay `canary:<app>:<hệ điều hành>`) chỉ cảnh báo một lần mỗi
 * ALERT_EVERY_SECONDS, nhớ ở bảng ops_alerts bằng một dòng có `kind` riêng của chủ thể (`speaker_seen:…`), không phải loại cảnh báo gửi
 * email: email vẫn là hai loại tĩnh `speaker_health_degraded`, `speaker_canary_failed` (không mang tên chủ thể).
 */
export async function evaluateSpeakerHealth(db: D1Database, now: number): Promise<{ degraded: number; canary: number }> {
  const fresh = async (subject: string): Promise<boolean> => {
    const kind = `speaker_seen:${subject}`;
    const row = await db.prepare("SELECT MAX(window_start) AS at FROM ops_alerts WHERE kind = ?1").bind(kind).first<{ at: number | null }>();
    if (row?.at != null && now - row.at < ALERT_EVERY_SECONDS) return false;
    await db.prepare("INSERT OR REPLACE INTO ops_alerts (kind, window_start, count, notified_count) VALUES (?1, ?2, 1, 1)").bind(kind, now).run();
    return true;
  };
  let degraded = 0;
  for (const d of await findDegraded(db, now)) {
    if (await fresh(`degraded:${d.meeting_app}:${d.meeting_version}`)) {
      await raiseAlert(db, "speaker_health_degraded" satisfies AlertKind, now);
      degraded++;
    }
  }
  let canary = 0;
  for (const c of [...(await findCanaryFailing(db, now)), ...(await findCanarySilent(db, now))]) {
    if (await fresh(`canary:${c.meeting_app}:${c.os_name}`)) {
      await raiseAlert(db, "speaker_canary_failed" satisfies AlertKind, now);
      canary++;
    }
  }
  // Dọn dấu chủ thể quá 7 ngày (không tích mãi).
  await db.prepare("DELETE FROM ops_alerts WHERE kind LIKE 'speaker_seen:%' AND window_start < ?1").bind(now - 7 * 86400).run();
  return { degraded, canary };
}
