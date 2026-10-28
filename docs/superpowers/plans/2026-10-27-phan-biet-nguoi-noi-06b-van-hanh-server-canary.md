# Phân biệt người nói, kế hoạch 06b: vận hành, phần server, Web Admin, kiểm tra tự động và phần cần chủ dự án

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push** (như file 06). **Task 10–16 làm hoàn toàn trên máy Mac này** (server chạy bằng D1 và workerd cục bộ của vitest, không deploy, không chạm production, Cloudflare, R2; không chạy gì với Teams, Chrome, Edge, Zoom). **Task 17–22 cần chủ dự án** (triển khai, đặt, bật workflow, tài khoản thử, máy thật): kế hoạch chỉ chuẩn bị lệnh và quy trình, ghi rõ ai làm; không có số liệu giả, và mọi mục "chưa kiểm" giữ nguyên chữ cho tới khi có số thật.

**Goal, Architecture, Tech Stack, Spec, Dựa trên, Quy ước, Quyết định thiết kế, Cấu trúc file:** như file `2026-10-27-phan-biet-nguoi-noi-06-van-hanh.md` (đọc file đó trước; số Task dùng chung). Task 0–9 (crate `speaker-ops`, tải công thức, ký và đăng công thức, giao thức 3, `app_version` Windows, sổ báo cáo tình trạng ở app, bộ che tên) phải xong trước Task 10. Task 13 cần Task 5 (`TileSample.shapes`) và Task 7; Task 14 cần Task 13.

**Phủ spec, "Để kế hoạch sau", rủi ro và điều cần chủ dự án quyết của cả hai file ở cuối file này.**

---

### Task 10: Server nhận và lưu báo cáo tình trạng

Migration 0007 chỉ **thêm** bảng `speaker_health` và hai index. `POST /v1/diagnostics` nhận `kind: "speaker_health"` **trước** `parseReport`: bảng riêng, hạn mức riêng (`speaker_device` 20 mỗi giờ, `speaker_global` 600), danh sách trường cho phép ở mọi cấp (khóa lạ là từ chối: nơi tên người có thể lọt vào), bộ phát hiện nhạy cảm của báo cáo lỗi chạy thêm một lần, `INSERT OR IGNORE` theo khóa (máy, ngày, app họp, phiên bản, canary), xóa theo email xóa luôn báo cáo của máy đã kích hoạt license của email đó. Hàm đánh giá và cảnh báo (`evaluateSpeakerHealth`…) nằm cùng file, nối vào cron ở Task 11.

**Files:**
- Create: `server/migrations/0007_speaker_health.sql`, `server/src/speaker-health.ts`
- Create: `server/test/speaker-health-fixture.ts`, `server/test/speaker-health.test.ts`
- Modify: `server/src/{alerts,ratelimit,diagnostics,admin}.ts`, `server/test/{db.ts,schema.test.ts,migrations.test.ts,admin.test.ts}`

- [ ] **Step 1: Migration**

Tạo `server/migrations/0007_speaker_health.sql`:

```sql
-- Báo cáo tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2). Chỉ THÊM một bảng và hai index; không đổi bảng nào
-- đã có. Không có tên người, không có chữ: chỉ phiên bản, trạng thái, số phút và mô tả chỉ báo tự học (vai trò, vị trí, lớp), mọi
-- trường đã qua danh sách cho phép ở src/speaker-health.ts.
-- Giữ 60 ngày (cron */5 dọn: pruneSpeakerHealth). Mỗi (máy, ngày, app họp, phiên bản app họp, canary) một dòng: app gửi lại sau lỗi
-- mạng không tạo bản trùng. `canary = 1` là kết quả của kiểm tra tự động hằng ngày (spec §7.3), không phải của người dùng.
-- Worker cũ không biết bảng này nên chạy đúng trên schema mới: áp migration này TRƯỚC khi deploy Worker mới.

CREATE TABLE speaker_health (
  device_id_hash TEXT NOT NULL,          -- cùng giá trị với error_reports, trials, activations; xóa theo email dùng nó
  day TEXT NOT NULL,                     -- 'YYYY-MM-DD' (UTC) của số liệu
  meeting_app TEXT NOT NULL CHECK (meeting_app IN ('teams', 'zoom', 'meet_chrome', 'meet_edge')),
  meeting_version TEXT NOT NULL,         -- phiên bản app họp; '?' khi app không đọc được
  canary INTEGER NOT NULL CHECK (canary IN (0, 1)),
  received_at INTEGER NOT NULL,          -- giờ server (giây Unix)
  build TEXT NOT NULL CHECK (build IN ('release', 'debug')),
  app_version TEXT NOT NULL,             -- phiên bản AI Translator
  os_name TEXT NOT NULL,
  os_version TEXT NOT NULL,
  arch TEXT NOT NULL,
  recipe_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok', 'no_names', 'no_speaking', 'no_permission', 'blocked')),
  minutes_ok INTEGER NOT NULL,
  minutes_total INTEGER NOT NULL,
  learned INTEGER NOT NULL,
  patterns TEXT NOT NULL,                -- JSON mảng mẫu chỉ báo tự học (không tên người); '[]' nếu không có
  PRIMARY KEY (device_id_hash, day, meeting_app, meeting_version, canary)
) WITHOUT ROWID;
CREATE INDEX speaker_health_received ON speaker_health (received_at);
CREATE INDEX speaker_health_app ON speaker_health (meeting_app, meeting_version, day);
```

- [ ] **Step 2: Module `speaker-health.ts`**

Tạo `server/src/speaker-health.ts`:

```typescript
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
/** Cảnh báo khi một (app họp, phiên bản app họp) có ≥ chừng này phần trăm báo cáo hỏng, từ chừng này báo cáo (spec §7.2). */
export const DEGRADED_SHARE = 0.3;
export const DEGRADED_MIN_REPORTS = 5;
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
}

/**
 * Các (app họp, phiên bản app họp) của người dùng thật (bản release, không phải canary) có ≥ DEGRADED_SHARE báo cáo hỏng trong
 * DEGRADED_WINDOW_DAYS ngày gần nhất, từ DEGRADED_MIN_REPORTS báo cáo. `no_permission` không tính là hỏng (việc của người dùng).
 */
export async function findDegraded(db: D1Database, now: number): Promise<Degraded[]> {
  const { results } = await db
    .prepare(
      `SELECT meeting_app, meeting_version, COUNT(*) AS reports,
              SUM(state IN ('no_names', 'no_speaking', 'blocked')) AS broken
       FROM speaker_health
       WHERE canary = 0 AND build = 'release' AND received_at >= ?1
       GROUP BY meeting_app, meeting_version
       HAVING COUNT(*) >= ?2 AND SUM(state IN ('no_names', 'no_speaking', 'blocked')) * 1.0 / COUNT(*) >= ?3
       ORDER BY meeting_app, meeting_version`,
    )
    .bind(now - DEGRADED_WINDOW_DAYS * 86400, DEGRADED_MIN_REPORTS, DEGRADED_SHARE)
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
```

- [ ] **Step 3: Nối vào server (loại cảnh báo, hạn mức, endpoint, xóa theo email) và hạ tầng test**

**Sửa `server/src/alerts.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  | "diagnostics_flood"
```

Đoạn thêm vào:

```typescript
  | "speaker_health_degraded"
  | "speaker_canary_failed"
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
    "Mở Web Admin, trang Báo cáo lỗi để xem nguồn, xóa báo cáo rác nếu cần.",
```

Đoạn thêm vào:

```typescript
  speaker_health_degraded:
    "Bộ đọc tên người nói: một phiên bản của Teams, Meet hay Zoom có từ 30% báo cáo tình trạng hỏng (không đọc được tên, không thấy ai " +
    '"đang nói", hay app họp không trả lời), từ 5 báo cáo trong 3 ngày qua. Có thể app họp vừa đổi giao diện. Mở Web Admin, trang Báo ' +
    "cáo lỗi, tab Bộ đọc tên để xem app, phiên bản và mẫu chỉ báo tự học; sửa công thức bằng pnpm recipes:update (docs/release/phat-hanh.md). " +
    "Thư này chỉ có số lượng, không nêu app hay phiên bản nào.",
  speaker_canary_failed:
    "Kiểm tra tự động hằng ngày của bộ đọc tên người nói hỏng hai ngày liền trên một app họp và một hệ điều hành (không đọc được tên " +
    "hay chỉ báo \"đang nói\" sai người), hoặc im lặng ba ngày liền (máy tắt, lịch tác vụ chết, không mở được cuộc họp thử). Mở Web " +
    "Admin, trang Báo cáo lỗi, tab Bộ đọc tên, mục Kiểm tra tự động; xem nhật ký trên máy chạy kiểm tra (tools/speaker-canary/README.md). " +
    "Thư này chỉ có số lượng.",
```

**Sửa `server/src/ratelimit.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  diag_global: 120,
```

Đoạn thêm vào:

```typescript
  // Báo cáo tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2) đi cùng endpoint nhưng đếm riêng, để không ăn
  // vào hạn mức của báo cáo lỗi: mỗi máy gửi tối đa vài báo cáo mỗi lần mở app (một cho mỗi ngày và mỗi cặp app họp, phiên bản).
  // Chạm speaker_global thì cũng có cảnh báo diagnostics_flood.
  speaker_device: 20,
  speaker_global: 600,
```

**Sửa `server/src/diagnostics.ts`:**

Thay đoạn:

```typescript
import type { Hono } from "hono";
import { raiseAlert } from "./alerts";
```

bằng:

```typescript
import type { Context, Hono } from "hono";
import { raiseAlert } from "./alerts";
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
import { hit, LIMITS } from "./ratelimit";
```

Đoạn thêm vào:

```typescript
import {
  findSpeakerSensitive,
  insertSpeakerHealthStatement,
  parseSpeakerHealth,
  SPEAKER_HEALTH_KIND,
} from "./speaker-health";
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
export const DIAGNOSTICS_PATH = "/v1/diagnostics";
```

Đoạn thêm vào:

```typescript
/** Báo cáo tình trạng bộ đọc tên (`kind: "speaker_health"`): bảng riêng, hạn mức riêng, không có tên người (src/speaker-health.ts). */
async function storeSpeakerHealth(c: Context<AppEnv>, body: Record<string, unknown>, now: number) {
  const db = c.env.DB;
  const global = await hit(c.env, "speaker_global", "all", now);
  if (!global.allowed) {
    if (global.count === LIMITS.speaker_global + 1) await raiseAlert(db, "diagnostics_flood", now);
    return tooMany(c, global.retryAfter);
  }
  const parsed = parseSpeakerHealth(body, now);
  if (!parsed.ok) return fail(c, 400, "invalid_request", { field: parsed.field });
  const report = parsed.report;
  const device = await hit(c.env, "speaker_device", report.device_id_hash, now);
  if (!device.allowed) return tooMany(c, device.retryAfter);
  const rule = findSpeakerSensitive(report);
  if (rule !== null) {
    console.warn(JSON.stringify({ event: "diagnostics_rejected_sensitive", rule, kind: SPEAKER_HEALTH_KIND }));
    return fail(c, 422, "rejected_sensitive", { rule });
  }
  const [inserted] = await db.batch([insertSpeakerHealthStatement(db, report, now)]);
  console.log(
    JSON.stringify({
      event: "speaker_health_stored",
      meeting_app: report.meeting_app,
      state: report.state,
      canary: report.canary,
      duplicate: inserted?.meta.changes !== 1,
    }),
  );
  return c.json({ ok: true }, 202);
}
```

Thay đoạn:

```typescript
    const global = await hit(c.env, "diag_global", "all", now);
    if (!global.allowed) {
```

bằng:

```typescript
    const body = await readJson(c);
    if (body?.kind === SPEAKER_HEALTH_KIND) return storeSpeakerHealth(c, body, now);
    const global = await hit(c.env, "diag_global", "all", now);
    if (!global.allowed) {
```

Thay đoạn:

```typescript
    const parsed = parseReport(await readJson(c), now);
```

bằng:

```typescript
    const parsed = parseReport(body, now);
```

**Sửa `server/src/admin.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
             'error_reports', (SELECT COUNT(*) FROM error_reports WHERE ${reportsOf}),
```

Đoạn thêm vào:

```typescript
             'speaker_health', (SELECT COUNT(*) FROM speaker_health WHERE ${reportsOf}),
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
      db.prepare(`DELETE FROM error_reports WHERE ${reportsOf.replaceAll("?3", "?")}`).bind(email),
```

Đoạn thêm vào:

```typescript
      db.prepare(`DELETE FROM speaker_health WHERE ${reportsOf.replaceAll("?3", "?")}`).bind(email),
```

Thay đoạn:

```typescript
    const [, , , , , acts, lics, ords] = await db.batch([
```

bằng:

```typescript
    const [, , , , , , acts, lics, ords] = await db.batch([
```

**Sửa `server/test/db.ts`:**

Thay đoạn:

```typescript
      "error_report_logs",
      "error_reports",
```

bằng:

```typescript
      "speaker_health",
      "error_report_logs",
      "error_reports",
```

**Sửa `server/test/schema.test.ts`:**

Thay đoạn:

```typescript
    "rate_limits",
    "support_conversations",
```

bằng:

```typescript
    "rate_limits",
    "speaker_health",
    "support_conversations",
```

**Sửa `server/test/migrations.test.ts`:**

Thay đoạn:

```typescript
it("có đúng sáu migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
    "0005_support_chat.sql",
    "0006_order_lang.sql",
  ]);
```

bằng:

```typescript
it("có đúng bảy migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
    "0005_support_chat.sql",
    "0006_order_lang.sql",
    "0007_speaker_health.sql",
  ]);
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  // D1 đang ở trạng thái sau 0005 (test trên chỉ áp năm migration đầu).
```

Đoạn thêm vào:

```typescript
 Chỉ áp tới 0006: 0007 có test riêng ở cuối file.
```

Thay đoạn:

```typescript
  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => t.name !== "orders")).toEqual(before.filter((t) => t.name !== "orders"));
```

bằng:

```typescript
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 6));

  const after = await tables();
  expect(after.filter((t) => t.name !== "orders")).toEqual(before.filter((t) => t.name !== "orders"));
```

**Sửa `server/test/admin.test.ts`:**

Thay đoạn:

```typescript
      error_reports: 0,
      support_conversations: 0,
```

bằng:

```typescript
      error_reports: 0,
      speaker_health: 0,
      support_conversations: 0,
```

**Sửa `server/test/migrations.test.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  await insert(null).run();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
```

Đoạn thêm vào:

```typescript
it("0007 chỉ thêm bảng speaker_health và hai index; bảng cũ giữ nguyên; trạng thái, app họp, canary chỉ nhận giá trị đã biết; mỗi khóa một dòng", async () => {
  // D1 đang ở trạng thái sau 0006 (test trên chỉ áp sáu migration đầu).
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
  const before = await tables();
  const indexesBefore = await indexNames();

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => t.name !== "speaker_health")).toEqual(before);
  expect(after.map((t) => t.name)).toContain("speaker_health");
  expect(await indexNames()).toEqual([...indexesBefore, "speaker_health_app", "speaker_health_received"].sort());
  const insert = (state: string, app: string, canary: number, device = "d") =>
    db
      .prepare(
        `INSERT INTO speaker_health (device_id_hash, day, meeting_app, meeting_version, canary, received_at, build, app_version, os_name,
                                     os_version, arch, recipe_version, state, minutes_ok, minutes_total, learned, patterns)
         VALUES (?4, '2026-10-01', ?2, '1', ?3, 0, 'release', '0.3.2', 'macos', '15', 'arm64', 1, ?1, 1, 1, 0, '[]')`,
      )
      .bind(state, app, canary, device);
  await expect(insert("broken", "teams", 0).run()).rejects.toThrow(/CHECK/);
  await expect(insert("ok", "webex", 0).run()).rejects.toThrow(/CHECK/);
  await expect(insert("ok", "teams", 2).run()).rejects.toThrow(/CHECK/);
  await insert("ok", "teams", 0).run();
  await expect(insert("no_names", "teams", 0).run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  await insert("ok", "teams", 1).run();
  await insert("ok", "teams", 0, "d2").run();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
```


- [ ] **Step 4: Test**

Tạo `server/test/speaker-health-fixture.ts`:

```typescript
// Báo cáo tình trạng bộ đọc tên mẫu cho test của server (dạng JSON app gửi, spec 2026-10-26-phan-biet-nguoi-noi §7.2).
import { env } from "cloudflare:workers";
import { sha256Hex } from "../src/crypto";
import { insertSpeakerHealthStatement, parseSpeakerHealth } from "../src/speaker-health";
import { T0 } from "./world";

/** Ngày UTC trước T0 (2026-10-01T00:00:00Z). */
export const DAY0 = "2026-09-30";
export const device = (n: number) => sha256Hex(`speaker-device-${n}`);

/** Thân request hợp lệ của báo cáo tình trạng; `overrides` ghi đè từng khóa cấp trên (không trộn sâu). */
export async function health(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return {
    v: 1,
    kind: "speaker_health",
    day: DAY0,
    canary: false,
    build: "release",
    app: { version: "0.3.2" },
    os: { name: "macos", version: "15.6.1", arch: "aarch64" },
    meeting: { app: "teams", version: "26032.1100" },
    recipe_version: 2,
    state: "ok",
    minutes: { ok: 40, total: 45 },
    learned: 0,
    patterns: [],
    device_id_hash: await device(1),
    ...overrides,
  };
}

/** Ghi thẳng một báo cáo (đã qua parse) với giờ nhận `at`. */
export async function seed(overrides: Record<string, unknown>, at = T0) {
  const parsed = parseSpeakerHealth(await health(overrides), T0);
  if (!parsed.ok) throw new Error(`báo cáo mẫu sai ở ${parsed.field}`);
  await insertSpeakerHealthStatement(env.DB, parsed.report, at).run();
}
```

Tạo `server/test/speaker-health.test.ts`:

```typescript
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlerts } from "../src/alerts";
import { hit, LIMITS } from "../src/ratelimit";
import {
  ALERT_EVERY_SECONDS,
  evaluateSpeakerHealth,
  findCanaryFailing,
  findCanarySilent,
  findDegraded,
  HEALTH_RETENTION_SECONDS,
  parseSpeakerHealth,
  pruneSpeakerHealth,
} from "../src/speaker-health";
import { resetDb } from "./db";
import { validReport } from "./report-fixture";
import { DAY0, device, health, seed } from "./speaker-health-fixture";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const send = (w: World, body: unknown) => w.call("POST", "/v1/diagnostics", body);
const rows = () => env.DB.prepare("SELECT * FROM speaker_health ORDER BY day, meeting_app, meeting_version").all().then((r) => r.results);
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

describe("parseSpeakerHealth: danh sách cho phép, không có chữ tự do", () => {
  it("báo cáo hợp lệ; phiên bản app họp thiếu thì lưu '?'", async () => {
    const ok = parseSpeakerHealth(await health(), T0);
    expect(ok).toMatchObject({ ok: true, report: { day: DAY0, meeting_app: "teams", meeting_version: "26032.1100", state: "ok", patterns: "[]" } });
    const none = parseSpeakerHealth(await health({ meeting: { app: "zoom", version: null } }), T0);
    expect(none).toMatchObject({ ok: true, report: { meeting_app: "zoom", meeting_version: "?" } });
  });

  it("khóa lạ ở mọi cấp bị từ chối (nơi tên người có thể lọt vào)", async () => {
    const bad = async (overrides: Record<string, unknown>, field: string) =>
      expect(parseSpeakerHealth(await health(overrides), T0)).toEqual({ ok: false, field });
    await bad({ participants: ["Lan"] }, "body");
    await bad({ app: { version: "0.3.2", user: "lan" } }, "app");
    await bad({ os: { name: "macos", version: "15", arch: "arm64", host: "lan-mbp" } }, "os");
    await bad({ meeting: { app: "teams", version: "1", title: "Họp với Lan" } }, "meeting");
    await bad({ minutes: { ok: 1, total: 2, who: "Lan" } }, "minutes");
  });

  it("từng trường sai trả đúng tên trường", async () => {
    const bad = async (overrides: Record<string, unknown>, field: string) =>
      expect(parseSpeakerHealth(await health(overrides), T0)).toEqual({ ok: false, field });
    await bad({ v: 2 }, "v");
    await bad({ kind: "crash" }, "kind");
    await bad({ day: "2026-02-30" }, "day");
    await bad({ day: "2026-10-05" }, "day");
    await bad({ day: "2026-09-01" }, "day");
    await bad({ day: "hôm qua" }, "day");
    await bad({ canary: "yes" }, "canary");
    await bad({ build: "staging" }, "build");
    await bad({ app: { version: "0.3" } }, "app");
    await bad({ os: { name: "macos", version: "15 /usr/local", arch: "arm64" } }, "os");
    await bad({ meeting: { app: "webex", version: "1" } }, "meeting");
    await bad({ meeting: { app: "teams", version: "a b" } }, "meeting");
    await bad({ meeting: { app: "teams", version: "?" } }, "meeting");
    await bad({ recipe_version: -1 }, "recipe_version");
    await bad({ state: "broken" }, "state");
    await bad({ minutes: { ok: 5, total: 4 } }, "minutes");
    await bad({ minutes: { ok: 0, total: 1501 } }, "minutes");
    await bad({ learned: 65 }, "learned");
    await bad({ device_id_hash: "abc" }, "device_id_hash");
    expect(parseSpeakerHealth(null, T0)).toEqual({ ok: false, field: "body" });
  });

  it("mẫu chỉ báo: chỉ vai trò, đường đi, lớp an toàn; tên người, email, mã số dài đều bị từ chối", async () => {
    const pattern = (classes: unknown[], role = "AXGroup") => [{ role, path: [2, 0], states: [{ subrole: "", classes }] }];
    const ok = parseSpeakerHealth(await health({ learned: 1, patterns: pattern(["vdi-frame-occlusion", "oZRSLe"]) }), T0);
    expect(ok).toMatchObject({ ok: true });
    const bad = async (patterns: unknown) => expect(parseSpeakerHealth(await health({ patterns }), T0)).toEqual({ ok: false, field: "patterns" });
    await bad(pattern(["Lan Nguyễn"]));
    await bad(pattern(["lan@example.com"]));
    await bad(pattern(["roster-avatar-img-12345678"]));
    await bad(pattern(["x".repeat(33)]));
    await bad(pattern(Array(7).fill("x")));
    await bad(pattern(["x"], "AX Group"));
    await bad([{ role: "AXGroup", path: Array(9).fill(0), states: [] }]);
    await bad(Array(5).fill(pattern(["x"])[0]));
    await bad([{ role: "AXGroup", path: [0], states: [{ subrole: "", classes: [], name: "Lan" }] }]);
    await bad("không phải mảng");
  });
});

describe("POST /v1/diagnostics với kind speaker_health", () => {
  it("202, lưu theo giờ server; gửi lại cùng khóa thì không tạo bản trùng", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    const body = await health({ learned: 1, patterns: [{ role: "AXGroup", path: [2, 0], states: [{ subrole: "", classes: ["x"] }] }] });
    expect(await send(w, body)).toMatchObject({ status: 202, body: { ok: true } });
    expect(await send(w, body)).toMatchObject({ status: 202 });
    expect(await rows()).toEqual([
      {
        device_id_hash: body.device_id_hash,
        day: DAY0,
        meeting_app: "teams",
        meeting_version: "26032.1100",
        canary: 0,
        received_at: T0,
        build: "release",
        app_version: "0.3.2",
        os_name: "macos",
        os_version: "15.6.1",
        arch: "aarch64",
        recipe_version: 2,
        state: "ok",
        minutes_ok: 40,
        minutes_total: 45,
        learned: 1,
        patterns: '[{"role":"AXGroup","path":[2,0],"states":[{"subrole":"","classes":["x"]}]}]',
      },
    ]);
    expect(await count("error_reports")).toBe(0);
  });

  it("báo cáo hỏng thì 400 kèm tên trường và không lưu gì; thân không phải JSON object thì 400", async () => {
    const w = makeWorld();
    expect(await send(w, await health({ state: "x" }))).toMatchObject({ status: 400, body: { error: "invalid_request", field: "state" } });
    expect(await send(w, await health({ extra: 1 }))).toMatchObject({ status: 400, body: { field: "body" } });
    expect(await count("speaker_health")).toBe(0);
  });

  /** Chuỗi qua được danh sách cho phép mà vẫn giống một key bản quyền (28 ký tự Crockford): bộ phát hiện của báo cáo lỗi chặn nốt. */
  it("chuỗi giống key bản quyền thì 422 và không lưu", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    const res = await send(w, await health({ meeting: { app: "teams", version: "ABCDEFGHJKMNPQRSTVWXYZ012345" } }));
    expect(res).toMatchObject({ status: 422, body: { error: "rejected_sensitive", rule: "license_key" } });
    expect(await count("speaker_health")).toBe(0);
  });

  it("đếm hạn mức riêng: hết hạn mức của máy thì 429, không ăn vào hạn mức báo cáo lỗi", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.speaker_device; i++) {
      expect((await send(w, await health({ meeting: { app: "teams", version: `1.${i}` } }))).status).toBe(202);
    }
    const over = await send(w, await health({ meeting: { app: "teams", version: "9.9" } }));
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
    // Báo cáo lỗi của cùng máy vẫn nhận (hạn mức diag_device chưa bị dùng).
    expect((await send(w, await validReport({ device_id_hash: await device(1) }))).status).toBe(202);
    // Máy khác vẫn gửi được tình trạng.
    expect((await send(w, await health({ device_id_hash: await device(2) }))).status).toBe(202);
  });

  it("chạm hạn mức toàn hệ thống: 429 và đúng lần đầu có cảnh báo diagnostics_flood", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.speaker_global; i++) await hit(env, "speaker_global", "all", T0);
    expect((await send(w, await health())).status).toBe(429);
    expect((await send(w, await health())).status).toBe(429);
    const alerts = await env.DB.prepare("SELECT kind, count FROM ops_alerts").all();
    expect(alerts.results).toEqual([{ kind: "diagnostics_flood", count: 1 }]);
  });

  it("báo cáo lỗi thường vẫn đi đường cũ (kind khác)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    expect((await send(w, await validReport())).status).toBe(202);
    expect(await count("error_reports")).toBe(1);
    expect(await count("speaker_health")).toBe(0);
  });
});

describe("cron: cảnh báo bộ đọc tên (spec §7.2)", () => {
  /** n báo cáo của n máy khác nhau cho cùng một app và phiên bản, với `states`. */
  async function reports(version: string, states: string[], extra: Record<string, unknown> = {}) {
    for (const [i, state] of states.entries()) {
      await seed({ meeting: { app: "teams", version }, state, device_id_hash: await device(100 + i), ...extra }, T0 - 3600);
    }
  }

  it("từ 5 báo cáo và ≥ 30% hỏng: cảnh báo; dưới 5 báo cáo hay dưới 30% thì không", async () => {
    await reports("1.0", ["ok", "ok", "no_names", "no_names", "blocked"]); // 3/5 hỏng
    await reports("2.0", ["no_names", "no_names", "no_names", "no_names"]); // 4 báo cáo: chưa đủ
    await reports("3.0", ["ok", "ok", "ok", "ok", "no_speaking"]); // 1/5 = 20%
    await reports("4.0", ["no_permission", "no_permission", "no_permission", "no_permission", "no_permission"]); // việc của người dùng
    expect((await findDegraded(env.DB, T0)).map((d) => [d.meeting_version, d.reports, d.broken])).toEqual([["1.0", 5, 3]]);
  });

  it("không tính báo cáo debug, canary, hay quá 3 ngày", async () => {
    await reports("1.0", ["no_names", "no_names", "no_names", "no_names", "no_names"], { build: "debug" });
    await reports("2.0", ["no_names", "no_names", "no_names", "no_names", "no_names"], { canary: true });
    for (let i = 0; i < 5; i++) await seed({ meeting: { app: "teams", version: "3.0" }, state: "blocked", device_id_hash: await device(200 + i) }, T0 - 4 * DAY);
    expect(await findDegraded(env.DB, T0)).toEqual([]);
  });

  it("mỗi chủ thể cảnh báo một lần mỗi ngày; email chỉ có số lượng, không có tên app hay phiên bản", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await reports("7.77", ["no_names", "no_names", "no_names", "ok", "ok"]);
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 1, canary: 0 });
    expect(await evaluateSpeakerHealth(env.DB, T0 + 600)).toEqual({ degraded: 0, canary: 0 });
    expect(await sendAlerts({ DB: env.DB, ENVIRONMENT: "test", OPERATOR_EMAIL: "ops@example.com" }, w.deps.email, T0 + 700)).toBe(1);
    const mail = w.resend.sent[0]!;
    expect(mail.subject).toContain("speaker_health_degraded");
    expect(JSON.stringify(mail)).not.toContain("7.77");
    expect(mail.subject).not.toMatch(/teams/i);
    expect(await evaluateSpeakerHealth(env.DB, T0 + ALERT_EVERY_SECONDS + 10)).toEqual({ degraded: 1, canary: 0 });
  });

  it("kiểm tra tự động hỏng hai ngày liền (cùng app, cùng hệ điều hành) thì cảnh báo; một ngày, hay có lượt ok thì không", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const canary = (day: string, state: string, os = "macos", app = "teams", n = 1) =>
      seed({ canary: true, day, state, meeting: { app, version: "1.0" }, os: { name: os, version: "15", arch: "arm64" }, device_id_hash: device(300 + n) as unknown as string }, T0);
    const d1 = "2026-10-01"; // ngày của T0
    const d0 = "2026-09-30";
    await seed({ canary: true, day: d1, state: "no_names", device_id_hash: await device(301) }, T0);
    expect(await findCanaryFailing(env.DB, T0)).toEqual([]);
    await seed({ canary: true, day: d0, state: "no_speaking", device_id_hash: await device(301) }, T0 - DAY);
    expect(await findCanaryFailing(env.DB, T0)).toEqual([{ meeting_app: "teams", os_name: "macos" }]);
    // Windows: hôm nay hỏng, hôm qua ok.
    await seed({ canary: true, day: d1, state: "blocked", os: { name: "windows", version: "11", arch: "x86_64" }, device_id_hash: await device(302) }, T0);
    await seed({ canary: true, day: d0, state: "ok", os: { name: "windows", version: "11", arch: "x86_64" }, device_id_hash: await device(302) }, T0 - DAY);
    expect(await findCanaryFailing(env.DB, T0)).toEqual([{ meeting_app: "teams", os_name: "macos" }]);
    void canary;
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 0, canary: 1 });
    expect(await evaluateSpeakerHealth(env.DB, T0 + 300)).toEqual({ degraded: 0, canary: 0 });
  });

  it("kiểm tra tự động im lặng 3 ngày (đã từng có kết quả) thì cảnh báo; còn kết quả gần đây hay chưa từng có thì không", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed({ canary: true, day: "2026-09-27", state: "ok", device_id_hash: await device(400) }, T0 - 4 * DAY);
    await seed({ canary: true, day: "2026-09-30", state: "ok", meeting: { app: "zoom", version: "7.1" }, device_id_hash: await device(401) }, T0 - DAY);
    await seed({ canary: true, day: "2026-09-24", state: "ok", meeting: { app: "meet_edge", version: "1" }, device_id_hash: await device(402) }, T0 - 20 * DAY);
    expect(await findCanarySilent(env.DB, T0)).toEqual([{ meeting_app: "teams", os_name: "macos" }]);
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 0, canary: 1 });
    expect(await evaluateSpeakerHealth(env.DB, T0 + 300)).toEqual({ degraded: 0, canary: 0 });
  });

  it("dọn báo cáo quá 60 ngày", async () => {
    await seed({}, T0 - HEALTH_RETENTION_SECONDS - 10);
    await seed({ meeting: { app: "zoom", version: "7.1" } }, T0 - 10);
    await pruneSpeakerHealth(env.DB, T0);
    expect((await rows()).map((r) => r.meeting_app)).toEqual(["zoom"]);
  });
});
```

- [ ] **Step 5: Chạy test**

Run: `cd $W/server && pnpm typecheck 2>&1 | tail -2 && pnpm exec vitest run test/speaker-health.test.ts test/migrations.test.ts test/schema.test.ts test/admin.test.ts test/diagnostics.test.ts test/error-reports.test.ts 2>&1 | grep -E "Tests |Test Files|FAIL"`
Expected: `tsc` không lỗi; mọi file đạt, `fail` không có; `speaker-health.test.ts` 16 test (4 của `parseSpeakerHealth`, 6 của endpoint, 6 của cron); `migrations.test.ts` thêm test "0007 chỉ thêm bảng speaker_health và hai index…" và test "có đúng bảy migration theo thứ tự". Test hiện có "Q9: xóa dữ liệu cá nhân theo email" đạt với `speaker_health: 0` trong chi tiết nhật ký.

- [ ] **Step 6: Kiểm âm tính**

Trong `parseSpeakerHealth` bỏ dòng `if (!onlyKeys(body, TOP_KEYS)) return bad("body");` rồi chạy `pnpm exec vitest run test/speaker-health.test.ts`: test "khóa lạ ở mọi cấp bị từ chối" **đỏ** (khóa `participants` lọt vào). Hoàn lại. Trong `storeSpeakerHealth` (file `diagnostics.ts`) đổi `"speaker_device"` thành `"diag_device"` rồi chạy lại: test "đếm hạn mức riêng" **đỏ** (báo cáo lỗi thường bị 429 vì hạn mức dùng chung). Hoàn lại.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W/server && pnpm exec vitest run 2>&1 | grep -E "Tests |Test Files|FAIL" && cd $W && git status --short | wc -l`
Expected: toàn bộ server đạt, không FAIL; số dòng `git status` tăng theo file mới, file sửa. Không commit.

---

### Task 11: Server, cron cảnh báo và route admin

Bước `speaker_health_alerts` chạy **trước** `send_alerts` của `reconcile` (cảnh báo của lần này đi luôn trong lần gửi này), `prune_speaker_health` sau. Route `GET /admin/speaker-health?days=` (1–30, mặc định 7): bảng theo app họp, phiên bản, hệ điều hành (bản release, không canary), kết quả kiểm tra tự động 14 ngày, mẫu chỉ báo tự học mới nhất; mỗi lần xem ghi `list_viewed`.

**Files:**
- Create: `server/src/admin-speaker-health.ts`, `server/test/admin-speaker-health.test.ts`
- Modify: `server/src/reconcile.ts`, `server/src/admin.ts`

- [ ] **Step 1: Cron và đăng ký route**

**Sửa `server/src/reconcile.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
import { pruneRateLimits } from "./ratelimit";
```

Đoạn thêm vào:

```typescript
import { evaluateSpeakerHealth, pruneSpeakerHealth } from "./speaker-health";
```

Thay đoạn:

```typescript
  let alertsSent = 0;
  await step("send_alerts", async () => {
```

bằng:

```typescript
  // Trước send_alerts, để cảnh báo bộ đọc tên của lần này đi luôn trong lần gửi cảnh báo này.
  await step("speaker_health_alerts", async () => {
    await evaluateSpeakerHealth(env.DB, now);
  });
  let alertsSent = 0;
  await step("send_alerts", async () => {
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  await step("prune_error_reports", () => pruneErrorReports(env.DB, now));
```

Đoạn thêm vào:

```typescript
  await step("prune_speaker_health", () => pruneSpeakerHealth(env.DB, now));
```

**Sửa `server/src/admin.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
import { registerAdminReports } from "./admin-reports";
```

Đoạn thêm vào:

```typescript
import { registerAdminSpeakerHealth } from "./admin-speaker-health";
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  registerAdminReports(app);
```

Đoạn thêm vào:

```typescript
  registerAdminSpeakerHealth(app);
```


- [ ] **Step 2: Route admin**

Tạo `server/src/admin-speaker-health.ts`:

```typescript
// Route admin cho tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2): bảng theo app họp, phiên bản app họp và
// hệ điều hành; kết quả kiểm tra tự động hằng ngày; mẫu chỉ báo tự học mới nhất. Chỉ đọc, không có tên người trong dữ liệu. Mỗi lần
// xem ghi một dòng list_viewed (như danh sách của admin-read.ts), nhật ký chỉ có số ngày và số dòng.
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { audit } from "./audit";
import { fail } from "./http";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const MAX_ROWS = 200;
const MAX_PATTERN_ROWS = 20;
const CANARY_DAYS = 14;

export function registerAdminSpeakerHealth(app: Hono<AdminAppEnv>): void {
  app.get("/admin/speaker-health", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const raw = c.req.query("days");
    const days = raw === undefined ? DEFAULT_DAYS : /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
    if (days < 1 || days > MAX_DAYS) return fail(c, 400, "invalid_request", { field: "days" });
    const db = c.env.DB;
    const now = c.get("deps").now();
    const [rows, canary, patterns] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT meeting_app, meeting_version, os_name, COUNT(*) AS reports, COUNT(DISTINCT device_id_hash) AS devices,
                  SUM(state = 'ok') AS ok, SUM(state = 'no_names') AS no_names, SUM(state = 'no_speaking') AS no_speaking,
                  SUM(state = 'no_permission') AS no_permission, SUM(state = 'blocked') AS blocked,
                  SUM(minutes_ok) AS minutes_ok, SUM(minutes_total) AS minutes_total,
                  MAX(recipe_version) AS recipe_version, MAX(received_at) AS last_at
           FROM speaker_health WHERE canary = 0 AND build = 'release' AND received_at >= ?1
           GROUP BY meeting_app, meeting_version, os_name
           ORDER BY meeting_app, meeting_version DESC, os_name LIMIT ?2`,
        )
        .bind(now - days * 86400, MAX_ROWS),
      db
        .prepare(
          `SELECT meeting_app, meeting_version, os_name, day, state, recipe_version, app_version
           FROM speaker_health WHERE canary = 1 AND received_at >= ?1
           ORDER BY day DESC, meeting_app, os_name LIMIT ?2`,
        )
        .bind(now - CANARY_DAYS * 86400, MAX_ROWS),
      db
        .prepare(
          `SELECT meeting_app, meeting_version, day, recipe_version, patterns
           FROM speaker_health WHERE build = 'release' AND patterns <> '[]' AND received_at >= ?1
           ORDER BY received_at DESC LIMIT ?2`,
        )
        .bind(now - days * 86400, MAX_PATTERN_ROWS),
    ]);
    const body = {
      generated_at: now,
      days,
      rows: rows?.results ?? [],
      canary: canary?.results ?? [],
      // `patterns` là JSON do server tự dựng từ dữ liệu đã kiểm; trả dạng đối tượng, không phải chuỗi.
      patterns: (patterns?.results ?? []).map((r) => ({ ...r, patterns: JSON.parse(String(r.patterns)) as unknown })),
    };
    await audit(db, {
      at: now,
      actor: c.get("actor"),
      action: "list_viewed",
      detail: { resource: "speaker_health", filters: { days: String(days) }, count: body.rows.length },
    });
    return c.json(body);
  });
}
```

- [ ] **Step 3: Test route admin và xóa theo email**

Tạo `server/test/admin-speaker-health.test.ts`:

```typescript
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { DAY0, device, seed } from "./speaker-health-fixture";
import { T0 } from "./world";

beforeEach(resetDb);

const rows = () => env.DB.prepare("SELECT * FROM speaker_health ORDER BY day, meeting_app, meeting_version").all().then((r) => r.results);

describe("Web Admin: GET /admin/speaker-health và xóa theo email", () => {
  it("bảng theo app họp, phiên bản, hệ điều hành; bỏ báo cáo debug và canary; canary và mẫu chỉ báo ở mục riêng; ghi nhật ký xem", async () => {
    const { adminCall } = makeAdmin();
    await seed({ state: "ok", device_id_hash: await device(1) }, T0 - 100);
    await seed({ state: "no_names", device_id_hash: await device(2), learned: 1, patterns: [{ role: "AXGroup", path: [1], states: [{ subrole: "", classes: ["x"] }] }] }, T0 - 50);
    await seed({ state: "blocked", build: "debug", device_id_hash: await device(3) }, T0 - 40);
    await seed({ canary: true, state: "ok", day: "2026-10-01", device_id_hash: await device(4) }, T0 - 30);
    const res = await adminCall("/admin/speaker-health");
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([
      {
        meeting_app: "teams",
        meeting_version: "26032.1100",
        os_name: "macos",
        reports: 2,
        devices: 2,
        ok: 1,
        no_names: 1,
        no_speaking: 0,
        no_permission: 0,
        blocked: 0,
        minutes_ok: 80,
        minutes_total: 90,
        recipe_version: 2,
        last_at: T0 - 50,
      },
    ]);
    expect(res.body.canary).toEqual([
      { meeting_app: "teams", meeting_version: "26032.1100", os_name: "macos", day: "2026-10-01", state: "ok", recipe_version: 2, app_version: "0.3.2" },
    ]);
    expect(res.body.patterns).toEqual([
      { meeting_app: "teams", meeting_version: "26032.1100", day: DAY0, recipe_version: 2, patterns: [{ role: "AXGroup", path: [1], states: [{ subrole: "", classes: ["x"] }] }] },
    ]);
    expect(await lastAudit()).toMatchObject({ action: "list_viewed" });
    const detail = JSON.parse(String((await lastAudit() as { detail: string }).detail));
    expect(detail).toEqual({ resource: "speaker_health", filters: { days: "7" }, count: 1 });
  });

  it("days ngoài 1–30 hay không phải số thì 400; không qua Access (cross-site) thì 403", async () => {
    const { adminCall } = makeAdmin();
    for (const days of ["0", "31", "abc", "-1", "1.5"]) {
      expect((await adminCall(`/admin/speaker-health?days=${days}`)).status, days).toBe(400);
    }
    expect((await adminCall("/admin/speaker-health", { operator: null })).status).toBe(403);
  });

  it("xóa theo email xóa luôn báo cáo tình trạng của máy đã kích hoạt license của email đó; máy khác giữ nguyên", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    const mine = await sha256Hex("d-mine");
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: mine, device_label: "MacBook" });
    await seed({ device_id_hash: mine }, T0);
    await seed({ device_id_hash: await device(9) }, T0);
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect(res.status).toBe(200);
    expect((await rows()).map((r) => r.device_id_hash)).toEqual([await device(9)]);
    const detail = JSON.parse(String((await lastAudit() as { detail: string }).detail));
    expect(detail.speaker_health).toBe(1);
  });
});
```

- [ ] **Step 4: Chạy test toàn server**

Run: `cd $W/server && pnpm typecheck 2>&1 | tail -2 && pnpm exec vitest run 2>&1 | grep -E "Tests |Test Files|FAIL" && pnpm test:scripts 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: không lỗi kiểu; mốc đo khi viết kế hoạch: **47 file, 1 690 test đạt** (mốc: 45 file, 1 671 test trước Task 10); `test:scripts` `fail 0`. Test `reconcile` hiện có vẫn đạt (hai bước mới chạy trên D1 trống không đổi gì).

- [ ] **Step 5: Kiểm âm tính**

Trong `evaluateSpeakerHealth` đổi điều kiện `if (await fresh(`degraded:…`))` thành luôn đúng (bỏ gọi `fresh`) rồi chạy `pnpm exec vitest run test/speaker-health.test.ts`: test "mỗi chủ thể cảnh báo một lần mỗi ngày" **đỏ**. Hoàn lại.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W/server && pnpm exec wrangler deploy --dry-run 2>&1 | tail -3; pnpm exec wrangler deploy --dry-run -c wrangler.admin.jsonc 2>&1 | tail -3`
Expected: cả hai `--dry-run` biên dịch được (không deploy gì). Không commit.

---

### Task 12: Web Admin, tab Bộ đọc tên

Tab thứ ba của trang Báo cáo lỗi (`?tab=speaker`): bảng theo app họp và phiên bản (hỏng từ 30% và từ 5 báo cáo thì huy hiệu đỏ), kết quả kiểm tra tự động, mẫu chỉ báo tự học dạng văn bản (không bao giờ dựng HTML từ dữ liệu). Chọn 7 hay 30 ngày.

**Files:**
- Create: `server/admin-ui/src/pages/{speaker-kit.tsx,SpeakerHealthPanel.tsx,SpeakerHealthPanel.test.tsx}`
- Modify: `server/admin-ui/src/api/{types.ts,endpoints.ts,endpoints.test.ts}`, `server/admin-ui/src/pages/ErrorsPage.tsx`

- [ ] **Step 1: Kiểu, hàm gọi API, tab**

**Sửa `server/admin-ui/src/api/types.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
export interface DeletedReports {
  deleted: number;
}
```

Đoạn thêm vào:

```typescript
/** Một dòng của tab Bộ đọc tên: báo cáo của người dùng (bản release) gộp theo app họp, phiên bản và hệ điều hành. */
export interface SpeakerHealthRow {
  meeting_app: string;
  /** "?" khi app không đọc được phiên bản của app họp. */
  meeting_version: string;
  os_name: string;
  reports: number;
  devices: number;
  ok: number;
  no_names: number;
  no_speaking: number;
  no_permission: number;
  blocked: number;
  minutes_ok: number;
  minutes_total: number;
  recipe_version: number;
  last_at: number;
}

/** Kết quả một lượt kiểm tra tự động hằng ngày. */
export interface SpeakerCanaryRow {
  meeting_app: string;
  meeting_version: string;
  os_name: string;
  day: string;
  state: string;
  recipe_version: number;
  app_version: string;
}

/** Mẫu chỉ báo tự học của một báo cáo; `patterns` là mảng đối tượng (vai trò, đường đi, trạng thái), không có chữ của app họp. */
export interface SpeakerPatternRow {
  meeting_app: string;
  meeting_version: string;
  day: string;
  recipe_version: number;
  patterns: unknown;
}

export interface SpeakerHealthResponse {
  generated_at: number;
  days: number;
  rows: SpeakerHealthRow[];
  canary: SpeakerCanaryRow[];
  patterns: SpeakerPatternRow[];
}
```

**Sửa `server/admin-ui/src/api/endpoints.ts`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```typescript
  DeletedReports,
```

Đoạn thêm vào:

```typescript
  SpeakerHealthResponse,
```

Thay đoạn:

```typescript
  deleteErrorReport: (id: string) =>
```

bằng:

```typescript
  speakerHealth: (days: number) => call<SpeakerHealthResponse>("GET", `/admin/speaker-health?days=${days}`),
  deleteErrorReport: (id: string) =>
```

**Sửa `server/admin-ui/src/pages/ErrorsPage.tsx`:**

Thay đoạn:

```tsx
// Trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): hai tab, Nhóm lỗi (mặc định) và Gửi tay. Tab đầu đọc từ
// `?tab=manual` của địa chỉ trang khi mở (như AuditPage đọc `?action=`): đường dẫn từ trang chi tiết của báo cáo gửi tay về đúng tab.
```

bằng:

```tsx
// Trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): ba tab, Nhóm lỗi (mặc định), Gửi tay và Bộ đọc tên (spec
// 2026-10-26-phan-biet-nguoi-noi §7.2). Tab đầu đọc từ `?tab=manual` hay `?tab=speaker` của địa chỉ trang khi mở (như AuditPage đọc
// `?action=`): đường dẫn từ trang chi tiết của báo cáo gửi tay về đúng tab.
```

Thay đoạn:

```tsx
import { ManualReportsPanel } from "./ManualReportsPanel";

type Tab = "groups" | "manual";

function initialTab(): Tab {
  return new URLSearchParams(window.location.search).get("tab") === "manual" ? "manual" : "groups";
}
```

bằng:

```tsx
import { ManualReportsPanel } from "./ManualReportsPanel";
import { SpeakerHealthPanel } from "./SpeakerHealthPanel";

type Tab = "groups" | "manual" | "speaker";

function initialTab(): Tab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "manual" || tab === "speaker" ? tab : "groups";
}
```

Thay đoạn:

```tsx
        { value: "manual", label: "Gửi tay" },
      ]}
    />
  );
  return tab === "groups" ? <ErrorGroupsPanel tabs={tabs} /> : <ManualReportsPanel tabs={tabs} />;
```

bằng:

```tsx
        { value: "manual", label: "Gửi tay" },
        { value: "speaker", label: "Bộ đọc tên" },
      ]}
    />
  );
  if (tab === "speaker") return <SpeakerHealthPanel tabs={tabs} />;
  return tab === "groups" ? <ErrorGroupsPanel tabs={tabs} /> : <ManualReportsPanel tabs={tabs} />;
```

**Sửa `server/admin-ui/src/api/endpoints.test.ts`:**

Thay đoạn:

```typescript
  { fn: "deleteErrorReport", run: () => api.deleteErrorReport(RID), method: "POST", url: "/admin/error-reports/delete", body: { id: RID } },
```

bằng:

```typescript
  { fn: "speakerHealth", run: () => api.speakerHealth(7), method: "GET", url: "/admin/speaker-health?days=7" },
  { fn: "speakerHealth", run: () => api.speakerHealth(30), method: "GET", url: "/admin/speaker-health?days=30" },
  { fn: "deleteErrorReport", run: () => api.deleteErrorReport(RID), method: "POST", url: "/admin/error-reports/delete", body: { id: RID } },
```

Thay đoạn:

```typescript
    expect(Object.keys(api)).toHaveLength(30);
```

bằng:

```typescript
    expect(Object.keys(api)).toHaveLength(31);
```


- [ ] **Step 2: Phần chung và panel**

Tạo `server/admin-ui/src/pages/speaker-kit.tsx`:

```tsx
// Phần chung của tab Bộ đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §7.2): tên app họp, nhãn và tông của tình trạng, cột của ba bảng.
// Dữ liệu không có tên người; mẫu chỉ báo tự học (vai trò, vị trí, lớp) hiện dạng văn bản, không bao giờ dựng HTML từ nó.
import type { SpeakerCanaryRow, SpeakerHealthRow } from "../api/types";
import { Badge, type Tone } from "../components/Badge";
import { Cell2, WhenCell } from "../components/columns";
import type { Column } from "../components/DataTable";
import { fmtInt } from "../format";

export const APP_LABELS: Record<string, string> = {
  teams: "Microsoft Teams",
  zoom: "Zoom",
  meet_chrome: "Google Meet (Chrome)",
  meet_edge: "Google Meet (Edge)",
};

export const STATE_LABELS: Record<string, string> = {
  ok: "Đọc được tên",
  no_names: "Không thấy tên",
  no_speaking: "Không thấy ai đang nói",
  no_permission: "Chưa có quyền Trợ năng",
  blocked: "App họp không trả lời",
};

export const STATE_TONES: Record<string, Tone> = {
  ok: "ok",
  no_names: "bad",
  no_speaking: "bad",
  no_permission: "neutral",
  blocked: "warn",
};

export const appLabel = (app: string): string => APP_LABELS[app] ?? app;

export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONES[state] ?? "neutral"}>{STATE_LABELS[state] ?? state}</Badge>;
}

/** Số báo cáo hỏng (không đọc được tên, không thấy ai đang nói, app họp không trả lời) của một dòng. */
export const brokenOf = (r: Pick<SpeakerHealthRow, "no_names" | "no_speaking" | "blocked">): number => r.no_names + r.no_speaking + r.blocked;

const percent = (part: number, whole: number): string => (whole === 0 ? "—" : `${Math.round((part * 100) / whole)}%`);

/** Cột bảng tình trạng theo phiên bản. `now` (giây): mốc của lần tải. */
export function healthColumns(now: number): Column<SpeakerHealthRow>[] {
  return [
    {
      header: "App họp",
      primary: true,
      cell: (r) => <Cell2 main={appLabel(r.meeting_app)} sub={r.meeting_version === "?" ? "không rõ phiên bản" : r.meeting_version} />,
    },
    { header: "Hệ điều hành", nowrap: true, cell: (r) => r.os_name },
    { header: "Máy", align: "right", cell: (r) => fmtInt(r.devices) },
    { header: "Báo cáo", align: "right", cell: (r) => fmtInt(r.reports) },
    {
      header: "Hỏng",
      align: "right",
      aside: true,
      cell: (r) => {
        const broken = brokenOf(r);
        const share = r.reports === 0 ? 0 : broken / r.reports;
        return <Badge tone={share >= 0.3 && r.reports >= 5 ? "bad" : broken > 0 ? "warn" : "ok"}>{`${fmtInt(broken)} (${percent(broken, r.reports)})`}</Badge>;
      },
    },
    {
      header: "Chưa có quyền",
      align: "right",
      hideOnMobile: true,
      cell: (r) => fmtInt(r.no_permission),
    },
    {
      header: "Phút đọc được tên",
      align: "right",
      nowrap: true,
      cell: (r) => <Cell2 main={percent(r.minutes_ok, r.minutes_total)} sub={`${fmtInt(r.minutes_ok)} / ${fmtInt(r.minutes_total)}`} />,
    },
    { header: "Công thức", align: "right", hideOnMobile: true, cell: (r) => fmtInt(r.recipe_version) },
    { header: "Gần nhất", nowrap: true, cell: (r) => <WhenCell sec={r.last_at} now={now} /> },
  ];
}

/** Cột bảng kiểm tra tự động hằng ngày. */
export function canaryColumns(): Column<SpeakerCanaryRow>[] {
  return [
    { header: "Ngày", primary: true, nowrap: true, cell: (r) => r.day },
    { header: "App họp", cell: (r) => <Cell2 main={appLabel(r.meeting_app)} sub={r.meeting_version === "?" ? undefined : r.meeting_version} /> },
    { header: "Hệ điều hành", nowrap: true, cell: (r) => r.os_name },
    { header: "Kết quả", aside: true, cell: (r) => <StateBadge state={r.state} /> },
    { header: "Công thức", align: "right", hideOnMobile: true, cell: (r) => fmtInt(r.recipe_version) },
    { header: "Bản app", nowrap: true, hideOnMobile: true, cell: (r) => r.app_version },
  ];
}
```

Tạo `server/admin-ui/src/pages/SpeakerHealthPanel.tsx`:

```tsx
// Tab Bộ đọc tên của trang Báo cáo lỗi (spec 2026-10-26-phan-biet-nguoi-noi §7.2): tình trạng bộ đọc tên người nói theo app họp,
// phiên bản app họp và hệ điều hành (báo cáo của người dùng, bản release), kết quả kiểm tra tự động hằng ngày, và các mẫu chỉ báo tự
// học mới nhất (cho người cập nhật công thức). Không có tên người trong dữ liệu. Báo cáo tự xóa sau 60 ngày.
import { type ReactNode, useState } from "react";
import { api } from "../api/endpoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { IconRefresh } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { fmtInt, nowSec } from "../format";
import { useLoad } from "../hooks";
import { appLabel, canaryColumns, healthColumns } from "./speaker-kit";

type Days = "7" | "30";

/** `tabs`: công tắc chuyển tab của ErrorsPage, đặt cạnh nút Làm mới ở đầu trang. */
export function SpeakerHealthPanel({ tabs }: { tabs: ReactNode }) {
  const [days, setDays] = useState<Days>("7");
  const load = useLoad(() => api.speakerHealth(Number(days)), [days]);
  const data = load.data;
  const now = data?.generated_at ?? nowSec();
  const reports = data?.rows.reduce((n, r) => n + r.reports, 0) ?? 0;
  return (
    <>
      <PageHeader
        title="Báo cáo lỗi"
        description={
          <p className="page-meta">
            <span>
              Tình trạng bộ đọc tên người nói ở máy người dùng: {fmtInt(reports)} báo cáo trong {days} ngày qua. Không có tên người. Báo
              cáo tự xóa sau 60 ngày.
            </span>
          </p>
        }
        actions={
          <>
            {tabs}
            <SegmentedControl<Days>
              label="Khoảng thời gian"
              size="sm"
              value={days}
              onChange={setDays}
              options={[
                { value: "7", label: "7 ngày" },
                { value: "30", label: "30 ngày" },
              ]}
            />
            <Button icon={<IconRefresh size={16} />} loading={load.loading} onClick={load.reload}>
              Làm mới
            </Button>
          </>
        }
      />
      {load.error && <ErrorBox error={load.error} onRetry={load.reload} title="Không tải được tình trạng bộ đọc tên" />}
      {!load.error && (
        <>
          <Card flush aria-label="Tình trạng theo phiên bản" title="Theo app họp và phiên bản" className="list-card">
            <DataTable
              flush
              caption="Tình trạng bộ đọc tên theo app họp, phiên bản và hệ điều hành"
              columns={healthColumns(now)}
              rows={data?.rows ?? []}
              rowKey={(r) => `${r.meeting_app}|${r.meeting_version}|${r.os_name}`}
              loading={load.loading && data === null}
              empty="Chưa có báo cáo tình trạng nào"
              emptyHint="Báo cáo hiện ở đây khi người dùng đã dịch trong cuộc họp Teams, Meet hay Zoom và gửi báo cáo (mỗi ngày một lần)."
            />
          </Card>
          <Card
            flush
            aria-label="Kiểm tra tự động"
            title="Kiểm tra tự động hằng ngày"
            description="Chạy ban đêm trên máy của chủ dự án (tools/speaker-canary). Hỏng hai ngày liền thì có email cảnh báo."
            className="list-card"
          >
            <DataTable
              flush
              caption="Kết quả kiểm tra tự động hằng ngày"
              columns={canaryColumns()}
              rows={data?.canary ?? []}
              rowKey={(r) => `${r.day}|${r.meeting_app}|${r.os_name}|${r.meeting_version}`}
              loading={load.loading && data === null}
              empty="Chưa có kết quả kiểm tra tự động"
            />
          </Card>
          <Card
            aria-label="Mẫu chỉ báo tự học"
            title="Mẫu chỉ báo tự học mới nhất"
            description="Khi công thức không còn khớp, bộ đọc tự tìm phần tử đổi theo tiếng nói. Mẫu dưới đây (vai trò, vị trí trong ô, lớp) giúp sửa công thức."
          >
            {(data?.patterns ?? []).length === 0 ? (
              <p className="muted">Chưa có mẫu nào.</p>
            ) : (
              <ul className="plain-list">
                {data?.patterns.map((p, i) => (
                  <li key={`${p.meeting_app}|${p.meeting_version}|${p.day}|${i}`}>
                    <strong>{appLabel(p.meeting_app)}</strong> {p.meeting_version === "?" ? "" : p.meeting_version} · {p.day} · công thức {p.recipe_version}
                    <pre className="mono">{JSON.stringify(p.patterns)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Test**

Tạo `server/admin-ui/src/pages/SpeakerHealthPanel.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeakerHealthResponse } from "../api/types";
import { ErrorsPage } from "./ErrorsPage";

const NOW = 1_790_812_800;

const row = (over: Record<string, unknown> = {}) => ({
  meeting_app: "teams",
  meeting_version: "26032.1100",
  os_name: "macos",
  reports: 10,
  devices: 8,
  ok: 6,
  no_names: 2,
  no_speaking: 1,
  no_permission: 1,
  blocked: 0,
  minutes_ok: 300,
  minutes_total: 400,
  recipe_version: 2,
  last_at: NOW - 3600,
  ...over,
});

const response = (over: Partial<SpeakerHealthResponse> = {}): SpeakerHealthResponse => ({
  generated_at: NOW,
  days: 7,
  rows: [row()],
  canary: [{ meeting_app: "teams", meeting_version: "26032.1100", os_name: "macos", day: "2026-10-01", state: "ok", recipe_version: 2, app_version: "0.3.2" }],
  patterns: [{ meeting_app: "teams", meeting_version: "26032.1100", day: "2026-10-01", recipe_version: 2, patterns: [{ role: "AXGroup", path: [2, 0], states: [] }] }],
  ...over,
});

let urls: string[];
let speaker: () => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  urls = [];
  speaker = () => json(response());
  window.history.replaceState(null, "", "/errors?tab=speaker");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return url.startsWith("/admin/speaker-health") ? speaker() : json({ items: [], next_cursor: null });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("ErrorsPage: tab Bộ đọc tên", () => {
  it("mở từ ?tab=speaker, gọi /admin/speaker-health?days=7 và hiện bảng theo app họp và phiên bản", async () => {
    render(<ErrorsPage />);
    const table = await screen.findByRole("table", { name: /Tình trạng bộ đọc tên theo app họp/ });
    expect(urls).toEqual(["/admin/speaker-health?days=7"]);
    const cells = within(table).getAllByRole("row")[1]!.textContent ?? "";
    expect(cells).toContain("Microsoft Teams");
    expect(cells).toContain("26032.1100");
    expect(cells).toContain("3 (30%)");
    expect(cells).toContain("75%");
  });

  it("hỏng từ 30% và từ 5 báo cáo thì huy hiệu đỏ; ít báo cáo hơn thì không", async () => {
    speaker = () => json(response({ rows: [row(), row({ meeting_version: "26040.1", reports: 3, no_names: 3, ok: 0, no_speaking: 0, no_permission: 0 })] }));
    render(<ErrorsPage />);
    const table = await screen.findByRole("table", { name: /Tình trạng bộ đọc tên theo app họp/ });
    const badges = within(table).getAllByText(/\(\d+%\)/);
    expect(badges[0]!.className).toContain("badge-bad");
    expect(badges[1]!.className).toContain("badge-warn");
  });

  it("hiện kết quả kiểm tra tự động và mẫu chỉ báo dạng văn bản", async () => {
    render(<ErrorsPage />);
    const canary = await screen.findByRole("table", { name: "Kết quả kiểm tra tự động hằng ngày" });
    expect(within(canary).getByText("Đọc được tên")).toBeTruthy();
    expect(screen.getByText(/"role":"AXGroup"/)).toBeTruthy();
  });

  it("đổi sang 30 ngày thì gọi lại với days=30; chưa có dữ liệu thì báo trống; lỗi thì có nút thử lại", async () => {
    const user = userEvent.setup();
    speaker = () => json(response({ rows: [], canary: [], patterns: [] }));
    render(<ErrorsPage />);
    expect(await screen.findByText("Chưa có báo cáo tình trạng nào")).toBeTruthy();
    expect(screen.getByText("Chưa có kết quả kiểm tra tự động")).toBeTruthy();
    expect(screen.getByText("Chưa có mẫu nào.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "30 ngày" }));
    await waitFor(() => expect(urls).toEqual(["/admin/speaker-health?days=7", "/admin/speaker-health?days=30"]));
    speaker = () => json({ error: "internal" }, 500);
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(await screen.findByText("Không tải được tình trạng bộ đọc tên")).toBeTruthy();
  });

  it("công tắc tab có mục Bộ đọc tên và chuyển được từ tab Nhóm lỗi", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/errors");
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    await user.click(screen.getByRole("radio", { name: "Bộ đọc tên" }));
    expect(await screen.findByRole("table", { name: /Tình trạng bộ đọc tên theo app họp/ })).toBeTruthy();
  });
});
```

- [ ] **Step 4: Chạy test, kiểu và build**

Run: `cd $W/server/admin-ui && pnpm typecheck 2>&1 | tail -2 && pnpm exec vitest run 2>&1 | grep -E "Tests |Test Files|FAIL" && pnpm build 2>&1 | tail -2`
Expected: không lỗi kiểu; **51 file, 1 159 test đạt** (mốc đo; trước Task 12: 50 file; thêm 5 test của panel và 2 ca của `endpoints.test.ts`; test "có test cho đủ mọi hàm của api" đạt với 31 hàm); `vite build` `✓ built`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W/server && pnpm run check 2>&1 | tail -6`
Expected: `pnpm check` (kiểu, vector, test, test script, Web Admin, dry-run deploy) kết thúc không lỗi. Không commit.

---

### Task 13: `crates/speaker-canary`, bộ đọc và chấm kiểm tra tự động

`Collector` nhận từng `Sample` của bộ đọc thật (`LiveReader`, macOS hay Windows), đưa qua đúng `SpeakingTracker` mà worker dùng (máy "im" tính theo lịch đã biết), gom `Frame` và `Run`, rồi `speaker_ops::canary::judge`. `report` dựng `speaker_health` có `canary = true`; `HttpPoster` gửi `POST {api}/v1/diagnostics` (chỉ `https`, hay `http` tới 127.0.0.1 khi thử). Tên khách (`who`) chỉ ở lịch và bộ nhớ, không vào kết quả, báo cáo, log, `Debug`. `main.rs` có hai lệnh: `run` (đọc, chấm, ghi kết quả và `<kết quả>.report.json`, gửi) và `send` (gửi lại báo cáo đã dựng). Mã thoát: 0 ok, 1 hỏng, 2 lỗi chạy, 3 chưa gửi được, 4 bị từ chối.

**Files:**
- Create: `crates/speaker-canary/Cargo.toml`, `crates/speaker-canary/src/lib.rs`, `crates/speaker-canary/src/main.rs`

- [ ] **Step 1: Crate**

Tạo `crates/speaker-canary/Cargo.toml` (workspace tự nhận `crates/*`):

```toml
[package]
name = "speaker-canary"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

# Kiểm tra tự động hằng ngày của bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06): chạy bộ đọc thật của
# `speaker-worker` lên cửa sổ họp của app thật trong lúc các khách chạy theo lịch nói đã biết, chấm bằng `speaker-ops::canary`, gửi kết quả
# như báo cáo tình trạng (`canary = true`). Công cụ của máy chủ dự án, KHÔNG nằm trong app hay gói cài; crate này có mã mạng (gửi báo cáo)
# nên `speaker-worker` không bao giờ phụ thuộc nó (`scripts/release/check-no-network.sh` chỉ kiểm worker).
[dependencies]
anyhow.workspace = true
clap.workspace = true
# Cùng bản và tính năng app dùng (TLS của hệ điều hành); bản mới nhất ổn định trên crates.io (`cargo search reqwest`, 2026-10-27).
reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "native-tls", "system-proxy"] }
serde.workspace = true
serde_json.workspace = true
sha2 = "0.11.0"
speaker-ops = { path = "../speaker-ops" }
speaker-protocol = { path = "../speaker-protocol" }
speaker-recipe = { path = "../speaker-recipe" }
speaker-worker = { path = "../speaker-worker" }
thiserror.workspace = true
```

Tạo `crates/speaker-canary/src/lib.rs`:

```rust
//! Phần thuần của kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06): đọc lịch nói, biến các lượt đọc của bộ
//! đọc thành "ai đang được báo đang nói", chấm, dựng báo cáo `speaker_health` có `canary = true`, gửi. Phần chạm hệ điều hành (đọc cây
//! Accessibility, UI Automation) nằm ở `main.rs`.
//!
//! Tên trong lịch (`who`) là tên hiển thị của các tài khoản thử trong cuộc họp thử; chỉ nằm trong file lịch cục bộ và trong bộ nhớ, **không
//! bao giờ** vào kết quả, báo cáo hay log. Mỗi lượt đọc đi qua đúng `SpeakingTracker` mà worker dùng, nên kiểm tra phát hiện đúng thứ làm
//! hỏng tên thật: công thức không còn khớp giao diện.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use speaker_ops::canary::{self, CanaryError, Frame, Params, Run, Turn, Verdict};
use speaker_ops::health::{self, Facts};
use speaker_protocol::{MeetingApp, ReaderStatus};
use speaker_recipe::{Os, Recipes};
use speaker_worker::names::track::SpeakingTracker;
use speaker_worker::reader::{Pass, Sample};

pub const DEFAULT_API: &str = "https://api.aitranslator.vn";

/// Lịch nói do bộ điều khiển (tools/speaker-canary) ghi: giây tính từ mốc `t0` (giờ Unix, ms) mà bộ điều khiển cho `run`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Schedule {
    pub app: MeetingApp,
    pub turns: Vec<ScheduledTurn>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq)]
pub struct ScheduledTurn {
    pub who: String,
    pub start_s: f64,
    pub end_s: f64,
}

// Tên khách không vào log, kể cả qua `{:?}`.
impl std::fmt::Debug for ScheduledTurn {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ScheduledTurn({} → {} s)", self.start_s, self.end_s)
    }
}

impl Schedule {
    /// Lượt nói tuyệt đối (giờ Unix, ms) từ mốc `t0_unix_ms`.
    pub fn turns(&self, t0_unix_ms: i64) -> Vec<Turn> {
        let at = |s: f64| t0_unix_ms + (s * 1000.0).round() as i64;
        self.turns
            .iter()
            .map(|t| Turn {
                who: t.who.clone(),
                start_ms: at(t.start_s),
                end_ms: at(t.end_s),
            })
            .collect()
    }
}

/// Gom các lượt đọc của bộ đọc thành `Frame` (ai đang được báo "đang nói") và đếm tóm tắt cho `canary::judge`.
pub struct Collector {
    app: MeetingApp,
    tracker: SpeakingTracker,
    delay_ms: i64,
    turns: Vec<Turn>,
    frames: Vec<Frame>,
    run: Run,
    app_version: Option<String>,
    recipe_version: u32,
}

impl Collector {
    /// `None` nếu công thức không có mục cho `app` trên hệ điều hành này (không có gì để kiểm).
    pub fn new(recipes: &Recipes, os: Os, app: MeetingApp, turns: Vec<Turn>) -> Option<Self> {
        let recipe = recipes.app(os, app)?;
        Some(Self {
            app,
            tracker: SpeakingTracker::new(recipe.speaking.iter().map(|s| s.kind).collect()),
            delay_ms: i64::from(recipe.delay_ms),
            turns,
            frames: Vec::new(),
            run: Run {
                passes_with_tiles: 0,
                passes_blocked: 0,
                passes: 0,
            },
            app_version: None,
            recipe_version: recipes.version,
        })
    }

    /// Máy "im" theo lịch: không lượt nói nào trong [`at` − trễ − 1 s, `at`] (như `quiet_at` của worker, nhưng theo lịch đã biết).
    fn quiet(&self, at_ms: i64) -> bool {
        let from = at_ms - self.delay_ms - 1_000;
        !self.turns.iter().any(|t| t.start_ms < at_ms + 1 && t.end_ms > from)
    }

    /// Một lượt đọc của bộ đọc.
    pub fn push(&mut self, s: &Sample) {
        if s.status == ReaderStatus::Off
            || s.pass == Pass::Idle && s.app.is_none() && s.status != ReaderStatus::NoMeeting
        {
            return;
        }
        self.run.passes += 1;
        if s.status == ReaderStatus::Blocked {
            self.run.passes_blocked += 1;
        }
        if s.status != ReaderStatus::Ok || s.app != Some(self.app) {
            return;
        }
        if self.app_version.is_none() {
            self.app_version = s.app_version.clone();
        }
        if s.tiles.iter().any(|t| !t.is_self) {
            self.run.passes_with_tiles += 1;
        }
        let at = i64::try_from(s.at_unix_ms).unwrap_or(i64::MAX);
        let quiet = self.quiet(at);
        let now = self.tracker.push(at, &s.tiles, &BTreeMap::new(), quiet);
        self.frames.push(Frame {
            at_ms: at,
            speaking: now
                .iter()
                .filter(|p| p.speaking > 0.0 && !p.is_self)
                .map(|p| p.name.clone())
                .collect(),
        });
    }

    /// Chấm cả lượt chạy.
    pub fn finish(self, params: &Params) -> Result<Outcome, CanaryError> {
        let verdict = canary::judge(&self.turns, &self.frames, self.run, params)?;
        Ok(Outcome {
            verdict,
            app: self.app,
            app_version: self.app_version,
            recipe_version: self.recipe_version,
            frames: self.frames.len(),
            passes: self.run.passes,
        })
    }
}

/// Kết quả một lượt kiểm tra (không có tên người).
#[derive(Clone, Debug, PartialEq)]
pub struct Outcome {
    pub verdict: Verdict,
    pub app: MeetingApp,
    pub app_version: Option<String>,
    pub recipe_version: u32,
    pub frames: usize,
    pub passes: u32,
}

/// Thông tin máy của báo cáo kiểm tra tự động. `machine` là nhãn do người vận hành đặt cho máy chạy kiểm tra (không phải mã phần cứng):
/// `device_id_hash` là SHA-256 của `canary|<nhãn>`, nên không trùng và không lẫn với máy người dùng.
pub fn facts(app_version: &str, os_version: &str, machine: &str) -> Facts {
    Facts {
        app_version: app_version.to_string(),
        build: if cfg!(debug_assertions) { "debug" } else { "release" },
        os_name: std::env::consts::OS.to_string(),
        os_version: os_version.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        device_id_hash: Sha256::digest(format!("canary|{machine}").as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    }
}

/// Thân báo cáo `speaker_health` (`canary = true`) của một lượt kiểm tra: toàn bộ thời gian chạy tính theo tình trạng đã chấm.
pub fn report(outcome: &Outcome, facts: &Facts, now_secs: i64, duration_ms: u64) -> Result<String, health::BuildError> {
    let entry = canary::entry(
        &outcome.verdict,
        duration_ms,
        outcome.app,
        outcome.app_version.clone(),
        outcome.recipe_version,
    );
    health::report_json(facts, health::day_of_unix_secs(now_secs), &entry, true)
}

/// File kết quả cục bộ của một lượt (cho nhật ký của người vận hành): tình trạng, điểm, phiên bản; không có tên người.
pub fn result_json(outcome: &Outcome, duration_ms: u64) -> String {
    let s = outcome.verdict.score;
    serde_json::json!({
        "state": outcome.verdict.health.as_str(),
        "meeting_app": outcome.app,
        "meeting_version": outcome.app_version,
        "recipe_version": outcome.recipe_version,
        "turns": s.turns,
        "turns_ok": s.turns_ok,
        "judged": s.judged,
        "wrong": s.wrong,
        "frames": outcome.frames,
        "passes": outcome.passes,
        "duration_ms": duration_ms,
    })
    .to_string()
}

/// Nơi nhận báo cáo: trả mã HTTP, hay lỗi mạng (không kèm URL).
pub trait Poster {
    fn post(&self, body: &str) -> Result<u16, String>;
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum SendError {
    /// Server từ chối báo cáo (4xx khác 429): gửi lại cũng vậy.
    #[error("server từ chối báo cáo: HTTP {0}")]
    Rejected(u16),
    /// Mạng hay server lỗi tạm (5xx, 429): thử lại sau.
    #[error("chưa gửi được: {0}")]
    Retry(String),
}

/// Gửi một báo cáo đã dựng. 2xx là xong.
pub fn send(poster: &dyn Poster, body: &str) -> Result<(), SendError> {
    match poster.post(body) {
        Ok(200..=299) => Ok(()),
        Ok(429) => Err(SendError::Retry("HTTP 429".into())),
        Ok(status @ 500..=599) => Err(SendError::Retry(format!("HTTP {status}"))),
        Ok(status) => Err(SendError::Rejected(status)),
        Err(e) => Err(SendError::Retry(e)),
    }
}

/// `POST {base}/v1/diagnostics` bằng reqwest (không theo redirect, hạn chờ ngắn), như `HttpReportApi` của app.
pub struct HttpPoster {
    url: String,
    client: reqwest::blocking::Client,
}

impl HttpPoster {
    /// `base` phải là `https` (hay `http` tới 127.0.0.1 khi thử); không thì `None`.
    pub fn new(base: &str) -> Option<Self> {
        let base = base.trim_end_matches('/');
        let url = reqwest::Url::parse(base).ok()?;
        let ok = url.scheme() == "https"
            || (url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost")));
        let client = reqwest::blocking::Client::builder()
            .user_agent("AI-Translator-Canary")
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .ok()?;
        (ok && url.query().is_none()).then(|| Self {
            url: format!("{base}/v1/diagnostics"),
            client,
        })
    }
}

impl Poster for HttpPoster {
    fn post(&self, body: &str) -> Result<u16, String> {
        self.client
            .post(&self.url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.to_string())
            .send()
            .map(|r| r.status().as_u16())
            .map_err(|e| e.without_url().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    use speaker_ops::health::Health;
    use speaker_recipe::parse;
    use speaker_worker::reader::extract::TileSample;

    const T0: i64 = 1_793_059_200_000;

    fn recipes() -> Recipes {
        parse(speaker_recipe::BUILTIN_JSON).unwrap()
    }

    fn schedule() -> Schedule {
        let turn = |who: &str, a: f64, b: f64| ScheduledTurn {
            who: who.into(),
            start_s: a,
            end_s: b,
        };
        Schedule {
            app: MeetingApp::Teams,
            turns: vec![
                turn("Khach A", 0.0, 6.0),
                turn("Khach B", 8.0, 14.0),
                turn("Khach A", 16.0, 22.0),
                turn("Khach B", 24.0, 30.0),
            ],
        }
    }

    fn tile(name: &str, is_self: bool, speaking: bool, slot: u32) -> TileSample {
        TileSample {
            name: name.into(),
            is_self,
            muted: Some(false),
            label_speaking: false,
            // Công thức Teams: chỉ báo "có mặt khi nói" (`Some(1)`).
            anchors: vec![speaking.then_some(1)],
            candidates: vec![],
            shapes: vec![],
            slot,
        }
    }

    /// Bộ đọc hoàn hảo: 4 lượt mỗi giây; ô của khách có chỉ báo khi khách đó đang nói (trễ 0,6 s). `show` đổi từng ô: `None` là ô không
    /// có mặt, `Some(b)` là chỉ báo `b`.
    fn samples(show: impl Fn(&str, bool) -> Option<bool>, status: ReaderStatus) -> Vec<Sample> {
        let turns = schedule().turns(T0);
        (0..32_000 / 250)
            .map(|i| {
                let at = T0 + i * 250;
                let on = |who: &str| {
                    turns
                        .iter()
                        .any(|t| t.who == who && (t.start_ms..t.end_ms).contains(&(at - 600)))
                };
                let mut tiles = vec![tile("Minh", true, false, 0)];
                for (k, guest) in ["Khach A", "Khach B"].iter().enumerate() {
                    if let Some(shown) = show(guest, on(guest)) {
                        tiles.push(tile(guest, false, shown, k as u32 + 1));
                    }
                }
                Sample {
                    at_unix_ms: at as u64,
                    period_ms: 250,
                    status,
                    app: Some(MeetingApp::Teams),
                    app_version: Some("26032.1100".into()),
                    tiles,
                    pass: Pass::Fast,
                    pass_ms: 1.0,
                    elements: 4,
                }
            })
            .collect()
    }

    fn judge(samples: &[Sample]) -> Outcome {
        let mut c = Collector::new(&recipes(), Os::Macos, MeetingApp::Teams, schedule().turns(T0)).unwrap();
        for s in samples {
            c.push(s);
        }
        c.finish(&Params::default()).unwrap()
    }

    #[test]
    fn the_schedule_gives_absolute_turns_and_never_prints_names() {
        let turns = schedule().turns(T0);
        assert_eq!((turns[1].start_ms, turns[1].end_ms), (T0 + 8_000, T0 + 14_000));
        let parsed: Schedule =
            serde_json::from_str(r#"{"app":"meet_chrome","turns":[{"who":"Khach X","start_s":1.5,"end_s":2.25}]}"#)
                .unwrap();
        assert_eq!(parsed.app, MeetingApp::MeetChrome);
        assert!(!format!("{parsed:?}").contains("Khach X"), "Debug không in tên khách");
    }

    #[test]
    fn a_working_recipe_reads_the_right_guest_at_the_right_time() {
        let out = judge(&samples(|_, on| Some(on), ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::Ok, "{:?}", out.verdict.score);
        assert_eq!((out.verdict.score.turns, out.verdict.score.turns_ok), (4, 4));
        assert_eq!(out.app_version.as_deref(), Some("26032.1100"));
        assert_eq!(out.recipe_version, recipes().version);
    }

    /// Teams đổi giao diện: chỉ báo "đang nói" biến mất (ô vẫn đọc được).
    #[test]
    fn tiles_without_an_indicator_mean_no_speaking() {
        let out = judge(&samples(|_, _| Some(false), ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::NoSpeaking);
    }

    /// Teams đổi giao diện: không còn ô người tham dự nào (chỉ còn ô của chính mình).
    #[test]
    fn no_participant_tiles_mean_no_names() {
        let out = judge(&samples(|_, _| None, ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::NoNames);
    }

    #[test]
    fn an_app_that_does_not_answer_means_blocked() {
        let out = judge(&samples(|_, on| Some(on), ReaderStatus::Blocked));
        assert_eq!(out.verdict.health, Health::Blocked);
    }

    /// Chỉ báo dính vào một khách (luôn bật dù khách đó im): sai người ở mọi lượt của khách kia và lúc im.
    #[test]
    fn an_indicator_stuck_on_one_guest_is_not_a_pass() {
        let out = judge(&samples(|who, on| Some(who == "Khach A" || on), ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::NoSpeaking);
        assert!(out.verdict.score.wrong_ratio() > 0.05, "{:?}", out.verdict.score);
    }

    #[test]
    fn there_is_nothing_to_check_without_a_recipe_for_the_app() {
        let none = parse(r#"{"schema":1,"version":1,"min_app_version":"0.3.2","apps":[]}"#).unwrap();
        assert!(Collector::new(&none, Os::Macos, MeetingApp::Teams, vec![]).is_none());
        assert!(
            Collector::new(&recipes(), Os::Windows, MeetingApp::Teams, vec![]).is_none(),
            "bản build sẵn chưa có Teams Windows"
        );
    }

    #[test]
    fn a_broken_schedule_is_an_error_not_a_verdict() {
        let mut c = Collector::new(
            &recipes(),
            Os::Macos,
            MeetingApp::Teams,
            schedule().turns(T0)[..2].to_vec(),
        )
        .unwrap();
        for s in samples(|_, on| Some(on), ReaderStatus::Ok) {
            c.push(&s);
        }
        assert!(c.finish(&Params::default()).is_err());
    }

    /// Báo cáo và kết quả không có tên khách; báo cáo đi đúng khuôn của `speaker_health` với `canary = true`.
    #[test]
    fn the_report_is_a_canary_health_report_without_any_name() {
        let out = judge(&samples(|_, on| Some(on), ReaderStatus::Ok));
        let f = facts("0.3.2", "15.6.1", "mac-chu-du-an");
        assert_eq!(f.device_id_hash.len(), 64);
        assert_ne!(f.device_id_hash, facts("0.3.2", "15.6.1", "may-khac").device_id_hash);
        let json = report(&out, &f, 1_793_059_300, 300_000).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["kind"], "speaker_health");
        assert_eq!(v["canary"], true);
        assert_eq!(v["state"], "ok");
        assert_eq!(v["minutes"], serde_json::json!({"ok": 5, "total": 5}));
        assert_eq!(
            v["meeting"],
            serde_json::json!({"app": "teams", "version": "26032.1100"})
        );
        let result = result_json(&out, 300_000);
        for text in [&json, &result, &format!("{out:?}")] {
            assert!(
                !text.contains("Khach") && !text.contains("Minh") && !text.contains("mac-chu-du-an"),
                "{text}"
            );
        }
        assert!(serde_json::from_str::<serde_json::Value>(&result).unwrap()["turns_ok"] == 4);
    }

    struct FakePoster(Mutex<Vec<Result<u16, String>>>);

    impl Poster for FakePoster {
        fn post(&self, _body: &str) -> Result<u16, String> {
            self.0.lock().unwrap().remove(0)
        }
    }

    #[test]
    fn sending_tells_retryable_from_final_failures() {
        let poster = |r: Result<u16, String>| FakePoster(Mutex::new(vec![r]));
        assert_eq!(send(&poster(Ok(202)), "{}"), Ok(()));
        assert_eq!(send(&poster(Ok(429)), "{}"), Err(SendError::Retry("HTTP 429".into())));
        assert_eq!(send(&poster(Ok(503)), "{}"), Err(SendError::Retry("HTTP 503".into())));
        assert_eq!(send(&poster(Ok(422)), "{}"), Err(SendError::Rejected(422)));
        assert_eq!(send(&poster(Ok(400)), "{}"), Err(SendError::Rejected(400)));
        assert_eq!(
            send(&poster(Err("mạng".into())), "{}"),
            Err(SendError::Retry("mạng".into()))
        );
    }

    #[test]
    fn only_https_or_loopback_servers_are_accepted() {
        assert!(HttpPoster::new(DEFAULT_API).is_some());
        assert!(HttpPoster::new("http://127.0.0.1:8787").is_some());
        assert!(HttpPoster::new("http://api.example.com").is_none());
        assert!(HttpPoster::new("https://api.example.com/?x=1").is_none());
        assert!(HttpPoster::new("không phải url").is_none());
    }
}
```

Tạo `crates/speaker-canary/src/main.rs`:

```rust
//! `speaker-canary`: kiểm tra tự động hằng ngày của bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06). Chạy trên máy của
//! chủ dự án (launchd, Task Scheduler) do bộ điều khiển `tools/speaker-canary` gọi; không nằm trong app hay gói cài.
//!
//!   speaker-canary run --schedule <lịch.json> --t0-unix-ms <ms> --seconds <n> --machine <nhãn> [--recipe <file>] [--out <kết quả.json>]
//!                      [--app-version <x.y.z>] [--os-version <chuỗi>] [--api <url>] [--no-send]
//!       đọc cửa sổ họp của app trong lịch (macOS: Accessibility, Windows: UI Automation) `--seconds` giây theo nhịp 4 lần mỗi giây, chấm so với
//!       lịch nói (giây tính từ `--t0-unix-ms`), ghi kết quả (không có tên người) và gửi `speaker_health` với `canary = true`. Báo cáo gửi lỗi tạm
//!       được giữ ở `<kết quả>.report.json` để gửi lại bằng `send`. Thoát 0 khi tình trạng là `ok`, 1 khi hỏng, 2 khi lỗi chạy.
//!   speaker-canary send --report <file> [--api <url>]
//!       gửi lại một báo cáo đã dựng (mã thoát 0 khi gửi được, 3 khi lỗi tạm, 4 khi bị từ chối).
//!
//! Chỉ đọc, không bấm, không gõ gì trong app họp. Tiến trình chạy công cụ phải có quyền Trợ năng (macOS: quyền của Terminal hay của launchd job).

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, bail};
use clap::{Parser, Subcommand};
use speaker_canary::{Collector, DEFAULT_API, HttpPoster, Schedule, SendError, facts, report, result_json, send};
use speaker_ops::canary::Params;
use speaker_ops::health::Health;
use speaker_recipe::{Os, Recipes};
use speaker_worker::reader::Sample;

const PERIOD: Duration = Duration::from_millis(250);

#[derive(Parser)]
#[command(about = "Kiểm tra tự động hằng ngày của bộ đọc tên người nói")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Run {
        #[arg(long)]
        schedule: PathBuf,
        /// Mốc 0 của lịch nói, giờ Unix (ms).
        #[arg(long)]
        t0_unix_ms: i64,
        #[arg(long)]
        seconds: u64,
        /// Nhãn máy chạy kiểm tra (không phải mã phần cứng); thành `device_id_hash` của báo cáo.
        #[arg(long)]
        machine: String,
        /// Công thức thay bản build sẵn (để thử công thức ứng viên).
        #[arg(long)]
        recipe: Option<PathBuf>,
        #[arg(long)]
        out: Option<PathBuf>,
        #[arg(long, default_value = env!("CARGO_PKG_VERSION"))]
        app_version: String,
        #[arg(long, default_value = "unknown")]
        os_version: String,
        #[arg(long, default_value = DEFAULT_API)]
        api: String,
        #[arg(long)]
        no_send: bool,
        /// Dấu `AXEnhancedUserInterface` (macOS), để trả lại nếu công cụ bị tắt giữa chừng.
        #[arg(long)]
        marker: Option<PathBuf>,
    },
    Send {
        #[arg(long)]
        report: PathBuf,
        #[arg(long, default_value = DEFAULT_API)]
        api: String,
    },
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Đọc cửa sổ họp của `app` `seconds` giây theo nhịp 4 lần mỗi giây; mỗi lượt đọc đưa cho `each`.
#[cfg(target_os = "macos")]
fn read(
    recipes: Arc<Recipes>,
    app: speaker_protocol::MeetingApp,
    seconds: u64,
    marker: Option<PathBuf>,
    mut each: impl FnMut(&Sample),
) -> anyhow::Result<()> {
    use speaker_worker::reader::macos::{LiveReader, set_process_timeout};
    set_process_timeout();
    let mut reader = LiveReader::new(recipes, marker, Some(app));
    reader.restore_leftovers();
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        let started = Instant::now();
        each(&reader.tick(false));
        std::thread::sleep(PERIOD.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    Ok(())
}

#[cfg(windows)]
fn read(
    recipes: Arc<Recipes>,
    app: speaker_protocol::MeetingApp,
    seconds: u64,
    _marker: Option<PathBuf>,
    mut each: impl FnMut(&Sample),
) -> anyhow::Result<()> {
    use speaker_worker::reader::uia::{ComGuard, LiveReader};
    let _com = ComGuard::init();
    let mut reader = LiveReader::new(recipes, Some(app))?;
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        let started = Instant::now();
        each(&reader.tick(false));
        std::thread::sleep(PERIOD.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    Ok(())
}

#[cfg(not(any(target_os = "macos", windows)))]
fn read(
    _recipes: Arc<Recipes>,
    _app: speaker_protocol::MeetingApp,
    _seconds: u64,
    _marker: Option<PathBuf>,
    _each: impl FnMut(&Sample),
) -> anyhow::Result<()> {
    bail!("kiểm tra tự động chỉ chạy trên macOS và Windows")
}

fn post(api: &str, body: &str) -> Result<(), SendError> {
    let poster = HttpPoster::new(api).ok_or(SendError::Rejected(0))?;
    send(&poster, body)
}

fn exit_of(result: Result<(), SendError>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(SendError::Retry(why)) => {
            eprintln!("speaker-canary: chưa gửi được ({why}); gửi lại bằng `send`");
            ExitCode::from(3)
        }
        Err(SendError::Rejected(status)) => {
            eprintln!("speaker-canary: server từ chối báo cáo (HTTP {status})");
            ExitCode::from(4)
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run(
    schedule: PathBuf,
    t0: i64,
    seconds: u64,
    machine: String,
    recipe: Option<PathBuf>,
    out: Option<PathBuf>,
    app_version: String,
    os_version: String,
    api: String,
    no_send: bool,
    marker: Option<PathBuf>,
) -> anyhow::Result<ExitCode> {
    let schedule: Schedule =
        serde_json::from_slice(&std::fs::read(&schedule).context("không đọc được lịch")?).context("lịch sai dạng")?;
    let recipe_json = match &recipe {
        Some(p) => std::fs::read_to_string(p).with_context(|| format!("không đọc được {}", p.display()))?,
        None => speaker_recipe::BUILTIN_JSON.to_string(),
    };
    let recipes = Arc::new(speaker_recipe::parse(&recipe_json)?);
    let os = Os::current().context("hệ điều hành này không có bộ đọc")?;
    let Some(mut collector) = Collector::new(&recipes, os, schedule.app, schedule.turns(t0)) else {
        bail!("công thức không có mục cho app này trên hệ điều hành này: không có gì để kiểm");
    };
    let started = now_ms();
    read(Arc::clone(&recipes), schedule.app, seconds, marker, |s: &Sample| {
        collector.push(s)
    })?;
    let duration_ms = u64::try_from(now_ms() - started).unwrap_or(0);
    let outcome = collector.finish(&Params::default())?;
    let result = result_json(&outcome, duration_ms);
    println!("{result}");
    let body = report(
        &outcome,
        &facts(&app_version, &os_version, &machine),
        now_ms() / 1000,
        duration_ms,
    )?;
    if let Some(out) = &out {
        std::fs::write(out, &result)?;
        std::fs::write(out.with_extension("report.json"), &body)?;
    }
    if !no_send {
        let sent = exit_of(post(&api, &body));
        if sent != ExitCode::SUCCESS {
            return Ok(sent);
        }
    }
    Ok(if outcome.verdict.health == Health::Ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    })
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Send { report, api } => match std::fs::read_to_string(&report) {
            Ok(body) => exit_of(post(&api, &body)),
            Err(e) => {
                eprintln!("speaker-canary: không đọc được {}: {e}", report.display());
                ExitCode::from(2)
            }
        },
        Command::Run {
            schedule,
            t0_unix_ms,
            seconds,
            machine,
            recipe,
            out,
            app_version,
            os_version,
            api,
            no_send,
            marker,
        } => match run(
            schedule,
            t0_unix_ms,
            seconds,
            machine,
            recipe,
            out,
            app_version,
            os_version,
            api,
            no_send,
            marker,
        ) {
            Ok(code) => code,
            Err(e) => {
                eprintln!("speaker-canary: lỗi: {e:#}");
                ExitCode::from(2)
            }
        },
    }
}
```

- [ ] **Step 2: Chạy test** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-canary -- --check && cargo test -p speaker-canary 2>&1 | grep -E "^test result|FAILED|panicked" && cargo clippy -p speaker-canary --all-targets -- -D warnings 2>&1 | tail -2`
Expected: `11 passed; 0 failed`; clippy `Finished`. `Cargo.lock` thêm gói `speaker-canary` (xem Mốc kiểm).

- [ ] **Step 3: Biên dịch chéo và clippy cho Windows** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 RC_x86_64_pc_windows_msvc=$W/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$W/scripts/fake-pkg-config PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 && cargo clippy -p speaker-worker -p speaker-canary --target x86_64-pc-windows-msvc --all-targets -- -D warnings 2>&1 | tail -3`
Expected: `Finished` không lỗi (nhánh `#[cfg(windows)]` của `read` gọi `uia::ComGuard` và `uia::LiveReader`).

- [ ] **Step 4: Kiểm âm tính**

Trong `Collector::push` đổi `p.speaking > 0.0` thành `p.speaking >= 0.0` (mọi người luôn "đang nói") rồi chạy `cargo test -p speaker-canary`: `a_working_recipe_reads_the_right_guest_at_the_right_time` và `the_report_is_a_canary_health_report_without_any_name` phải **đỏ** (9 đạt, 2 đỏ). Hoàn lại, 11 đạt.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git diff --stat Cargo.lock | tail -1 && scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe 2>&1 | tail -1 && cargo tree -p speaker-worker --edges normal 2>/dev/null | grep -c "speaker-canary\|speaker-ops"`
Expected: `Cargo.lock` chỉ thêm (ba chỗ: hai gói mới, một dòng phụ thuộc); worker vẫn "không có mã mạng"; số `speaker-canary` hay `speaker-ops` trong cây phụ thuộc của worker là `0` (worker không phụ thuộc hai crate này). Không commit.

---

### Task 14: `tools/speaker-canary`, bộ điều khiển và lịch tác vụ

`lib.mjs` (thuần): `defaultSchedule` (hai khách lần lượt rồi nói chồng, 6 lượt, 50 giây), `parseConfig` (nêu trường sai mà không in nội dung), `osVersion`, `canaryArgs`, `logLine`, `slots`, `launchdPlist`, `taskXml`. `canary.mjs`: một lượt = dựng lịch, mốc 0 sau `leadSeconds`, mở cuộc họp qua bộ chuyển, `speaker-canary run`, **luôn** dọn (đóng cuộc họp, xóa file lịch tạm có tên khách), ghi nhật ký (không tên). Bộ chuyển chưa có trong repo (Task 19, 20); `--dry-run` dùng bộ chuyển rỗng và không chạy `speaker-canary`.

**Files:**
- Create: `tools/speaker-canary/{lib.mjs,canary.mjs,canary.test.mjs,README.md}`, `tools/speaker-canary/templates/canary.example.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Thư viện thuần**

Tạo `tools/speaker-canary/lib.mjs`:

```javascript
// Phần thuần của bộ điều khiển kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06): đọc và kiểm cấu hình, dựng lịch nói,
// ghép tham số cho `speaker-canary run`, dựng file lịch tác vụ của launchd và Task Scheduler. Không chạm hệ điều hành (phần đó ở canary.mjs).

export const APPS = ["teams", "zoom", "meet_chrome", "meet_edge"];
export const DEFAULT_API = "https://api.aitranslator.vn";

/**
 * Lịch nói mặc định (spec 7.3: "2 khách nói lần lượt rồi nói chồng"), giây tính từ mốc 0: A, B, A, B lần lượt rồi hai khách nói chồng.
 * `guests`: đúng hai tên hiển thị của hai tài khoản thử trong cuộc họp.
 */
export function defaultSchedule(app, guests) {
  if (!APPS.includes(app)) throw new Error(`app không hợp lệ: ${app}`);
  if (!Array.isArray(guests) || guests.length !== 2 || guests.some((g) => typeof g !== "string" || g.trim() === "") || guests[0] === guests[1]) {
    throw new Error("cần đúng hai tên khách khác nhau");
  }
  const [a, b] = guests;
  const turn = (who, start_s, end_s) => ({ who, start_s, end_s });
  return { app, turns: [turn(a, 0, 6), turn(b, 8, 14), turn(a, 16, 22), turn(b, 24, 30), turn(a, 32, 40), turn(b, 34, 42)] };
}

/** Thời gian lịch kéo dài (giây): lượt cuối kết thúc, cộng phần đuôi để chỉ báo kịp tắt. */
export const scheduleSeconds = (schedule, tail = 8) => Math.ceil(Math.max(...schedule.turns.map((t) => t.end_s)) + tail);

const isPlainText = (v, max) => typeof v === "string" && v.length >= 1 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

/**
 * Đọc và kiểm cấu hình (JSON, nằm NGOÀI repo; có tên hiển thị của tài khoản thử, không có mật khẩu). Trả cấu hình đã chuẩn hóa hay ném lỗi
 * nêu trường sai. Không bao giờ in nội dung cấu hình vào thông báo lỗi.
 */
export function parseConfig(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("cấu hình không phải JSON");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("cấu hình phải là một đối tượng JSON");
  const fail = (field) => {
    throw new Error(`cấu hình sai ở "${field}"`);
  };
  if (!isPlainText(raw.machine, 40) || !/^[A-Za-z0-9._-]+$/.test(raw.machine)) fail("machine");
  if (!isPlainText(raw.canaryBin, 400)) fail("canaryBin");
  if (!isPlainText(raw.logDir, 400)) fail("logDir");
  const api = raw.api ?? DEFAULT_API;
  if (!/^https:\/\/[^\s/?#]+$/.test(api) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api)) fail("api");
  const leadSeconds = raw.leadSeconds ?? 20;
  if (!Number.isInteger(leadSeconds) || leadSeconds < 5 || leadSeconds > 300) fail("leadSeconds");
  if (raw.apps === null || typeof raw.apps !== "object" || Array.isArray(raw.apps)) fail("apps");
  const apps = {};
  for (const [name, a] of Object.entries(raw.apps)) {
    if (!APPS.includes(name)) fail(`apps.${name}`);
    if (a === null || typeof a !== "object") fail(`apps.${name}`);
    if (a.enabled !== undefined && typeof a.enabled !== "boolean") fail(`apps.${name}.enabled`);
    const guests = a.guests;
    if (!Array.isArray(guests) || guests.length !== 2 || !guests.every((g) => isPlainText(g, 80))) fail(`apps.${name}.guests`);
    if (a.adapter !== undefined && !isPlainText(a.adapter, 200)) fail(`apps.${name}.adapter`);
    // `recipe`: công thức thay bản build sẵn (để thử công thức ứng viên hay cố ý thử với công thức hỏng, Task 21 của kế hoạch 06).
    if (a.recipe !== undefined && !isPlainText(a.recipe, 400)) fail(`apps.${name}.recipe`);
    apps[name] = {
      enabled: a.enabled ?? true,
      guests: [...guests],
      adapter: a.adapter ?? `adapters/${name}.mjs`,
      recipe: a.recipe ?? null,
      options: a.options ?? {},
    };
  }
  return { machine: raw.machine, canaryBin: raw.canaryBin, logDir: raw.logDir, api, leadSeconds, apps };
}

/** Phiên bản hệ điều hành cho báo cáo (chuỗi gồm chữ số và dấu chấm): macOS theo `sw_vers`, Windows theo `os.release()`. */
export function osVersion(platform, { swVers, release }) {
  const text = platform === "darwin" ? swVers() : release();
  const clean = String(text ?? "").trim();
  return /^[0-9A-Za-z._+-]{1,40}$/.test(clean) ? clean : "unknown";
}

/** Đối số của `speaker-canary run`. */
export function canaryArgs({ cfg, scheduleFile, t0, seconds, resultFile, osVersion: osv, appVersion, recipe = null }) {
  return [
    "run",
    "--schedule", scheduleFile,
    "--t0-unix-ms", String(t0),
    "--seconds", String(seconds),
    "--machine", cfg.machine,
    "--os-version", osv,
    "--app-version", appVersion,
    "--api", cfg.api,
    "--out", resultFile,
  ].concat(recipe ? ["--recipe", recipe] : []);
}

/** Dòng nhật ký một lượt (JSON một dòng): không có tên khách. */
export function logLine({ app, at, exitCode, result, error }) {
  return JSON.stringify({ at: new Date(at).toISOString(), app, exit: exitCode, result: result ?? null, error: error ?? null });
}

const pad = (n) => String(n).padStart(2, "0");

/** Giờ chạy hằng đêm của từng app: lệch nhau 10 phút để các lượt không chồng nhau. */
export function slots(startHour, startMinute, count, stepMinutes = 10) {
  return Array.from({ length: count }, (_, i) => {
    const total = startHour * 60 + startMinute + i * stepMinutes;
    return { hour: Math.floor(total / 60) % 24, minute: total % 60 };
  });
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** plist của launchd (macOS): chạy `node canary.mjs --app <app> --config <file>` hằng ngày lúc `hour:minute`. */
export function launchdPlist({ label, node, script, configPath, app, hour, minute, logDir }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(script)}</string>
    <string>--app</string>
    <string>${xml(app)}</string>
    <string>--config</string>
    <string>${xml(configPath)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key><string>${xml(logDir)}/${xml(app)}.out.log</string>
  <key>StandardErrorPath</key><string>${xml(logDir)}/${xml(app)}.err.log</string>
</dict>
</plist>
`;
}

/** Tác vụ của Task Scheduler (Windows), định dạng XML của `schtasks /Create /XML`: chạy hằng ngày lúc `hour:minute`, chỉ khi người dùng đã đăng nhập. */
export function taskXml({ node, script, configPath, app, hour, minute, startDate }) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${xml(startDate)}T${pad(hour)}:${pad(minute)}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(node)}</Command>
      <Arguments>${xml(`"${script}" --app ${app} --config "${configPath}"`)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}
```

- [ ] **Step 2: Bộ điều khiển**

Tạo `tools/speaker-canary/canary.mjs`:

```javascript
#!/usr/bin/env node
// Bộ điều khiển kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06), chạy trên máy của chủ dự án (launchd, Task Scheduler):
//
//   node tools/speaker-canary/canary.mjs --app <teams|zoom|meet_chrome|meet_edge> --config <cấu hình.json> [--dry-run]
//
// Một lượt: dựng lịch nói cho hai khách, đặt mốc 0 sau `leadSeconds`, mở cuộc họp thử bằng bộ chuyển (`adapters/<app>.mjs`: chủ phòng là app thật,
// hai khách là trình duyệt tự động có micro giả là file giọng đọc), chạy `speaker-canary run` (bộ đọc thật chấm theo lịch rồi gửi `speaker_health` với
// `canary = true`), rồi LUÔN dọn cuộc họp. Không cần tài khoản hay dữ liệu thật của người dùng; mật khẩu không nằm trong repo hay trong cấu hình (hồ
// sơ trình duyệt đã đăng nhập sẵn). Mã thoát: của `speaker-canary` (0 ok, 1 hỏng, 2 lỗi chạy, 3 chưa gửi được, 4 bị từ chối), 5 khi bộ chuyển không mở được cuộc họp
// (hạ tầng thử hỏng, không phải app họp), 6 khi cấu hình sai.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as os from "node:os";
import { APPS, canaryArgs, defaultSchedule, logLine, osVersion, parseConfig, scheduleSeconds } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Phiên bản AI Translator của repo này (`src-tauri/tauri.conf.json`), cho báo cáo. */
export const repoAppVersion = (root = resolve(HERE, "../..")) => JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;

/** Bộ chuyển giả cho `--dry-run` và test: không mở gì. */
export const dryAdapter = { async open() { return { async stop() {} }; } };

/**
 * Một lượt kiểm tra. Mọi thứ ngoài (đồng hồ, chạy lệnh, bộ chuyển, thư mục tạm) đến qua `deps`, nên test chạy được bằng đồ giả.
 * Trả `{ exitCode, line }`.
 */
export async function runCanary({ app, cfg, deps }) {
  const { now, run, loadAdapter, tmp, append, log, version, osv } = deps;
  const appCfg = cfg.apps[app];
  if (!appCfg || !appCfg.enabled) {
    log(`${app}: tắt trong cấu hình, bỏ qua`);
    return { exitCode: 0, line: null };
  }
  const schedule = defaultSchedule(app, appCfg.guests);
  const t0 = now() + cfg.leadSeconds * 1000;
  const seconds = cfg.leadSeconds + scheduleSeconds(schedule);
  const dir = tmp();
  const scheduleFile = join(dir, `lich-${app}.json`);
  const resultFile = join(dir, `ket-qua-${app}.json`);
  writeFileSync(scheduleFile, JSON.stringify(schedule));
  let handle = null;
  let exitCode;
  let result = null;
  let error = null;
  try {
    try {
      handle = await (await loadAdapter(app, appCfg)).open({ options: appCfg.options, guests: appCfg.guests, t0, schedule, log });
    } catch (e) {
      error = `bộ chuyển không mở được cuộc họp: ${e.message}`;
      exitCode = 5;
    }
    if (exitCode === undefined) {
      const r = run(cfg.canaryBin, canaryArgs({ cfg, scheduleFile, t0, seconds, resultFile, osVersion: osv, appVersion: version, recipe: appCfg.recipe }));
      exitCode = r.status ?? 2;
      try {
        result = JSON.parse(readFileSync(resultFile, "utf8"));
      } catch {
        result = null;
      }
    }
  } finally {
    // Luôn dọn: đóng cuộc họp, xóa file lịch (có tên khách) và kết quả tạm.
    try {
      await handle?.stop();
    } catch (e) {
      log(`${app}: dọn cuộc họp lỗi: ${e.message}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
  const line = logLine({ app, at: now(), exitCode, result, error });
  append(cfg.logDir, `${new Date(now()).toISOString().slice(0, 10)}-${app}.jsonl`, `${line}\n`);
  log(line);
  return { exitCode, line };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const app = opt("--app");
  const configPath = opt("--config") ?? process.env.SPEAKER_CANARY_CONFIG;
  if (!APPS.includes(app) || !configPath) {
    console.error("Dùng: node tools/speaker-canary/canary.mjs --app <teams|zoom|meet_chrome|meet_edge> --config <cấu hình.json> [--dry-run]");
    return 6;
  }
  let cfg;
  try {
    cfg = parseConfig(readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    return 6;
  }
  const dry = args.includes("--dry-run");
  const deps = {
    now: () => Date.now(),
    run: (bin, a) => (dry ? { status: 0 } : spawnSync(bin, a, { stdio: ["ignore", "inherit", "inherit"] })),
    loadAdapter: async (name, appCfg) => (dry ? dryAdapter : import(pathToFileURL(resolve(HERE, appCfg.adapter)).href)),
    tmp: () => mkdtempSync(join(tmpdir(), "speaker-canary-")),
    append: (dir, file, text) => {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, file), text);
    },
    log: (m) => console.error(`speaker-canary: ${m}`),
    version: repoAppVersion(),
    osv: osVersion(process.platform, {
      swVers: () => spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).stdout,
      release: () => os.release(),
    }),
  };
  return runCanary({ app, cfg, deps }).then((r) => r.exitCode);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve(main()).then((code) => process.exit(code), (e) => {
    console.error(`LỖI: ${e.message}`);
    process.exit(2);
  });
}
```

- [ ] **Step 3: Mẫu cấu hình và README**

Tạo `tools/speaker-canary/templates/canary.example.json`:

```json
{
  "machine": "mac-chu-du-an",
  "canaryBin": "/đường/dẫn/tới/speaker-canary",
  "logDir": "/đường/dẫn/tới/thư-mục-nhật-ký",
  "api": "https://api.aitranslator.vn",
  "leadSeconds": 20,
  "apps": {
    "teams": { "guests": ["Tên khách A", "Tên khách B"], "options": {} },
    "meet_chrome": { "guests": ["Tên khách A", "Tên khách B"], "options": {} }
  }
}
```

Tạo `tools/speaker-canary/README.md`:

````markdown
# Kiểm tra tự động hằng ngày của bộ đọc tên người nói

Spec: `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` mục 7.3. Kế hoạch: `docs/superpowers/plans/2026-10-27-phan-biet-nguoi-noi-06-van-hanh.md`.

Teams, Meet và Zoom đổi giao diện không báo trước, và công thức đọc tên (spec 7.1) khớp theo giao diện đó. Mỗi đêm, trên máy của chủ dự án, công cụ này mở một cuộc họp thử, cho hai khách tự động nói theo một lịch đã biết, rồi cho **bộ đọc thật** của `speaker-worker` đọc cửa sổ họp của app thật và chấm: có thấy tên người tham dự không, chỉ báo "đang nói" có đúng người, đúng lúc không. Kết quả gửi về server như báo cáo tình trạng với `canary = true`; hỏng hai ngày liền (hay im lặng ba ngày) thì có email cảnh báo (spec 7.2).

Công cụ **không** thu âm, không chạy cả app, không đọc dữ liệu của người dùng, không cần tài khoản thật của ai. Nó chỉ đọc cây giao diện của cửa sổ họp thử (đúng phạm vi bộ đọc của app).

## Gồm những gì

| Phần | Việc |
|---|---|
| `crates/speaker-canary` (`speaker-canary`) | Chạy bộ đọc thật `--seconds` giây, chấm theo lịch, ghi kết quả, gửi báo cáo. Chạm hệ điều hành (Accessibility, UI Automation). |
| `crates/speaker-ops` (`canary.rs`, `health.rs`) | Luật chấm và dựng báo cáo (thuần, có test). |
| `canary.mjs`, `lib.mjs` | Bộ điều khiển: dựng lịch, mở và dọn cuộc họp qua bộ chuyển, gọi `speaker-canary run`, ghi nhật ký. |
| `adapters/<app>.mjs` | Bộ chuyển cho từng app: mở cuộc họp thử (chủ phòng là app thật, hai khách là trình duyệt tự động có micro giả là file giọng đọc) và chạy lịch nói của hai khách. **Làm cùng chủ dự án ở Task 18, 19 của kế hoạch 06**; chưa có file nào trong repo cho tới khi đó. |
| `templates/` | Mẫu cấu hình. |

## Cấu hình (ngoài repo)

File JSON ở **ngoài repo** (ví dụ thư mục dữ liệu riêng của máy), chỉ có tên hiển thị của các tài khoản thử và đường dẫn; **không có mật khẩu**: các hồ sơ trình duyệt đã đăng nhập sẵn một lần bằng tay.

```json
{
  "machine": "mac-chu-du-an",
  "canaryBin": "/đường/dẫn/tới/speaker-canary",
  "logDir": "/đường/dẫn/tới/thư-mục-nhật-ký",
  "api": "https://api.aitranslator.vn",
  "leadSeconds": 20,
  "apps": {
    "teams": { "guests": ["Tên khách A", "Tên khách B"], "options": {} },
    "meet_chrome": { "guests": ["Tên khách A", "Tên khách B"], "options": {} },
    "zoom": { "guests": ["Tên khách A", "Tên khách B"], "enabled": false, "options": {} }
  }
}
```

- `machine`: nhãn của máy chạy kiểm tra (chữ, số, `.`, `_`, `-`); thành `device_id_hash` của báo cáo (SHA-256 của `canary|<nhãn>`). Mac và Windows dùng hai nhãn khác nhau.
- `guests`: đúng tên hiển thị của hai khách trong cuộc họp thử. Tên này chỉ nằm trong file này và trong file lịch tạm (xóa sau mỗi lượt); không bao giờ vào log, kết quả hay báo cáo.
- `options`: tùy chọn riêng của bộ chuyển (hồ sơ trình duyệt, đường dẫn file giọng đọc…).
- `recipe` (tùy chọn): đường dẫn tới một công thức thay bản build sẵn, để thử công thức ứng viên hay cố ý thử với công thức hỏng (kiểm cảnh báo, Task 21 của kế hoạch 06).
- App không khai báo hay `enabled: false` thì bị bỏ qua.

## Tài khoản cần có

Theo spec 7.3 (chủ dự án tạo và đăng nhập sẵn trên máy chạy kiểm tra, trong hồ sơ trình duyệt riêng):

- 2–3 tài khoản Gmail: khách Meet phải đăng nhập Google. Một tài khoản làm chủ phòng Meet trong Chrome (hay Edge), hai tài khoản làm khách.
- 1 tài khoản Microsoft cá nhân: chủ phòng Teams (app Teams mới đã đăng nhập). Khách Teams vào bằng trình duyệt, không cần tài khoản.
- Zoom: chỉ khi chủ dự án có tài khoản và đồng ý (Zoom chưa có trong công thức build sẵn, nên chưa kiểm được).

## Chạy tay một lượt

```bash
# macOS (cần quyền Trợ năng cho tiến trình chạy lệnh; xem "Quyền Trợ năng")
cargo build --release -p speaker-canary
node tools/speaker-canary/canary.mjs --app teams --config "$HOME/…/canary.json"
# thử khô: không mở gì, không chạy speaker-canary
node tools/speaker-canary/canary.mjs --app teams --config "$HOME/…/canary.json" --dry-run
```

Mã thoát: `0` đạt; `1` tình trạng hỏng (đã gửi báo cáo); `2` lỗi chạy `speaker-canary`; `3` chưa gửi được (mạng; gửi lại bằng `speaker-canary send --report <file>`); `4` server từ chối; `5` bộ chuyển không mở được cuộc họp (hạ tầng thử hỏng, **không** gửi báo cáo của app họp; xem nhật ký); `6` cấu hình sai.

Nhật ký mỗi lượt: `<logDir>/<ngày>-<app>.jsonl` (một dòng JSON: ngày giờ, app, mã thoát, tình trạng, điểm; không có tên người).

## Lịch chạy ban đêm

Sinh file lịch bằng `lib.mjs` (`launchdPlist`, `taskXml`, `slots`): mỗi app một lượt, cách nhau 10 phút.

- macOS (launchd): đặt plist vào `~/Library/LaunchAgents/`, rồi `launchctl bootstrap gui/$(id -u) <plist>`. Máy phải đã đăng nhập và không khóa màn hình lúc chạy (đọc cây giao diện cần phiên người dùng).
- Windows (Task Scheduler): `schtasks /Create /TN "AI Translator speaker-canary teams" /XML <file.xml>`; chỉ chạy khi người dùng đã đăng nhập.

Mỗi lượt khoảng 5 phút mỗi app (spec 7.3), nên đặt giờ lúc máy không dùng.

## Quyền Trợ năng (macOS)

Bộ đọc cần quyền Trợ năng. Với launchd, quyền thuộc về chương trình chạy: cấp cho cả `node` và `speaker-canary` ở System Settings › Privacy & Security › Accessibility. **Chưa kiểm** rằng cấp như vậy là đủ khi chạy từ launchd; kiểm ở Task 18 của kế hoạch 06.

## Khi hỏng

| Dấu hiệu | Việc |
|---|---|
| Email "speaker_canary_failed", tab Bộ đọc tên (Web Admin) hiện `no_names` | Giao diện app họp đổi: chạy `ax-record fixture` / `uia-record fixture` trên máy có app họp bản mới, sửa công thức, `pnpm recipes:update` (`docs/release/phat-hanh.md` mục 15). |
| `no_speaking` | Ô tên còn đọc được mà chỉ báo "đang nói" đổi: xem mẫu chỉ báo tự học ở tab Bộ đọc tên, rồi như trên. |
| `blocked` | App họp không trả lời bộ đọc (Teams treo, quyền cao hơn): kiểm tay. |
| Mã thoát 5 nhiều ngày | Bộ chuyển hỏng (hồ sơ đăng xuất, app họp đổi cách vào phòng): sửa bộ chuyển. Sau 3 ngày không có kết quả nào, server cũng gửi cảnh báo. |
| Không có email dù biết đã hỏng | Kiểm cron (`wrangler tail` Worker API: bước `speaker_health_alerts`), và `OPERATOR_EMAIL` đã đặt. |
````

- [ ] **Step 4: Test**

Tạo `tools/speaker-canary/canary.test.mjs`:

```javascript
// Test bộ điều khiển kiểm tra tự động (kế hoạch 06). Chạy: node --test tools/speaker-canary/
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dryAdapter, repoAppVersion, runCanary } from "./canary.mjs";
import { APPS, canaryArgs, defaultSchedule, launchdPlist, logLine, osVersion, parseConfig, scheduleSeconds, slots, taskXml } from "./lib.mjs";

const config = (over = {}) =>
  JSON.stringify({
    machine: "mac-chu-du-an",
    canaryBin: "/opt/speaker-canary/speaker-canary",
    logDir: "/var/log/speaker-canary",
    apps: { teams: { guests: ["Canary Khach A", "Canary Khach B"] }, meet_chrome: { guests: ["Canary Khach A", "Canary Khach B"], enabled: false } },
    ...over,
  });

test("lịch mặc định: hai khách lần lượt rồi nói chồng, hợp lệ cho mọi app", () => {
  for (const app of APPS) {
    const s = defaultSchedule(app, ["A", "B"]);
    assert.equal(s.turns.length, 6);
    assert.ok(s.turns.every((t) => t.end_s > t.start_s));
    // Hai lượt cuối chồng nhau.
    assert.ok(s.turns[5].start_s < s.turns[4].end_s);
    assert.equal(scheduleSeconds(s), 50);
  }
  assert.throws(() => defaultSchedule("webex", ["A", "B"]), /app không hợp lệ/);
  assert.throws(() => defaultSchedule("teams", ["A"]), /đúng hai tên/);
  assert.throws(() => defaultSchedule("teams", ["A", "A"]), /đúng hai tên/);
  assert.throws(() => defaultSchedule("teams", ["A", " "]), /đúng hai tên/);
});

test("parseConfig chuẩn hóa và nêu trường sai mà không in nội dung", () => {
  const cfg = parseConfig(config());
  assert.equal(cfg.leadSeconds, 20);
  assert.equal(cfg.api, "https://api.aitranslator.vn");
  assert.equal(cfg.apps.teams.enabled, true);
  assert.equal(cfg.apps.teams.adapter, "adapters/teams.mjs");
  assert.equal(cfg.apps.meet_chrome.enabled, false);
  assert.equal(cfg.apps.teams.recipe, null);
  const bad = (over, field) => assert.throws(() => parseConfig(config(over)), (e) => e.message === `cấu hình sai ở "${field}"`, field);
  bad({ machine: "máy có dấu" }, "machine");
  bad({ canaryBin: "" }, "canaryBin");
  bad({ api: "http://api.example.com" }, "api");
  bad({ leadSeconds: 1 }, "leadSeconds");
  bad({ apps: { webex: { guests: ["A", "B"] } } }, "apps.webex");
  bad({ apps: { teams: { guests: ["A"] } } }, "apps.teams.guests");
  bad({ apps: { teams: { guests: ["A", "B"], recipe: "" } } }, "apps.teams.recipe");
  assert.throws(() => parseConfig("{"), /không phải JSON/);
  assert.throws(() => parseConfig("[]"), /đối tượng/);
  assert.doesNotThrow(() => parseConfig(config({ api: "http://127.0.0.1:8787" })));
  assert.throws(() => parseConfig(config({ machine: "bí-mật" })), (e) => !e.message.includes("bí-mật"));
});

test("osVersion chỉ nhận chuỗi an toàn", () => {
  assert.equal(osVersion("darwin", { swVers: () => "15.6.1\n", release: () => "24.6.0" }), "15.6.1");
  assert.equal(osVersion("win32", { swVers: () => "", release: () => "10.0.26100" }), "10.0.26100");
  assert.equal(osVersion("darwin", { swVers: () => "/usr/local", release: () => "" }), "unknown");
  assert.equal(osVersion("darwin", { swVers: () => undefined, release: () => "" }), "unknown");
});

test("slots lệch nhau 10 phút và quay vòng qua nửa đêm", () => {
  assert.deepEqual(slots(2, 0, 4), [{ hour: 2, minute: 0 }, { hour: 2, minute: 10 }, { hour: 2, minute: 20 }, { hour: 2, minute: 30 }]);
  assert.deepEqual(slots(23, 50, 2), [{ hour: 23, minute: 50 }, { hour: 0, minute: 0 }]);
});

test("file lịch tác vụ có đủ phần cần và thoát ký tự XML", () => {
  const plist = launchdPlist({ label: "vn.aitranslator.speaker-canary.teams", node: "/usr/local/bin/node", script: "/repo/tools/speaker-canary/canary.mjs", configPath: "/cfg/a&b.json", app: "teams", hour: 2, minute: 10, logDir: "/logs" });
  assert.match(plist, /<key>Label<\/key><string>vn\.aitranslator\.speaker-canary\.teams<\/string>/);
  assert.match(plist, /<string>--config<\/string>\s*<string>\/cfg\/a&amp;b\.json<\/string>/);
  assert.match(plist, /<key>Hour<\/key><integer>2<\/integer><key>Minute<\/key><integer>10<\/integer>/);
  assert.ok(!plist.includes("password") && !plist.includes("Password"));
  const task = taskXml({ node: "C:\\Program Files\\nodejs\\node.exe", script: "C:\\repo\\tools\\speaker-canary\\canary.mjs", configPath: "C:\\cfg\\canary.json", app: "meet_edge", hour: 2, minute: 30, startDate: "2026-11-01" });
  assert.match(task, /<StartBoundary>2026-11-01T02:30:00<\/StartBoundary>/);
  assert.match(task, /--app meet_edge --config &quot;C:\\cfg\\canary\.json&quot;/);
  assert.match(task, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(task, /<RunLevel>LeastPrivilege<\/RunLevel>/);
});

test("logLine không có tên khách", () => {
  const line = logLine({ app: "teams", at: Date.UTC(2026, 9, 27), exitCode: 1, result: { state: "no_names", turns: 6 } });
  assert.deepEqual(JSON.parse(line), { at: "2026-10-27T00:00:00.000Z", app: "teams", exit: 1, result: { state: "no_names", turns: 6 }, error: null });
});

test("phiên bản app lấy từ tauri.conf.json của repo", () => {
  assert.match(repoAppVersion(), /^\d+\.\d+\.\d+$/);
});

/** Bàn làm việc giả: đồng hồ cố định, `run` ghi lại lệnh và ghi file kết quả như `speaker-canary` thật. */
function bench(t, { adapter = dryAdapter, exit = 0, result = { state: "ok", turns: 6, turns_ok: 6 }, writeResult = true } = {}) {
  const logDir = mkdtempSync(join(tmpdir(), "mt-canary-log-"));
  const tmpRoot = mkdtempSync(join(tmpdir(), "mt-canary-tmp-"));
  t.after(() => {
    rmSync(logDir, { recursive: true, force: true });
    rmSync(tmpRoot, { recursive: true, force: true });
  });
  const state = { runs: [], lines: [], files: {}, scheduleDuringRun: null };
  const deps = {
    now: () => Date.UTC(2026, 9, 27, 2, 10, 0),
    run: (bin, args) => {
      state.runs.push({ bin, args });
      const at = (name) => args[args.indexOf(name) + 1];
      state.scheduleDuringRun = JSON.parse(readFileSync(at("--schedule"), "utf8"));
      if (writeResult) writeFileSync(at("--out"), JSON.stringify(result));
      return { status: exit };
    },
    loadAdapter: async () => adapter,
    tmp: () => mkdtempSync(join(tmpRoot, "run-")),
    append: (dir, file, text) => {
      state.files[file] = (state.files[file] ?? "") + text;
    },
    log: (m) => state.lines.push(m),
    version: "0.3.2",
    osv: "15.6.1",
  };
  return { deps, state, tmpRoot, logDir };
}

test("một lượt: lịch và kết quả tạm bị xóa, nhật ký không có tên khách, mã thoát của speaker-canary", async (t) => {
  const b = bench(t, { exit: 1, result: { state: "no_names", turns: 6, turns_ok: 0 } });
  const cfg = parseConfig(config());
  const { exitCode, line } = await runCanary({ app: "teams", cfg, deps: b.deps });
  assert.equal(exitCode, 1);
  const run = b.state.runs[0];
  assert.equal(run.bin, "/opt/speaker-canary/speaker-canary");
  assert.deepEqual(run.args.slice(0, 1), ["run"]);
  const arg = (name) => run.args[run.args.indexOf(name) + 1];
  assert.equal(arg("--t0-unix-ms"), String(Date.UTC(2026, 9, 27, 2, 10, 0) + 20_000));
  assert.equal(arg("--seconds"), "70");
  assert.equal(arg("--machine"), "mac-chu-du-an");
  assert.equal(arg("--os-version"), "15.6.1");
  assert.equal(arg("--app-version"), "0.3.2");
  assert.equal(b.state.scheduleDuringRun.turns[0].who, "Canary Khach A", "lịch có tên khách lúc chạy");
  assert.deepEqual(readdirSync(b.tmpRoot), [], "thư mục tạm đã xóa");
  const logged = b.state.files["2026-10-27-teams.jsonl"];
  assert.ok(!logged.includes("Canary Khach") && !b.state.lines.join("\n").includes("Canary Khach"));
  assert.deepEqual(JSON.parse(logged).result, { state: "no_names", turns: 6, turns_ok: 0 });
  assert.equal(JSON.parse(line).exit, 1);
});

test("bộ chuyển không mở được cuộc họp: mã 5, không chạy speaker-canary, vẫn dọn", async (t) => {
  const b = bench(t, {
    adapter: {
      async open() {
        throw new Error("Chrome chưa đăng nhập");
      },
    },
  });
  const { exitCode } = await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
  assert.equal(exitCode, 5);
  assert.equal(b.state.runs.length, 0);
  assert.match(b.state.files["2026-10-27-teams.jsonl"], /bộ chuyển không mở được cuộc họp: Chrome chưa đăng nhập/);
  assert.deepEqual(readdirSync(b.tmpRoot), []);
});

test("luôn đóng cuộc họp (stop) dù speaker-canary lỗi, và lỗi khi dọn không làm hỏng kết quả", async (t) => {
  const calls = [];
  const adapter = {
    async open({ t0, schedule }) {
      calls.push(["open", t0, schedule.turns.length]);
      return {
        async stop() {
          calls.push(["stop"]);
          throw new Error("không đóng được");
        },
      };
    },
  };
  const b = bench(t, { adapter, exit: 2, writeResult: false });
  const { exitCode } = await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
  assert.equal(exitCode, 2);
  assert.deepEqual(calls.map((c) => c[0]), ["open", "stop"]);
  assert.equal(calls[0][2], 6);
  assert.ok(b.state.lines.some((l) => l.includes("dọn cuộc họp lỗi")));
  assert.equal(JSON.parse(b.state.files["2026-10-27-teams.jsonl"]).result, null);
});

test("app tắt trong cấu hình thì không làm gì", async (t) => {
  const b = bench(t);
  const { exitCode, line } = await runCanary({ app: "meet_chrome", cfg: parseConfig(config()), deps: b.deps });
  assert.deepEqual([exitCode, line, b.state.runs.length], [0, null, 0]);
  assert.equal((await runCanary({ app: "zoom", cfg: parseConfig(config()), deps: b.deps })).exitCode, 0, "không khai báo thì cũng bỏ qua");
});

test("công thức thay thế của app (nếu có) được truyền cho speaker-canary", async (t) => {
  const b = bench(t);
  const text = config({ apps: { teams: { guests: ["Canary Khach A", "Canary Khach B"], recipe: "/cfg/recipe-hong.json" } } });
  await runCanary({ app: "teams", cfg: parseConfig(text), deps: b.deps });
  const args = b.state.runs[0].args;
  assert.equal(args[args.indexOf("--recipe") + 1], "/cfg/recipe-hong.json");
  const plain = bench(t);
  await runCanary({ app: "teams", cfg: parseConfig(config()), deps: plain.deps });
  assert.ok(!plain.state.runs[0].args.includes("--recipe"));
});

test("canaryArgs có đủ tham số", () => {
  const cfg = parseConfig(config());
  assert.deepEqual(canaryArgs({ cfg, scheduleFile: "/t/l.json", t0: 5, seconds: 70, resultFile: "/t/r.json", osVersion: "15", appVersion: "0.3.2" }), [
    "run", "--schedule", "/t/l.json", "--t0-unix-ms", "5", "--seconds", "70", "--machine", "mac-chu-du-an", "--os-version", "15", "--app-version", "0.3.2",
    "--api", "https://api.aitranslator.vn", "--out", "/t/r.json",
  ]);
  assert.ok(!existsSync("/t/l.json"));
});

test("cấu hình mẫu trong repo hợp lệ và không có bí mật", () => {
  const text = readFileSync(new URL("./templates/canary.example.json", import.meta.url), "utf8");
  const cfg = parseConfig(text);
  assert.deepEqual(Object.keys(cfg.apps), ["teams", "meet_chrome"]);
  assert.ok(!/password|secret|token|mật khẩu/i.test(text));
  assert.ok(!text.includes("/Use" + "rs/"), "không có đường dẫn cá nhân");
});
```

- [ ] **Step 5: Nối vào CI**

**Sửa `.github/workflows/ci.yml`:**

Thay đoạn:

```yaml
      - name: Công thức đọc tên (node --test, kế hoạch 06 của phân biệt người nói)
        run: node --test scripts/speaker-recipes/update.test.mjs
```

bằng:

```yaml
      - name: Công thức đọc tên và kiểm tra tự động (node --test, kế hoạch 06 của phân biệt người nói)
        run: node --test scripts/speaker-recipes/update.test.mjs tools/speaker-canary/canary.test.mjs
```


- [ ] **Step 6: Chạy test và thử khô**

Run: `cd $W && node --test tools/speaker-canary/canary.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖" && mkdir -p $DATA/canary/logs && printf '{"machine":"dev-thu","canaryBin":"/bin/true","logDir":"%s/canary/logs","apps":{"teams":{"guests":["Khach A","Khach B"]}}}' "$DATA" > $DATA/canary/dry.json && node tools/speaker-canary/canary.mjs --app teams --config $DATA/canary/dry.json --dry-run; echo "mã thoát $?"; ls $DATA/canary/logs; rm -f $DATA/canary/dry.json`
Expected: 14 test, `fail 0`; thử khô in một dòng nhật ký JSON (`"exit":0`, `"result":null`) và `mã thoát 0`; có file `<ngày>-teams.jsonl` trong `$DATA/canary/logs` (xóa thủ công nếu muốn). Không mở gì, không chạy `speaker-canary`.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && node --test scripts/speaker-recipes/update.test.mjs tools/speaker-canary/canary.test.mjs "scripts/release/*.test.mjs" 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`. Không commit.

---

### Task 15: Runbook

Mục 15 mới của `docs/release/phat-hanh.md` (mục 14 hiện có là chuyển tên miền): đợt triển khai lần đầu (migration trước, Worker sau, kiểm cron), `pnpm recipes:update`, quay lại và tắt từ xa, báo cáo tình trạng và Web Admin, kiểm tra tự động.

**Files:**
- Modify: `docs/release/phat-hanh.md`

- [ ] **Step 1: Thêm mục 15**

**Sửa `docs/release/phat-hanh.md`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```markdown
Đường lui: tới hết bước 4, tên cũ chạy nguyên vẹn; webhook lỗi thì đăng ký lại về `https://api.aitranslator.io.vn/…`. Ở bước 5, `pnpm exec wrangler rollback` cho Worker site không trả tên cũ về (custom domain không đi theo bản rollback): muốn bỏ chuyển hướng thì sửa `routes` của `website/wrangler.jsonc` thêm lại `aitranslator.io.vn` và deploy site (trả lời có khi wrangler hỏi).
```

Đoạn thêm vào:

````markdown
## 15. Phân biệt người nói: công thức đọc tên và báo cáo tình trạng (migration D1 0007)

Spec `2026-10-26-phan-biet-nguoi-noi-design.md` mục 7, kế hoạch `2026-10-27-phan-biet-nguoi-noi-06-van-hanh.md`. **Mỗi bước ghi vào production do chủ dự án chạy.** Tính năng còn **tắt** với người dùng cuối tới kế hoạch 07 (công tắc nội bộ `speaker::enabled`): các bước dưới đây đặt sẵn hạ tầng vận hành, chưa có người dùng thật nào gửi báo cáo hay tải công thức cho tới khi kế hoạch 07 bật tính năng.

### 15.1. Đợt triển khai lần đầu (server, admin, công thức)

Thứ tự (mỗi bước kiểm xong mới sang bước sau): **migration trước, Worker sau**. Migration 0007 chỉ **thêm** bảng `speaker_health` và hai index; Worker cũ chạy đúng trên schema mới.

1. **Kiểm trước (chỉ đọc), chép lại để so sau.**

   ```bash
   cd server
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE name = 'speaker_health'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: mốc time-travel in ra (đường lui khôi phục dữ liệu); truy vấn bảng trả rỗng; `foreign_key_check` rỗng.
2. **Áp migration.** `pnpm exec wrangler d1 migrations apply mt-license-production --remote` liệt kê đúng `0007_speaker_health.sql`, hỏi xác nhận. Kiểm lại truy vấn bước 1: có bảng `speaker_health`.
3. **Deploy Worker API và Worker admin** (cùng lúc, như mục 10): `pnpm check && pnpm exec wrangler deploy`, rồi `pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc`. Kiểm: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.aitranslator.vn/v1/diagnostics -H 'content-type: application/json' -d '{"v":1,"kind":"speaker_health"}'` ra `400` (thân thiếu trường, route nhận kind mới); Web Admin, trang Báo cáo lỗi, tab **Bộ đọc tên** mở được và báo trống.
4. **Kiểm cron:** sau 5 phút, `pnpm exec wrangler tail` (Worker API) có `"event":"reconcile"` và không có `reconcile_failed` ở các bước `speaker_health_alerts`, `prune_speaker_health` (bài học sự cố cron 2026-10-07: kiểm cron sau mỗi lần deploy).
5. **Đăng công thức đọc tên lần đầu** (mục 15.2): bản đầu là nội dung của `scripts/speaker-recipes/recipes.json` đang có, `"version": 1`, đăng với `first_release` (lệnh tự chọn khi chưa có bản nào trên R2). Kiểm: `curl -s https://releases.aitranslator.vn/speaker/recipes.json | head -c 200` in một dòng JSON có `"format":"ai-translator-speaker-recipes"`.

Đường lui: Worker lỗi thì `pnpm exec wrangler rollback` (bảng mới không ảnh hưởng Worker cũ). Công thức lỗi thì mục 15.3.

### 15.2. Sửa và đăng công thức: `pnpm recipes:update`

Khi Teams, Meet hay Zoom đổi giao diện và bộ đọc không còn đọc đúng (cảnh báo từ tab Bộ đọc tên, hay kiểm tra tự động hỏng):

1. Trên máy có app họp bản mới, đang trong cuộc họp thử, ghi cây giao diện: macOS `ax-record fixture <app> "$DATA/…/cay.jsonl" --seconds 20`, Windows `uia-record fixture …` (có tên thật: chỉ ghi vào `$DATA`, ngoài repo).
2. Ẩn danh bằng `scripts/speaker-recipes/make_fixture.py` (dừng khi còn mẫu cấm), duyệt bản in, chép fixture vào `scripts/speaker-recipes/fixtures/` kèm file `.truth.json` (cách làm: `scripts/speaker-recipes/fixtures/README.md`).
3. Sửa `scripts/speaker-recipes/recipes.json` và **tăng `"version"`** (app không nhận số cũ hơn hay bằng); `min_app_version` chỉ nâng khi công thức dùng khả năng mà app cũ không có.
4. `pnpm recipes:update --check` (kiểm luật của app, in khác biệt so với bản đang phát hành, chạy bộ test cây giao diện ghi sẵn). Đạt thì `pnpm recipes:update`: hỏi y/N rồi commit, đẩy `main`, ký trong CI (`sign-recipes.yml`, cùng khóa ký manifest model), tải `recipes.json` đã ký, đăng lên R2 (sao lưu bản cũ ở `.recipes-update/backup/`), kiểm lại qua URL công khai.
5. Điều kiện máy như mục 13.1 (nhánh `main`, cây chỉ có file của lượt này, `gh` tài khoản `dotienphong`, wrangler đã đăng nhập); không cần rclone.

App của người dùng tải trong vòng 6 giờ (lúc mở và mỗi 6 giờ, chỉ khi tính năng bật cho họ), áp dụng từ **phiên dịch sau**. Kiểm ở máy dev: log có dòng `công thức đọc tên: nhận số N`.

**Dừng giữa chừng:** chạy lại `pnpm recipes:update` (lệnh làm tiếp được: không commit lần hai, `git push` an toàn, CI ký lại). Nếu đã commit mà chưa đẩy, chạy `git push origin main` trước. Lỗi "Bản đã ký không khớp công thức trong repo": dừng hẳn, không đăng tay; xem lượt chạy CI.

### 15.3. Quay lại và tắt từ xa

- **Quay lại:** `pnpm recipes:update --revert-to <V>` đăng lại nội dung của phiên bản V với số mới = đang phát hành + 1 (app không nhận số cũ hơn, nên "quay lại" là một số mới mang nội dung cũ). Bản lưu từng phiên bản: `scripts/speaker-recipes/released/body-<V>.json`.
- **Tắt bộ đọc của một app (hay tất cả) từ xa:** đăng công thức không có mục của app đó (`"apps": []` là tắt hết): người dùng quay về "Người N" mà không cần phát hành app. Dùng khi công thức làm đọc sai tên.
- **Khóa ký bị lộ hay nghi bị lộ:** công thức chỉ là dữ liệu (không mã, app trong danh sách viết cứng, worker không có mạng), nên tệ nhất là đọc sai tên hay tắt bộ đọc; vẫn xử lý như khóa manifest model (đổi khóa ở `src-tauri/keys/manifest-public-keys.json`, phát hành app mới).

### 15.4. Báo cáo tình trạng và Web Admin

- Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản app họp) mỗi máy, chỉ khi người dùng bật "Gửi báo cáo lỗi" (Cài đặt › Quyền riêng tư). Không có tên người; có `device_id_hash` như báo cáo lỗi. Giữ 60 ngày; xóa theo email (`/admin/erase`) xóa luôn báo cáo của máy đã kích hoạt license của email đó.
- Web Admin › Báo cáo lỗi › tab **Bộ đọc tên**: bảng theo app họp, phiên bản và hệ điều hành (hỏng từ 30% và từ 5 báo cáo thì huy hiệu đỏ), kết quả kiểm tra tự động, mẫu chỉ báo tự học mới nhất.
- Email vận hành: `speaker_health_degraded` (một phiên bản app họp có ≥ 30% báo cáo hỏng, từ 5 báo cáo trong 3 ngày), `speaker_canary_failed` (kiểm tra tự động hỏng hai ngày liền hay im ba ngày). Mỗi chủ thể cảnh báo tối đa một lần mỗi ngày; thư chỉ có số lượng.

### 15.5. Kiểm tra tự động hằng ngày

`tools/speaker-canary/README.md`. Chủ dự án tạo tài khoản thử, đăng nhập sẵn trong hồ sơ trình duyệt riêng, rồi cài lịch (launchd, Task Scheduler).
````


- [ ] **Step 2: Kiểm các lệnh trong runbook có thật**

Run: `cd $W && for f in scripts/speaker-recipes/update.mjs scripts/speaker-recipes/fixtures/README.md tools/speaker-canary/README.md .github/workflows/sign-recipes.yml server/migrations/0007_speaker_health.sql; do test -f $f && echo "có $f" || echo "THIẾU $f"; done; grep -n "recipes:update" package.json; grep -c "^## 15\." docs/release/phat-hanh.md`
Expected: năm dòng `có …`; dòng `recipes:update` của `package.json`; `1`.

- [ ] **Step 3: Mốc kiểm**

Run: `cd $W && git diff --stat docs/release/phat-hanh.md | tail -1`
Expected: chỉ thêm dòng (mục 15), không xóa. Không commit.

---

### Task 16: Mốc kiểm cuối của phần A

Chạy lại toàn bộ kiểm tra liên quan trên cây làm việc, quét chuỗi nhạy cảm, ghi kết quả.

**Files:**
- Create: `$B/results/06-van-hanh.md`

- [ ] **Step 1: Toàn bộ kiểm tra tự động** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-protocol -p speaker-recipe -p speaker-ops -p speaker-canary -p speaker-worker -p pipeline -p meeting-translator -- --check && echo fmt-ok && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -2 && cargo test --locked -p speaker-protocol -p speaker-recipe -p speaker-ops -p speaker-canary -p speaker-worker -p pipeline 2>&1 | grep -E "^test result: .* [1-9][0-9]* passed|FAILED|panicked" && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED"`
Expected: `fmt-ok`; clippy `Finished`; các dòng `test result` có số đạt khác 0 (mốc đo: `speaker-protocol` 15, `speaker-recipe` 8, `speaker-ops` 39 và 1 bỏ qua, `speaker-canary` 11, `speaker-worker` lib 166 và `worker_process` 10, `pipeline` lib 360 và `speaker_client` 31); app lib **957 đạt, 6 bỏ qua**; không FAILED.

- [ ] **Step 2: Script, server, Web Admin, không mã mạng, phụ thuộc**

Run: `cd $W && node --test scripts/speaker-recipes/update.test.mjs tools/speaker-canary/canary.test.mjs "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"; scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe 2>&1 | tail -1; cargo deny check 2>&1 | tail -1; cargo audit 2>&1 | tail -2; cd $W/server && pnpm run check 2>&1 | tail -4; cd $W/server/admin-ui && pnpm exec vitest run 2>&1 | grep -E "Tests |Test Files"`
Expected: node `fail 0`; "không có mã mạng…"; `cargo deny` `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit` không có lỗ hổng mới (nếu có cảnh báo của crate có sẵn không do kế hoạch này thì ghi lại, không sửa ở đây); `pnpm run check` của server không lỗi; Web Admin 51 file, 1 159 test đạt.

- [ ] **Step 3: Biên dịch chéo Windows toàn bộ phần đụng tới** (build nặng)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && scripts/check-windows.sh --locked 2>&1 | tail -3`
Expected: `Finished` không lỗi (script chạy clippy `-D warnings` target `x86_64-pc-windows-msvc` cho `meeting-translator`, `pipeline`, `audio-capture`, `speaker-worker`, `speaker-protocol`; `speaker-canary` đã kiểm ở Task 13 Step 3). Đây là lần đầu `meeting-translator` được biên dịch chéo với `speaker/recipes.rs`, `speaker/health.rs` và hai thay đổi của `diagnostics/`: mã mới không có `cfg` theo hệ điều hành, nhưng chưa được kiểm chéo khi viết kế hoạch (hết đĩa cho lần build Windows của cả app).

- [ ] **Step 4: Quét chuỗi không được có trong repo công khai**

Run: `cd $W && files=$(git status --short -uall | awk '{print $2}' | grep -v '^bench/' | grep -v '^docs/superpowers/plans/'); grep -n "/Use[r]s/\|/hom[e]/[a-z]\|BEGIN [A-Z ]*PRIVATE\|AKIA[0-9A-Z]\{12\}\|password\|passwd" $files 2>/dev/null | grep -v "tools/speaker-canary/README.md.*password\|không có mật khẩu\|không mật khẩu\|Mật khẩu" ; echo "quét xong (dòng trên là các chỗ cần xem; trống là sạch)"; git diff Cargo.lock | grep '^[-+]' | grep -v '^+++\|^---' | grep -c '^-'`
Expected: không dòng nào được in ở phần quét (README nhắc "không có mật khẩu" bị loại có chủ ý; test của kế hoạch này tránh viết nguyên chuỗi cấm (dùng `/usr/local`, hay ghép `/Use` + `rs/`); mẫu `[r]` trong lệnh quét để chính lệnh không tự khớp); số dòng **bị xóa** khỏi `Cargo.lock` là `0` (chỉ thêm). Có dòng nào thì sửa trước khi đi tiếp. Tên trong test (`Lan Nguyễn`, `Minh Trần`, `Khach A`, `Canary Khach`…) là tên giả.

- [ ] **Step 5: Ghi kết quả**

Tạo `$B/results/06-van-hanh.md` (tiếng Việt, theo mẫu các file `results/` khác; **điền số đo thật của các lệnh Step 1–3**): mục "Câu hỏi" (spec §7.1–§7.3, §10), "Điều kiện" (máy, nhánh, commit `HEAD`, ngày, lệnh), "Kết quả" gồm bảng số test từng gói (so với mốc Task 0 Step 2), `Cargo.lock` chỉ thêm ba chỗ, `cargo deny`/`audit`, không mã mạng ở worker, clippy chéo Windows, và các kiểm âm tính đã làm (Task 1, 2, 4, 5, 7, 9, 10, 11, 13: đỏ khi phá, xanh khi hoàn lại), mục "Chưa kiểm" **giữ nguyên chữ**: hành vi thật của `GetPackageFullName` và `GetFileVersionInfoW` trên Windows (Task 20), đường tải công thức qua R2 thật (Task 18), email cảnh báo thật (Task 21), bộ chuyển và quyền Trợ năng khi chạy bằng launchd (Task 19), Task Scheduler (Task 20), mẫu nhãn ngoài tiếng Anh và tiếng Việt (Task 22).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short | wc -l && git diff --shortstat Cargo.lock`
Expected: số dòng `git status` khớp tổng file mới và sửa của Task 1–15 cộng file kết quả; `Cargo.lock` chỉ thêm dòng. Không commit; báo chủ dự án phần A xong và liệt kê Task 17–22 cần làm.

---

## Phần B: cần chủ dự án

Mọi Task dưới đây **chỉ chuẩn bị lệnh và quy trình**; ghi rõ ai làm. Điều kiện chung: phần A (Task 0–16) xong và chủ dự án đã quyết gộp vào `main` và đẩy (cần vì `sign-recipes.yml` phải có trên `main` mới chạy được; kế hoạch này không commit). CI của lượt đẩy xanh. Không có secret mới cần đặt: `MANIFEST_SIGNING_KEY` của environment `release` đã có (cùng khóa ký manifest model).

### Task 17: Triển khai server và Web Admin (chủ dự án chạy lệnh ghi production; Claude chuẩn bị và kiểm kết quả)

**Files:** không (chỉ lệnh; các bước ở `docs/release/phat-hanh.md` mục 15.1)

- [ ] **Step 1: Kiểm trước (chỉ đọc), chép lại để so sau**

Run (chủ dự án): `cd $W/server && pnpm exec wrangler d1 time-travel info mt-license-production && pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE name = 'speaker_health'" && pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"`
Expected: in mốc time-travel (**chép lại**: đường lui khôi phục dữ liệu); truy vấn bảng trả rỗng; `foreign_key_check` rỗng.

- [ ] **Step 2: Áp migration (trước Worker)**

Run (chủ dự án): `cd $W/server && pnpm exec wrangler d1 migrations apply mt-license-production --remote`
Expected: liệt kê đúng `0007_speaker_health.sql`, hỏi xác nhận (gõ y); xong, truy vấn Step 1 trả một dòng `speaker_health`.

- [ ] **Step 3: Deploy hai Worker (cùng lúc)**

Run (chủ dự án): `cd $W/server && pnpm check && pnpm exec wrangler deploy && pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc`
Expected: hai lần deploy thành công, không lỗi `secrets.required`. Kiểm: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.aitranslator.vn/v1/diagnostics -H 'content-type: application/json' -d '{"v":1,"kind":"speaker_health"}'` ra `400` (route nhận kind mới, thân thiếu `day`); Web Admin › Báo cáo lỗi › tab **Bộ đọc tên** mở được và báo trống ("Chưa có báo cáo tình trạng nào").

- [ ] **Step 4: Kiểm cron (bài học sự cố cron 2026-10-07)**

Run (chủ dự án): `cd $W/server && pnpm exec wrangler tail` và đợi 5 phút.
Expected: có `"event":"reconcile"`, **không** có `reconcile_failed` hay `step failed` ở `speaker_health_alerts`, `prune_speaker_health`. Nếu cron không chạy (cron của `mt-license` từng ngừng sau deploy): `pnpm exec wrangler triggers deploy`.

- [ ] **Step 5: Đường lui**

Worker lỗi: `pnpm exec wrangler rollback` (bảng mới không ảnh hưởng Worker cũ). Dữ liệu lỡ ghi sai: xóa các dòng của máy thử bằng `DELETE FROM speaker_health WHERE device_id_hash = '<mã máy thử>'`.

---

### Task 18: Đăng công thức lần đầu và thử trên app dev (chủ dự án chạy; Claude cùng làm)

**Files:** không (kết quả ghi vào `$B/results/06-van-hanh.md`, mục "Công thức tải từ xa")

- [ ] **Step 1: Cổng kiểm với bản build sẵn**

Run: `cd $W && pnpm recipes:update --check`
Expected: in "Công thức đang phát hành: chưa có", dòng `version: (chưa có bản nào) → 1` và các mục `+ thêm teams/macos`; chạy hai bước cổng kiểm (`check_recipes_body`, toàn bộ test của `speaker-worker`) và thoát 0, không đụng git hay R2.

- [ ] **Step 2: Đăng lần đầu (chủ dự án gõ y)**

Run (chủ dự án, ở nhánh `main` sạch, `gh` đã đăng nhập tài khoản `dotienphong`, wrangler đã đăng nhập): `cd $W && pnpm recipes:update`
Expected: hỏi y/N; gõ y thì commit (`feat(speaker): công thức đọc tên số 1`), đẩy `main`, kích `sign-recipes.yml` với `first_release=true` (job `check` rồi job `sign`), đợi, tải artifact `speaker-recipes`, đăng R2 và in "đã đăng recipes.json (lần đầu)". Kiểm: `curl -s https://releases.aitranslator.vn/speaker/recipes.json | head -c 160` in JSON có `"format":"ai-translator-speaker-recipes"` và `"kid"` thuộc khối `production`. `scripts/speaker-recipes/released/body-1.json` có trong repo.

- [ ] **Step 3: App dev nhận công thức**

Run (chủ dự án): chạy app dev có `AI_TRANSLATOR_DEV_SPEAKER=true` trong `.env` (cách chạy app dev như 04b Task 19, 20), đợi hơn 20 giây, xem log app.
Expected: có `công thức đọc tên: dùng số 1` lúc mở, rồi `công thức đọc tên: không có bản mới` (đúng bản đang có, không lỗi).

- [ ] **Step 4: Thử số mới, quay lại, tắt từ xa (trên app dev; tính năng còn tắt với người dùng thật nên an toàn)**

Run: sửa `"version": 2` trong `scripts/speaker-recipes/recipes.json` (giữ nguyên nội dung), `pnpm recipes:update` (y); mở lại app dev (lần kiểm đầu sau 20 giây) → log `nhận số 2, áp dụng từ phiên dịch sau`; bắt đầu một phiên dịch: `Load` mang công thức số 2. Rồi `pnpm recipes:update --revert-to 1` → công thức số 3 mang nội dung số 1. Cuối cùng thử công tắc tắt từ xa: sửa `"apps": []` và `"version": 4`, đăng; phiên mới không đọc tên ("Người N"); `pnpm recipes:update --revert-to 3` đăng lại số 5 mang nội dung số 3, bộ đọc trở lại.
Expected: mỗi bước đúng như mô tả; `released/` có `body-1…5.json`; app không bao giờ nhận số nhỏ hơn số đang có (thử: tải tay bản số 1 đã ký về và để lên R2 qua `wrangler r2 object put` rồi mở app: log `từ chối bản tải về (… cũ hơn bản đang có …)`; **đăng lại bản đúng ngay sau đó**).

---

### Task 19: Kiểm tra tự động trên macOS: tài khoản, bộ chuyển, quyền, lịch (chủ dự án và Claude làm cùng; cần màn hình)

**Files:**
- Create: `tools/speaker-canary/adapters/{meet_chrome,teams}.mjs` (làm cùng chủ dự án; hợp đồng ở Step 3)
- Create ngoài repo: `$DATA/canary/canary.json`, hồ sơ trình duyệt, file giọng đọc

Đây là phần **chưa kiểm được** trên máy dựng kế hoạch (không được chạy Teams, Chrome, Zoom): cách tạo phòng và vào phòng bằng tự động hóa chưa biết chắc. Task này có sản phẩm cuối rõ ràng (hai bộ chuyển chạy được, kiểm tra ban đêm chạy) nhưng đường đi phải thử.

- [ ] **Step 1: Tài khoản và hồ sơ (chủ dự án)**

Tạo (spec 7.3): 2–3 tài khoản Gmail (một chủ phòng Meet, hai khách) và 1 tài khoản Microsoft cá nhân (chủ phòng Teams; khách Teams vào bằng trình duyệt, không cần tài khoản). Mỗi vai một hồ sơ Chrome riêng, **đăng nhập sẵn một lần bằng tay**; mật khẩu không nằm trong repo hay cấu hình. Đặt tên hiển thị dễ nhận (ví dụ "Canary Khách A"). Ghi cấu hình vào `$DATA/canary/canary.json` (mẫu: `tools/speaker-canary/templates/canary.example.json`): nhãn máy `mac-chu-du-an`, `canaryBin`, `logDir`, tên hai khách, `options` của từng bộ chuyển (đường dẫn hồ sơ).

- [ ] **Step 2: File giọng đọc và build `speaker-canary`**

Chọn hai file wav giọng đọc dài ≥ 45 giây (một cho mỗi khách; micro giả của trình duyệt phát file, không phát tiếng ra loa). Build: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release -p speaker-canary && mkdir -p $DATA/canary/bin && cp $W/target/release/speaker-canary $DATA/canary/bin/`.
Expected: file chạy được; `$DATA/canary/bin/speaker-canary --help` in cách dùng.

- [ ] **Step 3: Bộ chuyển (Claude viết cùng chủ dự án, thử từng bước)**

Hợp đồng của `tools/speaker-canary/adapters/<app>.mjs`: `export async function open({ options, guests, t0, schedule, log })` trả `{ stop() }`. (a) Mở hay vào cuộc họp thử để app chủ phòng hiện ô của hai khách; (b) cho khách `k` phát giọng đúng trong các lượt `[t0 + start_s, t0 + end_s]` của lịch (bật và tắt micro theo giờ, file giọng lặp liên tục); (c) không phát tiếng cuộc họp ra loa (khách tắt tiếng đầu ra); (d) `stop()` rời cuộc họp, đóng trình duyệt, dù lỗi giữa chừng; (e) không có tên, đường dẫn cá nhân hay bí mật trong file (mọi thứ riêng của máy lấy từ `options`). Thư viện điều khiển trình duyệt cài **ngoài repo** (`$DATA/canary/node`; bản ổn định mới nhất, kiểm tương thích theo CLAUDE.md §6.12; adapter nạp bằng đường dẫn trong `options`), không thêm gì vào `package.json` của repo.
Gợi ý thử (chưa kiểm): Meet: hồ sơ chủ phòng mở `https://meet.google.com/new` (vào phòng ngay với camera và micro đang bật: tắt trước), hai khách Playwright với `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` vào bằng liên kết phòng; Teams: app chủ phòng mở liên kết cuộc họp cá nhân dùng lại được (Calendar › Meet now › lấy liên kết, dạng `teams.live.com/meet/…`), hai khách vào bằng trình duyệt với tên "khách". Ghi **cách làm được** (và cách không làm được) vào `$B/results/06-van-hanh.md` mục "Bộ chuyển".

- [ ] **Step 4: Quyền Trợ năng và chạy tay một lượt mỗi app**

Cấp quyền Trợ năng (System Settings › Privacy & Security › Accessibility) cho Terminal; chạy `node tools/speaker-canary/canary.mjs --app meet_chrome --config $DATA/canary/canary.json` và với `teams`.
Expected: mã thoát `0`, dòng nhật ký `"state":"ok"` với `turns_ok` ≥ 90% (công thức build sẵn chỉ có **Teams** macOS: Meet chưa vào công thức nên `speaker-canary` báo "công thức không có mục cho app này" và thoát 2: đó là kết quả đúng cho tới khi Meet vào công thức, Task 22 hay kế hoạch sau). Báo cáo của lượt đã tới server: Web Admin › Báo cáo lỗi › Bộ đọc tên › Kiểm tra tự động có một dòng `teams`, `ok`.

- [ ] **Step 5: Lịch ban đêm bằng launchd**

Sinh plist bằng `launchdPlist` và `slots` (`tools/speaker-canary/lib.mjs`): mỗi app một lượt, cách nhau 10 phút, ví dụ từ 02:00. Cài: `launchctl bootstrap gui/$(id -u) <plist>`. Cấp quyền Trợ năng cho `node` và `$DATA/canary/bin/speaker-canary`. Máy phải đã đăng nhập, không khóa màn hình, không ngủ lúc chạy (`caffeinate` hay cài đặt Năng lượng).
Expected: đêm đầu có file nhật ký mới ở `logDir` với `"state":"ok"`; nếu mã thoát 2 và log "chưa có quyền" thì quyền Trợ năng chưa đủ cho launchd: ghi lại, thử cấp cho đúng chương trình mà macOS đòi (**chưa kiểm** là đủ).

---

### Task 20: Kiểm tra tự động trên Windows (chủ dự án có máy Windows; Claude chuẩn bị gói)

**Files:** không trong repo (gói và cấu hình ở `$DATA/canary-win/`)

- [ ] **Step 1: Build `.exe` trên Mac (không dùng `cargo-xwin`)**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo build --release -p speaker-canary --target x86_64-pc-windows-gnu`
Expected: `target/x86_64-pc-windows-gnu/release/speaker-canary.exe` (cách dựng `.exe` giống gói của kế hoạch 05: `x86_64-w64-mingw32-gcc`, script giả `scripts/fake-pkg-config`, `scripts/fake-llvm-rc`; thiếu công cụ thì xem `scripts/check-windows.sh` và 05b Task 9). Chép sang máy Windows cùng `tools/speaker-canary/` và một bản Node 24.

- [ ] **Step 2: Cấu hình và một lượt chạy tay (chủ dự án)**

Cấu hình `canary.json` với nhãn máy **khác** của Mac (ví dụ `win-chu-du-an`), `canaryBin` là đường dẫn `.exe`. Bộ chuyển Windows (Teams MSIX và Chrome) làm theo Task 19 Step 3. Bản build sẵn chưa có mục Windows (spec 05), nên kiểm tra tự động Windows chỉ chạy được khi công thức đã có mục Windows (05b Task 11 hay 13): trước đó `speaker-canary` thoát 2 với "công thức không có mục cho app này trên hệ điều hành này".
Expected (khi đã có công thức Windows): `node tools\speaker-canary\canary.mjs --app teams --config <cấu hình>` thoát 0; trong kết quả `meeting_version` là phiên bản gói Teams (kiểm `package_version`/`GetPackageFullName` thật) và với Chrome là phiên bản file (kiểm `GetFileVersionInfoW`). **Đây là lần đầu hai hàm đó chạy thật**: nếu `meeting_version` rỗng, báo lại để sửa.

- [ ] **Step 3: Task Scheduler**

Sinh XML bằng `taskXml` (`tools/speaker-canary/lib.mjs`), cài: `schtasks /Create /TN "AI Translator speaker-canary teams" /XML <file.xml>`; chỉ chạy khi người dùng đã đăng nhập; máy không ngủ lúc chạy.
Expected: đêm đầu có nhật ký mới; hàng `canary` của hệ điều hành `windows` hiện ở tab Bộ đọc tên.

---

### Task 21: Thử báo động cố ý (chủ dự án chạy; dữ liệu thử xóa ngay sau đó)

Chứng minh đường cảnh báo chạy thật. **Dùng nhãn máy riêng** (`canary-thu-nghiem`) để mọi dòng thử xóa được bằng một lệnh.

- [ ] **Step 1: Kiểm tra tự động hỏng (công thức hỏng)**

Tạo bản sao công thức với `class_token` của chỉ báo Teams đổi tên (ví dụ thêm hậu tố `-x`), đặt đường dẫn vào `apps.teams.recipe` của một cấu hình thử với `"machine":"canary-thu-nghiem"`. Chạy `node tools/speaker-canary/canary.mjs --app teams --config <cấu hình thử>`.
Expected: thoát `1`; nhật ký `"state":"no_speaking"` (ô còn thấy, chỉ báo không khớp); tab Bộ đọc tên hiện một dòng canary `no_speaking`.

- [ ] **Step 2: Giả lập "hai ngày liền" mà không phải chờ**

Sửa `"day"` trong `<kết quả>.report.json` (file mà `speaker-canary run --out <kết quả>.json` đã ghi) thành ngày hôm qua theo UTC (trong 8 ngày), rồi gửi: `Y=$(date -u -v-1d +%F) && sed -i '' "s/\"day\":\"[0-9-]*\"/\"day\":\"$Y\"/" <kết quả>.report.json && $DATA/canary/bin/speaker-canary send --report <kết quả>.report.json; echo "mã thoát $?"` (lệnh `date -v` là của macOS). Server nhận (202): mã thoát `0`.
Expected: trong 5–10 phút có email "[license production] Cảnh báo: speaker_canary_failed (1)" tới `OPERATOR_EMAIL` (nội dung chỉ có số lượng); không có email thứ hai trong 24 giờ.

- [ ] **Step 3: Giả lập "một phiên bản hỏng" (≥ 30%, từ 5 báo cáo)**

Gửi bằng `curl` năm báo cáo `speaker_health` (`canary:false`, `build:"release"`) từ năm `device_id_hash` thử khác nhau (SHA-256 của `thu-nghiem-1` đến `thu-nghiem-5`), hai `ok` và ba `no_names`, cùng `meeting.app:"teams"`, `meeting.version:"0.0.1-thu"`:

```bash
DAY=$(date -u +%F)
for i in 1 2 3 4 5; do
  H=$(printf "thu-nghiem-$i" | shasum -a 256 | cut -d' ' -f1)
  S=ok; [ $i -gt 2 ] && S=no_names
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.aitranslator.vn/v1/diagnostics -H 'content-type: application/json' \
    -d "{\"v\":1,\"kind\":\"speaker_health\",\"day\":\"$DAY\",\"canary\":false,\"build\":\"release\",\"app\":{\"version\":\"0.3.2\"},\"os\":{\"name\":\"macos\",\"version\":\"15.6.1\",\"arch\":\"aarch64\"},\"meeting\":{\"app\":\"teams\",\"version\":\"0.0.1-thu\"},\"recipe_version\":1,\"state\":\"$S\",\"minutes\":{\"ok\":5,\"total\":10},\"learned\":0,\"patterns\":[],\"device_id_hash\":\"$H\"}"
done
```

Expected: năm dòng `202`; trong 5–10 phút có email `speaker_health_degraded (1)`; tab Bộ đọc tên hiện dòng `teams 0.0.1-thu` huy hiệu đỏ.

- [ ] **Step 4: Dọn dữ liệu thử**

Run (chủ dự án): `cd $W/server && H=$(printf 'canary|canary-thu-nghiem' | shasum -a 256 | cut -d' ' -f1) && pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM speaker_health WHERE meeting_version = '0.0.1-thu' OR device_id_hash = '$H'"` rồi `pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT COUNT(*) AS n FROM speaker_health"` và so với số dòng ghi lại trước khi thử.
Expected: không còn dòng thử nào; hàng `speaker_seen:…` ở `ops_alerts` tự dọn sau 7 ngày.

---

### Task 22: Mẫu nhãn theo 5 ngôn ngữ giao diện cho công thức (chủ dự án thử, Claude sửa công thức)

Spec 7.1: "mẫu nhãn theo 5 ngôn ngữ giao diện"; bản build sẵn chỉ có tiêu đề cửa sổ Teams tiếng Anh và tiếng Việt, nhãn ô chỉ tiếng Anh (rà soát A-NHỎ 7 của kế hoạch 04). Quy trình là chính `pnpm recipes:update`, nên không cần phát hành app.

- [ ] **Step 1: Ghi cây Teams ở từng ngôn ngữ (chủ dự án)**

Đổi ngôn ngữ giao diện của Teams sang tiếng Việt, Nhật, Trung, Hàn (lần lượt), vào cuộc họp thử có hai khách nói; mỗi ngôn ngữ chạy `ax-record fixture teams $DATA/…/teams-<ngôn ngữ>.jsonl --seconds 30` (macOS) hay `uia-record fixture …` (Windows). Ghi lại **tiêu đề cửa sổ họp** và nhãn ô ("Context menu is available", "muted", "(Guest)", "Myself video" thành gì).

- [ ] **Step 2: Ẩn danh và duyệt**

`scripts/speaker-recipes/make_fixture.py` (dừng khi còn mẫu cấm); duyệt bản in; chép fixture và `.truth.json` vào `scripts/speaker-recipes/fixtures/` (cách làm: `scripts/speaker-recipes/fixtures/README.md`). Tên trong fixture là tên giả.

- [ ] **Step 3: Sửa công thức (Claude)**

Thêm vào `scripts/speaker-recipes/recipes.json` các mẫu `window_title` và nhánh trong `tile.label` cho từng ngôn ngữ (mỗi mẫu ≤ 256 ký tự, tối đa 16 mẫu mỗi danh sách; `speaker_recipe::parse` kiểm), tăng `version`, thêm test độ khớp theo fixture mới (như test của Teams macOS ở 04: mỗi khách khớp ≥ 0,85).
Expected: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result|FAILED"` đạt, bao gồm các fixture mới.

- [ ] **Step 4: Đăng**

`pnpm recipes:update --check` rồi `pnpm recipes:update` (mục 15.2 của runbook). Kiểm trên máy chạy Teams ở ngôn ngữ đó (thử tay): tên hiện đúng. Meet, Zoom: làm tương tự khi hai app đó vào công thức (kế hoạch 05b Task 13, hay sau này).

---

## Phủ spec

| Mục spec | Yêu cầu | Task |
|---|---|---|
| §7.1 | nguồn `scripts/speaker-recipes/recipes.json`, bản build sẵn nhúng vào app, bản mới ở `releases.aitranslator.vn/speaker/recipes.json` | T3 (`RECIPES_URL`, `body`), T4 (`R2_KEY`, đăng R2) |
| §7.1 | phong bì ký cùng cấu trúc `models.json`, cùng khóa, `format` và tiền tố ký riêng, chữ ký manifest model không dùng được cho công thức và ngược lại | T1 (Rust và Node, vector hai chiều) |
| §7.1 | app tải lúc mở và mỗi 6 giờ, kiểm chữ ký, `schema`, `min_app_version`, không nhận bản cũ hơn (chống quay lui), lưu trên máy, lỗi gì cũng giữ bản đang có | T2 (`judge`, `RecipeStore`), T3 (`RecipeService`, luồng nền) |
| §7.1 | nội dung chỉ mô tả, không mã; mẫu chữ `regex` ≤ 256 ký tự, file ≤ 256 KB; app ngoài danh sách viết cứng thì bỏ mục | đã có ở `speaker_recipe::parse` (04); T1 (`MAX_ENVELOPE_BYTES`, body quá 256 KB), T2 (`judge` dùng `parse`) |
| §7.1 | `pnpm recipes:update` giống `pnpm models:update`: kiểm cấu trúc, chạy bộ test cây giao diện ghi sẵn, hỏi y/N, CI ký và đăng R2 | T4 |
| §7.2 | mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản), `kind` mới `speaker_health` qua `POST /v1/diagnostics`, chỉ khi "Gửi báo cáo lỗi" bật | T7 (`Tracker::due`), T8 (`flush`, `purge`), T10 (endpoint) |
| §7.2 | nội dung: phiên bản app, hệ điều hành, app họp và phiên bản, phiên bản công thức, trạng thái, số phút đọc được tên và tổng, mẫu chỉ báo tự hiệu chỉnh, cờ `canary`; không tên người, không chữ | T7 (`report_json`, `sanitize_patterns`), T5 (mẫu chỉ báo, `app_version` macOS đã có), T6 (`app_version` Windows) |
| §7.2 | đi qua bộ che và kiểm lần cuối của báo cáo lỗi | T8 (`scrub::find_sensitive` trên cả chuỗi JSON), T10 (`findSensitive` ở server, 422) |
| §7.2 | server: bảng D1 `speaker_health`, giới hạn tần suất như báo cáo lỗi | T10 (migration 0007, `speaker_device`, `speaker_global`) |
| §7.2 | Web Admin: bảng theo app họp, phiên bản và trạng thái | T11 (route), T12 (tab) |
| §7.2 | cron email khi một phiên bản app họp có ≥ 30% báo cáo hỏng (từ 5 báo cáo), hoặc kiểm tra tự động hỏng 2 ngày liền | T10 (`findDegraded`, `findCanaryFailing`, `evaluateSpeakerHealth`), T11 (nối vào `reconcile`); thêm: im lặng 3 ngày (QĐ 11) |
| §7.3 | kịch bản như nghiên cứu (tạo phòng, hai khách nói lần lượt rồi nói chồng), kiểm tên ra đúng; ban đêm trên Mac (launchd) và Windows (Task Scheduler), ~5 phút mỗi app | T13 (chấm, bộ đọc), T14 (lịch nói, bộ điều khiển, plist, XML), T19, T20 (bộ chuyển và lịch thật, chủ dự án) |
| §7.3 | tài khoản: 2–3 Gmail, 1 Microsoft cá nhân; chủ dự án tạo; mật khẩu không nằm trong repo | T19 Step 1; `tools/speaker-canary/README.md` |
| §7.3 | khách dùng micro giả là file giọng đọc, không phát tiếng ra loa; kết quả gửi như `speaker_health` với `canary = true` | T13 (`report`), T19 Step 3 (hợp đồng bộ chuyển) |
| §7.3 | "chạy bản app dev" | **Khác có chủ ý** (QĐ 13): chạy bộ đọc thật, không chạy cả app; chờ chủ dự án duyệt (quyết 1) |
| §7.4 | hỏng thì vẫn chạy: bộ đọc không đọc được thì "Người N", người dùng chọn tên | đã có (03, 04); T3 (lỗi tải giữ bản đang có), T2 (công thức rỗng là công tắc tắt), T18 Step 4 (thử) |
| §6.5 | mẫu chỉ báo tự hiệu chỉnh đi kèm báo cáo tình trạng (không tên người) | T5 |
| §6.1, §6.2 | (05 hứa) `app_version` trên Windows | T6 |
| §10 | không bí mật mới; công thức độc (khóa ký bị lộ): chỉ mô tả, không mã, worker không có mạng | T2, T4 (không secret mới, dùng `MANIFEST_SIGNING_KEY` có sẵn); runbook 15.3 |
| §10 | lộ tên người tham dự: log chỉ có số đếm; bộ che báo cáo lỗi thêm luật kiểm tên; báo cáo tình trạng không có tên | T9 (`redact_names`, `known_names`), T7, T10 (danh sách cho phép, test "không có tên") |
| §10 | phụ thuộc mới qua `cargo deny`, `cargo audit`; bản mới nhất ổn định theo §6.12 | Tech Stack (đầu file 06), T16 Step 2 |
| §12 | test công thức: chữ ký, tiền tố riêng, chống quay lui, giới hạn mẫu và kích thước, app ngoài danh sách bị bỏ | T1, T2 (`envelope`, `recipes`); phần `parse` đã có ở 04 |
| §12 | A-spk3 (tên thật, kịch bản tự động) phần kiểm tra tự động | T13, T19, T20 (lõi chấm: ≥ 90% đúng, ≤ 5% sai); nghiệm thu A-spk3 bằng họp thật ở kế hoạch 07 |
| §12 | A-spk7 bảo mật: báo cáo không có tên, `cargo deny`, `cargo audit`, không mã mạng ở worker | T7, T10 (không tên); T5, T6, T13 Mốc kiểm (không mã mạng); T16 |
| §13 mục 6 | công thức ký số (`pnpm recipes:update`, CI, R2), báo cáo `speaker_health` (app, server, D1, Web Admin, cron), kiểm tra tự động hằng ngày (macOS, Windows) | T1–T22 |
| §14 | "Teams, Meet đổi giao diện": năm lớp ở mục 7 | T3–T4 (sửa không cần phát hành), T7–T12 (biết ngay), T13–T14, T19–T21 (kiểm hằng ngày) |
| 03 hứa | bộ che báo cáo lỗi thêm luật kiểm tên người (spec §10) | T9 |
| 04 hứa | mẫu nhãn theo 5 ngôn ngữ giao diện | T22 |
| 05 hứa | `app_version` trên Windows; hợp nhất `Stats`; công thức Windows tải từ xa có ký số; `pnpm recipes:update` chạy cả fixture Windows | T6; T6; T2–T4 (công thức là dữ liệu chung hai hệ điều hành, worker Windows tự đọc khi có mục Windows); T4 (`cargo test -p speaker-worker --lib` gồm fixture Windows) |
| 05 hứa | `uia-record` thay `ax-record` trong canary trên Windows | T13 (`read` dùng `uia::LiveReader` trực tiếp, không qua công cụ ghi), T20 |

## Để kế hoạch sau

- **Kế hoạch 07 (phát hành):** chính sách quyền riêng tư nói đúng hai việc mới của kế hoạch này (app tải công thức đọc tên từ `releases.aitranslator.vn`: một lệnh GET không kèm dữ liệu nào của người dùng; báo cáo tình trạng bộ đọc: không tên người, chỉ số phút, trạng thái, phiên bản, mô tả chỉ báo, `device_id_hash`, chỉ khi bật "Gửi báo cáo lỗi", xóa khi tắt công tắc; giữ 60 ngày) kèm câu hỏi luật sư (spec §10); website 5 ngôn ngữ; sửa spec chính §10.1 (báo cáo tình trạng); nghiệm thu A-spk1–7 (A-spk3 bằng họp thật, A-spk4 và A-spk5 trên i5, A-spk6, A-spk7); bật tính năng (gỡ công tắc nội bộ `speaker::enabled`), từ lúc đó người dùng thật mới tải công thức và gửi báo cáo.
- **Hợp nhất vòng lặp `tick`** của `reader::macos` và `reader::uia` (dùng `windowset::read_windows`, `reconcile`, `health`): sau khi 04b Task 19–21 đạt (macOS thử với app thật). Ở kế hoạch này chỉ hợp nhất `Stats`.
- **Kiểm tra tự động ở mức cả app** (chạy app dev, kiểm tên ra phụ đề, cần quyền thu âm máy ban đêm): chỉ nếu họp thật cho thấy bộ đọc đúng mà ghép tên sai.
- **Meet và Zoom vào công thức và vào kiểm tra tự động:** khi đạt tiêu chí của 04 (QĐ 16, 32) và chủ dự án đồng ý; cho tới đó kiểm tra tự động của hai app này thoát 2 ("không có mục").
- **Ngưỡng cảnh báo theo số liệu thật** (30%, 5 báo cáo, 3 ngày) sau khi có người dùng thật; hiện là số của spec.
- **Nâng `sha2` 0.11.1 và `serde_json` 1.0.154** cho cả workspace (đợt cập nhật phụ thuộc chung).
- **Lưu `state.json` cho `recipes:update`** như `models:update` nếu thấy lượt đăng hay dừng giữa chừng (hiện chạy lại là đủ).

## Rủi ro và điều chưa biết

| Rủi ro | Cách xử lý trong kế hoạch |
|---|---|
| **Bộ chuyển (tạo phòng, vào phòng, cho khách nói đúng lịch) chưa kiểm được**: tự động hóa Teams, Meet, Zoom bằng trình duyệt tự động và app chủ phòng chưa thử ở máy này; Google và Microsoft có thể đòi xác minh với trình duyệt tự động, hồ sơ mới | Task 19, 20 có sản phẩm cuối và quy trình thử từng bước, làm cùng chủ dự án; hồ sơ trình duyệt đăng nhập sẵn bằng tay (không đăng nhập tự động); bộ chuyển hỏng cho mã thoát 5 và **không** gửi báo cáo sai, và sau 3 ngày im lặng server tự cảnh báo (QĐ 11); phần lõi (chấm, gửi, điều khiển, dọn) đã test đầy đủ trên Mac |
| **Quyền Trợ năng khi chạy từ launchd** (quyền thuộc về chương trình chạy: `node` và `speaker-canary`; cdhash đổi mỗi lần build lại thì mất quyền như app ký ad-hoc) | Chưa kiểm là cấp như vậy đủ (README, Task 19 Step 5); `speaker-canary` thoát 2 với thông báo rõ khi thiếu quyền; sau mỗi lần build lại `speaker-canary` phải cấp lại |
| **Hai hàm Windows chưa chạy thật:** `GetPackageFullName` (Teams MSIX) và `GetFileVersionInfoW` (Chrome, Edge, Zoom) chỉ qua clippy chéo; phần phân tích chuỗi có test | `meeting_version` trống không làm hỏng gì (báo cáo ghi "?"); Task 20 Step 2 là lần chạy thật đầu tiên; sai thì sửa nhỏ (không phát hành tính năng) |
| **Công thức tải từ xa sai làm bộ đọc đọc sai tên** (ưu tiên 2: thà "Người N" còn hơn sai tên) | Cổng kiểm của `recipes:update` chạy toàn bộ test cây ghi sẵn; chỉ là dữ liệu (không mã); tắt từ xa bằng công thức rỗng; quay lại bằng `--revert-to` (số mới, nội dung cũ); app chỉ áp từ phiên sau |
| **Khóa ký bị lộ** (cùng khóa với manifest model) | Công thức chỉ mô tả, không mã; app trong danh sách viết cứng; worker không có mạng (không gửi được gì ra ngoài); tiền tố ký riêng nên chữ ký manifest model không dùng được cho công thức; xử lý như khóa manifest model (đổi khóa, phát hành app) |
| **Quay lui bằng phát lại bản cũ có chữ ký đúng** | `version` không giảm (T2, test); người vận hành quay lại bằng số mới |
| **Báo cáo tình trạng lộ tên người** | Danh sách cho phép ở app (`report_json`, `sanitize_patterns`) và ở server (khóa lạ là từ chối); `AXIdentifier` không đi vào mô tả; chuỗi qua bộ phát hiện nhạy cảm; chỉ khi bật gửi báo cáo lỗi; test "báo cáo không có tên" ở cả hai đầu. Rủi ro còn lại: một **lớp CSS** tình cờ mang chữ có nghĩa (ví dụ tên): lớp chỉ nhận `[A-Za-z0-9_-]`, ≤ 32 byte, không dãy ≥ 5 chữ số; nghi ngờ thì chủ dự án xóa dòng ở D1 |
| **Máy ngủ giữa phiên làm số phút phình** (khoảng giữa hai `ReaderState`) | Trần 3 giờ mỗi khoảng (`MAX_INTERVAL_MS`); số phút chỉ để so tỉ lệ, không để tính tiền |
| **Số liệu thưa lúc đầu** (ít người dùng) làm ngưỡng "≥ 5 báo cáo trong 3 ngày" khó đạt | Kiểm tra tự động hằng ngày là đường báo chính khi người dùng còn ít; ngưỡng chỉnh theo số liệu thật (để kế hoạch sau) |
| **Báo cáo bị `no_permission` thống trị** (người dùng chưa cấp quyền Trợ năng) | Không tính vào "hỏng" (`Health::broken`); tab Bộ đọc tên có cột "Chưa có quyền" riêng |
| **`diag_ip` dùng chung** (30 mỗi giờ mỗi IP) cho cả báo cáo tình trạng: nhiều người sau một IP (CGNAT) | Báo cáo tình trạng ít (mỗi ngày mỗi cặp); gặp 429 thì app dừng lượt và thử lại ở lần sau (lỗi tạm); nếu thực tế chật thì tách bộ đếm IP riêng (việc nhỏ) |
| **Cron `*/5` từng ngừng sau deploy (2026-10-07)** | Task 17 Step 4 kiểm cron; `wrangler triggers deploy` là cách sửa đã biết |
| **Kiểm tra tự động cần máy luôn bật, đã đăng nhập, không khóa màn hình** (đọc cây giao diện cần phiên người dùng) | README nêu; im lặng 3 ngày sẽ báo; chủ dự án quyết máy nào chạy (quyết 2) |
| **Windows chưa có công thức**: bản build sẵn chỉ có Teams macOS, nên kiểm tra tự động Windows chỉ chạy khi có mục Windows (05b Task 11, 13) | Task 20 ghi rõ; `speaker-canary` thoát 2 "không có mục" thay vì báo hỏng giả |
| **`GET` công thức là một lệnh gọi mạng mới của app** (ngoài manifest model, cập nhật app, bản quyền, báo cáo lỗi) cùng host `releases.aitranslator.vn` đã có trong danh sách kết nối | Chỉ khi tính năng bật cho người dùng; không kèm mã máy; kiểm lại bằng A7 (bộ đếm kết nối) ở kế hoạch 07 trước khi bật cho người dùng |
| Số test "mong đợi" là số đo khi viết kế hoạch trên bản sao của cây hiện tại | Lệch thì ghi số thật; đổi hành vi thì dừng, báo |

## Điều cần chủ dự án quyết

Mặc định ghi ở mỗi mục là cách kế hoạch này làm nếu chủ dự án không nói khác.

1. **Kiểm tra tự động ở mức bộ đọc, không chạy cả app** (QĐ 13; khác chữ "chạy bản app dev" của spec 7.3). Mặc định: mức bộ đọc (không cần quyền thu âm ban đêm, không cần đo lại nhận giọng; đo đúng thứ hay vỡ). Cách khác: chạy cả app dev và kiểm tên trên phụ đề (tốn quyền thu âm, loa và độ phức tạp; để sau, nếu họp thật cho thấy cần).
2. **Máy chạy kiểm tra ban đêm:** máy Mac của chủ dự án (và máy Windows i5 cho Windows) phải bật, đăng nhập, không khóa màn hình lúc 02:00–03:00. Mặc định: chạy trên các máy đó. Cách khác: một máy riêng hay máy ảo chỉ để kiểm tra (không có trong kế hoạch).
3. **Zoom trong kiểm tra tự động:** mặc định tắt cho tới khi Zoom có trong công thức (04 QĐ 16, 32); cần tài khoản Zoom của chủ dự án nếu bật.
4. **Ngưỡng cảnh báo:** ≥ 30% hỏng từ 5 báo cáo trong 3 ngày; kiểm tra tự động hỏng 2 ngày liền hay im 3 ngày; mỗi chủ thể một lần mỗi ngày. Mặc định: số của spec (và 3 ngày im lặng do kế hoạch thêm). Chỉnh sau khi có số liệu thật.
5. **Nhịp tải công thức:** lúc mở (sau 20 giây) và mỗi 6 giờ (spec). Mặc định: giữ.
6. **Thời gian giữ báo cáo tình trạng:** 60 ngày (báo cáo lỗi giữ 30 ngày). Mặc định: 60 để so được qua các đợt phát hành app họp. Cách khác: 30 ngày cho đồng bộ.
7. **Tắt "Gửi báo cáo lỗi" xóa luôn sổ tình trạng trên máy.** Mặc định: có. Cách khác: giữ sổ, chỉ ngừng gửi.
8. **Chưa nâng `sha2` 0.11.1 và `serde_json` 1.0.154** (CLAUDE.md §6.12 đòi bản mới nhất khi cài; hai thư viện này đã có sẵn, đổi cho cả workspace). Mặc định: không nâng trong kế hoạch này, nâng ở đợt cập nhật phụ thuộc chung. Cách khác: nâng ngay (đổi `Cargo.lock` của nhiều crate, build và test lại toàn bộ).
9. **Công thức rỗng là công tắc khẩn cấp tắt bộ đọc từ xa.** Mặc định: có (app nhận công thức không còn mục nào). Cách khác: yêu cầu công thức luôn có ít nhất một mục (mất công tắc khẩn cấp; tắt bằng cách phát hành app).
10. **Cho phép commit** phần 06 khi xong. Mặc định: chưa (đang để ở working tree như dặn). Phần B cần phần A đã gộp vào `main`.
11. **Chính sách quyền riêng tư (kế hoạch 07)** phải nói về tải công thức và báo cáo tình trạng, và chủ dự án hỏi luật sư (spec §10). Mặc định: làm ở 07, không làm ở đây.
12. **Lịch của các bước cần chủ dự án:** Task 17 khoảng 30 phút; Task 18 khoảng 1 giờ; Task 19 nhiều giờ (tài khoản, thử bộ chuyển từng app); Task 20 khoảng 2 giờ khi đã có công thức Windows; Task 21 khoảng 30 phút (chờ email); Task 22 khoảng 2 giờ mỗi ngôn ngữ cho Teams. Mặc định: 17, 18 trước; 19 song song; 22 sau khi 04b Task 19–21 xong.
