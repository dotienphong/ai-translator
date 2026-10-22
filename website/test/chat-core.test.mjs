// Test đơn vị cho lõi chat hỗ trợ (src/assets/chat-core.js; spec 2026-10-22-chat-ho-tro-zalo §3, hợp đồng ở kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan): luật chữ, bản lưu support.v1, gọi API, mã lỗi, nhịp hỏi tin mới. Không cần trình duyệt:
// fetch, localStorage, đồng hồ và trạng thái tab đều là bản giả.
//   node --test test/chat-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API, STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore,
  createApi, outcome, createPoller, watchReply,
} from "../src/assets/chat-core.js";

const TOKEN = "A".repeat(40) + "b-_";

test("luật chữ như server: \\r\\n thành \\n, tab thành dấu cách, bỏ ký tự điều khiển, bỏ khoảng trắng hai đầu; đếm theo code point", () => {
  assert.equal(normalizeText("  a\r\nb\rc\td\u0000e\u0007\u001bf\u007f  "), "a\nb\nc def");
  assert.equal(normalizeText("\n\n xin chào \n"), "xin chào");
  assert.equal(charCount("👋🏻ab"), 4);
  assert.equal(charCount("Chào"), 4);
  assert.equal(validText("   \n\t "), null);
  assert.equal(validText(" hi "), "hi");
  assert.equal(validText("😀".repeat(MAX_CHARS)), "😀".repeat(MAX_CHARS), "1000 emoji là 1000 ký tự");
  assert.equal(validText("a".repeat(MAX_CHARS + 1)), null);
});

test("parseState: chỉ nhận { token 43 ký tự base64url, lastId ≥ 0, waitingSince số dương hay null }", () => {
  const ok = { token: TOKEN, lastId: 7, waitingSince: 1_800_000_000 };
  assert.deepEqual(parseState(JSON.stringify(ok)), ok);
  assert.deepEqual(parseState(JSON.stringify({ ...ok, waitingSince: null, extra: 1 })), { token: TOKEN, lastId: 7, waitingSince: null });
  for (const bad of [null, "", "{", "null", "[]", JSON.stringify({ ...ok, token: "ngắn" }), JSON.stringify({ ...ok, token: 5 }), JSON.stringify({ ...ok, lastId: -1 }), JSON.stringify({ ...ok, lastId: 1.5 }), JSON.stringify({ ...ok, waitingSince: "1" }), JSON.stringify({ ...ok, waitingSince: 0 })]) {
    assert.equal(parseState(bad), null, String(bad));
  }
});

test("isWaiting: tin cuối là của khách và gửi trong 24 giờ qua", () => {
  const now = 1_800_000_000;
  assert.equal(isWaiting({ token: TOKEN, lastId: 0, waitingSince: now - 10 }, now), true);
  assert.equal(isWaiting({ token: TOKEN, lastId: 0, waitingSince: now - WAIT_WINDOW + 1 }, now), true);
  assert.equal(isWaiting({ token: TOKEN, lastId: 0, waitingSince: now - WAIT_WINDOW }, now), false);
  assert.equal(isWaiting({ token: TOKEN, lastId: 0, waitingSince: null }, now), false);
  assert.equal(isWaiting(null, now), false);
});

/** localStorage giả: Map, có thể bắt đọc hay ghi ném lỗi như chế độ riêng tư. */
function fakeStorage({ throwOnGet = false, throwOnSet = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => {
      if (throwOnGet) throw new Error("SecurityError");
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => {
      if (throwOnSet) throw new Error("QuotaExceededError");
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

test("createStore: ghi và đọc support.v1 dạng JSON; clear xóa khóa", () => {
  const s = fakeStorage();
  const store = createStore(() => s);
  assert.equal(store.load(), null);
  const st = { token: TOKEN, lastId: 3, waitingSince: null };
  store.save(st);
  assert.deepEqual(JSON.parse(s.map.get(STORE_KEY)), st);
  assert.deepEqual(createStore(() => s).load(), st, "trang khác (store khác) đọc lại được");
  store.clear();
  assert.equal(s.map.has(STORE_KEY), false);
  assert.equal(store.load(), null);
});

test("createStore: không có localStorage (truy cập ném lỗi, hay ghi ném lỗi như Safari riêng tư): cuộc chat chỉ sống trong trang hiện tại", () => {
  const st = { token: TOKEN, lastId: 1, waitingSince: 1_800_000_000 };
  for (const [name, get] of [
    ["truy cập localStorage ném lỗi", () => { throw new Error("SecurityError"); }],
    ["getItem ném lỗi", () => fakeStorage({ throwOnGet: true })],
    ["setItem ném lỗi", () => fakeStorage({ throwOnSet: true })],
  ]) {
    const store = createStore(get);
    assert.equal(store.load(), null, name);
    store.save(st);
    assert.deepEqual(store.load(), st, `${name}: vẫn đọc lại được trong trang`);
    assert.equal(createStore(get).load(), null, `${name}: trang khác không thấy`);
    store.clear();
    assert.equal(store.load(), null, name);
  }
});

/** fetch giả: ghi lại request, trả lần lượt các phản hồi trong `replies` (`"network"` thì ném lỗi như mất mạng). */
function fakeFetch(replies) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, headers: { ...init.headers }, body: init.body === undefined ? undefined : JSON.parse(init.body), credentials: init.credentials });
    const r = replies.shift() ?? { status: 200, body: {} };
    if (r === "network") throw new TypeError("Failed to fetch");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h) => (h.toLowerCase() === "retry-after" && r.retryAfter !== undefined ? String(r.retryAfter) : null) },
      json: async () => {
        if (r.raw !== undefined) return JSON.parse(r.raw);
        return r.body;
      },
    };
  };
  return { fn, calls };
}

test("createApi: đúng đường dẫn, phương thức, header và thân của hợp đồng; chỉ gọi api.aitranslator.io.vn", async () => {
  const { fn, calls } = fakeFetch([
    { status: 200, body: { enabled: true } },
    { status: 201, body: { token: TOKEN, message: { id: 5, sender: "customer", text: "hi", created_at: 1 } } },
    { status: 201, body: { message: { id: 6, sender: "customer", text: "again", created_at: 2 } } },
    { status: 200, body: { enabled: true, status: "open", messages: [] } },
    { status: 200, body: { ok: true } },
    { status: 200, body: { ok: true } },
  ]);
  const api = createApi(fn);
  assert.deepEqual(await api.status(), { ok: true, status: 200, data: { enabled: true } });
  const first = await api.send(null, "hi", { lang: "ja", source: "web", page: "/ja/pricing/" });
  assert.equal(first.data.token, TOKEN);
  await api.send(TOKEN, "again", { lang: "ja", source: "web", page: "/ja/" });
  await api.messages(TOKEN, 6);
  await api.setEmail(TOKEN, "a@b.vn");
  await api.remove(TOKEN);
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const json = { "Content-Type": "application/json" };
  assert.deepEqual(calls, [
    { url: `${API}/v1/support/status`, method: "GET", headers: {}, body: undefined, credentials: "omit" },
    { url: `${API}/v1/support/messages`, method: "POST", headers: json, body: { text: "hi", lang: "ja", source: "web", page: "/ja/pricing/" }, credentials: "omit" },
    { url: `${API}/v1/support/messages`, method: "POST", headers: { ...auth, ...json }, body: { text: "again" }, credentials: "omit" },
    { url: `${API}/v1/support/messages?after=6`, method: "GET", headers: auth, body: undefined, credentials: "omit" },
    { url: `${API}/v1/support/email`, method: "PUT", headers: { ...auth, ...json }, body: { email: "a@b.vn" }, credentials: "omit" },
    { url: `${API}/v1/support/conversation`, method: "DELETE", headers: { ...auth, ...json }, body: {}, credentials: "omit" },
  ]);
  assert.equal(API, "https://api.aitranslator.io.vn");
});

test("createApi: lỗi không ném; đọc mã lỗi, Retry-After; mất mạng là status 0; thân không phải JSON vẫn có mã", async () => {
  const { fn } = fakeFetch([
    { status: 429, body: { error: "rate_limited" }, retryAfter: 30 },
    "network",
    { status: 502, raw: "<html>Bad gateway</html>" },
    { status: 400, body: { error: "invalid_request", field: "text" } },
  ]);
  const api = createApi(fn);
  assert.deepEqual(await api.send(TOKEN, "x"), { ok: false, status: 429, error: "rate_limited", retryAfter: 30 });
  assert.deepEqual(await api.messages(TOKEN, 0), { ok: false, status: 0, error: "network", retryAfter: null });
  assert.deepEqual(await api.status(), { ok: false, status: 502, error: "http_502", retryAfter: null });
  assert.deepEqual(await api.setEmail(TOKEN, "x"), { ok: false, status: 400, error: "invalid_request", retryAfter: null });
});

test("outcome: bảng mã lỗi của hợp đồng", () => {
  const cases = [
    [{ ok: true, status: 200 }, "ok"],
    [{ ok: false, status: 401, error: "invalid_token" }, "reset"],
    [{ ok: false, status: 403, error: "conversation_closed" }, "closed"],
    [{ ok: false, status: 503, error: "support_disabled" }, "disabled"],
    [{ ok: false, status: 429, error: "support_busy" }, "busy"],
    [{ ok: false, status: 429, error: "rate_limited" }, "rate"],
    [{ ok: false, status: 429, error: "http_429" }, "rate"],
    [{ ok: false, status: 0, error: "network" }, "network"],
    [{ ok: false, status: 502, error: "http_502" }, "network"],
    [{ ok: false, status: 503, error: "http_503" }, "network"],
    [{ ok: false, status: 400, error: "invalid_request" }, "invalid"],
    [{ ok: false, status: 413, error: "invalid_request" }, "invalid"],
    [{ ok: false, status: 415, error: "unsupported_media_type" }, "invalid"],
  ];
  for (const [r, want] of cases) assert.equal(outcome(r), want, JSON.stringify(r));
});

/** Đồng hồ, hẹn giờ và trạng thái tab giả. `fire()` chạy hẹn giờ đang chờ (đẩy đồng hồ tới lúc hẹn) và đợi lần hỏi xong. */
function fakeEnv({ visible = true } = {}) {
  const env = {
    t: 1_800_000_000_000,
    timers: [],
    vis: visible,
    listeners: new Set(),
    now: () => env.t,
    setTimer: (fn, ms) => {
      const id = Symbol("timer");
      env.timers.push({ id, fn, ms, at: env.t + ms });
      return id;
    },
    clearTimer: (id) => {
      env.timers = env.timers.filter((x) => x.id !== id);
    },
    visible: () => env.vis,
    onVisibility: (fn) => {
      env.listeners.add(fn);
      return () => env.listeners.delete(fn);
    },
    setVisible(v) {
      env.vis = v;
      for (const fn of env.listeners) fn();
    },
    /** Số ms của hẹn giờ đang chờ (đúng một hẹn giờ), hay null khi không có. */
    next() {
      assert.ok(env.timers.length <= 1, `có ${env.timers.length} hẹn giờ cùng lúc`);
      return env.timers[0]?.ms ?? null;
    },
    async fire() {
      const x = env.timers.shift();
      assert.ok(x, "không có hẹn giờ nào");
      env.t = x.at;
      await x.fn();
      return x.ms;
    },
  };
  return env;
}
const OK = { ok: true, status: 200, data: {} };

test("poller khung mở: hỏi ngay, rồi 3 giây; 2 phút liền không có tin mới thì 15 giây; có tin mới hay khách gửi tin thì về 3 giây", async () => {
  const env = fakeEnv();
  const replies = [];
  let calls = 0;
  const poller = createPoller({ mode: "open", env, tick: async () => { calls++; return { result: OK, fresh: replies.shift() ?? 0 }; } });
  poller.start();
  assert.equal(env.next(), 0, "mở khung thì hỏi ngay");
  await env.fire();
  assert.equal(env.next(), 3_000);
  for (let i = 0; i < 39; i++) await env.fire(); // 39 lần × 3 giây = 117 giây không có tin mới
  assert.equal(env.next(), 3_000);
  await env.fire(); // 120 giây
  assert.equal(env.next(), 15_000, "sau 2 phút không có tin mới");
  replies.push(1);
  await env.fire();
  assert.equal(env.next(), 3_000, "có tin mới của chủ dự án thì về 3 giây");
  for (let i = 0; i < 40; i++) await env.fire();
  assert.equal(env.next(), 15_000);
  env.t += 5_000;
  poller.bump();
  assert.equal(env.next(), 0, "khách gửi tin: lần hỏi 3 giây đã quá hạn nên hỏi ngay");
  await env.fire();
  assert.equal(env.next(), 3_000);
  poller.stop();
  assert.equal(env.next(), null);
  assert.equal(calls, 83);
});

test("poller: 429 chờ đúng Retry-After (tối thiểu 15 giây); lỗi mạng giãn 3 → 15 → 60 giây rồi về nhịp thường khi thông", async () => {
  const env = fakeEnv();
  const results = [
    { ok: false, status: 429, error: "rate_limited", retryAfter: 40 },
    { ok: false, status: 429, error: "support_busy", retryAfter: 2 },
    { ok: false, status: 429, error: "rate_limited", retryAfter: null },
    { ok: false, status: 0, error: "network" },
    { ok: false, status: 0, error: "network" },
    { ok: false, status: 502, error: "http_502" },
    { ok: false, status: 0, error: "network" },
    OK,
  ];
  const poller = createPoller({ mode: "open", env, tick: async () => ({ result: results.shift(), fresh: 0 }) });
  poller.start();
  await env.fire();
  assert.equal(env.next(), 40_000);
  await env.fire();
  assert.equal(env.next(), 15_000, "Retry-After 2 giây thì vẫn chờ 15 giây");
  await env.fire();
  assert.equal(env.next(), 15_000, "429 không có Retry-After: 15 giây");
  const waits = [];
  for (let i = 0; i < 4; i++) {
    await env.fire();
    waits.push(env.next());
  }
  assert.deepEqual(waits, [3_000, 15_000, 60_000, 60_000]);
  await env.fire();
  assert.equal(env.next(), 15_000, "thông mạng thì về nhịp thường (đã hơn 2 phút không có tin mới nên là 15 giây)");
  poller.report({ ok: false, status: 429, error: "rate_limited", retryAfter: 90 });
  assert.equal(env.next(), 90_000, "429 khi gửi tin cũng giãn nhịp hỏi");
  poller.stop();
});

test("poller khung đóng (watch): 60 giây; lỗi mạng không làm nhanh hơn 60 giây; start({ immediate: false }) chờ một nhịp", async () => {
  const env = fakeEnv();
  const results = [OK, { ok: false, status: 0, error: "network" }, OK];
  const poller = createPoller({ mode: "watch", env, tick: async () => ({ result: results.shift(), fresh: 0 }) });
  poller.start();
  assert.equal(env.next(), 0, "tải trang thì hỏi một lần ngay");
  await env.fire();
  assert.equal(env.next(), 60_000);
  await env.fire();
  assert.equal(env.next(), 60_000, "lỗi mạng: 3 giây nhưng không dưới nhịp nền 60 giây");
  poller.stop();
  const later = createPoller({ mode: "watch", env, tick: async () => ({ result: OK, fresh: 0 }) });
  later.start({ immediate: false });
  assert.equal(env.next(), 60_000);
  later.stop();
});

test("poller: tab ẩn thì không hẹn giờ, không gọi mạng; hiện lại thì hỏi khi tới hạn", async () => {
  const env = fakeEnv({ visible: false });
  let calls = 0;
  const poller = createPoller({ mode: "open", env, tick: async () => { calls++; return { result: OK, fresh: 0 }; } });
  poller.start();
  assert.equal(env.next(), null, "tab ẩn lúc mở: chưa hỏi");
  env.setVisible(true);
  assert.equal(env.next(), 0);
  await env.fire();
  assert.equal(calls, 1);
  env.t += 1_000;
  env.setVisible(false);
  assert.equal(env.next(), null, "ẩn tab: hủy hẹn giờ");
  env.t += 500;
  env.setVisible(true);
  assert.equal(env.next(), 1_500, "hiện lại: còn 1,5 giây tới hạn 3 giây");
  env.t += 60_000;
  env.setVisible(false);
  env.setVisible(true);
  assert.equal(env.next(), 0, "hạn đã qua: hỏi ngay");
  poller.stop();
  assert.equal(env.listeners.size, 0, "dừng thì gỡ nghe visibilitychange");
});

/** Môi trường cho watchReply: env giả cộng API và bản lưu giả. */
function watchEnv(state, replies) {
  const env = fakeEnv();
  const s = fakeStorage();
  if (state) s.setItem(STORE_KEY, JSON.stringify(state));
  const { fn, calls } = fakeFetch(replies);
  return Object.assign(env, { api: createApi(fn), store: createStore(() => s), calls, storage: s });
}

test("watchReply: không đang chờ thì không làm gì; đang chờ thì hỏi ?after=lastId, thấy trả lời thì chấm đỏ một lần và dừng", async () => {
  const nowSec = 1_800_000_000;
  assert.equal(watchReply({ onReply: () => assert.fail(), env: watchEnv(null, []) }), null);
  assert.equal(watchReply({ onReply: () => assert.fail(), env: watchEnv({ token: TOKEN, lastId: 4, waitingSince: null }, []) }), null);
  assert.equal(watchReply({ onReply: () => assert.fail(), env: watchEnv({ token: TOKEN, lastId: 4, waitingSince: nowSec - WAIT_WINDOW - 5 }, []) }), null, "quá 24 giờ");

  const env = watchEnv({ token: TOKEN, lastId: 4, waitingSince: nowSec - 30 }, [
    { status: 200, body: { enabled: true, status: "open", messages: [{ id: 5, sender: "customer", text: "còn đó không?", created_at: nowSec }] } },
    { status: 200, body: { enabled: true, status: "open", messages: [{ id: 5, sender: "customer", text: "còn đó không?", created_at: nowSec }, { id: 9, sender: "owner", text: "Có", created_at: nowSec + 60 }] } },
  ]);
  let replied = 0;
  const poller = watchReply({ onReply: () => replied++, env });
  assert.equal(env.next(), 0);
  await env.fire();
  assert.equal(replied, 0, "chỉ có tin của khách");
  assert.equal(env.next(), 60_000);
  await env.fire();
  assert.equal(replied, 1);
  assert.equal(poller.running, false);
  assert.equal(env.next(), null);
  assert.deepEqual(env.calls.map((c) => c.url), [`${API}/v1/support/messages?after=4`, `${API}/v1/support/messages?after=4`]);
  assert.equal(env.store.load().lastId, 4, "lastId chỉ tiến khi khách mở khung, để trang sau vẫn hiện chấm đỏ");
});

test("watchReply: 401 thì xóa bản lưu và dừng", async () => {
  const env = watchEnv({ token: TOKEN, lastId: 0, waitingSince: 1_800_000_000 - 30 }, [{ status: 401, body: { error: "invalid_token" } }]);
  const poller = watchReply({ onReply: () => assert.fail(), env });
  await env.fire();
  assert.equal(poller.running, false);
  assert.equal(env.store.load(), null);
  assert.equal(env.storage.map.has(STORE_KEY), false);
});
