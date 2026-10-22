// Test đơn vị cho lõi chat hỗ trợ (src/assets/chat-core.js; spec 2026-10-22-chat-ho-tro-zalo §3, hợp đồng ở kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan): luật chữ, bản lưu support.v1, gọi API, mã lỗi, nhịp hỏi tin mới. Không cần trình duyệt:
// fetch, localStorage, đồng hồ và trạng thái tab đều là bản giả.
//   node --test test/chat-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore } from "../src/assets/chat-core.js";

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
