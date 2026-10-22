# Chat hỗ trợ 02: website — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi trang của website (vi, en, ja, zh, ko, cả trang 404) có bong bóng chat nổi ở góc dưới phải; bấm thì mở khung chat gửi tin tới `https://api.aitranslator.io.vn/v1/support/*` và hiện câu trả lời của chủ dự án, đúng hợp đồng API và hợp đồng phía khách của kế hoạch 00; không thêm thư viện, CSP chỉ mở `connect-src` cho đúng API đó.

**Architecture:** Lõi không đụng DOM `website/src/assets/chat-core.js` giữ mọi luật của hợp đồng (luật chữ, bản lưu `support.v1`, gọi API, bảng mã lỗi, vòng hỏi tin theo nhịp 3/15/60 giây, chỉ hỏi khi tab đang hiện) và được test bằng `node:test` với đồng hồ, `fetch`, `localStorage` giả. `site.js` (bundle có sẵn) chèn bong bóng và đọc đường dẫn đã băm của các file chat từ thuộc tính `data-chat-*` của chính thẻ `<script>` của nó (do `layout.mjs` sinh), nên không có script nội tuyến mới và `script-src` giữ nguyên; khi khách đang chờ trả lời, `site.js` nạp động lõi để hỏi mỗi 60 giây và hiện chấm đỏ. Khung chat là ES module `chat.js` cộng `chat.css`, chỉ nạp khi bấm; `build.mjs` băm từng file và đổi hai dòng `import` của `chat.js` sang tên đã băm.

**Tech Stack:** JS và CSS thuần (ES module, không framework, không thư viện mới), Node 24 (`node:test`), Chrome không đầu qua `website/tools/browser/cdp.mjs` (Fetch domain của Chrome DevTools Protocol làm API giả, kể cả preflight CORS).

**Spec:** `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md` (mục 3; phần Website của mục 1 và mục 6). Đọc mục 3 trước khi làm. **Hợp đồng:** `2026-10-22-chat-ho-tro-00-tong-quan.md`

---

## Quy ước cho người thực thi

- Làm **thẳng trên nhánh `main`** trong `/Users/dtphong/Desktop/software_business/ai-translator`, không worktree. Shell của Claude Code về lại thư mục khác sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`** (hay `cd /Users/dtphong/Desktop/software_business/ai-translator/website &&`).
- Trước mỗi commit, lệnh commit tự kiểm `test "$(git branch --show-current)" = main`; ra khác `main` thì dừng. Thư mục này có thể có phiên khác cùng làm: chỉ `git add` đúng các file của task, không `git add -A`, không đụng file lạ (ví dụ các kế hoạch `docs/superpowers/plans/2026-10-22-chat-ho-tro-*.md` chưa commit).
- **Không push, không deploy (`pnpm deploy`), không phát hành.** Website deploy sau khi app 0.2.4 lên R2 (spec mục 7), do chủ dự án quyết.
- **Không thêm thư viện.** Không đổi `website/package.json`, `website/pnpm-lock.yaml`.
- **Không đổi hợp đồng** (đường dẫn, thân JSON, mã lỗi, nhịp hỏi, khóa `support.v1`, lời chào, dòng phụ, chân khung). Thấy hợp đồng sai thì dừng và báo.
- **Không sửa** trang Liên hệ, Dữ liệu và bảo mật, chính sách (`website/src/content/`, `docs/legal/`): đó là kế hoạch 04.
- **Không nhắc Zalo** ở bất cứ file nào trong `website/src/assets/` (mã gửi xuống trình duyệt, ai cũng đọc được), kể cả trong chú thích: dẫn spec bằng chữ "spec chat hỗ trợ 2026-10-22", không dẫn tên file spec. Test ở Task 4 chặn.
- Chỉ gọi `https://api.aitranslator.io.vn`. Không thêm biến môi trường, thuộc tính hay cách nào ghi đè URL (CLAUDE.md).
- Chú thích trong mã viết tiếng Việt, theo giọng các file kế bên.

## Cách đọc các bước

- **Tạo tệp mới:** dòng "Tạo" + đường dẫn + "với nội dung:", rồi một khối mã. Tạo bằng công cụ Write với đúng nội dung khối (thêm một dấu xuống dòng ở cuối).
- **Thêm vào cuối tệp:** khối `bash` dạng `cd … && cat >> <tệp> <<'EOF'`. Chạy nguyên khối: heredoc có nháy đơn nên `$` và dấu backtick giữ nguyên; dòng trống đầu tiên trong heredoc là cố ý (cách nội dung cũ một dòng).
- **Sửa tệp có sẵn:** dòng "Tệp:" + đường dẫn, rồi các cặp khối `old` và `new`. Sửa bằng công cụ Edit: `old_string` là nội dung khối `old`, `new_string` là nội dung khối `new`, làm lần lượt từ trên xuống. Mỗi khối `old` phải khớp **đúng một lần** trong tệp ngay trước khi sửa (kể cả số dấu cách đầu dòng); không khớp hay khớp nhiều lần thì dừng và báo, đừng đoán.

## Quyết định của kế hoạch này (spec và hợp đồng chưa nói)

1. **Truyền đường dẫn đã băm cho `site.js` qua thuộc tính `data-chat-*`** của thẻ `<script src="/assets/bundle/site.<băm>.js" defer>`: `data-chat-core`, `data-chat-ui`, `data-chat-css`, `data-chat-lang`, `data-chat-label` (nhãn bong bóng), `data-chat-unread`. Không thêm script nội tuyến, nên CSP chỉ có băm của script khởi tạo giao diện như cũ.
2. **Lõi `chat-core.js` được `site.js` nạp khi khách đang chờ trả lời** (tin cuối là của khách, trong 24 giờ), không chỉ khi bấm: hợp đồng yêu cầu hỏi tin mới mỗi 60 giây và hiện chấm đỏ cả khi khung đóng, và như vậy khung mở hay đóng dùng chung một mã nhịp hỏi, xử lý 429, lỗi mạng. Khung chat (`chat.js`, `chat.css`) vẫn **chỉ** tải khi bấm. Khách chưa từng chat, hay không đang chờ, không tải thêm gì và không gọi mạng.
3. **`lastId` chỉ tiến khi khung đang mở** (khách đã thấy tin). Khung đóng mà thấy tin chủ dự án mới thì hiện chấm đỏ và thôi hỏi, không ghi gì: trang sau hỏi lại một lần lúc tải và vẫn hiện chấm đỏ cho tới khi khách mở khung. `waitingSince` là `created_at` (giờ máy chủ) của tin khách cuối; về `null` khi khung mở và tin cuối là của chủ dự án.
4. **Thẻ email chỉ hiện ngay sau tin đầu của một cuộc chat mới** (trong trang đó), cho tới khi khách lưu hay bấm "Bỏ qua". Bản lưu chỉ có ba khóa của hợp đồng nên không nhớ việc khách đã lưu hay bỏ qua; mở lại cuộc chat cũ ở trang khác thì không hiện lại thẻ (spec không có chỗ đổi email sau).
5. **Chưa có cuộc chat:** mở khung chỉ gọi `GET /v1/support/status` một lần (biết chat bật hay tắt), không hỏi tin định kỳ.
6. **Tin gửi lần lượt** (hàng đợi): tin thứ hai đợi tin đầu có token, nên không tạo hai cuộc chat.
7. **Enter của bộ gõ không gửi** (`isComposing` hay `keyCode` 229: tiếng Nhật, Trung, Hàn, Telex), chỉ chốt chữ.
8. **Chi tiết nhịp:** tab hiện lại thì hỏi khi tới hạn (hạn đã qua thì hỏi ngay); lỗi mạng giãn theo số lần lỗi liền (lần 1: 3 giây, lần 2: 15 giây, từ lần 3: 60 giây) nhưng không nhanh hơn nhịp nền; 429 khi gửi tin hay lưu email cũng giãn nhịp hỏi. Mã 5xx (trừ `503 support_disabled`) coi như lỗi mạng.
9. **Bộ đếm ký tự** hiện từ 900, đếm theo code point như server; quá 1000 thì nút gửi tắt, ô nhập `aria-invalid`, có dòng báo.
10. **Điện thoại là màn hình ≤ 640px** (cùng mốc với nút phát video): khung chiếm toàn màn hình, phần còn lại của trang `visibility: hidden` (tiêu điểm không lọt ra phía sau), bong bóng ẩn. Màn hình cảm ứng: mở khung thì tiêu điểm vào nút Đóng, không vào ô nhập (tránh bàn phím ảo che khung).
11. **Token màu mới `--danger`** (sáng `#c4312b`, tối `#ff7b72`) cho chấm đỏ, tin lỗi, nút Xóa.
12. **Chữ ở file riêng `website/src/assets/chat-strings.js`** (spec cho phép), vì cả khung chat trên trình duyệt và `layout.mjs` (nhãn bong bóng lúc dựng) cùng nhập.
13. **README có ngay ngoại lệ "không `pnpm deploy`" của đợt chat** (Task 8): bong bóng gọi `/v1/support/*` vào `main` trước khi server có các đường đó. Kế hoạch 04 thấy cụm này thì không thêm lần nữa.
14. **Liên kết "Quyền riêng tư" của ja/zh/ko** trỏ `/en/privacy/` kèm `hreflang="en"`; chữ liên kết có nhãn ngôn ngữ ở cuối như chân trang của website ("プライバシー（英語）", "隐私（英文）", "개인정보(영어)"), và chân khung ja viết "90 日間" có khoảng trắng (hợp đồng đã ghi theo quy tắc dịch của website, chốt 2026-10-22).

## Cấu trúc file

| File | Việc |
|---|---|
| `website/src/assets/chat-core.js` (mới) | Lõi không DOM: hằng số của hợp đồng, `normalizeText`, `charCount`, `validText`, `parseState`, `isWaiting`, `createStore`, `createApi`, `outcome`, `createPoller`, `watchReply`, `browserEnv` |
| `website/src/assets/chat-strings.js` (mới) | `CHAT[lang]` chữ năm ngôn ngữ của bong bóng và khung chat, `SUPPORT_EMAIL` |
| `website/src/assets/chat.js` (mới) | Khung chat (ES module tải khi bấm): `openChat`, `closeChat`, `isOpen`; gửi tin, trạng thái tin, thẻ email, menu ⋯ xóa, chế độ tắt và đóng |
| `website/src/assets/chat.css` (mới) | Giao diện khung theo token sáng/tối; toàn màn hình trên điện thoại |
| `website/src/assets/site.js` | Chèn bong bóng; tải khung khi bấm; `watchReply` khi đang chờ trả lời; chấm đỏ |
| `website/src/assets/site.css` | Token `--danger`; CSS bong bóng |
| `website/src/build/build.mjs` | `chatAssets()` băm các file chat (đổi `import` của `chat.js`); CSP `connect-src 'self' https://api.aitranslator.io.vn` |
| `website/src/build/layout.mjs` | `chatAttrs()`: thuộc tính `data-chat-*` trên thẻ script `site.js` |
| `website/test/chat-core.test.mjs` (mới) | 14 test đơn vị của lõi |
| `website/test/chat-strings.test.mjs` (mới) | 5 test: đủ năm ngôn ngữ, câu của hợp đồng, liên kết chính sách, không nhắc Zalo |
| `website/test/chat-widget.test.mjs` (mới) | 16 test trình duyệt với API giả |
| `website/test/site.test.mjs` | Thêm 4 test: CSP, `data-chat-*`, không tải sẵn file chat, `chat.js` nhập đúng file đã băm |
| `website/README.md` | Mục "Chat hỗ trợ (bong bóng)" |

## Mốc số test (`pnpm test` trong `website/`)

Đo ngày 2026-10-22 trên `main` (commit `01c2077a`), máy có Google Chrome, không có PowerShell 7 (hai test của `install.ps1` bị bỏ qua).

| Sau task | `ℹ tests` | `ℹ pass` | `ℹ fail` | `ℹ skipped` |
|---|---|---|---|---|
| 0 (mốc) | 152 | 150 | 0 | 2 |
| 1 | 157 | 155 | 0 | 2 |
| 2 | 160 | 158 | 0 | 2 |
| 3 | 166 | 164 | 0 | 2 |
| 4 | 171 | 169 | 0 | 2 |
| 5 | 174 | 172 | 0 | 2 |
| 6 | 178 | 176 | 0 | 2 |
| 7 | 191 | 189 | 0 | 2 |
| 8, 9 | 191 | 189 | 0 | 2 |

Không có Chrome thì mọi test trình duyệt (cả các test có từ trước) bị bỏ qua: `skipped` tăng, `pass` giảm tương ứng; báo người giao việc, vì Task 6 và 7 chỉ kiểm được thật khi có Chrome. Có PowerShell 7 thì `skipped` là 0 và `pass` cộng 2.

**Test có sẵn hay chập chờn khi cả bộ chạy song song:** `test/video-facade.test.mjs` ("máy tính: nút lớn thay thanh điều khiển…") đôi khi đỏ khi máy bận (đo: 1 lần trong 8 lần chạy cả bộ sau khi thêm test chat; chạy riêng luôn đạt). Gặp thì chạy lại riêng `node --test test/video-facade.test.mjs`; đạt thì ghi lại và đi tiếp, đỏ lại thì dừng và báo.

---

### Task 0: Mốc xuất phát

**Files:** không sửa file nào.

- [ ] **Step 1: Kiểm nhánh, trạng thái và Node**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && node -v && ls website/src/assets
```
Expected: `main`; `git status` không có file nào trong `website/` (có thể có các file kế hoạch `docs/superpowers/plans/…` của phiên khác: để nguyên); Node `v24.x` (≥ 24.21); `website/src/assets` chỉ có `fonts img og site.css site.js video` (chưa có file `chat-*`).

- [ ] **Step 2: Kiểm có Chrome cho test trình duyệt**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```
Expected: in ra đúng đường dẫn đó. Không có thì đặt `CHROME=<đường dẫn Chrome hay Chromium>` cho mọi lệnh test, hay báo người giao việc.

- [ ] **Step 3: Chạy toàn bộ test website**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 152`, `ℹ pass 150`, `ℹ fail 0`, `ℹ skipped 2` (mất khoảng một phút). Có `fail` trước khi sửa gì thì ghi tên test, dừng và báo; không sửa ở kế hoạch này.

- [ ] **Step 4: Kiểm các chỗ kế hoạch sẽ sửa còn nguyên như lúc viết kế hoạch**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && grep -cF "\"connect-src 'self'\"," src/build/build.mjs && grep -cF '<script src="${ctx.assets.js}" defer></script>' src/build/layout.mjs && grep -cx "  // Hiện dần khi cuộn tới" src/assets/site.js && grep -cx "  --ok: #0c7a4b;" src/assets/site.css && grep -ci zalo src/assets/site.js src/assets/site.css
```
Expected: bốn dòng `1`, rồi `src/assets/site.js:0` và `src/assets/site.css:0` (lệnh `grep` cuối thoát mã 1 vì không khớp: đúng như mong đợi). Số khác thì có người đã sửa các file này sau ngày viết kế hoạch: đối chiếu từng khối `old` của các task với file hiện tại trước khi làm.

---

### Task 1: Lõi chat: luật chữ, bản lưu `support.v1`

**Files:**
- Create: `website/src/assets/chat-core.js`
- Test: `website/test/chat-core.test.mjs`

Lõi là ES module (`website/package.json` có `"type": "module"`, nên Node nhập được file `.js`), không đụng `document` hay `window` lúc nạp, nên test chạy thẳng bằng `node:test`. Phần này gồm mọi hằng số của hợp đồng (dùng ở Task 2, 3) và các hàm chữ, bản lưu.

- [ ] **Step 1: Viết test hỏng**

Tạo `website/test/chat-core.test.mjs` với nội dung:

```js
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
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-core.test.mjs 2>&1 | grep -E "ERR_MODULE_NOT_FOUND|ℹ (tests|pass|fail)"
```
Expected: dòng `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/website/src/assets/chat-core.js' imported from …/website/test/chat-core.test.mjs`, rồi `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Viết phần đầu của lõi**

Tạo `website/src/assets/chat-core.js` với nội dung:

```js
// Lõi chat hỗ trợ của website (spec chat hỗ trợ ngày 2026-10-22, mục 3; hợp đồng API và hợp đồng phía khách: kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan). Không đụng DOM: khung chat (chat.js) và site.js (hỏi tin khi khung đóng, chấm đỏ) cùng
// dùng; test đơn vị ở test/chat-core.test.mjs. Chỉ gọi đúng máy chủ production, không có cách ghi đè URL (CLAUDE.md).

export const API = "https://api.aitranslator.io.vn";
export const STORE_KEY = "support.v1";
export const MAX_CHARS = 1000;
/** Hiện bộ đếm ký tự từ mức này (spec: "đếm ký tự khi gần 1000"). */
export const COUNT_FROM = 900;
/** Đang chờ trả lời: tin cuối là của khách và gửi trong 24 giờ qua (giây). */
export const WAIT_WINDOW = 24 * 60 * 60;
/** Nhịp hỏi tin mới (ms): khung mở 3 giây, 2 phút liền không có tin mới thì 15 giây; khung đóng mà đang chờ trả lời 60 giây. */
export const FAST = 3_000;
export const SLOW = 15_000;
export const IDLE_AFTER = 120_000;
export const WATCH = 60_000;
/** Nhận 429: chờ Retry-After nhưng không dưới 15 giây. Lỗi mạng: giãn dần 3 → 15 → 60 giây. */
export const MIN_RETRY = 15_000;
export const NET_BACKOFF = [3_000, 15_000, 60_000];

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Chữ khách gõ theo luật của server: \r\n và \r thành \n, tab thành dấu cách, bỏ ký tự điều khiển khác, bỏ khoảng trắng hai đầu. */
export function normalizeText(s) {
  return String(s).replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[^\P{Cc}\n]/gu, "").trim();
}

/** Số ký tự theo code point (emoji tính 1), như server đếm. */
export const charCount = (s) => Array.from(s).length;

/** Chữ hợp lệ để gửi (1–1000 ký tự sau khi chuẩn hóa), hay null. */
export function validText(s) {
  const t = normalizeText(s);
  const n = charCount(t);
  return n >= 1 && n <= MAX_CHARS ? t : null;
}

/** Đọc bản lưu `{ token, lastId, waitingSince }` (chuỗi JSON); sai dạng thì null. */
export function parseState(raw) {
  if (typeof raw !== "string") return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || typeof v.token !== "string" || !TOKEN.test(v.token)) return null;
  if (!Number.isSafeInteger(v.lastId) || v.lastId < 0) return null;
  if (v.waitingSince !== null && !(Number.isSafeInteger(v.waitingSince) && v.waitingSince > 0)) return null;
  return { token: v.token, lastId: v.lastId, waitingSince: v.waitingSince };
}

/** Đang chờ trả lời (khung đóng thì hỏi mỗi 60 giây): có cuộc chat, tin cuối là của khách, gửi trong 24 giờ qua. */
export const isWaiting = (state, nowSec) => Boolean(state && state.waitingSince !== null && nowSec - state.waitingSince < WAIT_WINDOW);

/**
 * Bản lưu trên trình duyệt (`localStorage`, khóa `support.v1`). Trình duyệt không cho đọc hay ghi (chế độ riêng tư, chặn dữ
 * liệu trang) thì giữ trong bộ nhớ: cuộc chat chỉ sống trong trang hiện tại. `getStorage` được gọi lại mỗi lần (truy cập
 * `localStorage` cũng có thể ném lỗi).
 */
export function createStore(getStorage) {
  let memory = null;
  let persistent = true;
  const storage = () => {
    if (!persistent) return null;
    try {
      return getStorage() ?? null;
    } catch {
      persistent = false;
      return null;
    }
  };
  return {
    load() {
      const s = storage();
      if (s) {
        try {
          memory = parseState(s.getItem(STORE_KEY));
        } catch {
          persistent = false;
        }
      }
      return memory;
    },
    save(state) {
      memory = state;
      const s = storage();
      if (!s) return;
      try {
        s.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        persistent = false;
      }
    },
    clear() {
      memory = null;
      const s = storage();
      if (!s) return;
      try {
        s.removeItem(STORE_KEY);
      } catch {
        persistent = false;
      }
    },
  };
}
```

- [ ] **Step 4: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-core.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 5`, `ℹ pass 5`, `ℹ fail 0`.

- [ ] **Step 5: Cả bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 157`, `ℹ pass 155`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/assets/chat-core.js website/test/chat-core.test.mjs && git commit -q -m "feat(website): lõi chat hỗ trợ: luật chữ và bản lưu support.v1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: Lõi chat: gọi API và bảng mã lỗi

**Files:**
- Modify: `website/src/assets/chat-core.js` (thêm vào cuối)
- Test: `website/test/chat-core.test.mjs`

`createApi` theo đúng bảng request của hợp đồng: request ghi có `Content-Type: application/json` và thân JSON (cả `DELETE` gửi `{}`), token trong `Authorization: Bearer`, không gửi cookie. Không bao giờ ném lỗi: mất mạng ra `status: 0`. `outcome` đổi kết quả thành việc khung chat phải làm, theo bảng mã lỗi của hợp đồng.

- [ ] **Step 1: Viết test hỏng**

Tệp: `website/test/chat-core.test.mjs`

```old
import { STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore } from "../src/assets/chat-core.js";
```
```new
import { API, STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore, createApi, outcome } from "../src/assets/chat-core.js";
```

Rồi thêm vào cuối tệp:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/chat-core.test.mjs <<'EOF'

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
EOF
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-core.test.mjs 2>&1 | grep -E "SyntaxError|ℹ (tests|pass|fail)"
```
Expected: `SyntaxError: The requested module '../src/assets/chat-core.js' does not provide an export named 'createApi'`, rồi `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Thêm `createApi` và `outcome` vào cuối lõi**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/src/assets/chat-core.js <<'EOF'

/**
 * Gọi API chat (`fetchFn` là `fetch` của trình duyệt, hay bản giả trong test). Không bao giờ ném: thành công ra
 * `{ ok: true, status, data }`; lỗi ra `{ ok: false, status, error, retryAfter }` (`status` 0 và `error: "network"` khi không tới
 * được máy chủ; `retryAfter` là số giây của header Retry-After hay null).
 */
export function createApi(fetchFn) {
  async function call(method, path, { token = null, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const init = { method, headers, credentials: "omit" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body ?? {});
    }
    let res;
    try {
      res = await fetchFn(API + path, init);
    } catch {
      return { ok: false, status: 0, error: "network", retryAfter: null };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* thân không phải JSON (trang lỗi của cổng mạng) */
    }
    if (res.ok) return { ok: true, status: res.status, data };
    const ra = Number(res.headers.get("Retry-After"));
    return { ok: false, status: res.status, error: typeof data?.error === "string" ? data.error : `http_${res.status}`, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null };
  }
  return {
    status: () => call("GET", "/v1/support/status"),
    /** Tin đầu (chưa có token) gửi kèm `first` = `{ lang, source, page }`; các tin sau chỉ gửi `{ text }`. */
    send: (token, text, first) => (token ? call("POST", "/v1/support/messages", { token, body: { text } }) : call("POST", "/v1/support/messages", { body: { text, ...first } })),
    messages: (token, after) => call("GET", `/v1/support/messages?after=${after}`, { token }),
    setEmail: (token, email) => call("PUT", "/v1/support/email", { token, body: { email } }),
    remove: (token) => call("DELETE", "/v1/support/conversation", { token, body: {} }),
  };
}

/**
 * Việc phải làm với một kết quả của createApi (bảng mã lỗi của hợp đồng): "ok"; "reset" (401: xóa bản lưu, tin kế tiếp mở cuộc
 * mới); "closed" (403: cuộc chat bị chặn); "disabled" (503: chat tắt); "busy" (429 support_busy); "rate" (429 rate_limited);
 * "network" (không tới được máy chủ, hay 5xx khác); "invalid" (400, 413, 415: lỗi chung, không tự thử lại).
 */
export function outcome(r) {
  if (r.ok) return "ok";
  switch (r.error) {
    case "invalid_token":
      return "reset";
    case "conversation_closed":
      return "closed";
    case "support_disabled":
      return "disabled";
    case "support_busy":
      return "busy";
    case "rate_limited":
      return "rate";
  }
  if (r.status === 0 || r.status >= 500) return "network";
  if (r.status === 429) return "rate";
  if (r.status === 401) return "reset";
  if (r.status === 403) return "closed";
  return "invalid";
}
EOF
```

- [ ] **Step 4: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-core.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 5: Cả bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 160`, `ℹ pass 158`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/assets/chat-core.js website/test/chat-core.test.mjs && git commit -q -m "feat(website): lõi chat hỗ trợ: gọi API và bảng mã lỗi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Lõi chat: nhịp hỏi tin mới và hỏi khi khung đóng

**Files:**
- Modify: `website/src/assets/chat-core.js` (thêm vào cuối)
- Test: `website/test/chat-core.test.mjs`

`createPoller` cài bảng nhịp của hợp đồng phía khách (khung mở: 3 giây, 2 phút liền không có tin mới thì 15 giây, có tin mới hay khách gửi tin thì về 3 giây; khung đóng mà đang chờ: 60 giây; 429 chờ `Retry-After` tối thiểu 15 giây; lỗi mạng giãn 3 → 15 → 60 giây) và chỉ hẹn giờ khi tab đang hiện (`visibilitychange`). Đồng hồ, hẹn giờ, trạng thái tab đi qua `env` nên test điều khiển được từng nhịp. `watchReply` là vòng hỏi của `site.js` khi khung đóng. `browserEnv` là `env` thật trên trình duyệt.

- [ ] **Step 1: Viết test hỏng**

Tệp: `website/test/chat-core.test.mjs`

```old
import { API, STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore, createApi, outcome } from "../src/assets/chat-core.js";
```
```new
import {
  API, STORE_KEY, MAX_CHARS, WAIT_WINDOW, normalizeText, charCount, validText, parseState, isWaiting, createStore,
  createApi, outcome, createPoller, watchReply,
} from "../src/assets/chat-core.js";
```

Rồi thêm vào cuối tệp:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/chat-core.test.mjs <<'EOF'

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
EOF
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-core.test.mjs 2>&1 | grep -E "SyntaxError|ℹ (tests|pass|fail)"
```
Expected: `SyntaxError: The requested module '../src/assets/chat-core.js' does not provide an export named 'createPoller'`, rồi `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Thêm `createPoller`, `watchReply`, `browserEnv` vào cuối lõi**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/src/assets/chat-core.js <<'EOF'

/**
 * Vòng hỏi tin mới theo nhịp của hợp đồng phía khách.
 * - `mode: "open"` (khung đang mở): 3 giây; 2 phút liền không có tin mới thì 15 giây; `bump()` (khách gửi tin) về 3 giây.
 * - `mode: "watch"` (khung đóng, đang chờ trả lời): 60 giây.
 * - Lỗi: 429 chờ Retry-After (tối thiểu 15 giây); lỗi mạng giãn 3 → 15 → 60 giây; không bao giờ nhanh hơn nhịp nền.
 * - Chỉ hỏi khi tab đang hiện: tab ẩn thì hủy hẹn giờ; hiện lại thì hỏi khi tới hạn (hạn đã qua thì hỏi ngay).
 * `tick()` gọi API một lần và trả `{ result, fresh }`: `result` của createApi, `fresh` là số tin mới của chủ dự án.
 * `env`: `{ now(), setTimer(fn, ms), clearTimer(id), visible(), onVisibility(fn) }` (`onVisibility` trả hàm hủy đăng ký).
 */
export function createPoller({ tick, mode, env }) {
  let timer = null;
  let running = false;
  let busy = false;
  let lastPollAt = 0;
  let lastNewAt = 0;
  let netFails = 0;
  let holdUntil = 0;
  let unlisten = null;

  const base = () => (mode === "watch" ? WATCH : env.now() - lastNewAt >= IDLE_AFTER ? SLOW : FAST);
  const due = () => {
    let d = base();
    if (netFails > 0) d = Math.max(d, NET_BACKOFF[Math.min(netFails, NET_BACKOFF.length) - 1]);
    return Math.max(lastPollAt + d, holdUntil);
  };
  const arm = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
    if (!running || busy || !env.visible()) return;
    timer = env.setTimer(run, Math.max(0, due() - env.now()));
  };
  const apply = (result, fresh) => {
    const o = outcome(result);
    if (o === "ok") {
      netFails = 0;
      if (fresh > 0) lastNewAt = env.now();
    } else if (o === "network") netFails += 1;
    else if (o === "rate" || o === "busy") holdUntil = env.now() + Math.max(MIN_RETRY, (result.retryAfter ?? 0) * 1000);
  };
  async function run() {
    timer = null;
    if (!running || busy || !env.visible()) return;
    busy = true;
    lastPollAt = env.now();
    let out;
    try {
      out = await tick();
    } catch {
      out = { result: { ok: false, status: 0, error: "network", retryAfter: null }, fresh: 0 };
    }
    busy = false;
    apply(out.result, out.fresh ?? 0);
    arm();
  }
  return {
    /** `immediate: false`: lần hỏi đầu sau một nhịp (vừa hỏi xong ở chỗ khác, ví dụ lúc đóng khung). */
    start({ immediate = true } = {}) {
      if (running) return;
      running = true;
      lastNewAt = env.now();
      lastPollAt = immediate ? -Infinity : env.now();
      unlisten = env.onVisibility(arm);
      arm();
    },
    stop() {
      running = false;
      unlisten?.();
      unlisten = null;
      if (timer !== null) env.clearTimer(timer);
      timer = null;
    },
    bump() {
      lastNewAt = env.now();
      arm();
    },
    /** Kết quả của một request khác (gửi tin, lưu email): 429 hay lỗi mạng cũng giãn nhịp hỏi. */
    report(result) {
      apply(result, 0);
      arm();
    },
    get running() {
      return running;
    },
  };
}

/**
 * Khung đóng, đang chờ trả lời: hỏi một lần ngay (`immediate`, lúc tải trang) rồi mỗi 60 giây. Thấy tin chủ dự án mới
 * (id > lastId) thì gọi `onReply()` và dừng: chấm đỏ đã hiện, còn lastId chỉ tiến khi khách mở khung và thấy tin, nên trang
 * sau vẫn hiện chấm đỏ. Hết chờ (quá 24 giờ, mất bản lưu) hay nhận 401 thì dừng. Trả về poller, hay null khi không đang chờ.
 */
export function watchReply({ immediate = true, onReply, env = browserEnv() }) {
  const nowSec = () => Math.floor(env.now() / 1000);
  if (!isWaiting(env.store.load(), nowSec())) return null;
  const poller = createPoller({
    mode: "watch",
    env,
    tick: async () => {
      const st = env.store.load();
      if (!isWaiting(st, nowSec())) {
        poller.stop();
        return { result: { ok: true }, fresh: 0 };
      }
      const result = await env.api.messages(st.token, st.lastId);
      if (!result.ok) {
        if (outcome(result) === "reset") {
          env.store.clear();
          poller.stop();
        }
        return { result, fresh: 0 };
      }
      const fresh = (result.data?.messages ?? []).filter((m) => m.sender === "owner").length;
      if (fresh > 0) {
        poller.stop();
        onReply();
      }
      return { result, fresh };
    },
  });
  poller.start({ immediate });
  return poller;
}

/** Môi trường thật trên trình duyệt: đồng hồ, hẹn giờ, trạng thái hiện của tab, API, bản lưu (test truyền env giả). */
export function browserEnv() {
  return {
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
    visible: () => document.visibilityState === "visible",
    onVisibility(fn) {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
    api: createApi((url, init) => fetch(url, init)),
    store: createStore(() => localStorage),
  };
}
EOF
```

- [ ] **Step 4: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-core.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 14`, `ℹ pass 14`, `ℹ fail 0`.

- [ ] **Step 5: Cả bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 166`, `ℹ pass 164`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/assets/chat-core.js website/test/chat-core.test.mjs && git commit -q -m "feat(website): lõi chat hỗ trợ: nhịp hỏi tin mới, chỉ hỏi khi tab đang hiện" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Chữ năm ngôn ngữ của chat

**Files:**
- Create: `website/src/assets/chat-strings.js`
- Test: `website/test/chat-strings.test.mjs`

Tiêu đề, dòng phụ, lời chào và chân khung trích đúng hợp đồng (test so nguyên văn); chân khung ja/zh/ko có nhãn "（英語）" / "（英文）" / "(영어)" sau chữ liên kết chính sách, ja/zh có một khoảng trắng giữa chữ Nhật/Hán và số hay chữ Latin, tiếng Hàn số dính đơn vị (quy tắc dịch của website). Các câu khác theo giọng các bản dịch đang có: ja lịch sự (です/ます), zh xưng "你" và gọi người trả lời là "客服" (như trang Liên hệ bản zh), ko dùng "지원팀". `{email}` được khung chat thay bằng liên kết `mailto:`. Test cuối quét mọi file `.js`, `.css` trong `src/assets/` (cả file thêm ở Task 6, 7) để chặn chữ "zalo".

- [ ] **Step 1: Viết test hỏng**

Tạo `website/test/chat-strings.test.mjs` với nội dung:

```js
// Chữ của chat hỗ trợ (src/assets/chat-strings.js): đủ năm ngôn ngữ cùng khóa, câu trích đúng hợp đồng phía khách (kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan), liên kết chính sách có thật, không nhắc tên dịch vụ chuyển tin.
//   node --test test/chat-strings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { CHAT, SUPPORT_EMAIL } from "../src/assets/chat-strings.js";
import { LANG_CODES } from "../src/langs.mjs";
import { SITE } from "../src/site.mjs";
import { pages } from "../src/content/index.mjs";

test("chat-strings: đủ năm ngôn ngữ, cùng khóa như bản en, không chuỗi rỗng; email hỗ trợ khớp SITE.email", () => {
  assert.deepEqual(Object.keys(CHAT), LANG_CODES);
  const keys = Object.keys(CHAT.en).sort();
  for (const l of LANG_CODES) {
    assert.deepEqual(Object.keys(CHAT[l]).sort(), keys, `${l}: khác khóa bản en`);
    for (const [k, v] of Object.entries(CHAT[l])) assert.ok(typeof v === "string" && v.trim(), `${l}.${k} rỗng`);
    for (const k of ["off", "closed", "busy"]) assert.equal(CHAT[l][k].split("{email}").length, 2, `${l}.${k}: cần đúng một {email}`);
  }
  assert.equal(SUPPORT_EMAIL, SITE.email);
});

test("chat-strings: tiêu đề, dòng phụ, lời chào và chân khung trích đúng spec và hợp đồng (ja/zh/ko có nhãn tiếng Anh sau liên kết chính sách)", () => {
  assert.equal(CHAT.vi.title, "Hỗ trợ AI Translator");
  const want = {
    vi: ["Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời", "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English.", "Tin nhắn được lưu 90 ngày · Quyền riêng tư"],
    en: ["A real person replies, not a bot · no guaranteed response time", "Hi 👋 How can we help? You can write in English or Vietnamese.", "Messages are kept for 90 days · Privacy"],
    ja: ["ボットではなく人が返信します · 返信時間は保証していません", "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。", "メッセージは 90 日間保存されます · プライバシー（英語）"],
    zh: ["由真人回复，不是机器人 · 不保证回复时间", "你好 👋 有什么可以帮你？如果可以，请用英文书写。", "消息保存 90 天 · 隐私（英文）"],
    ko: ["봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다", "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요.", "메시지는 90일간 보관됩니다 · 개인정보(영어)"],
  };
  for (const l of LANG_CODES) {
    const [sub, greeting, foot] = want[l];
    assert.equal(CHAT[l].sub, sub, `${l}: dòng phụ`);
    assert.equal(CHAT[l].greeting, greeting, `${l}: lời chào`);
    assert.equal(`${CHAT[l].keep} · ${CHAT[l].privacy}`, foot, `${l}: chân khung`);
  }
  const off = { vi: "Chat đang tạm tắt. Hãy gửi email tới support@aitranslator.io.vn", closed: "Cuộc trò chuyện đã đóng. Hãy gửi email tới support@aitranslator.io.vn" };
  assert.equal(CHAT.vi.off.replace("{email}", SUPPORT_EMAIL), off.vi);
  assert.equal(CHAT.vi.closed.replace("{email}", SUPPORT_EMAIL), off.closed);
});

test("chat-strings: liên kết Quyền riêng tư tới chính sách có thật (vi: bản vi; en, ja, zh, ko: bản en)", () => {
  const privacy = new Map(pages.filter((p) => p.id === "privacy").map((p) => [p.lang, p.path]));
  assert.equal(CHAT.vi.privacyHref, privacy.get("vi"));
  for (const l of ["en", "ja", "zh", "ko"]) assert.equal(CHAT[l].privacyHref, privacy.get("en"), l);
});

test("chat-strings: bản ja/zh/ko đã dịch (không chuỗi nào trùng bản en, trừ đường dẫn)", () => {
  for (const l of ["ja", "zh", "ko"]) {
    for (const [k, v] of Object.entries(CHAT[l])) if (k !== "privacyHref") assert.notEqual(v, CHAT.en[k], `${l}.${k} còn tiếng Anh`);
  }
});

test("chat: không file nào trong src/assets (mã gửi xuống trình duyệt) nhắc tên dịch vụ chuyển tin, kể cả trong chú thích", async () => {
  const dir = new URL("../src/assets/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => /\.(js|css)$/.test(f));
  assert.ok(files.includes("chat-strings.js") && files.includes("site.js"), files.join(", "));
  for (const f of files) assert.ok(!/zalo/i.test(await readFile(new URL(f, dir), "utf8")), `src/assets/${f} nhắc Zalo`);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-strings.test.mjs 2>&1 | grep -E "ERR_MODULE_NOT_FOUND|ℹ (tests|pass|fail)"
```
Expected: dòng `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/website/src/assets/chat-strings.js' …`, rồi `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Viết chữ**

Tạo `website/src/assets/chat-strings.js` với nội dung:

```js
// Chữ của bong bóng và khung chat hỗ trợ theo năm ngôn ngữ (spec chat hỗ trợ ngày 2026-10-22, mục 3). Lời chào, dòng phụ và chân
// khung trích đúng hợp đồng phía khách (kế hoạch 2026-10-22-chat-ho-tro-00-tong-quan); chân khung ja/zh/ko thêm nhãn "(tiếng Anh)"
// sau chữ liên kết như chân trang của website, vì chính sách chỉ có vi/en. ja/zh: một khoảng trắng giữa chữ Nhật/Hán và số. Khung chat
// (trình duyệt) và layout.mjs (nhãn bong bóng, lúc dựng) cùng nhập file này. `{email}` được thay bằng liên kết mailto.
// Không nhắc tên dịch vụ chuyển tin ở đây (quy tắc "không công bố công nghệ lõi" của website/README.md; có test chặn).

export const SUPPORT_EMAIL = "support@aitranslator.io.vn";

export const CHAT = {
  vi: {
    open: "Mở chat hỗ trợ",
    unread: "có trả lời mới",
    title: "Hỗ trợ AI Translator",
    sub: "Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời",
    greeting: "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English.",
    you: "Bạn",
    support: "Hỗ trợ",
    menu: "Tùy chọn",
    close: "Đóng",
    del: "Xóa cuộc trò chuyện",
    confirm: "Xóa toàn bộ cuộc trò chuyện? Tin nhắn bị xóa khỏi máy chủ và không khôi phục được.",
    confirmYes: "Xóa",
    confirmNo: "Hủy",
    inputLabel: "Tin nhắn",
    placeholder: "Nhập tin nhắn…",
    send: "Gửi",
    sending: "Đang gửi…",
    sent: "Đã gửi",
    failed: "Không gửi được, thử lại",
    tooLong: "Tin nhắn dài hơn 1000 ký tự.",
    emailAsk: "Để lại email để nhận câu trả lời nếu bạn rời trang (không bắt buộc)",
    emailLabel: "Email của bạn",
    emailSave: "Lưu",
    emailClose: "Bỏ qua",
    emailSaved: "Đã lưu email. Nếu bạn rời trang, câu trả lời sẽ được gửi qua email.",
    emailBad: "Email chưa đúng định dạng.",
    emailFail: "Chưa lưu được email, hãy thử lại sau.",
    off: "Chat đang tạm tắt. Hãy gửi email tới {email}",
    closed: "Cuộc trò chuyện đã đóng. Hãy gửi email tới {email}",
    rate: "Bạn gửi hơi nhanh. Hãy thử lại sau ít phút.",
    busy: "Hỗ trợ đang bận. Hãy gửi email tới {email}",
    network: "Không kết nối được. Kiểm tra mạng rồi thử lại.",
    invalid: "Không gửi được tin này.",
    delFail: "Chưa xóa được, hãy thử lại sau.",
    keep: "Tin nhắn được lưu 90 ngày",
    privacy: "Quyền riêng tư",
    privacyHref: "/chinh-sach-quyen-rieng-tu/",
  },
  en: {
    open: "Open support chat",
    unread: "new reply",
    title: "AI Translator support",
    sub: "A real person replies, not a bot · no guaranteed response time",
    greeting: "Hi 👋 How can we help? You can write in English or Vietnamese.",
    you: "You",
    support: "Support",
    menu: "Options",
    close: "Close",
    del: "Delete conversation",
    confirm: "Delete the whole conversation? The messages are removed from the server and cannot be restored.",
    confirmYes: "Delete",
    confirmNo: "Cancel",
    inputLabel: "Message",
    placeholder: "Type a message…",
    send: "Send",
    sending: "Sending…",
    sent: "Sent",
    failed: "Not sent, try again",
    tooLong: "The message is longer than 1000 characters.",
    emailAsk: "Leave your email to get the reply if you leave this page (optional)",
    emailLabel: "Your email",
    emailSave: "Save",
    emailClose: "Dismiss",
    emailSaved: "Email saved. If you leave this page, the reply will be sent by email.",
    emailBad: "That email address does not look right.",
    emailFail: "Could not save the email, please try again later.",
    off: "Chat is paused for now. Please email {email}",
    closed: "This conversation is closed. Please email {email}",
    rate: "You are sending messages too fast. Please try again in a few minutes.",
    busy: "Support is busy right now. Please email {email}",
    network: "Could not connect. Check your connection and try again.",
    invalid: "This message could not be sent.",
    delFail: "Could not delete the conversation, please try again later.",
    keep: "Messages are kept for 90 days",
    privacy: "Privacy",
    privacyHref: "/en/privacy/",
  },
  ja: {
    open: "サポートチャットを開く",
    unread: "新しい返信があります",
    title: "AI Translator サポート",
    sub: "ボットではなく人が返信します · 返信時間は保証していません",
    greeting: "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。",
    you: "あなた",
    support: "サポート",
    menu: "オプション",
    close: "閉じる",
    del: "会話を削除",
    confirm: "会話をすべて削除しますか？メッセージはサーバーから削除され、元に戻せません。",
    confirmYes: "削除",
    confirmNo: "キャンセル",
    inputLabel: "メッセージ",
    placeholder: "メッセージを入力…",
    send: "送信",
    sending: "送信中…",
    sent: "送信済み",
    failed: "送信できませんでした。再試行",
    tooLong: "メッセージが 1000 文字を超えています。",
    emailAsk: "ページを離れても返信を受け取れるよう、メールアドレスを残せます（任意）",
    emailLabel: "メールアドレス",
    emailSave: "保存",
    emailClose: "閉じる",
    emailSaved: "メールアドレスを保存しました。ページを離れた場合、返信はメールで届きます。",
    emailBad: "メールアドレスの形式が正しくありません。",
    emailFail: "メールアドレスを保存できませんでした。後でもう一度お試しください。",
    off: "チャットは一時停止中です。{email} までメールでお問い合わせください。",
    closed: "この会話は終了しました。{email} までメールでお問い合わせください。",
    rate: "送信が早すぎます。数分後にもう一度お試しください。",
    busy: "現在サポートが混み合っています。{email} までメールでお問い合わせください。",
    network: "接続できませんでした。ネットワークを確認して、もう一度お試しください。",
    invalid: "このメッセージは送信できませんでした。",
    delFail: "会話を削除できませんでした。後でもう一度お試しください。",
    keep: "メッセージは 90 日間保存されます",
    privacy: "プライバシー（英語）",
    privacyHref: "/en/privacy/",
  },
  zh: {
    open: "打开客服聊天",
    unread: "有新回复",
    title: "AI Translator 客服",
    sub: "由真人回复，不是机器人 · 不保证回复时间",
    greeting: "你好 👋 有什么可以帮你？如果可以，请用英文书写。",
    you: "你",
    support: "客服",
    menu: "选项",
    close: "关闭",
    del: "删除对话",
    confirm: "删除整个对话？消息将从服务器删除，无法恢复。",
    confirmYes: "删除",
    confirmNo: "取消",
    inputLabel: "消息",
    placeholder: "输入消息…",
    send: "发送",
    sending: "发送中…",
    sent: "已发送",
    failed: "发送失败，点此重试",
    tooLong: "消息超过 1000 个字符。",
    emailAsk: "留下邮箱，离开页面后也能收到回复（可选）",
    emailLabel: "你的邮箱",
    emailSave: "保存",
    emailClose: "关闭",
    emailSaved: "邮箱已保存。离开页面后，回复会通过邮件发给你。",
    emailBad: "邮箱格式不正确。",
    emailFail: "邮箱保存失败，请稍后再试。",
    off: "聊天暂时关闭。请发送邮件至 {email}",
    closed: "此对话已关闭。请发送邮件至 {email}",
    rate: "发送太快了，请几分钟后再试。",
    busy: "客服目前繁忙。请发送邮件至 {email}",
    network: "无法连接。请检查网络后重试。",
    invalid: "无法发送此消息。",
    delFail: "对话删除失败，请稍后再试。",
    keep: "消息保存 90 天",
    privacy: "隐私（英文）",
    privacyHref: "/en/privacy/",
  },
  ko: {
    open: "지원 채팅 열기",
    unread: "새 답변이 있습니다",
    title: "AI Translator 지원",
    sub: "봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다",
    greeting: "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요.",
    you: "나",
    support: "지원팀",
    menu: "옵션",
    close: "닫기",
    del: "대화 삭제",
    confirm: "대화 전체를 삭제할까요? 메시지가 서버에서 삭제되며 되돌릴 수 없습니다.",
    confirmYes: "삭제",
    confirmNo: "취소",
    inputLabel: "메시지",
    placeholder: "메시지를 입력하세요…",
    send: "보내기",
    sending: "보내는 중…",
    sent: "보냄",
    failed: "보내지 못했습니다. 다시 시도",
    tooLong: "메시지가 1000자를 넘습니다.",
    emailAsk: "페이지를 떠나도 답변을 받을 수 있도록 이메일을 남겨 주세요(선택)",
    emailLabel: "이메일",
    emailSave: "저장",
    emailClose: "닫기",
    emailSaved: "이메일을 저장했습니다. 페이지를 떠나면 답변이 이메일로 전송됩니다.",
    emailBad: "이메일 형식이 올바르지 않습니다.",
    emailFail: "이메일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    off: "채팅이 잠시 중단되었습니다. {email}로 이메일을 보내 주세요.",
    closed: "이 대화는 종료되었습니다. {email}로 이메일을 보내 주세요.",
    rate: "메시지를 너무 빠르게 보내고 있습니다. 몇 분 후에 다시 시도해 주세요.",
    busy: "지금 지원팀이 바쁩니다. {email}로 이메일을 보내 주세요.",
    network: "연결할 수 없습니다. 네트워크를 확인한 후 다시 시도해 주세요.",
    invalid: "이 메시지를 보낼 수 없습니다.",
    delFail: "대화를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    keep: "메시지는 90일간 보관됩니다",
    privacy: "개인정보(영어)",
    privacyHref: "/en/privacy/",
  },
};
```

- [ ] **Step 4: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-strings.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 5`, `ℹ pass 5`, `ℹ fail 0` (khoảng 15 giây: test nạp danh mục trang).

- [ ] **Step 5: Cả bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 171`, `ℹ pass 169`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/assets/chat-strings.js website/test/chat-strings.test.mjs && git commit -q -m "feat(website): chữ năm ngôn ngữ của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Dựng: CSP, lõi đã băm, thuộc tính `data-chat-*`

**Files:**
- Modify: `website/src/build/build.mjs` (import, `headers()`, hàm mới `chatAssets()`, `assets` trong `build()`)
- Modify: `website/src/build/layout.mjs` (import, hàm mới `chatAttrs()`, thẻ script `site.js`)
- Test: `website/test/site.test.mjs`

CSP lấy nguồn API từ hằng `API` của lõi (một nguồn duy nhất). Ở task này `chatAssets()` mới băm lõi; Task 7 thay hàm này bằng bản băm cả khung chat. `chatAttrs()` không làm gì khi `ctx.assets.chat` vắng (test `renderPage` trong `test/i18n.test.mjs` truyền `ctx` giả chỉ có `css`, `js`).

- [ ] **Step 1: Viết test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

test("CSP: connect-src chỉ thêm API của chat hỗ trợ; script-src, style-src, font-src, img-src giữ nguyên", async () => {
  const h = await readFile(path.join(DIST, "_headers"), "utf8");
  const csp = /Content-Security-Policy: (.+)/.exec(h)?.[1] ?? "";
  const dir = Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]));
  assert.equal(dir["connect-src"], "'self' https://api.aitranslator.io.vn");
  assert.match(dir["script-src"], /^'self' 'sha256-[A-Za-z0-9+/=]+'$/);
  assert.equal(dir["style-src"], "'self'");
  assert.equal(dir["font-src"], "'self'");
  assert.equal(dir["img-src"], "'self' data:");
  assert.equal(dir["default-src"], "'self'");
});

test("chat hỗ trợ: mọi trang (và 404) truyền đường dẫn đã băm của lõi chat, ngôn ngữ và nhãn bong bóng cho site.js; file có trong dist", async () => {
  const { CHAT } = await import("../src/assets/chat-strings.js");
  const all = [...pages.map((p) => [p, htmlByPath.get(p.path)]), [{ path: "/404.html", lang: "vi" }, await readFile(path.join(DIST, "404.html"), "utf8")]];
  for (const [p, html] of all) {
    const tag = /<script src="\/assets\/bundle\/site\.[0-9a-f]{10}\.js" defer([^>]*)><\/script>/.exec(html)?.[1];
    assert.ok(tag, `${p.path}: thiếu thẻ script site.js`);
    const attr = (n) => new RegExp(`\\sdata-chat-${n}="([^"]*)"`).exec(tag)?.[1];
    assert.match(attr("core") ?? "", /^\/assets\/bundle\/chat-core\.[0-9a-f]{10}\.js$/, `${p.path}: data-chat-core`);
    assert.ok(await exists(path.join(DIST, attr("core"))), `${p.path}: thiếu ${attr("core")}`);
    assert.equal(attr("lang"), p.lang, `${p.path}: data-chat-lang`);
    assert.equal(decode(attr("label") ?? ""), CHAT[p.lang].open, `${p.path}: data-chat-label`);
    assert.equal(decode(attr("unread") ?? ""), CHAT[p.lang].unread, `${p.path}: data-chat-unread`);
  }
});

test("chat hỗ trợ: HTML không tải sẵn file nào của chat (chỉ tải khi cần)", () => {
  for (const p of pages) {
    const html = htmlByPath.get(p.path);
    assert.ok(!/<(?:script|link)\b[^>]*\s(?:src|href)="\/assets\/bundle\/chat/.test(html), `${p.path}: tải sẵn file chat`);
  }
});
EOF
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)" | head -4
```
Expected: hai dòng `✖ CSP: connect-src chỉ thêm API của chat hỗ trợ; …` và `✖ chat hỗ trợ: mọi trang (và 404) truyền đường dẫn đã băm của lõi chat, …`, rồi `ℹ tests 77`, `ℹ pass 75`, `ℹ fail 2`. (Test thứ ba, "HTML không tải sẵn file nào của chat", đạt ngay: nó giữ cho các task sau không tải sẵn.)

- [ ] **Step 3: Sửa `build.mjs`**

Tệp: `website/src/build/build.mjs`

```old
import { LANG_CODES, PUBLISHED, tagOf, homeOf, isHome } from "../langs.mjs";
```
```new
import { LANG_CODES, PUBLISHED, tagOf, homeOf, isHome } from "../langs.mjs";
import { API as CHAT_API } from "../assets/chat-core.js";
```

```old
    "connect-src 'self'",
```
```new
    // Chat hỗ trợ gọi API của license server (spec chat hỗ trợ 2026-10-22, mục 3); không thêm nguồn nào khác.
    `connect-src 'self' ${CHAT_API}`,
```

```old
export async function build() {
```
```new
/** Lõi chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3): ES module tên có mã băm, site.js chỉ tải khi khách đang chờ trả lời.
 *  site.js đọc đường dẫn qua thuộc tính data-chat-* của thẻ script (layout.mjs), nên không cần script nội tuyến mới. */
async function chatAssets() {
  const core = await readFile(path.join(SRC, "assets", "chat-core.js"));
  const out = { core: `/assets/bundle/chat-core.${sha(core)}.js` };
  await writeOut(out.core.slice(1), core);
  return out;
}

export async function build() {
```

```old
  const assets = { css: `/assets/bundle/site.${sha(css)}.css`, js: `/assets/bundle/site.${sha(js)}.js` };
```
```new
  const assets = { css: `/assets/bundle/site.${sha(css)}.css`, js: `/assets/bundle/site.${sha(js)}.js`, chat: await chatAssets() };
```

- [ ] **Step 4: Sửa `layout.mjs`**

Tệp: `website/src/build/layout.mjs`

```old
import { S } from "../strings.mjs";
```
```new
import { S } from "../strings.mjs";
import { CHAT } from "../assets/chat-strings.js";
```

```old
export function renderPage(page, ctx) {
```
```new
/** Thuộc tính data-chat-* của thẻ script site.js: đường dẫn đã băm của chat hỗ trợ, ngôn ngữ và nhãn bong bóng (spec chat hỗ
 *  trợ 2026-10-22, mục 3). Truyền qua thuộc tính để CSP giữ nguyên (không thêm script nội tuyến). ctx không có assets.chat
 *  (test dựng một trang giả) thì không có bong bóng. */
function chatAttrs(page, ctx) {
  const c = ctx.assets.chat;
  if (!c) return "";
  const t = CHAT[page.lang];
  return ` data-chat-core="${c.core}" data-chat-lang="${page.lang}" data-chat-label="${esc(t.open)}" data-chat-unread="${esc(t.unread)}"`;
}

export function renderPage(page, ctx) {
```

```old
<script src="${ctx.assets.js}" defer></script>
```
```new
<script src="${ctx.assets.js}" defer${chatAttrs(page, ctx)}></script>
```

- [ ] **Step 5: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)" && node --test test/i18n.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 77`, `ℹ pass 77`, `ℹ fail 0`; rồi `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0`. Đỏ ở "không lộ công nghệ lõi" thì một chữ mới trong HTML trùng danh sách công nghệ lõi: đổi chữ, không nới luật.

- [ ] **Step 6: Cả bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 174`, `ℹ pass 172`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/build/build.mjs website/src/build/layout.mjs website/test/site.test.mjs && git commit -q -m "feat(website): CSP mở connect-src cho API chat; đường dẫn chat đã băm qua data-chat-*" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: Bong bóng và chấm đỏ

**Files:**
- Modify: `website/src/assets/site.css` (token `--danger`, CSS bong bóng ở cuối)
- Modify: `website/src/assets/site.js` (khối chat trước "Hiện dần khi cuộn tới")
- Test: `website/test/chat-widget.test.mjs` (mới)

Test trình duyệt dùng API giả: máy chủ thật chỉ cho origin `https://aitranslator.io.vn` nên không gọi được từ bản dựng cục bộ. `fakeApi` chặn mọi request tới `https://api.aitranslator.io.vn/*` bằng `Fetch.enable` của Chrome DevTools Protocol (đã thử: Chrome chặn được cả preflight `OPTIONS`) và trả lời như server theo hợp đồng; CSP của trang vẫn áp như thật (`serve.mjs` đọc `_headers`), nên request tới nơi khác hay script lạ đều hiện ở `p.errors`. Không cần thư viện nào: `tools/browser/cdp.mjs` đã lộ `p.s.send` và `p.s.handlers`.

Sau task này bấm bong bóng chưa mở gì (khung chat ở Task 7); test của task này không bấm.

- [ ] **Step 1: Viết test hỏng**

Tạo `website/test/chat-widget.test.mjs` với nội dung:

```js
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
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-widget.test.mjs 2>&1 | grep -E "^✖|^✔|ℹ (tests|pass|fail)" | head -6
```
Expected: `✖ mọi trang năm ngôn ngữ (và 404) có bong bóng đúng nhãn; …`, `✔ tắt JavaScript: không có bong bóng`, `✖ đang chờ trả lời (tin cuối của khách, trong 24 giờ): …`, `✔ không chờ trả lời …`, rồi `ℹ tests 4`, `ℹ pass 2`, `ℹ fail 2`. (Hai test đạt sẵn là test chặn: chúng phải còn đạt sau khi có bong bóng.)

- [ ] **Step 3: Sửa `site.css`: token `--danger`**

Dòng `--accent: …; --on-brand: #04122b;` có ở hai chỗ: khối `:root[data-theme="dark"]` (thụt 2 dấu cách) và khối `@media (prefers-color-scheme: dark)` (thụt 4 dấu cách). Sửa cả hai; mỗi khối `old` dưới đây chỉ khớp một chỗ nhờ số dấu cách ở đầu dòng thứ hai.

Tệp: `website/src/assets/site.css`

```old
  --ok: #0c7a4b;
  --on-brand: #ffffff;
```
```new
  --ok: #0c7a4b;
  --danger: #c4312b;
  --on-brand: #ffffff;
```

```old
  --accent: #2fd0c0; --accent-soft: #0e2b2b; --warn: #f2c15a; --warn-soft: #2a2110; --ok: #4fd69b; --on-brand: #04122b;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4); --shadow-md: 0 10px 30px -10px rgba(0, 0, 0, .6);
```
```new
  --accent: #2fd0c0; --accent-soft: #0e2b2b; --warn: #f2c15a; --warn-soft: #2a2110; --ok: #4fd69b; --on-brand: #04122b; --danger: #ff7b72;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4); --shadow-md: 0 10px 30px -10px rgba(0, 0, 0, .6);
```

```old
    --accent: #2fd0c0; --accent-soft: #0e2b2b; --warn: #f2c15a; --warn-soft: #2a2110; --ok: #4fd69b; --on-brand: #04122b;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4); --shadow-md: 0 10px 30px -10px rgba(0, 0, 0, .6);
```
```new
    --accent: #2fd0c0; --accent-soft: #0e2b2b; --warn: #f2c15a; --warn-soft: #2a2110; --ok: #4fd69b; --on-brand: #04122b; --danger: #ff7b72;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4); --shadow-md: 0 10px 30px -10px rgba(0, 0, 0, .6);
```

- [ ] **Step 4: Sửa `site.css`: CSS bong bóng ở cuối tệp**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/src/assets/site.css <<'EOF'

/* ---------- Chat hỗ trợ: bong bóng (spec chat hỗ trợ 2026-10-22, mục 3) ----------
   site.js chèn `.chat-root` vào cuối <body> (tắt JS thì không có). Khung chat ở chat.css, chỉ tải khi bấm bong bóng. */
.chat-root { position: fixed; right: 16px; bottom: 16px; z-index: 70; }
.chat-bubble { position: relative; display: grid; place-items: center; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 50%; background: var(--brand); color: var(--on-brand); box-shadow: var(--shadow-md); cursor: pointer; transition: transform .15s var(--ease), background .15s; }
.chat-bubble:hover { background: var(--brand-hover); transform: translateY(-1px); }
.chat-bubble .icon { width: 26px; height: 26px; }
.chat-dot { position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 0 2px var(--bg); }
body:has(.mnav[open]) .chat-root { display: none; }
@media print { .chat-root { display: none; } }
EOF
```

- [ ] **Step 5: Sửa `site.js`: bong bóng, tải khung khi bấm, hỏi khi đang chờ**

Khối mới dùng `store` (đọc `localStorage` có bắt lỗi) có sẵn ở đầu `site.js`, và chỉ chạy khi thẻ script có `data-chat-core`.

Tệp: `website/src/assets/site.js`

```old
  // Hiện dần khi cuộn tới
```
```new
  // Chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3): bong bóng góc dưới phải ở mọi trang (tắt JS thì không có; trang Liên hệ
  // vẫn có email). Đường dẫn đã băm của chat nằm ở thuộc tính data-chat-* của thẻ script này (layout.mjs). Khung chat (chat.js,
  // chat.css) chỉ tải khi bấm. Lõi (chat-core.js) chỉ tải khi khách đang chờ trả lời: hỏi tin mới lúc tải trang rồi mỗi 60 giây
  // khi tab đang hiện; có trả lời thì bong bóng hiện chấm đỏ.
  const chatCfg = document.querySelector("script[data-chat-core]")?.dataset;
  if (chatCfg) {
    const wrap = document.createElement("div");
    wrap.className = "chat-root";
    wrap.innerHTML = '<button class="chat-bubble" type="button" aria-expanded="false" aria-controls="chat-panel"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-message"/></svg><span class="chat-dot" hidden></span></button>';
    document.body.appendChild(wrap);
    const bubble = wrap.firstElementChild;
    const dot = bubble.querySelector(".chat-dot");
    const markUnread = (on) => {
      dot.hidden = !on;
      bubble.setAttribute("aria-label", on ? `${chatCfg.chatLabel} (${chatCfg.chatUnread})` : chatCfg.chatLabel);
    };
    markUnread(false);
    let ui = null;
    let loading = null;
    let watcher = null;
    // Cùng điều kiện với isWaiting của chat-core.js, đọc thẳng ở đây để khỏi tải lõi khi không chờ: có token, tin cuối là của
    // khách, gửi trong 24 giờ qua.
    const waiting = () => {
      let s = null;
      try { s = JSON.parse(store.get("support.v1")); } catch { /* bản lưu hỏng */ }
      return Boolean(s && typeof s.token === "string" && Number.isInteger(s.waitingSince) && Date.now() / 1000 - s.waitingSince < 86400);
    };
    const watch = (immediate) => {
      watcher?.stop();
      watcher = null;
      if (!waiting()) return;
      import(chatCfg.chatCore)
        .then((core) => { if (!ui?.isOpen()) watcher = core.watchReply({ immediate, onReply: () => markUnread(true) }); })
        .catch(() => { /* tải lỗi (mạng): lần tải trang sau thử lại */ });
    };
    const loadCss = (href) => new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
    const open = async () => {
      loading ??= Promise.all([loadCss(chatCfg.chatCss), import(chatCfg.chatUi)]).then(([, mod]) => (ui = mod));
      try { await loading; } catch { loading = null; return; } // tải lỗi (mạng): bấm lại để thử
      watcher?.stop();
      watcher = null;
      markUnread(false);
      ui.openChat({ root: wrap, bubble, lang: chatCfg.chatLang, onClose: () => watch(false) });
    };
    bubble.addEventListener("click", () => (ui?.isOpen() ? ui.closeChat() : open()));
    watch(true);
  }

  // Hiện dần khi cuộn tới
```

- [ ] **Step 6: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/chat-widget.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 7: Cả bộ test** (các test không tràn ngang của Tải xuống và trang chủ năm ngôn ngữ chạy lại với bong bóng)

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"
```
Expected: `ℹ tests 178`, `ℹ pass 176`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/assets/site.css website/src/assets/site.js website/test/chat-widget.test.mjs && git commit -q -m "feat(website): bong bóng chat hỗ trợ ở mọi trang, chấm đỏ khi có trả lời" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: Khung chat

**Files:**
- Create: `website/src/assets/chat.css`
- Create: `website/src/assets/chat.js`
- Modify: `website/src/build/build.mjs` (thay `chatAssets()` của Task 5)
- Modify: `website/src/build/layout.mjs` (thêm `data-chat-ui`, `data-chat-css` vào `chatAttrs()`)
- Test: `website/test/site.test.mjs`, `website/test/chat-widget.test.mjs`

Khung chat theo mục 3 của spec và hợp đồng phía khách: tiêu đề, dòng phụ, lời chào theo ngôn ngữ trang (chỉ hiện phía khách, không gửi lên server), Enter gửi và Shift+Enter xuống dòng, đếm ký tự từ 900, trạng thái từng tin ("Đang gửi…", "Đã gửi", "Không gửi được, thử lại" bấm để gửi lại đúng nội dung), thẻ email sau tin đầu, menu ⋯ "Xóa cuộc trò chuyện" có hỏi lại, chân khung có liên kết chính sách, chế độ chat tắt và cuộc chat bị chặn (thay ô nhập bằng dòng email `support@`), `401` thì về cuộc chat mới, toàn màn hình trên điện thoại, Esc đóng (lần lượt: menu, hộp hỏi xóa, khung), vùng `role="log"` (đọc tin mới qua `aria-live` ngầm định của nó), màu theo token sáng/tối. Chữ của khách và của chủ dự án luôn gán bằng `textContent`. Chiều cao ô nhập gán qua CSSOM (`el.style.height`), CSP không chặn kiểu gán này (test kiểm `p.errors` rỗng).

- [ ] **Step 1: Viết test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

test("chat hỗ trợ: data-chat-ui, data-chat-css trỏ tới file có thật; chat.js đã băm chỉ nhập lõi và chữ đã băm", async () => {
  const tag = /<script src="\/assets\/bundle\/site\.[0-9a-f]{10}\.js" defer([^>]*)><\/script>/.exec(htmlByPath.get("/"))[1];
  const attr = (n) => new RegExp(`\\sdata-chat-${n}="([^"]*)"`).exec(tag)?.[1] ?? "";
  assert.match(attr("ui"), /^\/assets\/bundle\/chat\.[0-9a-f]{10}\.js$/);
  assert.match(attr("css"), /^\/assets\/bundle\/chat\.[0-9a-f]{10}\.css$/);
  for (const n of ["ui", "css"]) assert.ok(await exists(path.join(DIST, attr(n))), `thiếu ${attr(n)}`);
  const ui = await readFile(path.join(DIST, attr("ui")), "utf8");
  const imports = [...ui.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.equal(imports.length, 2, imports.join(", "));
  assert.equal(imports[0], path.basename(attr("core")), "chat.js phải nhập đúng lõi mà site.js dùng");
  assert.match(imports[1], /^chat-strings\.[0-9a-f]{10}\.js$/);
  for (const f of imports) assert.ok(await exists(path.join(DIST, "assets", "bundle", f)), `thiếu ${f}`);
});
EOF
```

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/chat-widget.test.mjs <<'EOF'

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
EOF
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)" | head -4 && node --test test/chat-widget.test.mjs 2>&1 | grep -E "ℹ (tests|pass|fail)"
```
Expected: `✖ chat hỗ trợ: data-chat-ui, data-chat-css trỏ tới file có thật; …`, `ℹ tests 78`, `ℹ pass 77`, `ℹ fail 1`; rồi `ℹ tests 16`, `ℹ pass 4`, `ℹ fail 12` (bốn test của Task 6 vẫn đạt).

- [ ] **Step 3: Viết `chat.css`**

Tạo `website/src/assets/chat.css` với nội dung:

```css
/* Khung chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3). site.js chỉ tải file này khi khách bấm bong bóng. Màu lấy từ token sáng/tối
   của site.css. Điện thoại (≤ 640px): khung chiếm toàn màn hình, phần còn lại của trang ẩn đi (tiêu điểm không lọt ra phía sau). */
.chat-panel { position: fixed; right: 16px; bottom: 84px; z-index: 71; display: flex; flex-direction: column; width: min(380px, calc(100vw - 32px)); height: min(600px, calc(100vh - 108px)); height: min(600px, calc(100dvh - 108px)); background: var(--surface); color: var(--ink-2); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-lg); overflow: hidden; font-size: .95rem; line-height: 1.5; }
.chat-panel[hidden] { display: none; }
.chat-head { position: relative; display: flex; align-items: flex-start; gap: 2px; padding: 12px 8px 12px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.chat-titles { flex: 1; min-width: 0; padding-top: 2px; }
.chat-title { margin: 0; font-size: 1rem; line-height: 1.3; color: var(--ink); }
.chat-sub { margin: 2px 0 0; font-size: .78rem; line-height: 1.4; color: var(--ink-3); }
.chat-icon { display: inline-grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ink-2); cursor: pointer; }
.chat-icon:hover { background: var(--brand-soft); color: var(--brand-ink); }
.chat-icon[hidden] { display: none; }
.chat-dots circle { fill: currentColor; stroke: none; }
.chat-menu { position: absolute; top: 50px; right: 46px; z-index: 2; min-width: 220px; padding: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-md); }
.chat-menu[hidden] { display: none; }
.chat-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--danger); font: inherit; text-align: left; cursor: pointer; }
.chat-menu button:hover { background: var(--bg-alt); }
.chat-log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 10px; padding: 16px; }
.chat-msg { position: relative; display: flex; flex-direction: column; max-width: 85%; }
.chat-msg.is-owner { align-self: flex-start; align-items: flex-start; }
.chat-msg.is-customer { align-self: flex-end; align-items: flex-end; }
.chat-text { margin: 0; padding: 8px 13px; border-radius: 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
.is-owner .chat-text { background: var(--bg-alt); color: var(--ink); border-bottom-left-radius: 6px; }
.is-customer .chat-text { background: var(--brand); color: var(--on-brand); border-bottom-right-radius: 6px; }
.chat-state { margin-top: 3px; padding: 0; border: 0; background: none; font: inherit; font-size: .75rem; color: var(--ink-3); }
button.chat-state { color: var(--danger); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.chat-confirm, .chat-email { margin: 0 12px 10px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface-2); font-size: .88rem; }
.chat-confirm[hidden], .chat-email[hidden], .chat-email-row[hidden] { display: none; }
.chat-confirm p { margin: 0 0 10px; color: var(--ink); }
.chat-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.chat-btn { min-height: 36px; padding: 6px 14px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
.chat-btn:hover { border-color: var(--brand); color: var(--brand-ink); }
.chat-btn.is-danger { background: var(--danger); border-color: var(--danger); color: var(--on-brand); }
.chat-email { position: relative; padding-right: 44px; }
.chat-email-ask { margin: 0 0 8px; color: var(--ink); }
.chat-email-close { position: absolute; top: 6px; right: 6px; width: 32px; height: 32px; }
.chat-email-row { display: flex; gap: 8px; }
.chat-email-row input { flex: 1; min-width: 0; min-height: 36px; padding: 6px 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; }
.chat-email-msg { margin: 0; font-size: .82rem; color: var(--ink-3); }
.chat-email-msg:not(:empty) { margin-top: 6px; }
.chat-note { margin: 0; padding: 0 16px; font-size: .84rem; color: var(--warn); }
.chat-note:not(:empty) { padding-bottom: 8px; }
.chat-compose { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 8px; padding: 10px 12px; border-top: 1px solid var(--line); }
.chat-compose[hidden], .chat-off[hidden], .chat-count[hidden] { display: none; }
.chat-count { flex: 1 0 100%; margin: 0; text-align: right; font-size: .75rem; color: var(--ink-3); }
.chat-count.is-over { color: var(--danger); font-weight: 600; }
.chat-compose textarea { flex: 1; min-width: 0; min-height: 42px; max-height: 150px; padding: 10px 14px; border: 1px solid var(--line-strong); border-radius: 21px; background: var(--surface); color: var(--ink); font: inherit; line-height: 1.4; resize: none; }
.chat-compose textarea[aria-invalid="true"] { border-color: var(--danger); }
.chat-send { display: grid; place-items: center; flex: none; width: 42px; height: 42px; padding: 0; border: 0; border-radius: 50%; background: var(--brand); color: var(--on-brand); cursor: pointer; }
.chat-send:disabled { background: var(--line-strong); color: var(--ink-3); cursor: default; }
.chat-off { margin: 0; padding: 14px 16px; border-top: 1px solid var(--line); background: var(--warn-soft); color: var(--ink); font-size: .9rem; }
.chat-foot { margin: 0; padding: 8px 16px 10px; border-top: 1px solid var(--line); font-size: .75rem; color: var(--ink-3); text-align: center; }
@media (max-width: 640px) {
  .chat-panel { inset: 0; width: auto; height: 100vh; height: 100dvh; border: 0; border-radius: 0; }
  html.chat-open { overflow: hidden; }
  .chat-open body > :not(.chat-root):not(.sprite) { visibility: hidden; }
  .chat-open .chat-bubble { display: none; }
}
```

- [ ] **Step 4: Viết `chat.js`**

Hai dòng `import` phải giữ đúng dạng `from "./chat-core.js"` và `from "./chat-strings.js"`: `chatAssets()` (Step 5) đổi chúng thành tên đã băm, và báo lỗi khi `chat.js` nhập file khác.

Tạo `website/src/assets/chat.js` với nội dung:

```js
// Khung chat hỗ trợ của website (spec chat hỗ trợ 2026-10-22, mục 3; hợp đồng phía khách: kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan). ES module: site.js tải động khi khách bấm bong bóng, cùng chat.css; build.mjs đổi hai
// dòng import dưới đây thành tên file đã băm. Chữ của khách và của chủ dự án luôn gán bằng textContent, không bao giờ innerHTML.
import { MAX_CHARS, COUNT_FROM, browserEnv, createPoller, outcome, validText, normalizeText, charCount } from "./chat-core.js";
import { CHAT, SUPPORT_EMAIL } from "./chat-strings.js";

let env = null;
let t = null;
let lang = "vi";
let opts = null;
let els = null;
let poller = null;
let queue = Promise.resolve();
let lastId = 0; // id lớn nhất đã nhận trong khung (con trỏ `after`)
let loaded = false; // đã lấy lịch sử (?after=0) của cuộc chat hiện tại
let mode = "ready"; // "ready" | "off" (chat tắt) | "closed" (cuộc chat bị chặn)
const seen = new Set(); // id các tin đã vẽ: tin khách gửi xong cũng quay lại trong lần hỏi kế tiếp

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const use = (name) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
const DOTS = '<svg class="icon chat-dots" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

export const isOpen = () => Boolean(els && !els.panel.hidden);

/** Mở khung (site.js gọi). `o`: `{ root, bubble, lang, onClose }`. */
export function openChat(o) {
  opts = o;
  if (!els) build(o.lang);
  els.panel.hidden = false;
  opts.bubble.setAttribute("aria-expanded", "true");
  document.documentElement.classList.add("chat-open");
  els.log.scrollTop = els.log.scrollHeight;
  start();
  // Máy có chuột: tiêu điểm vào ô nhập ngay. Màn hình cảm ứng: không bật bàn phím ảo che khung, tiêu điểm vào nút đóng.
  (mode === "ready" && matchMedia("(pointer: fine)").matches ? els.input : els.close).focus();
}

export function closeChat() {
  if (!isOpen()) return;
  poller.stop();
  hideMenu();
  els.confirm.hidden = true;
  els.panel.hidden = true;
  document.documentElement.classList.remove("chat-open");
  opts.bubble.setAttribute("aria-expanded", "false");
  opts.bubble.focus();
  opts.onClose?.();
}

function build(l) {
  env = browserEnv();
  lang = Object.hasOwn(CHAT, l) ? l : "en";
  t = CHAT[lang];
  const panel = document.createElement("div");
  panel.className = "chat-panel";
  panel.id = "chat-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "chat-title");
  panel.hidden = true;
  panel.innerHTML = `<div class="chat-head">
<div class="chat-titles"><h2 class="chat-title" id="chat-title">${esc(t.title)}</h2><p class="chat-sub">${esc(t.sub)}</p></div>
<button class="chat-icon" type="button" data-menu aria-haspopup="true" aria-expanded="false" aria-controls="chat-menu" aria-label="${esc(t.menu)}">${DOTS}</button>
<button class="chat-icon" type="button" data-close aria-label="${esc(t.close)}">${use("x")}</button>
<div class="chat-menu" id="chat-menu" hidden><button type="button" data-delete>${use("trash")}<span>${esc(t.del)}</span></button></div>
</div>
<div class="chat-log" role="log" aria-labelledby="chat-title"></div>
<div class="chat-confirm" role="group" aria-labelledby="chat-confirm-text" hidden><p id="chat-confirm-text">${esc(t.confirm)}</p><div class="chat-actions"><button type="button" class="chat-btn is-danger" data-yes>${esc(t.confirmYes)}</button><button type="button" class="chat-btn" data-no>${esc(t.confirmNo)}</button></div></div>
<div class="chat-email" hidden>
<p class="chat-email-ask" id="chat-email-ask">${esc(t.emailAsk)}</p>
<button class="chat-icon chat-email-close" type="button" data-email-close aria-label="${esc(t.emailClose)}">${use("x")}</button>
<div class="chat-email-row"><input type="email" autocomplete="email" inputmode="email" maxlength="254" aria-labelledby="chat-email-ask" placeholder="${esc(t.emailLabel)}"><button type="button" class="chat-btn" data-email-save>${esc(t.emailSave)}</button></div>
<p class="chat-email-msg" role="status"></p>
</div>
<p class="chat-note" role="status"></p>
<div class="chat-compose">
<p class="chat-count" id="chat-count" hidden></p>
<label class="sr-only" for="chat-input">${esc(t.inputLabel)}</label>
<textarea id="chat-input" rows="1" placeholder="${esc(t.placeholder)}" aria-describedby="chat-count"></textarea>
<button class="chat-send" type="button" data-send aria-label="${esc(t.send)}" disabled>${use("arrow-right")}</button>
</div>
<p class="chat-off" hidden></p>
<p class="chat-foot">${esc(t.keep)} · <a href="${t.privacyHref}"${lang === "vi" ? "" : ' hreflang="en"'}>${esc(t.privacy)}</a></p>`;
  opts.root.append(panel);
  const q = (s) => panel.querySelector(s);
  els = {
    panel,
    log: q(".chat-log"),
    menuBtn: q("[data-menu]"),
    menu: q(".chat-menu"),
    delBtn: q("[data-delete]"),
    close: q("[data-close]"),
    confirm: q(".chat-confirm"),
    confirmYes: q("[data-yes]"),
    confirmNo: q("[data-no]"),
    email: q(".chat-email"),
    emailRow: q(".chat-email-row"),
    emailInput: q(".chat-email input"),
    emailSave: q("[data-email-save]"),
    emailClose: q("[data-email-close]"),
    emailMsg: q(".chat-email-msg"),
    note: q(".chat-note"),
    compose: q(".chat-compose"),
    count: q(".chat-count"),
    input: q("#chat-input"),
    send: q("[data-send]"),
    off: q(".chat-off"),
  };
  poller = createPoller({ mode: "open", env, tick });
  addMessage("owner", t.greeting);
  els.menuBtn.hidden = !env.store.load();
  wire();
}

function wire() {
  els.close.addEventListener("click", closeChat);
  els.menuBtn.addEventListener("click", toggleMenu);
  els.delBtn.addEventListener("click", askDelete);
  els.confirmYes.addEventListener("click", confirmDelete);
  els.confirmNo.addEventListener("click", () => {
    els.confirm.hidden = true;
    els.menuBtn.focus();
  });
  els.send.addEventListener("click", submit);
  els.input.addEventListener("input", onInput);
  els.input.addEventListener("keydown", (e) => {
    // Enter gửi, Shift+Enter xuống dòng. Đang gõ bằng bộ gõ (IME: tiếng Nhật, Trung, Hàn, Telex) thì Enter là chốt chữ, không gửi.
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  });
  els.emailSave.addEventListener("click", saveEmail);
  els.emailInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    saveEmail();
  });
  els.emailClose.addEventListener("click", () => {
    els.email.hidden = true;
    els.input.focus();
  });
  // Esc: đóng menu, rồi hộp hỏi xóa, rồi cả khung (tiêu điểm về bong bóng).
  opts.root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    e.preventDefault();
    if (!els.menu.hidden) {
      hideMenu();
      els.menuBtn.focus();
    } else if (!els.confirm.hidden) {
      els.confirm.hidden = true;
      els.menuBtn.focus();
    } else closeChat();
  });
  document.addEventListener("click", (e) => {
    if (!els.menu.hidden && !els.menu.contains(e.target) && !els.menuBtn.contains(e.target)) hideMenu();
  });
}

/** Mở khung: có cuộc chat thì hỏi tin mới (lần đầu lấy cả lịch sử); chưa có thì chỉ hỏi chat có đang bật không. */
function start() {
  if (env.store.load()) poller.start();
  else checkStatus();
}

function checkStatus() {
  env.api.status().then((r) => {
    if (r.ok && !env.store.load()) setMode(r.data?.enabled === false ? "off" : "ready");
  });
}

async function tick() {
  const st = env.store.load();
  if (!st) {
    poller.stop();
    return { result: { ok: true }, fresh: 0 };
  }
  const first = !loaded;
  if (first) els.log.setAttribute("aria-busy", "true"); // lịch sử hiện một lượt, trình đọc màn hình không đọc từng tin cũ
  const result = await env.api.messages(st.token, first ? 0 : lastId);
  els.log.removeAttribute("aria-busy");
  if (env.store.load()?.token !== st.token) return { result: { ok: true }, fresh: 0 }; // vừa xóa cuộc chat trong lúc chờ
  if (!result.ok) {
    if (outcome(result) === "reset") resetConversation();
    return { result, fresh: 0 };
  }
  loaded = true;
  const { enabled, status, messages = [] } = result.data ?? {};
  let fresh = 0;
  for (const m of messages) {
    lastId = Math.max(lastId, m.id);
    if (seen.has(m.id)) continue;
    addMessage(m.sender, m.text, { id: m.id, state: m.sender === "customer" ? "sent" : null });
    if (m.sender === "owner") fresh += 1;
  }
  setMode(enabled === false ? "off" : status === "closed" ? "closed" : "ready");
  // Khách đang nhìn khung nên đã thấy mọi tin: lastId tiến; còn chờ trả lời chỉ khi tin cuối là của khách.
  const last = messages.at(-1);
  env.store.save({ token: st.token, lastId, waitingSince: last ? (last.sender === "customer" ? last.created_at : null) : st.waitingSince });
  return { result, fresh };
}

function addMessage(sender, text, { id = null, state = null } = {}) {
  const row = document.createElement("div");
  row.className = `chat-msg is-${sender}`;
  const who = document.createElement("span");
  who.className = "sr-only";
  who.textContent = `${sender === "customer" ? t.you : t.support}: `;
  const body = document.createElement("p");
  body.className = "chat-text";
  body.textContent = text;
  row.append(who, body);
  if (id !== null) {
    row.dataset.id = String(id);
    seen.add(id);
  }
  els.log.append(row);
  if (state) setState(row, state);
  els.log.scrollTop = els.log.scrollHeight;
  return row;
}

/** Trạng thái tin của khách: "sending", "sent", hay "failed" (nút bấm để gửi lại đúng nội dung đó). */
function setState(row, state) {
  row.dataset.state = state;
  row.querySelector(".chat-state")?.remove();
  let el;
  if (state === "failed") {
    el = document.createElement("button");
    el.type = "button";
    el.textContent = t.failed;
    el.addEventListener("click", () => retry(row));
  } else {
    el = document.createElement("span");
    el.textContent = state === "sending" ? t.sending : t.sent;
  }
  el.className = "chat-state";
  row.append(el);
}

function submit() {
  const text = validText(els.input.value);
  if (!text || mode !== "ready") return;
  els.input.value = "";
  onInput();
  const row = addMessage("customer", text, { state: "sending" });
  queue = queue.then(() => deliver(text, row));
}

function retry(row) {
  if (mode !== "ready") return;
  setState(row, "sending");
  queue = queue.then(() => deliver(row.querySelector(".chat-text").textContent, row));
}

/** Gửi lần lượt từng tin (tin đầu tạo cuộc chat; tin sau phải đợi có token). */
async function deliver(text, row) {
  const st = env.store.load();
  const result = await env.api.send(st?.token ?? null, text, { lang, source: "web", page: location.pathname });
  poller.report(result);
  if (result.ok) {
    const m = result.data.message;
    row.dataset.id = String(m.id);
    seen.add(m.id);
    setState(row, "sent");
    note("");
    env.store.save({ token: result.data.token ?? st.token, lastId, waitingSince: m.created_at });
    if (!st) {
      // Tin đầu của cuộc chat mới: hiện menu ⋯ và thẻ email.
      loaded = true;
      els.menuBtn.hidden = false;
      els.email.hidden = false;
    }
    if (isOpen()) {
      poller.start({ immediate: false });
      poller.bump();
    } else opts.onClose?.(); // khung đã đóng trong lúc gửi: site.js bắt đầu hỏi 60 giây
    return;
  }
  setState(row, "failed");
  const o = outcome(result);
  if (o === "reset") {
    resetConversation();
    els.log.append(row); // tin chưa gửi vẫn ở đó: bấm "thử lại" thì mở cuộc chat mới
  } else if (o === "closed") setMode("closed");
  else if (o === "disabled") setMode("off");
  else note(o === "busy" ? t.busy : o === "rate" ? t.rate : o === "network" ? t.network : t.invalid);
}

/** Về trạng thái mới (401, hay khách xóa cuộc chat): xóa bản lưu, chỉ còn lời chào. */
function resetConversation() {
  poller.stop();
  env.store.clear();
  seen.clear();
  lastId = 0;
  loaded = false;
  els.log.replaceChildren();
  addMessage("owner", t.greeting);
  els.menuBtn.hidden = true;
  els.email.hidden = true;
  setMode("ready");
  checkStatus();
}

/** Chat tắt hay cuộc chat bị chặn: thay ô nhập bằng dòng email support@ (lịch sử vẫn hiện). */
function setMode(m) {
  mode = m;
  els.compose.hidden = m !== "ready";
  els.off.hidden = m === "ready";
  if (m !== "ready") {
    fillEmail(els.off, m === "off" ? t.off : t.closed);
    els.email.hidden = true;
  }
}

function fillEmail(el, template) {
  const [before, after] = template.split("{email}");
  const a = document.createElement("a");
  a.href = `mailto:${SUPPORT_EMAIL}`;
  a.textContent = SUPPORT_EMAIL;
  el.replaceChildren(before, a, after);
}

/** Dòng báo lỗi dưới khung tin (vùng role=status, đọc một lần khi đổi). */
function note(text) {
  if (text.includes("{email}")) fillEmail(els.note, text);
  else els.note.textContent = text;
}

function onInput() {
  const n = charCount(normalizeText(els.input.value));
  const over = n > MAX_CHARS;
  els.count.hidden = n < COUNT_FROM;
  els.count.textContent = `${n}/${MAX_CHARS}`;
  els.count.classList.toggle("is-over", over);
  els.input.setAttribute("aria-invalid", String(over));
  els.send.disabled = n === 0 || over;
  if (over) note(t.tooLong);
  else if (els.note.textContent === t.tooLong) note("");
  // Ô nhập cao theo nội dung tới khoảng 6 dòng (gán qua CSSOM, không phải thuộc tính style, nên CSP không chặn).
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 150)}px`;
}

async function saveEmail() {
  const value = els.emailInput.value.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    els.emailMsg.textContent = t.emailBad;
    return;
  }
  const st = env.store.load();
  if (!st) return;
  els.emailSave.disabled = true;
  const result = await env.api.setEmail(st.token, value);
  els.emailSave.disabled = false;
  poller.report(result);
  if (result.ok) {
    els.emailRow.hidden = true;
    els.emailMsg.textContent = t.emailSaved;
    return;
  }
  const o = outcome(result);
  if (o === "reset") resetConversation();
  else if (o === "closed") setMode("closed");
  else els.emailMsg.textContent = o === "invalid" ? t.emailBad : t.emailFail;
}

function toggleMenu() {
  const show = els.menu.hidden;
  els.menu.hidden = !show;
  els.menuBtn.setAttribute("aria-expanded", String(show));
  if (show) els.delBtn.focus();
}

function hideMenu() {
  els.menu.hidden = true;
  els.menuBtn.setAttribute("aria-expanded", "false");
}

function askDelete() {
  hideMenu();
  els.confirm.hidden = false;
  els.confirmNo.focus();
}

async function confirmDelete() {
  const st = env.store.load();
  els.confirmYes.disabled = true;
  const result = st ? await env.api.remove(st.token) : { ok: true };
  els.confirmYes.disabled = false;
  els.confirm.hidden = true;
  // 200 hay 401 (cuộc chat đã không còn): xóa bản lưu, về trạng thái mới. Lỗi khác: giữ nguyên, báo lỗi.
  if (!result.ok && outcome(result) !== "reset") {
    note(t.delFail);
    els.menuBtn.focus();
    return;
  }
  resetConversation();
  note("");
  (mode === "ready" ? els.input : els.close).focus();
}
```

- [ ] **Step 5: `build.mjs`: băm cả khung chat**

Tệp: `website/src/build/build.mjs`

```old
/** Lõi chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3): ES module tên có mã băm, site.js chỉ tải khi khách đang chờ trả lời.
 *  site.js đọc đường dẫn qua thuộc tính data-chat-* của thẻ script (layout.mjs), nên không cần script nội tuyến mới. */
async function chatAssets() {
  const core = await readFile(path.join(SRC, "assets", "chat-core.js"));
  const out = { core: `/assets/bundle/chat-core.${sha(core)}.js` };
  await writeOut(out.core.slice(1), core);
  return out;
}
```
```new
/** Chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3): các ES module và CSS tên có mã băm. site.js tải chat-core.js khi khách đang
 *  chờ trả lời, chat.js và chat.css khi khách bấm bong bóng; đường dẫn đi qua thuộc tính data-chat-* của thẻ script (layout.mjs),
 *  nên không cần script nội tuyến mới. chat.js nhập "./chat-core.js" và "./chat-strings.js": hai dòng đó được đổi thành tên đã
 *  băm trước khi băm chính chat.js, nên sửa một file con thì tên chat.js cũng đổi (cache immutable không giữ bản cũ). */
async function chatAssets() {
  const out = {};
  const named = {};
  for (const [key, name] of [["core", "chat-core"], ["strings", "chat-strings"]]) {
    const buf = await readFile(path.join(SRC, "assets", `${name}.js`));
    out[key] = `/assets/bundle/${name}.${sha(buf)}.js`;
    named[`${name}.js`] = path.posix.basename(out[key]);
    await writeOut(out[key].slice(1), buf);
  }
  const ui = (await readFile(path.join(SRC, "assets", "chat.js"), "utf8")).replace(/from "\.\/([a-z-]+\.js)"/g, (m, f) => {
    if (!named[f]) throw new Error(`chat.js nhập file không có trong bundle: ${f}`);
    return `from "./${named[f]}"`;
  });
  const css = await readFile(path.join(SRC, "assets", "chat.css"));
  out.ui = `/assets/bundle/chat.${sha(ui)}.js`;
  out.css = `/assets/bundle/chat.${sha(css)}.css`;
  await writeOut(out.ui.slice(1), ui);
  await writeOut(out.css.slice(1), css);
  return out;
}
```

- [ ] **Step 6: `layout.mjs`: thêm đường dẫn khung chat**

Tệp: `website/src/build/layout.mjs`

```old
  return ` data-chat-core="${c.core}" data-chat-lang="${page.lang}" data-chat-label="${esc(t.open)}" data-chat-unread="${esc(t.unread)}"`;
```
```new
  return ` data-chat-core="${c.core}" data-chat-ui="${c.ui}" data-chat-css="${c.css}" data-chat-lang="${page.lang}" data-chat-label="${esc(t.open)}" data-chat-unread="${esc(t.unread)}"`;
```

- [ ] **Step 7: Chạy để thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)" && node --test test/chat-widget.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)" && node --test test/chat-strings.test.mjs 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"
```
Expected: `ℹ tests 78`, `ℹ pass 78`, `ℹ fail 0`; `ℹ tests 16`, `ℹ pass 16`, `ℹ fail 0` (khoảng 50 giây); `ℹ tests 5`, `ℹ pass 5`, `ℹ fail 0` (test "không nhắc Zalo" giờ quét cả `chat.js`, `chat.css`). Một test trình duyệt đỏ thì đọc thông báo `assert` và `p.errors` (lỗi CSP hiện ở đó dạng `security: … violates the following Content Security Policy directive …`); sửa mã cho đúng hợp đồng, không nới test.

- [ ] **Step 8: Cả bộ test và bản dựng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" && pnpm build 2>&1 | tail -1 && ls dist/assets/bundle/
```
Expected: `ℹ tests 191`, `ℹ pass 189`, `ℹ fail 0`, `ℹ skipped 2`; `Đã sinh 119 trang vào dist (…)`; `dist/assets/bundle/` có sáu file: `chat-core.<10 hex>.js`, `chat-strings.<10 hex>.js`, `chat.<10 hex>.js`, `chat.<10 hex>.css`, `site.<10 hex>.css`, `site.<10 hex>.js`.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/src/assets/chat.css website/src/assets/chat.js website/src/build/build.mjs website/src/build/layout.mjs website/test/site.test.mjs website/test/chat-widget.test.mjs && git commit -q -m "feat(website): khung chat hỗ trợ (gửi, nhận trả lời, thẻ email, xóa, chế độ tắt)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 8: README của website

**Files:**
- Modify: `website/README.md`

Thêm vào README: dòng cấu trúc, câu về nơi duy nhất trang gọi ra ngoài site, mục "Chat hỗ trợ (bong bóng)", và **ngoại lệ không `pnpm deploy`** cho đợt chat. Ngoại lệ đặt ngay ở kế hoạch này vì bong bóng vào `main` từ Task 6, có thể trước kế hoạch 04; kế hoạch 04 (bước "Ngoại lệ deploy") kiểm cụm `Ngoại lệ, đợt chat hỗ trợ` và bỏ qua nếu đã có, nên câu dưới nêu luôn phần của kế hoạch 04.

- [ ] **Step 1: Sửa README**

Tệp: `website/README.md`

```old
src/assets/             site.css, site.js, font Be Vietnam Pro (OFL), ảnh (img/, og/, app/)
```
```new
src/assets/             site.css, site.js, chat hỗ trợ (chat-core.js, chat-strings.js, chat.js, chat.css), font Be Vietnam Pro (OFL), ảnh (img/, og/, app/)
```

```old
- Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`).
```
```new
- Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`). Nơi duy nhất ngoài site mà trang gọi tới là API của chính dự án cho chat hỗ trợ (`connect-src` có `https://api.aitranslator.io.vn`; xem mục Chat hỗ trợ).
```

```old
## Script cài macOS (`src/public/install.sh`)
```
```new
## Chat hỗ trợ (bong bóng)
Spec: `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md` mục 3. Hợp đồng API và hợp đồng phía khách (nhịp hỏi tin, bản lưu, lời chào, mã lỗi): `docs/superpowers/plans/2026-10-22-chat-ho-tro-00-tong-quan.md`; app dùng cùng hợp đồng, đổi một bên thì đổi bên kia.
- `site.js` chèn bong bóng góc dưới phải ở mọi trang (tắt JS thì không có; trang Liên hệ vẫn có email). Đường dẫn đã băm của chat đi qua thuộc tính `data-chat-*` của thẻ script `site.js` (`chatAttrs` ở `src/build/layout.mjs`), nên CSP không thêm script nội tuyến nào. `chat.js` và `chat.css` chỉ tải khi bấm bong bóng; `chat-core.js` tải thêm khi khách đang chờ trả lời (tin cuối là của khách, gửi trong 24 giờ qua) để hỏi tin mới lúc tải trang rồi mỗi 60 giây, có trả lời thì hiện chấm đỏ.
- `chatAssets` ở `src/build/build.mjs` băm `chat-core.js` và `chat-strings.js`, đổi hai dòng `import` của `chat.js` thành tên đã băm rồi mới băm `chat.js`. `chat.js` chỉ được nhập hai file đó, viết đúng dạng `from "./tên.js"` (dựng sẽ báo lỗi nếu nhập file khác).
- Chỉ gọi `https://api.aitranslator.io.vn` (`API` ở `src/assets/chat-core.js`, cũng là nguồn của `connect-src` trong CSP); không có biến hay cách ghi đè URL (CLAUDE.md). Bản xem cục bộ (`pnpm dev`) không gọi được API thật vì CORS chỉ cho `https://aitranslator.io.vn`: mở được khung, gửi tin sẽ báo không kết nối được. Test dùng API giả chặn qua Chrome DevTools Protocol (`test/chat-widget.test.mjs`).
- Lưu trên trình duyệt: `localStorage` khóa `support.v1` = `{ token, lastId, waitingSince }`. `lastId` chỉ tiến khi khách mở khung và thấy tin (nên chấm đỏ còn ở trang sau); trình duyệt chặn `localStorage` thì cuộc chat chỉ sống trong trang hiện tại.
- Chữ năm ngôn ngữ ở `src/assets/chat-strings.js` (tiêu đề, dòng phụ, lời chào, chân khung trích đúng hợp đồng; nhãn bong bóng đi vào HTML lúc dựng). Sửa chữ thì sửa đủ năm bản. **Không** file nào trong `src/assets/` được nhắc tên dịch vụ chuyển tin, kể cả trong chú thích: mã gửi xuống trình duyệt ai cũng đọc được (test `chat-strings.test.mjs` chặn).
- Test: `test/chat-core.test.mjs` (lõi, không cần trình duyệt), `test/chat-strings.test.mjs`, `test/chat-widget.test.mjs` (Chrome không đầu), và các test CSP, `data-chat-*` trong `test/site.test.mjs`.

## Script cài macOS (`src/public/install.sh`)
```

```old
Website là bước sau cùng của mục 9 (bước 11), chỉ khi bản app có Creem đã đăng và Creem đang bán thật; đọc mục 9 trước khi deploy bất cứ thứ gì sau khi gộp.
```
```new
Website là bước sau cùng của mục 9 (bước 11), chỉ khi bản app có Creem đã đăng và Creem đang bán thật; đọc mục 9 trước khi deploy bất cứ thứ gì sau khi gộp.
- **Ngoại lệ, đợt chat hỗ trợ: từ lúc nội dung chat vào `main` (bong bóng của kế hoạch 02; trang Liên hệ, Dữ liệu và bảo mật, chính sách mục 11 của kế hoạch 04) cho tới bước deploy website của `docs/release/phat-hanh.md` mục 11, KHÔNG `pnpm deploy`.** Trong khoảng đó `main` có bong bóng gọi `/v1/support/*` của `api.aitranslator.io.vn` trong khi server có thể chưa có các đường đó (khung chat sẽ báo không gửi được), app chưa có màn hình Hỗ trợ, và các trang nói về chat có thể đi trước chính sách. Website đi sau khi app 0.2.4 đã lên R2 (spec chat hỗ trợ, mục 7).
```

- [ ] **Step 2: Kiểm**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -c "^## Chat hỗ trợ (bong bóng)$" website/README.md && grep -c "Ngoại lệ, đợt chat hỗ trợ" website/README.md && git diff --stat -- website/README.md
```
Expected: `1`, `1`; `website/README.md | 14 ++++++++++++--` (`1 file changed, 12 insertions(+), 2 deletions(-)`).

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test "$(git branch --show-current)" = main && git add website/README.md && git commit -q -m "docs(website): README mục chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 9: Kiểm cuối

**Files:** không sửa file nào.

- [ ] **Step 1: Cả bộ test, bản dựng, CSP trong `_headers`**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" && pnpm build 2>&1 | tail -1 && grep "Content-Security-Policy" dist/_headers
```
Expected: `ℹ tests 191`, `ℹ pass 189`, `ℹ fail 0`, `ℹ skipped 2`; `Đã sinh 119 trang vào dist (…)`; dòng CSP có `connect-src 'self' https://api.aitranslator.io.vn`, còn `script-src 'self' 'sha256-…'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self' data:` như cũ.

- [ ] **Step 2: Không thêm thư viện, không đụng phần của kế hoạch khác, không nhắc Zalo trong mã gửi xuống trình duyệt**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git diff --stat 01c2077a HEAD -- website/package.json website/pnpm-lock.yaml website/src/content docs/legal && git diff --name-only 01c2077a HEAD -- website && grep -il zalo website/src/assets/*.js website/src/assets/*.css website/dist/assets/bundle/*; echo "grep zalo: $?"
```
Expected: lệnh `git diff --stat` đầu không in gì; danh sách file đổi đúng 13 file của bảng "Cấu trúc file"; `grep zalo: 1` (không file nào khớp). Nếu `01c2077a` không còn là cha của các commit kế hoạch (có người commit xen vào `main`), thay bằng commit ngay trước commit của Task 1 (`git log --oneline -12`).

- [ ] **Step 3: Xem tận mắt (không bắt buộc)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm dev
```
Mở `http://127.0.0.1:4173/`: bong bóng ở góc dưới phải; bấm thì khung hiện đúng tiêu đề, dòng phụ, lời chào. Gửi tin sẽ báo "Không kết nối được…" vì API thật chỉ cho origin `https://aitranslator.io.vn` (đúng như spec mục 3, "Bản xem cục bộ"). Xem xong thì dừng `pnpm dev` (Ctrl+C) và kiểm không còn tiến trình nghe cổng 4173: `lsof -nP -iTCP:4173 -sTCP:LISTEN` không in gì.

- [ ] **Step 4: Báo cho người giao việc**

Ghi lại: số test (191, `pass` 189 so với mốc 150), danh sách commit (`git log --oneline -8`), và nhắc: **chưa deploy website**; website chỉ deploy sau khi server (kế hoạch 01) đã chạy và app 0.2.4 lên R2 (spec mục 7); trước khi server có `/v1/support/*`, khung chat trên website thật sẽ báo "Không gửi được tin này." (máy chủ trả 404). Kế hoạch 04 còn phải nói về chat trên trang Liên hệ, Dữ liệu và bảo mật và chính sách (kể cả bản lưu `support.v1` trong `localStorage` của trình duyệt).

---

## Tự rà: đối chiếu spec mục 3 và hợp đồng phía khách

| Yêu cầu | Ở đâu | Test |
|---|---|---|
| Bong bóng góc dưới phải ở mọi trang năm ngôn ngữ, do `site.js` chèn; tắt JS thì không có | Task 6 (`site.js`, `site.css`) | `chat-widget`: "mọi trang năm ngôn ngữ (và 404)…", "tắt JavaScript…" |
| File khung chat (JS, CSS) tách riêng, tên có mã băm, chỉ tải khi bấm | Task 5, 7 (`chatAssets`, `chatAttrs`) | `site`: "HTML không tải sẵn…", "data-chat-ui, data-chat-css…"; `chat-widget`: "chưa bấm thì không tải file chat", "bấm bong bóng: tải chat.js và chat.css…" |
| Truyền URL đã băm mà không thêm script nội tuyến (CSP) | Task 5 (`data-chat-*`) | `site`: "CSP trong _headers băm đúng script nội tuyến…" (có sẵn), "chat hỗ trợ: mọi trang (và 404)…" |
| CSP `connect-src 'self' https://api.aitranslator.io.vn`, không thêm nguồn khác | Task 5 (`headers()`) | `site`: "CSP: connect-src chỉ thêm API…" |
| Tiêu đề "Hỗ trợ AI Translator", dòng phụ, lời chào theo ngôn ngữ trang | Task 4, 7 | `chat-strings`: "tiêu đề, dòng phụ, lời chào…"; `chat-widget`: "bấm bong bóng…" (cả năm ngôn ngữ) |
| Enter gửi, Shift+Enter xuống dòng | Task 7 | `chat-widget`: "gửi tin: Enter gửi, Shift+Enter…" |
| Đếm ký tự khi gần 1000 | Task 1, 7 | `chat-core`: "luật chữ…"; `chat-widget`: "đếm ký tự…" |
| Trạng thái "Đã gửi" / "Không gửi được, thử lại" (bấm gửi lại đúng nội dung) | Task 7 | `chat-widget`: "gửi tin…", "lỗi khi gửi: 429…" |
| Thẻ email sau tin đầu, lưu bằng `PUT /v1/support/email`, đóng thẻ được | Task 7 | `chat-widget`: "thẻ email…" |
| Menu ⋯ "Xóa cuộc trò chuyện" có hỏi lại; `200`/`401` thì xóa bản lưu | Task 7 | `chat-widget`: "menu ⋯ Xóa cuộc trò chuyện…" |
| Chân khung "lưu 90 ngày · Quyền riêng tư" (vi → bản vi; khác → `/en/privacy/`) | Task 4, 7 | `chat-strings`: "liên kết Quyền riêng tư…"; `chat-widget`: "bấm bong bóng…" |
| Chat tắt (`enabled=false`, `503`) hay bị chặn (`closed`, `403`): thay ô nhập bằng email support@, lịch sử vẫn hiện | Task 7 | `chat-widget`: "chat tắt…; cuộc chat bị chặn…" |
| Điện thoại: khung toàn màn hình | Task 7 (`chat.css`) | `chat-widget`: "điện thoại 375 px…" |
| Bàn phím: mở và đóng bằng phím, Esc đóng, tin mới đọc qua `aria-live` | Task 6, 7 (bong bóng là `<button>`, phím Esc, tiêu điểm về bong bóng, `role="log"`) | `chat-widget`: "bấm bong bóng… Esc đóng, tiêu điểm về bong bóng; phím cách mở lại", "trả lời của chủ dự án… vùng role=log" |
| Theme sáng/tối theo token của `site.css` | Task 6, 7 | `chat-widget`: "điện thoại 375 px… màu theo token sáng/tối" |
| `localStorage` khóa `support.v1` = `{ token, lastId, waitingSince }`; ném lỗi thì chỉ sống trong trang | Task 1, 7 | `chat-core`: "createStore…" (hai test); `chat-widget`: "localStorage không dùng được…" |
| Nhịp: mở 3 giây → 15 giây sau 2 phút; về 3 giây khi có tin hay khách gửi | Task 3 | `chat-core`: "poller khung mở…"; `chat-widget`: "trả lời của chủ dự án… (hỏi mỗi 3 giây)" |
| Khung đóng, đang chờ (24 giờ): hỏi lúc tải trang rồi 60 giây; có trả lời thì chấm đỏ | Task 3, 6 | `chat-core`: "poller khung đóng (watch)…", "watchReply…" (hai test); `chat-widget`: "đang chờ trả lời…", "đóng khung khi đang chờ…" |
| Còn lại, kể cả chưa từng chat: không gọi mạng | Task 6 | `chat-widget`: "chưa bấm thì… không gọi API", "không chờ trả lời…" |
| Chỉ hỏi khi tab đang hiện (`visibilitychange`) | Task 3 | `chat-core`: "poller: tab ẩn…"; `chat-widget`: "…tab ẩn thì không hỏi, hiện lại thì hỏi tiếp" |
| `429`: chờ `Retry-After` (tối thiểu 15 giây), báo "gửi quá nhanh" hay "đang bận…support@"; lỗi mạng giãn 3 → 15 → 60 giây | Task 2, 3, 7 | `chat-core`: "poller: 429…"; `chat-widget`: "lỗi khi gửi…" |
| `401 invalid_token`: xóa bản lưu, tin kế tiếp mở cuộc mới | Task 3, 7 | `chat-core`: "watchReply: 401…"; `chat-widget`: "401…" |
| Lịch sử khi mở lại: `GET ?after=0` | Task 7 (`tick`, `loaded`) | `chat-widget`: "401…" (gọi `after=0` lúc mở), "đóng khung khi đang chờ…" |
| Tin đầu gửi `{ text, lang, source: "web", page }`; tin sau chỉ `{ text }` | Task 2, 7 | `chat-core`: "createApi: đúng đường dẫn…"; `chat-widget`: "gửi tin…" |
| Chữ đủ năm ngôn ngữ; không nhắc Zalo | Task 4 | `chat-strings`: năm test |
| Test dùng server giả (CORS chỉ cho domain thật) | Task 6, 7 | `fakeApi` (Fetch domain) |

Kiểm chữ giữ chỗ: không bước nào để trống hay hẹn "làm sau"; mọi bước sửa mã có mã đầy đủ, mọi lệnh có kết quả mong đợi. Tên dùng xuyên task: `createPoller`/`report`/`bump`/`start({ immediate })`/`stop`, `watchReply({ immediate, onReply, env })`, `browserEnv()`, `chatAssets()` trả `{ core, strings, ui, css }`, `chatAttrs(page, ctx)`, `data-chat-core|ui|css|lang|label|unread` (`dataset.chatCore|chatUi|chatCss|chatLang|chatLabel|chatUnread`), `openChat({ root, bubble, lang, onClose })`, `closeChat()`, `isOpen()`, khóa chữ `CHAT[lang].open|unread|title|sub|greeting|keep|privacy|privacyHref|…`.

Toàn bộ mã trong kế hoạch đã chạy thật trên một bản sao của `main` (`01c2077a`) theo đúng thứ tự task, với các số test ở bảng "Mốc số test".
