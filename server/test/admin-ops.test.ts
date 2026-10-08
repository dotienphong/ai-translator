import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultFetchPublic } from "../src/admin-ops";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb, wrapDb } from "./db";

beforeEach(resetDb);

interface AlertItem {
  kind: string;
  window_start: number;
  count: number;
  notified_count: number;
  notified_at: number | null;
}
interface AlertsBody {
  items: AlertItem[];
  total: number;
  pending: number;
}

const alert = (kind: string, windowStart: number, count: number, notifiedCount = 0, notifiedAt: number | null = null) =>
  env.DB.prepare("INSERT INTO ops_alerts (kind, window_start, count, notified_count, notified_at) VALUES (?, ?, ?, ?, ?)").bind(
    kind,
    windowStart,
    count,
    notifiedCount,
    notifiedAt,
  );

const auditCount = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())?.n;

describe("GET /admin/alerts", () => {
  it("bảng rỗng: items [], total 0, pending 0", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/alerts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, pending: 0 });
  });

  it("mới nhất trước (window_start giảm dần), cùng giờ thì theo kind tăng dần; đủ năm trường mỗi dòng", async () => {
    await env.DB.batch([
      alert("webhook_failed", 1000, 2, 2, 1100),
      alert("email_failed", 3000, 1),
      alert("webhook_failed", 3000, 5, 1),
      alert("cron_stalled", 2000, 3, 0),
    ]);
    const { adminCall } = makeAdmin();
    const body = (await adminCall("/admin/alerts")).body as unknown as AlertsBody;
    expect(body.items.map((i) => [i.kind, i.window_start])).toEqual([
      ["email_failed", 3000],
      ["webhook_failed", 3000],
      ["cron_stalled", 2000],
      ["webhook_failed", 1000],
    ]);
    expect(body.items[1]).toEqual({ kind: "webhook_failed", window_start: 3000, count: 5, notified_count: 1, notified_at: null });
    expect(body.items[3]).toEqual({ kind: "webhook_failed", window_start: 1000, count: 2, notified_count: 2, notified_at: 1100 });
  });

  it("notified_at null được giữ nguyên là null (không đổi thành 0 hay bỏ trường)", async () => {
    await alert("a", 10, 1).run();
    const { adminCall } = makeAdmin();
    const item = ((await adminCall("/admin/alerts")).body as unknown as AlertsBody).items[0];
    expect(item).toHaveProperty("notified_at", null);
  });

  it("hơn 200 dòng: items cắt còn 200 dòng mới nhất, total vẫn là tổng thật, pending đếm cả phần bị cắt", async () => {
    const stmts: D1PreparedStatement[] = [];
    for (let i = 1; i <= 205; i++) stmts.push(alert("k", i, 1)); // 205 dòng, đều chưa báo
    await env.DB.batch(stmts);
    const { adminCall } = makeAdmin();
    const body = (await adminCall("/admin/alerts")).body as unknown as AlertsBody;
    expect(body.items).toHaveLength(200);
    expect(body.items[0]?.window_start).toBe(205);
    expect(body.items[199]?.window_start).toBe(6);
    expect(body.total).toBe(205);
    expect(body.pending).toBe(205);
  });

  it("pending: chỉ đếm count > notified_count; bằng nhau không tính; không phụ thuộc bị cắt ở 200", async () => {
    await env.DB.batch([
      alert("a", 1, 3, 0), // chưa báo
      alert("a", 2, 3, 2), // báo thiếu
      alert("a", 3, 3, 3), // đã báo hết
      alert("a", 4, 1, 1), // đã báo hết
      alert("b", 4, 4, 0),
    ]);
    const { adminCall } = makeAdmin();
    const body = (await adminCall("/admin/alerts")).body as unknown as AlertsBody;
    expect(body.total).toBe(5);
    expect(body.pending).toBe(3);
  });

  it("ghi đúng một dòng nhật ký alerts_viewed, không detail, không email", async () => {
    await alert("a", 1, 1).run();
    const { adminCall } = makeAdmin();
    expect((await adminCall("/admin/alerts")).status).toBe(200);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "alerts_viewed", order_code: null, detail: null });
    expect(await auditCount()).toBe(1);
  });

  it("403 khi request từ trang khác hay không qua Access, và không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/alerts", { headers: { "sec-fetch-site": "cross-site" } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect((await adminCall("/admin/alerts", { operator: null })).status).toBe(403);
    expect(await auditCount()).toBe(0);
  });

  it("D1 lỗi: 500 và KHÔNG ghi alerts_viewed (chỉ ghi nhật ký sau khi tính xong)", async () => {
    const { db } = wrapDb(env.DB, (q) => q.includes("FROM ops_alerts"));
    const { adminFetch } = makeAdmin({ DB: db });
    const res = await adminFetch("/admin/alerts");
    expect(res.status).toBe(500);
    expect(await auditCount()).toBe(0);
  });

  it("hai truy vấn chạy trong MỘT db.batch (số liệu nhất quán)", async () => {
    let batches = 0;
    const real = env.DB;
    const db = new Proxy(real, {
      get(target, prop) {
        if (prop === "batch") {
          return (stmts: D1PreparedStatement[]) => {
            batches++;
            return target.batch(stmts);
          };
        }
        const v: unknown = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const { adminFetch } = makeAdmin({ DB: db });
    expect((await adminFetch("/admin/alerts")).status).toBe(200);
    expect(batches).toBe(1);
  });

  it("phản hồi không được lưu đệm: Cache-Control no-store", async () => {
    const { adminFetch } = makeAdmin();
    expect((await adminFetch("/admin/alerts")).headers.get("cache-control")).toBe("no-store");
  });

  it("alerts_viewed ẩn khỏi /admin/audit mặc định, hiện khi include_views=1 hay lọc đúng action đó", async () => {
    const { adminCall } = makeAdmin();
    await adminCall("/admin/alerts");
    const actions = async (q = "") =>
      ((await adminCall(`/admin/audit${q}`)).body as unknown as { items: { action: string }[] }).items.map((i) => i.action);
    expect(await actions()).not.toContain("alerts_viewed");
    expect(await actions("?include_views=1")).toContain("alerts_viewed");
    expect(await actions("?action=alerts_viewed")).toEqual(["alerts_viewed"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// GET /admin/releases
// ---------------------------------------------------------------------------------------------------------------------

/** 1 MiB, viết lại tại đây (không import từ src) để test khóa đúng giá trị của hợp đồng. */
const MAX_BODY_BYTES = 1024 * 1024;
const BASE = "https://releases.aitranslator.io.vn";
const URLS = { stable: `${BASE}/stable/latest.json`, beta: `${BASE}/beta/latest.json`, models: `${BASE}/models/models.json` };

type Reply = Response | Error | (() => Response | Promise<Response>);
type Replies = Partial<Record<keyof typeof URLS, Reply>>;

const reply = (v: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(v), { status: 200, ...init });

/** App admin với `fetchPublic` giả: ghi lại mọi URL được gọi; nguồn không khai báo trả 404. Mặc định có RELEASES_BASE_URL. */
function releasesApp(replies: Replies = {}, adminEnv: Record<string, unknown> = { RELEASES_BASE_URL: BASE }) {
  const calls: string[] = [];
  const fetchPublic = async (url: string): Promise<Response> => {
    calls.push(url);
    const key = (Object.keys(URLS) as (keyof typeof URLS)[]).find((k) => URLS[k] === url);
    const r = key ? replies[key] : undefined;
    if (r === undefined) return new Response("not found", { status: 404 });
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  };
  return { calls, ...makeAdmin(adminEnv, { fetchPublic }) };
}

const timeoutError = () => new DOMException("The operation timed out.", "TimeoutError");

/** Dữ liệu giả của kênh: có sẵn các trường KHÔNG được lộ (url, chữ ký, trường lạ). */
const latest = (over: Record<string, unknown> = {}) => ({
  version: "0.4.2",
  pub_date: "2026-10-05T03:00:00Z",
  notes: "Sửa lỗi thu âm.",
  platforms: {
    "darwin-aarch64": { signature: "SIGNATURE-LEAK-1", url: "https://leak.example/app-1.tar.gz" },
    "windows-x86_64": { signature: "SIGNATURE-LEAK-2", url: "https://leak.example/app-2.zip" },
  },
  extra_field: "EXTRA-LEAK",
  ...over,
});

const b64url = (text: string, padded = false): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const out = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
  return padded ? out : out.replace(/=+$/, "");
};

const modelFile = (over: Record<string, unknown> = {}) => ({
  id: "whisper-turbo",
  tier: ["standard"],
  kind: "asr",
  version: "1",
  file: "FILE-LEAK.bin",
  url: "models/URL-LEAK.bin",
  bytes: 574041195,
  sha256: "SHA-LEAK-394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
  license_id: "LICENSE-LEAK",
  min_app_version: "0.1.0",
  ...over,
});

const modelInner = (over: Record<string, unknown> = {}) => ({
  schema: 1,
  sequence: 7,
  published_at: "2026-10-02T00:00:00Z",
  files: [modelFile(), modelFile({ id: "silero-vad", tier: ["standard", "lite"], kind: "vad", bytes: 2327524 })],
  packs: [
    { id: "standard", name: { vi: "NAME-LEAK-vi", en: "NAME-LEAK-en" }, note: { vi: "NOTE-LEAK" } },
    { id: "lite", name: { vi: "NAME-LEAK-2" }, note: { en: "NOTE-LEAK-2" } },
  ],
  recommend: { fallback: "RECOMMEND-LEAK" },
  ...over,
});

const envelope = (inner: unknown, over: Record<string, unknown> = {}, padded = false) => ({
  format: "ai-translator-models",
  version: 1,
  kid: "test-m1",
  body: b64url(JSON.stringify(inner), padded),
  signature: "ENVELOPE-SIG-LEAK",
  ...over,
});

const okReplies = (): Replies => ({ stable: reply(latest()), beta: reply(latest({ version: "0.5.0-beta.1" })), models: reply(envelope(modelInner())) });

interface ReleasesBody {
  base_url: string;
  channels: { stable: Record<string, unknown>; beta: Record<string, unknown> };
  models: Record<string, unknown>;
}

const getReleases = async (replies: Replies = okReplies()) => {
  const app = releasesApp(replies);
  const res = await app.adminFetch("/admin/releases");
  const text = await res.text();
  return { app, status: res.status, text, body: JSON.parse(text) as ReleasesBody };
};

describe("GET /admin/releases: dữ liệu và danh sách trắng", () => {
  it("cả ba nguồn ok: đúng từng trường xuất ra, không thừa trường nào", async () => {
    const { status, body } = await getReleases();
    expect(status).toBe(200);
    expect(body.base_url).toBe(BASE);
    expect(body.channels.stable).toEqual({
      status: "ok",
      version: "0.4.2",
      pub_date: "2026-10-05T03:00:00Z",
      notes: "Sửa lỗi thu âm.",
      platforms: ["darwin-aarch64", "windows-x86_64"],
    });
    expect(body.channels.beta).toMatchObject({ status: "ok", version: "0.5.0-beta.1" });
    expect(body.models).toEqual({
      status: "ok",
      sequence: 7,
      published_at: "2026-10-02T00:00:00Z",
      kid: "test-m1",
      packs: ["standard", "lite"],
      files: [
        { id: "whisper-turbo", kind: "asr", version: "1", bytes: 574041195, tier: "standard", min_app_version: "0.1.0" },
        { id: "silero-vad", kind: "vad", version: "1", bytes: 2327524, tier: "standard,lite", min_app_version: "0.1.0" },
      ],
    });
  });

  it("JSON phản hồi không chứa url, chữ ký, sha256, license_id, ghi chú, tên gói hay trường lạ của dữ liệu giả", async () => {
    const { text } = await getReleases();
    for (const leak of ["LEAK", "leak.example", "sha256", '"url"', "signature", "license", "extra_field"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("chỉ gọi đúng ba URL cố định của bucket, không URL nào khác", async () => {
    const { app } = await getReleases();
    expect([...app.calls].sort()).toEqual([URLS.beta, URLS.models, URLS.stable].sort());
    expect(URLS).toEqual({
      stable: "https://releases.aitranslator.io.vn/stable/latest.json",
      beta: "https://releases.aitranslator.io.vn/beta/latest.json",
      models: "https://releases.aitranslator.io.vn/models/models.json",
    });
  });

  it("route không nhận tham số từ request: query và header không đổi URL được gọi", async () => {
    const app = releasesApp(okReplies());
    await app.adminFetch("/admin/releases?base=https://evil.example&url=https://evil.example/x", { headers: { host: "evil.example" } });
    expect(app.calls.every((u) => u.startsWith(`${BASE}/`))).toBe(true);
    expect(app.calls).toHaveLength(3);
  });

  it("ba lần gọi chạy song song: cả ba đã bắt đầu trước khi nguồn nào trả lời", async () => {
    const gates: (() => void)[] = [];
    const slow = (): Promise<Response> => new Promise((resolve) => gates.push(() => resolve(reply(latest()))));
    const app = releasesApp({ stable: slow, beta: slow, models: () => new Promise((resolve) => gates.push(() => resolve(reply(envelope(modelInner()))))) });
    const pending = app.adminFetch("/admin/releases");
    await vi.waitFor(() => expect(app.calls).toHaveLength(3));
    expect(gates).toHaveLength(3);
    for (const g of gates) g();
    expect((await pending).status).toBe(200);
  });

  it("platforms: chỉ lấy tên khóa; notes ngắn giữ nguyên; pub_date null hay vắng đều ra null", async () => {
    const stable = reply(latest({ pub_date: null, notes: "x".repeat(1000) }));
    const { body } = await getReleases({ stable, beta: reply(latest({ pub_date: undefined, notes: undefined })) });
    expect(body.channels.stable).toMatchObject({ pub_date: null, notes: "x".repeat(1000) });
    expect(body.channels.beta).toMatchObject({ pub_date: null, notes: "" });
  });

  it("notes dài 5000 ký tự bị cắt còn 1000 ký tự", async () => {
    const { body } = await getReleases({ stable: reply(latest({ notes: "a".repeat(5000) })) });
    expect((body.channels.stable.notes as string).length).toBe(1000);
  });

  it("notes cắt theo ký tự, không cắt đôi cặp thay thế (emoji)", async () => {
    const { body } = await getReleases({ stable: reply(latest({ notes: "😀".repeat(5000) })) });
    const notes = body.channels.stable.notes as string;
    expect(Array.from(notes)).toHaveLength(1000);
    expect(notes).toBe("😀".repeat(1000));
  });

  it("body của models: base64url có đệm và không đệm đều giải được, kể cả khi có ký tự - và _", async () => {
    const inner = modelInner({ packs: [{ id: "a>>>b???c" }, { id: "é-ế" }] });
    const unpadded = b64url(JSON.stringify(inner));
    const padded = b64url(JSON.stringify(inner), true);
    expect(unpadded).toMatch(/[-_]/);
    expect(padded).toMatch(/=$/);
    for (const body of [unpadded, padded]) {
      const res = await getReleases({ models: reply(envelope(inner, { body })) });
      expect(res.body.models).toMatchObject({ status: "ok", packs: ["a>>>b???c", "é-ế"] });
    }
  });

  it("tier: mảng chuẩn hóa thành chuỗi nối bằng dấu phẩy; chuỗi giữ nguyên; mảng rỗng ra chuỗi rỗng", async () => {
    const inner = modelInner({
      files: [modelFile({ id: "a", tier: ["x", "y", "z"] }), modelFile({ id: "b", tier: "solo" }), modelFile({ id: "c", tier: [] })],
    });
    const { body } = await getReleases({ models: reply(envelope(inner)) });
    expect((body.models.files as { tier: string }[]).map((f) => f.tier)).toEqual(["x,y,z", "solo", ""]);
  });

  it("nội dung độc hại của bucket không đổi cấu trúc phản hồi: trường status, reason, base_url lạ bị bỏ qua", async () => {
    const hostile = {
      status: "error",
      reason: "PWNED",
      base_url: "https://evil.example",
      channels: "PWNED",
      models: "PWNED",
      version: "9.9.9",
      platforms: { "x<script>": 1 },
      notes: "<script>alert(1)</script>",
    };
    const inner = modelInner({ status: "error", reason: "PWNED" });
    const { body, text } = await getReleases({ stable: reply(hostile), beta: reply(hostile), models: reply(envelope(inner, { status: "error", reason: "PWNED" })) });
    expect(body.base_url).toBe(BASE);
    expect(body.channels.stable).toEqual({ status: "ok", version: "9.9.9", pub_date: null, notes: "<script>alert(1)</script>", platforms: ["x<script>"] });
    expect(body.models.status).toBe("ok");
    expect(body.models).not.toHaveProperty("reason");
    expect(text).not.toContain("evil.example");
    expect(text).not.toContain("PWNED");
  });
});

describe("GET /admin/releases: trạng thái từng nguồn", () => {
  it("stable ok, beta 404: beta là missing, stable và models không bị ảnh hưởng", async () => {
    const { body } = await getReleases({ stable: reply(latest()), models: reply(envelope(modelInner())) });
    expect(body.channels.stable.status).toBe("ok");
    expect(body.channels.beta).toEqual({ status: "missing" });
    expect(body.models.status).toBe("ok");
  });

  it.each([404, 403])("HTTP %i là missing (không có reason)", async (code) => {
    const r = () => new Response("nope", { status: code });
    const { body } = await getReleases({ stable: r, beta: r, models: r });
    expect(body.channels.stable).toEqual({ status: "missing" });
    expect(body.channels.beta).toEqual({ status: "missing" });
    expect(body.models).toEqual({ status: "missing" });
  });

  it("models 404 mà hai kênh ok", async () => {
    const { body } = await getReleases({ stable: reply(latest()), beta: reply(latest()) });
    expect(body.models).toEqual({ status: "missing" });
    expect(body.channels.stable.status).toBe("ok");
  });

  it("một nguồn quá hạn (TimeoutError): error/timeout; hai nguồn kia vẫn ok", async () => {
    const { status, body } = await getReleases({ stable: timeoutError(), beta: reply(latest()), models: reply(envelope(modelInner())) });
    expect(status).toBe(200);
    expect(body.channels.stable).toEqual({ status: "error", reason: "timeout" });
    expect(body.channels.beta.status).toBe("ok");
    expect(body.models.status).toBe("ok");
  });

  it("AbortError cũng là timeout; hết hạn lúc đang đọc thân cũng là timeout", async () => {
    const stream = () =>
      new Response(
        new ReadableStream({
          start(ctrl) {
            ctrl.error(timeoutError());
          },
        }),
      );
    const { body } = await getReleases({ stable: new DOMException("aborted", "AbortError"), beta: stream, models: stream });
    expect(body.channels.stable).toEqual({ status: "error", reason: "timeout" });
    expect(body.channels.beta).toEqual({ status: "error", reason: "timeout" });
    expect(body.models).toEqual({ status: "error", reason: "timeout" });
  });

  it("lỗi mạng khác: error/network, không chép thông điệp lỗi", async () => {
    const { body, text } = await getReleases({ stable: new Error("SECRET-DETAIL connect ECONNRESET") });
    expect(body.channels.stable).toEqual({ status: "error", reason: "network" });
    expect(text).not.toContain("SECRET-DETAIL");
  });

  it("HTTP 500: error/http_500, không chép thân phản hồi", async () => {
    const r = () => new Response("<html>BODY-LEAK</html>", { status: 500 });
    const { body, text } = await getReleases({ stable: r, beta: new Response("x", { status: 503 }), models: r });
    expect(body.channels.stable).toEqual({ status: "error", reason: "http_500" });
    expect(body.channels.beta).toEqual({ status: "error", reason: "http_503" });
    expect(body.models).toEqual({ status: "error", reason: "http_500" });
    expect(text).not.toContain("BODY-LEAK");
  });

  it("chuyển hướng 302 không được theo: error/http_302, đích chuyển hướng không bị gọi và không bị chép", async () => {
    const redirect = () => new Response(null, { status: 302, headers: { location: "https://evil.example/latest.json" } });
    const { body, text, app } = await getReleases({ stable: redirect, beta: redirect, models: redirect });
    expect(body.channels.stable).toEqual({ status: "error", reason: "http_302" });
    expect(body.models).toEqual({ status: "error", reason: "http_302" });
    expect(app.calls).toHaveLength(3);
    expect(text).not.toContain("evil.example");
  });

  it("thân không phải JSON (hay rỗng): error/invalid_json", async () => {
    const { body } = await getReleases({ stable: new Response("{ not json"), beta: new Response(""), models: new Response("<html>") });
    expect(body.channels.stable).toEqual({ status: "error", reason: "invalid_json" });
    expect(body.channels.beta).toEqual({ status: "error", reason: "invalid_json" });
    expect(body.models).toEqual({ status: "error", reason: "invalid_json" });
  });

  const badChannels: [string, unknown][] = [
    ["JSON không phải object", ["0.4.2"]],
    ["null", null],
    ["thiếu version", latest({ version: undefined })],
    ["version không phải chuỗi", latest({ version: 4 })],
    ["thiếu platforms", latest({ platforms: undefined })],
    ["platforms là mảng", latest({ platforms: ["darwin"] })],
    ["platforms là chuỗi", latest({ platforms: "darwin" })],
    ["pub_date là số", latest({ pub_date: 123 })],
    ["notes là số", latest({ notes: 123 })],
  ];
  it.each(badChannels)("latest.json hình dạng sai (%s): error/invalid_shape", async (_name, value) => {
    const { body } = await getReleases({ stable: reply(value), beta: reply(value) });
    expect(body.channels.stable).toEqual({ status: "error", reason: "invalid_shape" });
    expect(body.channels.beta).toEqual({ status: "error", reason: "invalid_shape" });
  });

  const badModels: [string, unknown][] = [
    ["không phải object", [1]],
    ["format sai", envelope(modelInner(), { format: "other" })],
    ["version phong bì sai", envelope(modelInner(), { version: 2 })],
    ["thiếu kid", envelope(modelInner(), { kid: undefined })],
    ["body không phải chuỗi", envelope(modelInner(), { body: { a: 1 } })],
    ["body không phải base64url", envelope(modelInner(), { body: "***not base64***" })],
    ["body có độ dài base64 không hợp lệ", envelope(modelInner(), { body: "A" })],
    ["body giải ra không phải JSON", envelope(modelInner(), { body: b64url("not json") })],
    ["body giải ra không phải object", envelope(modelInner(), { body: b64url("[1,2]") })],
    ["body giải ra không phải UTF-8", envelope(modelInner(), { body: "_w" })],
    ["thiếu files", envelope(modelInner({ files: undefined }))],
    ["files không phải mảng", envelope(modelInner({ files: {} }))],
    ["packs không phải mảng", envelope(modelInner({ packs: "standard" }))],
    ["sequence không phải số", envelope(modelInner({ sequence: "7" }))],
    ["published_at không phải chuỗi", envelope(modelInner({ published_at: 20261002 }))],
    ["file thiếu id", envelope(modelInner({ files: [modelFile({ id: undefined })] }))],
    ["file có bytes là chuỗi", envelope(modelInner({ files: [modelFile({ bytes: "100" })] }))],
    ["file có tier là số", envelope(modelInner({ files: [modelFile({ tier: 1 })] }))],
    ["file có tier chứa số", envelope(modelInner({ files: [modelFile({ tier: ["a", 1] })] }))],
    ["file không phải object", envelope(modelInner({ files: ["x"] }))],
    ["pack thiếu id", envelope(modelInner({ packs: [{ name: "x" }] }))],
  ];
  it.each(badModels)("models.json hình dạng sai (%s): error/invalid_shape", async (_name, value) => {
    const { body } = await getReleases({ models: reply(value) });
    expect(body.models).toEqual({ status: "error", reason: "invalid_shape" });
  });

  it("thân hơn 1 MiB (không có Content-Length, đọc theo luồng): error/too_large và dừng đọc", async () => {
    let cancelled = false;
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    const big = () =>
      new Response(
        new ReadableStream({
          pull(ctrl) {
            // 4 MiB rồi đóng; bên đọc đúng phải hủy luồng ngay khi qua 1 MiB.
            if (sent >= 64) ctrl.close();
            else {
              sent++;
              ctrl.enqueue(chunk);
            }
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    const { body } = await getReleases({ stable: big, beta: reply(latest()) });
    expect(body.channels.stable).toEqual({ status: "error", reason: "too_large" });
    expect(body.channels.beta.status).toBe("ok");
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(64);
  });

  it("thân vượt 1 MiB đúng 1 byte: too_large; đúng 1 MiB: vẫn đọc được", async () => {
    const withSize = (bytes: number) => {
      const head = JSON.stringify(latest({ pad: "", notes: "ok" }));
      return head.replace('"pad":""', `"pad":"${"p".repeat(bytes - head.length)}"`);
    };
    const exact = withSize(MAX_BODY_BYTES);
    expect(new TextEncoder().encode(exact).length).toBe(MAX_BODY_BYTES);
    const over = `${exact} `;
    expect(new TextEncoder().encode(over).length).toBe(MAX_BODY_BYTES + 1);
    const { body } = await getReleases({ stable: new Response(exact), beta: new Response(over) });
    expect(body.channels.stable.status).toBe("ok");
    expect(body.channels.beta).toEqual({ status: "error", reason: "too_large" });
  });

  it("Content-Length khai vượt 1 MiB: too_large ngay, không đọc thân", async () => {
    const declared = () => new Response("{}", { headers: { "content-length": String(MAX_BODY_BYTES + 1) } });
    const { body } = await getReleases({ stable: declared });
    expect(body.channels.stable).toEqual({ status: "error", reason: "too_large" });
  });

  it("mọi nguồn lỗi vẫn là 200 (lỗi nằm trong từng nguồn) và vẫn ghi nhật ký", async () => {
    const { status, body } = await getReleases({ stable: timeoutError(), beta: new Response("", { status: 500 }), models: new Response("x") });
    expect(status).toBe(200);
    expect([body.channels.stable.status, body.channels.beta.status, body.models.status]).toEqual(["error", "error", "error"]);
    expect(await lastAudit()).toMatchObject({ action: "releases_viewed" });
  });
});

describe("GET /admin/releases: cấu hình, quyền và nhật ký", () => {
  it.each([
    ["thiếu biến", undefined],
    ["rỗng", ""],
    ["có / cuối", `${BASE}/`],
    ["không phải https", "http://releases.aitranslator.io.vn"],
    ["có đường dẫn", `${BASE}/x`],
    ["có thông tin đăng nhập", "https://user@releases.aitranslator.io.vn"],
  ])("RELEASES_BASE_URL %s: 503 releases_not_configured, không gọi mạng, không ghi nhật ký", async (_name, value) => {
    const app = releasesApp(okReplies(), value === undefined ? {} : { RELEASES_BASE_URL: value });
    const res = await app.adminCall("/admin/releases");
    expect(res).toEqual({ status: 503, body: { error: "releases_not_configured" } });
    expect(app.calls).toEqual([]);
    expect(await auditCount()).toBe(0);
  });

  it("ghi đúng một dòng nhật ký releases_viewed, không detail, không email", async () => {
    const { status } = await getReleases();
    expect(status).toBe(200);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "releases_viewed", order_code: null, detail: null });
    expect(await auditCount()).toBe(1);
  });

  it("403 khi request từ trang khác hay không qua Access: không gọi bucket, không ghi nhật ký", async () => {
    const app = releasesApp(okReplies());
    expect(await app.adminCall("/admin/releases", { headers: { "sec-fetch-site": "cross-site" } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect((await app.adminCall("/admin/releases", { operator: null })).status).toBe(403);
    expect(app.calls).toEqual([]);
    expect(await auditCount()).toBe(0);
  });

  it("phản hồi không được lưu đệm: Cache-Control no-store", async () => {
    const app = releasesApp(okReplies());
    expect((await app.adminFetch("/admin/releases")).headers.get("cache-control")).toBe("no-store");
  });

  it("mặc định của harness: fetchPublic trả 404 cho mọi URL (không gọi mạng thật)", async () => {
    const { adminCall } = makeAdmin({ RELEASES_BASE_URL: BASE });
    const res = await adminCall("/admin/releases");
    expect(res.body).toMatchObject({ channels: { stable: { status: "missing" }, beta: { status: "missing" } }, models: { status: "missing" } });
  });

  it("releases_viewed ẩn khỏi /admin/audit mặc định, hiện khi include_views=1 hay lọc đúng action đó", async () => {
    const app = releasesApp(okReplies());
    await app.adminCall("/admin/releases");
    const actions = async (q = "") =>
      ((await app.adminCall(`/admin/audit${q}`)).body as unknown as { items: { action: string }[] }).items.map((i) => i.action);
    expect(await actions()).not.toContain("releases_viewed");
    expect(await actions("?include_views=1")).toContain("releases_viewed");
    expect(await actions("?action=releases_viewed")).toEqual(["releases_viewed"]);
  });
});

describe("defaultFetchPublic (fetch thật của Worker admin)", () => {
  it("gọi fetch với redirect: manual và tín hiệu hết hạn 5 giây, đúng URL được truyền", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    try {
      await defaultFetchPublic(URLS.stable);
      expect(spy).toHaveBeenCalledTimes(1);
      const [url, init] = spy.mock.calls[0] ?? [];
      expect(url).toBe(URLS.stable);
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("hạn là 5 giây: AbortSignal.timeout(5000) cấp tín hiệu cho fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    try {
      await defaultFetchPublic(URLS.beta);
      expect(timeoutSpy).toHaveBeenCalledWith(5000);
      expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBe(timeoutSpy.mock.results[0]?.value);
    } finally {
      fetchSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  });
});
