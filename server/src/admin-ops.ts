// Trang Hệ thống của Web Admin (spec 2026-10-08-web-admin-he-thong-design.md). Chỉ đọc.
import type { Hono } from "hono";
import { type AdminAppEnv, type AdminDeps, crossSite } from "./admin-auth";
import { audit } from "./audit";
import { fail, isRecord } from "./http";

/** Số dòng cảnh báo tối đa trong một phản hồi (`total` và `pending` vẫn tính trên toàn bảng). */
const ALERTS_LIMIT = 200;

export interface AlertItem {
  kind: string;
  window_start: number;
  count: number;
  notified_count: number;
  notified_at: number | null;
}

// ---- Bản phát hành và model (đọc từ bucket R2 công khai qua URL) ----

/** Hạn mỗi lần gọi bucket (ms) và dung lượng phản hồi tối đa (byte). */
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_BODY_BYTES = 1024 * 1024;
const NOTES_MAX_CHARS = 1000;
/** Chuỗi ngắn và danh sách lấy từ bucket bị cắt ở đây: bucket là nguồn ngoài, không tin về độ dài. */
const SHORT_MAX = 200;
const LIST_MAX = 200;

/** `fetchPublic` mặc định: hạn 5 giây (cả lúc đọc thân), không theo chuyển hướng (302 trả nguyên cho nơi gọi xử lý). */
export function defaultFetchPublic(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "manual" });
}

export type Source<T> = ({ status: "ok" } & T) | { status: "missing" } | { status: "error"; reason: string };

export interface ChannelInfo {
  version: string;
  pub_date: string | null;
  notes: string;
  platforms: string[];
}

export interface ModelFile {
  id: string;
  kind: string;
  version: string;
  bytes: number;
  tier: string;
  min_app_version: string;
}

export interface ModelsInfo {
  sequence: number;
  published_at: string;
  kid: string;
  packs: string[];
  files: ModelFile[];
}

const chars = (s: string, max: number): string => {
  const all = Array.from(s);
  return all.length > max ? all.slice(0, max).join("") : s;
};
const short = (s: string): string => chars(s, SHORT_MAX);

/** Đọc thân tối đa MAX_BODY_BYTES; vượt thì null (và hủy luồng, không đọc tiếp). */
async function readLimited(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Một nguồn: tự bắt mọi lỗi; `reason` chỉ là mã cố định, không bao giờ chép nội dung do bucket trả về. */
async function loadSource<T>(deps: AdminDeps, url: string, parse: (json: unknown) => T | null): Promise<Source<T>> {
  let text: string | null;
  try {
    const res = await deps.fetchPublic(url);
    if (res.status === 404 || res.status === 403) {
      await res.body?.cancel();
      return { status: "missing" };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { status: "error", reason: `http_${res.status}` };
    }
    text = await readLimited(res);
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    return { status: "error", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
  if (text === null) return { status: "error", reason: "too_large" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "error", reason: "invalid_json" };
  }
  const info = parse(json);
  return info === null ? { status: "error", reason: "invalid_shape" } : { status: "ok", ...info };
}

/** latest.json của kênh: chỉ chép version, pub_date, notes (cắt 1000 ký tự) và tên các khóa của platforms. */
function parseChannel(json: unknown): ChannelInfo | null {
  if (!isRecord(json)) return null;
  const { version, pub_date, notes, platforms } = json;
  if (typeof version !== "string") return null;
  if (pub_date !== undefined && pub_date !== null && typeof pub_date !== "string") return null;
  if (notes !== undefined && typeof notes !== "string") return null;
  if (!isRecord(platforms)) return null;
  return {
    version: short(version),
    pub_date: typeof pub_date === "string" ? short(pub_date) : null,
    notes: chars(notes ?? "", NOTES_MAX_CHARS),
    platforms: Object.keys(platforms).slice(0, LIST_MAX).map(short),
  };
}

/** base64url (có hay không có đệm) sang chuỗi UTF-8; sai thì null. */
function decodeBase64Url(s: string): string | null {
  const t = s.replace(/=+$/, "");
  if (!/^[A-Za-z0-9_-]*$/.test(t) || t.length % 4 === 1) return null;
  try {
    const bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  } catch {
    return null;
  }
}

function parseModelFile(f: unknown): ModelFile | null {
  if (!isRecord(f)) return null;
  const { id, kind, version, bytes, tier, min_app_version } = f;
  if (typeof id !== "string" || typeof kind !== "string" || typeof version !== "string" || typeof min_app_version !== "string") return null;
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return null;
  let tiers: string;
  if (typeof tier === "string") tiers = tier;
  else if (Array.isArray(tier) && tier.every((t) => typeof t === "string")) tiers = tier.join(",");
  else return null;
  return { id: short(id), kind: short(kind), version: short(version), bytes, tier: short(tiers), min_app_version: short(min_app_version) };
}

/**
 * models.json: phong bì { format, version: 1, kid, body }; body là base64url của JSON { sequence, published_at, files, packs }.
 * Chỉ chép danh sách trắng (không url, sha256, license_id, note, tên gói). Chữ ký không được kiểm ở đây.
 */
function parseModels(json: unknown): ModelsInfo | null {
  if (!isRecord(json) || json.format !== "ai-translator-models" || json.version !== 1) return null;
  if (typeof json.kid !== "string" || typeof json.body !== "string") return null;
  const decoded = decodeBase64Url(json.body);
  if (decoded === null) return null;
  let inner: unknown;
  try {
    inner = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!isRecord(inner)) return null;
  const { sequence, published_at, files, packs } = inner;
  if (typeof sequence !== "number" || !Number.isFinite(sequence) || typeof published_at !== "string") return null;
  if (!Array.isArray(files) || !Array.isArray(packs)) return null;
  const outFiles: ModelFile[] = [];
  for (const f of files.slice(0, LIST_MAX)) {
    const parsed = parseModelFile(f);
    if (parsed === null) return null;
    outFiles.push(parsed);
  }
  const outPacks: string[] = [];
  for (const p of packs.slice(0, LIST_MAX)) {
    if (!isRecord(p) || typeof p.id !== "string") return null;
    outPacks.push(short(p.id));
  }
  return { sequence, published_at: short(published_at), kid: short(json.kid), packs: outPacks, files: outFiles };
}

/** Gốc URL công khai của bucket: chỉ https, tên miền, không có `/` cuối (test cấu hình khóa định dạng này). */
const BASE_URL_PATTERN = /^https:\/\/[a-z0-9.-]+$/;

export function registerAdminOps(app: Hono<AdminAppEnv>): void {
  app.get("/admin/alerts", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    // Hai truy vấn trong MỘT batch: danh sách và hai con số nhất quán với nhau.
    const [list, sums] = await db.batch([
      db
        .prepare(
          `SELECT kind, window_start, count, notified_count, notified_at FROM ops_alerts ORDER BY window_start DESC, kind LIMIT ${ALERTS_LIMIT}`,
        ),
      db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN count > notified_count THEN 1 ELSE 0 END), 0) AS pending FROM ops_alerts"),
    ]);
    const s = (sums?.results?.[0] ?? {}) as { total?: number; pending?: number };
    const body = { items: (list?.results ?? []) as unknown as AlertItem[], total: s.total ?? 0, pending: s.pending ?? 0 };
    await audit(db, { at: now, actor: c.get("actor"), action: "alerts_viewed" });
    return c.json(body);
  });
  app.get("/admin/releases", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const base = c.env.RELEASES_BASE_URL;
    if (!base || !BASE_URL_PATTERN.test(base)) return fail(c, 503, "releases_not_configured");
    const deps = c.get("deps");
    // Ba nguồn chạy song song, mỗi nguồn tự bắt lỗi: một nguồn hỏng không làm hỏng nguồn khác. URL cố định, không nhận gì từ request.
    const [stable, beta, models] = await Promise.all([
      loadSource(deps, `${base}/stable/latest.json`, parseChannel),
      loadSource(deps, `${base}/beta/latest.json`, parseChannel),
      loadSource(deps, `${base}/models/models.json`, parseModels),
    ]);
    await audit(c.env.DB, { at: deps.now(), actor: c.get("actor"), action: "releases_viewed" });
    return c.json({ base_url: base, channels: { stable, beta }, models });
  });
}
