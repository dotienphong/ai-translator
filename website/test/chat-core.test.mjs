// Test đơn vị cho lõi chat hỗ trợ (src/assets/chat-core.js; spec 2026-10-22-chat-ho-tro-zalo §3, hợp đồng ở kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan): luật chữ, bản lưu support.v1, gọi API, mã lỗi, nhịp hỏi tin mới. Không cần trình duyệt:
// fetch, localStorage, đồng hồ và trạng thái tab đều là bản giả.
//   node --test test/chat-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { API, STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore, createApi, outcome } from "../src/assets/chat-core.js";

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
