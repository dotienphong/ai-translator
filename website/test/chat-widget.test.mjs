// Kiểm chat hỗ trợ của website trong Chrome không đầu (spec chat hỗ trợ 2026-10-22, mục 3; hợp đồng ở kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan), qua tools/browser/cdp.mjs. Máy chủ thật chỉ cho origin https://aitranslator.io.vn nên
// test dùng API giả: chặn mọi request tới https://api.aitranslator.io.vn (cả preflight OPTIONS) bằng Fetch domain của CDP.
// CSP của trang vẫn áp như thật (serve.mjs đọc _headers), nên request tới nơi khác hay script lạ đều lộ ra ở p.errors.
//   node --test test/chat-widget.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { findChrome, launch } from "../tools/browser/cdp.mjs";
import { CHAT } from "../src/assets/chat-strings.js";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "chat-dist-"));
process.env.WEBSITE_DIST = DIST;
const API = "https://api.aitranslator.io.vn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let browser;
let base;

before(async () => {
  if (skip) return;
  const { build } = await import("../src/build/build.mjs");
  await build();
  const { start } = await import("../src/serve.mjs");
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  rmSync(DIST, { recursive: true, force: true });
});

/**
 * API chat giả theo hợp đồng, gắn vào một trang: chặn request tới api.aitranslator.io.vn bằng Fetch domain (kể cả preflight
 * OPTIONS) và trả lời như server. `fail` chen lỗi cho các request kế tiếp: `{ status, error, retryAfter }` hay "network".
 */
async function fakeApi(page) {
  const api = {
    enabled: true,
    nextId: 1,
    convs: new Map(),
    requests: [],
    fail: [],
    create(first = {}) {
      const token = randomBytes(32).toString("base64url");
      api.convs.set(token, { messages: [], email: null, status: "open", first });
      return token;
    },
    add(token, sender, text) {
      const m = { id: api.nextId++, sender, text, created_at: Math.floor(Date.now() / 1000) };
      api.convs.get(token).messages.push(m);
      return m;
    },
    calls: (method, prefix) => api.requests.filter((r) => r.method === method && r.path.startsWith(prefix)),
  };
  const cors = [
    { name: "Access-Control-Allow-Origin", value: base },
    { name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
    { name: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
    { name: "Access-Control-Expose-Headers", value: "Retry-After" },
  ];
  const reply = (requestId, status, body, extra = []) =>
    page.s.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: [...cors, { name: "Content-Type", value: "application/json" }, ...extra],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    });
  page.s.handlers.push(async (m) => {
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    if (request.method === "OPTIONS") return page.s.send("Fetch.fulfillRequest", { requestId, responseCode: 204, responseHeaders: cors });
    const url = new URL(request.url);
    const header = Object.entries(request.headers).find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? "";
    const auth = header.replace(/^Bearer /, "") || null;
    const body = request.postData ? JSON.parse(request.postData) : undefined;
    api.requests.push({ method: request.method, path: url.pathname + url.search, auth, body, type: request.headers["Content-Type"] ?? null });
    const f = api.fail.shift();
    if (f === "network") return page.s.send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" });
    if (f) return reply(requestId, f.status, { error: f.error }, f.retryAfter ? [{ name: "Retry-After", value: String(f.retryAfter) }] : []);
    const key = `${request.method} ${url.pathname}`;
    if (key === "GET /v1/support/status") return reply(requestId, 200, { enabled: api.enabled });
    const conv = auth ? api.convs.get(auth) : null;
    if (auth && !conv) return reply(requestId, 401, { error: "invalid_token" });
    if (key === "POST /v1/support/messages") {
      if (!api.enabled) return reply(requestId, 503, { error: "support_disabled" });
      if (conv?.status === "closed") return reply(requestId, 403, { error: "conversation_closed" });
      const token = conv ? auth : api.create(body);
      const message = api.add(token, "customer", body.text);
      return reply(requestId, 201, conv ? { message } : { token, message });
    }
    if (key === "GET /v1/support/messages") {
      const after = Number(url.searchParams.get("after"));
      return reply(requestId, 200, { enabled: api.enabled, status: conv.status, messages: conv.messages.filter((x) => x.id > after) });
    }
    if (key === "PUT /v1/support/email") {
      conv.email = body.email;
      return reply(requestId, 200, { ok: true });
    }
    if (key === "DELETE /v1/support/conversation") {
      api.convs.delete(auth);
      return reply(requestId, 200, { ok: true });
    }
    return reply(requestId, 404, { error: "not_found" });
  });
  await page.s.send("Fetch.enable", { patterns: [{ urlPattern: `${API}/*` }] });
  return api;
}

/** Trang mới có API giả, localStorage sạch (mọi trang chung một hồ sơ Chrome), rồi mở `path`. */
async function freshPage(path, o = {}) {
  const p = await browser.newPage({ width: 1280, height: 900, ...o });
  const api = await fakeApi(p);
  await p.goto(base + "/");
  await p.eval("localStorage.clear()");
  if (o.state) await p.eval(`localStorage.setItem("support.v1", ${JSON.stringify(JSON.stringify(o.state))})`);
  api.requests.length = 0;
  await p.goto(base + path);
  return { p, api };
}

/** Chờ biểu thức JS trong trang ra giá trị truthy. */
async function until(p, expr, ms = 7000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await p.eval(expr)) return;
    await sleep(100);
  }
  throw new Error(`hết giờ chờ: ${expr}`);
}

/** Lỗi thật của trang: bỏ dòng log mạng của các mã lỗi mà test cố ý trả (4xx, 5xx, mất mạng). */
const realErrors = (p) => p.errors.filter((e) => !/^network: Failed to load resource: (the server responded with a status of [45]\d\d|net::ERR_INTERNET_DISCONNECTED)/.test(e));
const chatFiles = (p) => p.eval(`performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((n) => n.startsWith("/assets/bundle/chat"))`);

test("mọi trang năm ngôn ngữ (và 404) có bong bóng đúng nhãn; chưa bấm thì không tải file chat, không gọi API", { skip }, async () => {
  for (const [path, lang] of [["/", "vi"], ["/en/pricing/", "en"], ["/ja/faq/", "ja"], ["/zh/", "zh"], ["/ko/contact/", "ko"], ["/khong-co-trang-nay/", "vi"]]) {
    const { p, api } = await freshPage(path);
    const b = await p.eval(`(() => { const b = document.querySelector(".chat-root > .chat-bubble"); if (!b) return null; const r = b.getBoundingClientRect(); return { label: b.getAttribute("aria-label"), expanded: b.getAttribute("aria-expanded"), dot: b.querySelector(".chat-dot").hidden, right: innerWidth - r.right, bottom: innerHeight - r.bottom, fixed: getComputedStyle(b.parentElement).position }; })()`);
    assert.ok(b, `${path}: không có bong bóng`);
    assert.deepEqual(b, { label: CHAT[lang].open, expanded: "false", dot: true, right: 16, bottom: 16, fixed: "fixed" }, path);
    assert.deepEqual(await chatFiles(p), [], `${path}: đã tải file chat trước khi bấm`);
    assert.deepEqual(api.requests, [], `${path}: đã gọi API`);
    assert.deepEqual(realErrors(p), [], path);
    await p.close();
  }
});

test("tắt JavaScript: không có bong bóng", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 900 });
  await p.setJS(false);
  await p.goto(base + "/");
  assert.equal(await p.eval(`document.querySelectorAll(".chat-root, .chat-bubble").length`), 0);
  await p.close();
});

test("đang chờ trả lời (tin cuối của khách, trong 24 giờ): tải trang thì hỏi một lần; có trả lời thì chấm đỏ và nhãn báo có trả lời; chỉ tải lõi", { skip }, async () => {
  const p0 = await browser.newPage({ width: 1280, height: 900 });
  const api = await fakeApi(p0);
  const token = api.create();
  const asked = api.add(token, "customer", "Gói Monthly dùng được trên 2 máy không?");
  api.add(token, "owner", "Mỗi key dùng trên một máy.");
  await p0.goto(base + "/");
  await p0.eval("localStorage.clear()");
  await p0.eval(`localStorage.setItem("support.v1", ${JSON.stringify(JSON.stringify({ token, lastId: 0, waitingSince: asked.created_at }))})`);
  api.requests.length = 0;
  await p0.goto(base + "/en/");
  await until(p0, `!document.querySelector(".chat-dot").hidden`);
  assert.equal(await p0.eval(`document.querySelector(".chat-bubble").getAttribute("aria-label")`), `${CHAT.en.open} (${CHAT.en.unread})`);
  assert.deepEqual(api.requests.map((r) => [r.method, r.path, r.auth]), [["GET", "/v1/support/messages?after=0", token]]);
  const files = await chatFiles(p0);
  assert.equal(files.length, 1, files.join(", "));
  assert.match(files[0], /^\/assets\/bundle\/chat-core\.[0-9a-f]{10}\.js$/);
  // Đã thấy trả lời thì thôi hỏi (chấm đỏ đã hiện), và bản lưu không đổi: trang sau vẫn hiện chấm đỏ.
  await sleep(1500);
  assert.equal(api.requests.length, 1);
  assert.deepEqual(JSON.parse(await p0.eval(`localStorage.getItem("support.v1")`)), { token, lastId: 0, waitingSince: asked.created_at });
  assert.deepEqual(realErrors(p0), []);
  await p0.close();
});

test("không chờ trả lời (tin cuối đã có trả lời, hay quá 24 giờ): không gọi mạng, không tải lõi", { skip }, async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = randomBytes(32).toString("base64url");
  for (const waitingSince of [null, now - 25 * 3600]) {
    const { p, api } = await freshPage("/", { state: { token, lastId: 3, waitingSince } });
    await sleep(800);
    assert.deepEqual(api.requests, [], String(waitingSince));
    assert.deepEqual(await chatFiles(p), [], String(waitingSince));
    await p.close();
  }
});
