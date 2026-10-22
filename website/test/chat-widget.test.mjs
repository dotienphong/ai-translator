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

/** Mở khung bằng cách bấm bong bóng, chờ khung hiện. */
async function openChat(p) {
  await p.click(".chat-bubble");
  await until(p, `document.querySelector(".chat-panel") && !document.querySelector(".chat-panel").hidden`);
}
/** Gõ chữ vào ô nhập như bàn phím thật (Input.insertText phát sự kiện input). */
async function type(p, selector, text) {
  await p.focus(selector);
  await p.s.send("Input.insertText", { text });
  await sleep(50);
}
const msgs = (p) => p.eval(`[...document.querySelectorAll(".chat-log .chat-msg")].map((m) => [m.classList.contains("is-owner") ? "owner" : "customer", m.querySelector(".chat-text").textContent, m.dataset.state ?? null])`);
const saved = async (p) => JSON.parse(await p.eval(`localStorage.getItem("support.v1")`));
const LANG_HOME = { vi: "/", en: "/en/", ja: "/ja/", zh: "/zh/", ko: "/ko/" };

/** Chờ điều kiện phía Node (request API giả đã tới) đúng. */
async function eventually(fn, ms = 7000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(50);
  }
  throw new Error("hết giờ chờ điều kiện");
}

test("bấm bong bóng: tải chat.js và chat.css; tiêu đề, dòng phụ, lời chào, chân khung đúng ngôn ngữ; chưa có cuộc chat thì chỉ hỏi /status; Esc đóng, tiêu điểm về bong bóng; phím cách mở lại", { skip }, async () => {
  for (const lang of Object.keys(LANG_HOME)) {
    const { p, api } = await freshPage(LANG_HOME[lang]);
    await openChat(p);
    const r = await p.eval(`(() => {
      const panel = document.querySelector(".chat-panel");
      const foot = panel.querySelector(".chat-foot");
      return {
        title: panel.querySelector(".chat-title").textContent,
        sub: panel.querySelector(".chat-sub").textContent,
        foot: foot.textContent,
        href: foot.querySelector("a").getAttribute("href"),
        role: panel.getAttribute("role"),
        log: panel.querySelector(".chat-log").getAttribute("role"),
        expanded: document.querySelector(".chat-bubble").getAttribute("aria-expanded"),
        menu: panel.querySelector("[data-menu]").hidden,
      };
    })()`);
    const t = CHAT[lang];
    assert.deepEqual(r, { title: t.title, sub: t.sub, foot: `${t.keep} · ${t.privacy}`, href: t.privacyHref, role: "dialog", log: "log", expanded: "true", menu: true }, lang);
    assert.deepEqual(await msgs(p), [["owner", t.greeting, null]], `${lang}: lời chào`);
    await eventually(() => api.requests.length > 0);
    await sleep(300);
    assert.deepEqual(api.requests.map((x) => `${x.method} ${x.path}`), ["GET /v1/support/status"], lang);
    const files = (await chatFiles(p)).map((f) => f.replace(/\.[0-9a-f]{10}\./, "."));
    assert.deepEqual(files.sort(), ["/assets/bundle/chat-core.js", "/assets/bundle/chat-strings.js", "/assets/bundle/chat.css", "/assets/bundle/chat.js"], lang);
    await p.press("Escape");
    assert.equal(await p.eval(`document.querySelector(".chat-panel").hidden`), true, `${lang}: Esc không đóng`);
    assert.equal(await p.eval(`document.activeElement === document.querySelector(".chat-bubble")`), true, `${lang}: tiêu điểm không về bong bóng`);
    assert.equal(await p.eval(`document.querySelector(".chat-bubble").getAttribute("aria-expanded")`), "false");
    // Mở lại bằng bàn phím: tiêu điểm đang ở bong bóng, phím cách bấm nút; tiêu điểm phải vào trong khung.
    await p.press(" ");
    await until(p, `!document.querySelector(".chat-panel").hidden`);
    assert.equal(await p.eval(`document.querySelector(".chat-panel").contains(document.activeElement)`), true, `${lang}: mở bằng phím mà tiêu điểm không vào khung`);
    assert.deepEqual(realErrors(p), [], lang);
    await p.close();
  }
});

test("gửi tin: Enter gửi, Shift+Enter và Enter của bộ gõ không gửi; tin đầu POST không token kèm lang, source, page; 'Đã gửi'; lưu support.v1; thẻ email hiện; tin sau có Authorization", { skip }, async () => {
  const { p, api } = await freshPage("/bang-gia/");
  await openChat(p);
  await type(p, "#chat-input", "Gói Monthly dùng được trên 2 máy không?");
  const notSent = await p.eval(`(() => {
    const input = document.querySelector("#chat-input");
    return [{ shiftKey: true }, { isComposing: true }].map((o) => { const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...o }); input.dispatchEvent(e); return e.defaultPrevented; });
  })()`);
  assert.deepEqual(notSent, [false, false], "Shift+Enter và Enter của bộ gõ không được chặn (để xuống dòng, chốt chữ)");
  assert.equal(api.calls("POST", "/v1/support/messages").length, 0);
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  assert.equal(await p.eval(`document.querySelector("#chat-input").value`), "");
  assert.deepEqual((await msgs(p)).at(-1), ["customer", "Gói Monthly dùng được trên 2 máy không?", "sent"]);
  assert.equal(await p.eval(`document.querySelector('.chat-msg.is-customer .chat-state').textContent`), CHAT.vi.sent);
  const [first] = api.calls("POST", "/v1/support/messages");
  assert.deepEqual(first, { method: "POST", path: "/v1/support/messages", auth: null, body: { text: "Gói Monthly dùng được trên 2 máy không?", lang: "vi", source: "web", page: "/bang-gia/" }, type: "application/json" });
  const [token] = [...api.convs.keys()];
  const st = await saved(p);
  assert.equal(st.token, token);
  assert.equal(st.waitingSince, api.convs.get(token).messages[0].created_at);
  assert.equal(await p.eval(`document.querySelector(".chat-email").hidden`), false, "thẻ email phải hiện sau tin đầu");
  assert.equal(await p.eval(`document.querySelector("[data-menu]").hidden`), false, "menu ⋯ hiện khi đã có cuộc chat");
  await type(p, "#chat-input", "Cảm ơn");
  await p.click("[data-send]");
  await until(p, `[...document.querySelectorAll('.chat-msg.is-customer')].at(-1).dataset.state === "sent"`);
  const second = api.calls("POST", "/v1/support/messages")[1];
  assert.deepEqual([second.auth, second.body], [token, { text: "Cảm ơn" }]);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("trả lời của chủ dự án hiện trong khung (hỏi mỗi 3 giây, vùng role=log); khách đã thấy thì hết chờ; tab ẩn thì không hỏi, hiện lại thì hỏi tiếp", { skip }, async () => {
  const { p, api } = await freshPage("/en/");
  await openChat(p);
  await type(p, "#chat-input", "Subtitles do not show in Teams");
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  const [token] = [...api.convs.keys()];
  const reply = api.add(token, "owner", "Which version are you on?");
  await until(p, `[...document.querySelectorAll(".chat-msg.is-owner .chat-text")].some((e) => e.textContent === "Which version are you on?")`, 6000);
  assert.equal(await p.eval(`document.querySelector(".chat-msg.is-owner:last-child .sr-only").textContent`), `${CHAT.en.support}: `);
  assert.deepEqual(await saved(p), { token, lastId: reply.id, waitingSince: null });
  // Nhịp 3 giây khi khung mở.
  const before = api.calls("GET", "/v1/support/messages").length;
  await sleep(6500);
  const polls = api.calls("GET", "/v1/support/messages").length - before;
  assert.ok(polls >= 2 && polls <= 3, `6,5 giây mà hỏi ${polls} lần`);
  assert.equal(api.calls("GET", "/v1/support/messages").at(-1).path, `/v1/support/messages?after=${reply.id}`, "con trỏ after phải tiến");
  // Tab ẩn: không gọi mạng.
  await p.eval(`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange"))`);
  const hidden = api.requests.length;
  await sleep(4000);
  assert.equal(api.requests.length, hidden, "tab ẩn mà vẫn hỏi");
  await p.eval(`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange"))`);
  await eventually(() => api.requests.length > hidden, 1000);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("đóng khung khi đang chờ, chủ dự án trả lời: trang sau hiện chấm đỏ; mở khung thì thấy trả lời và hết chấm đỏ", { skip }, async () => {
  const { p, api } = await freshPage("/ja/");
  await openChat(p);
  await type(p, "#chat-input", "ライセンスについて質問があります");
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  await p.click("[data-close]");
  const [token] = [...api.convs.keys()];
  api.add(token, "owner", "What is your question?");
  await p.goto(base + "/ja/pricing/");
  await until(p, `!document.querySelector(".chat-dot").hidden`);
  await openChat(p);
  assert.equal(await p.eval(`document.querySelector(".chat-dot").hidden`), true);
  await until(p, `[...document.querySelectorAll(".chat-msg.is-owner .chat-text")].some((e) => e.textContent === "What is your question?")`);
  assert.deepEqual((await msgs(p)).map((m) => m[1]), [CHAT.ja.greeting, "ライセンスについて質問があります", "What is your question?"]);
  assert.equal((await saved(p)).waitingSince, null);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("đếm ký tự: hiện từ 900; quá 1000 thì nút gửi tắt, ô nhập báo sai, có dòng báo dài quá, Enter không gửi", { skip }, async () => {
  const { p, api } = await freshPage("/");
  await openChat(p);
  const state = () => p.eval(`(() => { const c = document.querySelector(".chat-count"); return { count: c.hidden ? null : c.textContent, send: document.querySelector("[data-send]").disabled, invalid: document.querySelector("#chat-input").getAttribute("aria-invalid"), note: document.querySelector(".chat-note").textContent }; })()`);
  await type(p, "#chat-input", "a".repeat(899));
  assert.deepEqual(await state(), { count: null, send: false, invalid: "false", note: "" });
  await type(p, "#chat-input", "😀");
  assert.deepEqual(await state(), { count: "900/1000", send: false, invalid: "false", note: "" }, "emoji tính một ký tự");
  await type(p, "#chat-input", "b".repeat(101));
  assert.deepEqual(await state(), { count: "1001/1000", send: true, invalid: "true", note: CHAT.vi.tooLong });
  await p.press("Enter");
  assert.equal(api.calls("POST", "/v1/support/messages").length, 0);
  await p.eval(`(() => { const i = document.querySelector("#chat-input"); i.value = i.value.slice(0, -1); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  assert.deepEqual(await state(), { count: "1000/1000", send: false, invalid: "false", note: "" });
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("thẻ email: sai định dạng thì báo, đúng thì PUT { email } và báo đã lưu; nút Bỏ qua đóng thẻ", { skip }, async () => {
  const { p, api } = await freshPage("/ko/");
  await openChat(p);
  await type(p, "#chat-input", "안녕하세요");
  await p.press("Enter");
  await until(p, `!document.querySelector(".chat-email").hidden`);
  await type(p, ".chat-email input", "khong-phai-email");
  await p.click("[data-email-save]");
  assert.equal(await p.eval(`document.querySelector(".chat-email-msg").textContent`), CHAT.ko.emailBad);
  assert.equal(api.calls("PUT", "/v1/support/email").length, 0);
  await p.eval(`document.querySelector(".chat-email input").value = ""`);
  await type(p, ".chat-email input", " Khach@Vi-Du.vn ");
  await p.click("[data-email-save]");
  await until(p, `document.querySelector(".chat-email-msg").textContent === ${JSON.stringify(CHAT.ko.emailSaved)}`);
  const [put] = api.calls("PUT", "/v1/support/email");
  const [token] = [...api.convs.keys()];
  assert.deepEqual([put.auth, put.body], [token, { email: "khach@vi-du.vn" }]);
  assert.equal(await p.eval(`document.querySelector(".chat-email-row").hidden`), true);
  await p.click("[data-email-close]");
  assert.equal(await p.eval(`document.querySelector(".chat-email").hidden`), true);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("menu ⋯ Xóa cuộc trò chuyện: hỏi lại; Hủy giữ nguyên; Xóa gọi DELETE {} rồi về lời chào và xóa support.v1", { skip }, async () => {
  const { p, api } = await freshPage("/zh/");
  await openChat(p);
  await type(p, "#chat-input", "你好");
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  const [token] = [...api.convs.keys()];
  await p.click("[data-menu]");
  assert.equal(await p.eval(`document.querySelector("[data-menu]").getAttribute("aria-expanded")`), "true");
  assert.equal(await p.eval(`document.querySelector("[data-delete]").textContent`), CHAT.zh.del);
  await p.click("[data-delete]");
  assert.equal(await p.eval(`document.querySelector(".chat-confirm").hidden`), false, "phải hỏi lại trước khi xóa");
  assert.equal(await p.eval(`document.querySelector("#chat-confirm-text").textContent`), CHAT.zh.confirm);
  await p.click("[data-no]");
  assert.equal(await p.eval(`document.querySelector(".chat-confirm").hidden`), true);
  assert.equal(api.calls("DELETE", "/v1/support/conversation").length, 0);
  await p.click("[data-menu]");
  await p.click("[data-delete]");
  await p.click("[data-yes]");
  await until(p, `localStorage.getItem("support.v1") === null`);
  const [del] = api.calls("DELETE", "/v1/support/conversation");
  assert.deepEqual([del.auth, del.body, del.type], [token, {}, "application/json"]);
  assert.deepEqual(await msgs(p), [["owner", CHAT.zh.greeting, null]]);
  assert.equal(await p.eval(`document.querySelector("[data-menu]").hidden`), true);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("chat tắt: ô nhập thay bằng dòng email support@; cuộc chat bị chặn: dòng 'đã đóng', lịch sử vẫn hiện", { skip }, async () => {
  const { p, api } = await freshPage("/");
  api.enabled = false;
  await openChat(p);
  await until(p, `!document.querySelector(".chat-off").hidden`);
  const off = await p.eval(`(() => { const o = document.querySelector(".chat-off"); return { text: o.textContent, href: o.querySelector("a").getAttribute("href"), compose: document.querySelector(".chat-compose").hidden }; })()`);
  assert.deepEqual(off, { text: CHAT.vi.off.replace("{email}", "support@aitranslator.io.vn"), href: "mailto:support@aitranslator.io.vn", compose: true });
  await p.close();

  const p2 = await browser.newPage({ width: 1280, height: 900 });
  const api2 = await fakeApi(p2);
  const token = api2.create();
  const m = api2.add(token, "customer", "Tin cũ");
  api2.convs.get(token).status = "closed";
  await p2.goto(base + "/");
  await p2.eval(`localStorage.clear(); localStorage.setItem("support.v1", ${JSON.stringify(JSON.stringify({ token, lastId: 0, waitingSince: null }))})`);
  await p2.goto(base + "/");
  await openChat(p2);
  await until(p2, `!document.querySelector(".chat-off").hidden`);
  assert.equal(await p2.eval(`document.querySelector(".chat-off").textContent`), CHAT.vi.closed.replace("{email}", "support@aitranslator.io.vn"));
  assert.equal(await p2.eval(`document.querySelector(".chat-compose").hidden`), true);
  assert.deepEqual((await msgs(p2)).map((x) => x[1]), [CHAT.vi.greeting, m.text]);
  assert.deepEqual(realErrors(p2), []);
  await p2.close();
});

test("lỗi khi gửi: 429 thì 'Không gửi được, thử lại' và báo gửi quá nhanh, bấm thử lại gửi đúng nội dung; support_busy báo email; mất mạng báo kiểm tra mạng", { skip }, async () => {
  const { p, api } = await freshPage("/");
  await openChat(p);
  api.fail.push({ status: 429, error: "rate_limited", retryAfter: 20 });
  await type(p, "#chat-input", "Xin chào");
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "failed"`);
  assert.equal(await p.eval(`document.querySelector(".chat-msg.is-customer button.chat-state").textContent`), CHAT.vi.failed);
  assert.equal(await p.eval(`document.querySelector(".chat-note").textContent`), CHAT.vi.rate);
  await p.click(".chat-msg.is-customer button.chat-state");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  const posts = api.calls("POST", "/v1/support/messages");
  assert.deepEqual(posts.map((x) => x.body.text), ["Xin chào", "Xin chào"]);
  assert.equal(await p.eval(`document.querySelector(".chat-note").textContent`), "");
  api.fail.push({ status: 429, error: "support_busy", retryAfter: 60 });
  await type(p, "#chat-input", "Tin hai");
  await p.press("Enter");
  await until(p, `[...document.querySelectorAll('.chat-msg.is-customer')].at(-1).dataset.state === "failed"`);
  assert.equal(await p.eval(`document.querySelector(".chat-note").textContent`), CHAT.vi.busy.replace("{email}", "support@aitranslator.io.vn"));
  assert.equal(await p.eval(`document.querySelector(".chat-note a").getAttribute("href")`), "mailto:support@aitranslator.io.vn");
  api.fail.push("network");
  await type(p, "#chat-input", "Tin ba");
  await p.press("Enter");
  await until(p, `document.querySelector(".chat-note").textContent === ${JSON.stringify(CHAT.vi.network)}`);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("401 (cuộc chat đã hết hạn hay bị xóa): xóa bản lưu, về lời chào; tin kế tiếp mở cuộc chat mới", { skip }, async () => {
  const gone = randomBytes(32).toString("base64url");
  const { p, api } = await freshPage("/", { state: { token: gone, lastId: 5, waitingSince: null } });
  await openChat(p);
  await until(p, `localStorage.getItem("support.v1") === null`);
  assert.deepEqual(api.requests.slice(0, 1).map((r) => [r.method, r.path, r.auth]), [["GET", "/v1/support/messages?after=0", gone]]);
  assert.deepEqual(await msgs(p), [["owner", CHAT.vi.greeting, null]]);
  await type(p, "#chat-input", "Tin mới");
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  const [post] = api.calls("POST", "/v1/support/messages");
  assert.equal(post.auth, null, "phải mở cuộc chat mới (không gửi token cũ)");
  assert.notEqual((await saved(p)).token, gone);
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("localStorage không dùng được (chế độ riêng tư): chat vẫn chạy trong trang, tin sau dùng token trong bộ nhớ; tải lại là cuộc chat mới", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 900 });
  const api = await fakeApi(p);
  await p.s.send("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });` });
  await p.goto(base + "/");
  await openChat(p);
  for (const text of ["Một", "Hai"]) {
    await type(p, "#chat-input", text);
    await p.press("Enter");
    await until(p, `[...document.querySelectorAll('.chat-msg.is-customer')].at(-1)?.dataset.state === "sent"`);
  }
  const [a, b] = api.calls("POST", "/v1/support/messages");
  assert.equal(a.auth, null);
  assert.equal(b.auth, [...api.convs.keys()][0], "tin thứ hai phải dùng token giữ trong bộ nhớ");
  await p.goto(base + "/");
  await openChat(p);
  await type(p, "#chat-input", "Ba");
  await p.press("Enter");
  await until(p, `document.querySelector('.chat-msg.is-customer')?.dataset.state === "sent"`);
  assert.equal(api.calls("POST", "/v1/support/messages")[2].auth, null, "trang mới không còn token");
  assert.deepEqual(realErrors(p), []);
  await p.close();
});

test("điện thoại 375 px: khung chiếm toàn màn hình, trang phía sau ẩn, không tràn ngang; máy tính: khung nổi trên bong bóng; màu theo token sáng/tối", { skip }, async () => {
  for (const dark of [false, true]) {
    const { p } = await freshPage("/", { width: 375, height: 740, mobile: true, dark });
    await openChat(p);
    const r = await p.eval(`(() => {
      const panel = document.querySelector(".chat-panel").getBoundingClientRect();
      return { panel: [panel.left, panel.top, panel.width, panel.height], main: getComputedStyle(document.querySelector("main")).visibility, bubble: getComputedStyle(document.querySelector(".chat-bubble")).display, scroll: document.documentElement.scrollWidth - innerWidth, bg: getComputedStyle(document.querySelector(".chat-panel")).backgroundColor };
    })()`);
    assert.deepEqual(r, { panel: [0, 0, 375, 740], main: "hidden", bubble: "none", scroll: 0, bg: dark ? "rgb(17, 26, 45)" : "rgb(255, 255, 255)" }, dark ? "tối" : "sáng");
    await p.click("[data-close]");
    assert.equal(await p.eval(`getComputedStyle(document.querySelector("main")).visibility`), "visible");
    assert.deepEqual(realErrors(p), []);
    await p.close();
  }
  const { p } = await freshPage("/", { width: 1280, height: 800 });
  await openChat(p);
  const d = await p.eval(`(() => { const a = document.querySelector(".chat-panel").getBoundingClientRect(); const b = document.querySelector(".chat-bubble").getBoundingClientRect(); return { right: innerWidth - a.right, gap: Math.round(b.top - a.bottom), width: a.width, main: getComputedStyle(document.querySelector("main")).visibility }; })()`);
  assert.ok(d.gap >= 11 && d.gap <= 12, `khung phải nằm ngay trên bong bóng (cách ${d.gap}px; bong bóng nhích 1px khi chuột đang trỏ)`);
  assert.deepEqual({ ...d, gap: 0 }, { right: 16, gap: 0, width: 380, main: "visible" });
  await p.close();
});
