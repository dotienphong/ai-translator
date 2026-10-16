// Các hằng nối giữa app (Rust) và server (TypeScript) không được trôi lệch nhau (kế hoạch hardening 06, task C5).
// Test đọc thẳng file nguồn rồi đối chiếu, nên không có hai nơi cùng ghi một con số mà quên đổi nơi kia. Chạy bằng `pnpm test:scripts`.
//
// 1. Tên miền trang thanh toán của Creem (server) phải nằm trong `EXTERNAL_HOSTS` của app: nếu không, nút mở trang
//    thanh toán trong app bị chặn (`navigation.rs`).
// 2. Nhịp hỏi trạng thái đơn thẻ của app (`purchase.rs`) phải nằm dưới hạn mức `order_poll` của server (`ratelimit.ts`) ở mọi
//    giờ đồng hồ, dù đơn tạo lúc nào trong giờ. Server không gửi `Retry-After` cho app nên app không tự thích ứng được.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Đọc file nguồn của repo (đường dẫn từ gốc repo). Thiếu file thì lỗi nói rõ file nào. */
function source(path) {
  try {
    return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  } catch (e) {
    throw new Error(`không đọc được ${path}: ${e.message}`);
  }
}

/** Tính biểu thức số học thuần như `30 * 60` hay `24 * 3600` (chỉ chữ số, `_`, khoảng trắng, `+ - * / ( )`). */
function arithmetic(expr, where) {
  const clean = expr.replace(/_/g, "").trim();
  if (!/^[\d\s+\-*/()]+$/.test(clean)) throw new Error(`${where}: biểu thức không phải số học thuần: ${expr}`);
  const value = Function(`"use strict"; return (${clean});`)();
  if (!Number.isFinite(value)) throw new Error(`${where}: biểu thức không ra số hữu hạn: ${expr}`);
  return value;
}

/** Hằng số của file Rust: `[pub] const TÊN: kiểu = biểu thức;`. */
function rustConst(text, name, file) {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*:\\s*[A-Za-z0-9_]+\\s*=\\s*([^;]+);`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy hằng ${name} (đổi tên hay đổi dạng khai báo thì sửa test này theo)`);
  return arithmetic(m[1], `${file}: ${name}`);
}

/** Hằng số của file TypeScript: `[export] const TÊN = biểu thức;`. */
function tsConst(text, name, file) {
  const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*([^;]+);`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy hằng ${name} (đổi tên hay đổi dạng khai báo thì sửa test này theo)`);
  return arithmetic(m[1], `${file}: ${name}`);
}

/** Danh sách tên miền `EXTERNAL_HOSTS` của app (bỏ chú thích `//` rồi lấy các chuỗi trong dấu nháy kép). */
function externalHosts(text, file) {
  const m = /pub const EXTERNAL_HOSTS: &\[&str\] = &\[([\s\S]*?)\];/.exec(text);
  if (!m) throw new Error(`${file}: không thấy EXTERNAL_HOSTS`);
  const hosts = [...m[1].replace(/\/\/.*$/gm, "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (hosts.length === 0) throw new Error(`${file}: EXTERNAL_HOSTS rỗng hay đổi dạng khai báo`);
  return hosts;
}

const NAVIGATION = "src-tauri/src/navigation.rs";
const PURCHASE = "src-tauri/src/license/purchase.rs";
const CREEM = "server/src/payment/creem.ts";
const CHECKOUT = "server/src/checkout.ts";
const RATELIMIT = "server/src/ratelimit.ts";

/** Hạn mức `order_poll` của server: `order_poll: 600,` trong `LIMITS`. */
function orderPollLimit(text, file) {
  const m = /^\s*order_poll:\s*([\d_]+)\s*,/m.exec(text);
  if (!m) throw new Error(`${file}: không thấy hạn mức order_poll trong LIMITS`);
  return arithmetic(m[1], `${file}: order_poll`);
}

/** Mọi hằng làm nên lịch hỏi và hạn mức, đọc từ file nguồn thật. */
function readConstants() {
  const purchase = source(PURCHASE);
  const ratelimit = source(RATELIMIT);
  const checkout = source(CHECKOUT);
  return {
    every: rustConst(purchase, "POLL_EVERY_CARD_SECS", PURCHASE),
    late: rustConst(purchase, "POLL_LATE_CARD_SECS", PURCHASE),
    fast: rustConst(purchase, "LATE_CARD_FAST_WINDOW_SECS", PURCHASE),
    stale: rustConst(purchase, "POLL_STALE_CARD_SECS", PURCHASE),
    keep: rustConst(purchase, "KEEP_AFTER_EXPIRY_SECS", PURCHASE),
    ttl: tsConst(checkout, "CREEM_CHECKOUT_TTL_SECONDS", CHECKOUT),
    window: tsConst(ratelimit, "WINDOW_SECONDS", RATELIMIT),
    limit: orderPollLimit(ratelimit, RATELIMIT),
  };
}

// Trong hạn mỗi `every` giây; quá hạn `ttl` mỗi `late` giây trong `fast` giây đầu, rồi mỗi `stale` giây; thôi hỏi sau `keep`
// giây kể từ hạn. Đúng `poll_secs` và `KEEP_AFTER_EXPIRY_SECS` của purchase.rs (`now <= expires_at` là còn trong hạn).
function pollStats({ every, late, fast, stale, keep, ttl, window }) {
  for (const [name, v] of Object.entries({ every, late, fast, stale, keep, ttl, window })) {
    assert.ok(Number.isInteger(v) && v > 0, `${name} phải là số nguyên dương, đang là ${v}`);
  }
  let busiest = 0;
  let busiestCreatedAt = 0;
  let total = 0;
  // Cửa sổ của server là cố định theo giờ đồng hồ (`windowStart = now - (now % WINDOW_SECONDS)`), nên chỉ cần thử mọi giây tạo
  // đơn trong MỘT giờ: dời thời điểm tạo đơn đi cả số nguyên lần cửa sổ thì mọi con số y nguyên.
  for (let created = 0; created < window; created++) {
    const expiresAt = created + ttl;
    const lastPoll = expiresAt + keep;
    const perWindow = new Map();
    let polls = 0;
    for (let t = created; t <= lastPoll; ) {
      const bucket = Math.floor(t / window);
      perWindow.set(bucket, (perWindow.get(bucket) ?? 0) + 1);
      polls += 1;
      t += t <= expiresAt ? every : t <= expiresAt + fast ? late : stale;
    }
    const most = Math.max(...perWindow.values());
    if (most > busiest) {
      busiest = most;
      busiestCreatedAt = created;
    }
    total = Math.max(total, polls);
  }
  return { busiest, busiestCreatedAt, total };
}

/**
 * Hai điều kiện cho một đơn thẻ bỏ dở (khách không trả, app cứ hỏi tới hết `keep`):
 * - mỗi cửa sổ giờ cố định, số lần hỏi dưới hạn mức `order_poll` (vượt thì server trả 429 và đơn của khách trả muộn bị lỡ nhịp);
 * - cả vòng đời dưới `2 × order_poll`. Điều kiện này không đến từ hạn mức giờ (pha 30 giây kéo dài cả ngày vẫn chỉ 120 lần mỗi
 *   giờ, dưới hạn mức) mà để giữ chi phí D1: mỗi lần hỏi ghi một dòng `rate_limits`. Nhịp hiện tại (5 giây, 30 giây, 120 giây)
 *   cho 1 171 lần; nhịp cũ (30 giây cả ngày) là 3 241 lần (M1 của review C1). Cố ý tăng thì đổi ngân sách ở đây.
 */
function problems(constants) {
  const { busiest, busiestCreatedAt, total } = pollStats(constants);
  const out = [];
  if (busiest >= constants.limit) {
    out.push(
      `đơn tạo ở giây ${busiestCreatedAt} của giờ có ${busiest} lần hỏi trong một cửa sổ giờ, không dưới hạn mức order_poll ${constants.limit}`,
    );
  }
  const budget = 2 * constants.limit;
  if (total >= budget) {
    out.push(`một đơn thẻ bỏ dở bị hỏi ${total} lần cả vòng đời, không dưới ngân sách ${budget} (2 × order_poll)`);
  }
  return out;
}

test("CREEM_CHECKOUT_HOST của server có trong EXTERNAL_HOSTS của app", () => {
  const creem = source(CREEM);
  const m = /^\s*(?:export\s+)?const\s+CREEM_CHECKOUT_HOST\s*=\s*"([^"]+)"\s*;/m.exec(creem);
  assert.ok(m, `${CREEM}: không thấy hằng CREEM_CHECKOUT_HOST (đổi tên hay đổi dạng khai báo thì sửa test này theo)`);
  const hosts = externalHosts(source(NAVIGATION), NAVIGATION);
  assert.ok(
    hosts.includes(m[1]),
    `server trả trang thanh toán ở ${m[1]} nhưng EXTERNAL_HOSTS của app chỉ có ${hosts.join(", ")}: app sẽ chặn không mở được`,
  );
});

test("nhịp hỏi đơn thẻ của app nằm dưới hạn mức order_poll của server ở mọi giờ đồng hồ", () => {
  const constants = readConstants();
  // Đơn thẻ của server giữ đúng `ttl`; khách tạo đơn ở giây bất kỳ của giờ. Cửa sổ hạn mức của server là cố định theo giờ đồng
  // hồ (kiểm đúng công thức ở đây: đổi sang cửa sổ trượt thì mô hình dưới đây hết đúng).
  assert.ok(
    /const windowStart = now - \(now % WINDOW_SECONDS\);/.test(source(RATELIMIT)),
    `${RATELIMIT}: cửa sổ hạn mức không còn là cố định theo giờ đồng hồ; mô hình của test này phải viết lại`,
  );
  assert.ok(
    /USD:\s*\{[^}]*ttl:\s*CREEM_CHECKOUT_TTL_SECONDS/.test(source(CHECKOUT)),
    `${CHECKOUT}: đơn USD (Creem) không còn dùng CREEM_CHECKOUT_TTL_SECONDS làm hạn`,
  );
  assert.deepEqual(problems(constants), [], `hằng đọc được: ${JSON.stringify(constants)}`);
});

// Đột biến trong bộ nhớ: đổi hằng đã đọc được trước khi so, để chứng minh phép so thật sự bắt được lệch. Không đụng file nguồn.
test("kiểm nhịp hỏi báo lỗi khi nhịp bị giảm hay pha 30 giây kéo dài, và im khi đổi vô hại", () => {
  const real = readConstants();
  assert.deepEqual(problems(real), [], "bản thật phải đạt thì đột biến dưới đây mới có nghĩa");
  const red = {
    "nhịp đơn thẻ trong hạn giảm về 1 giây": { every: 1 },
    "pha sau hạn giảm về 5 giây": { late: 5 },
    "pha 30 giây kéo dài cả ngày (cửa sổ nhanh = hết thời gian giữ)": { fast: real.keep },
    "pha 120 giây giảm về 60 giây": { stale: 60 },
    "hạn đơn thẻ nới lên 2 giờ": { ttl: 2 * 3600 },
    "hạn mức order_poll của server hạ xuống 400": { limit: 400 },
  };
  for (const [what, change] of Object.entries(red)) {
    assert.notDeepEqual(problems({ ...real, ...change }), [], `đột biến "${what}" phải làm kiểm bị đỏ`);
  }
  // Đổi vô hại (hỏi thưa hơn) thì không báo lỗi, để biết kiểm không đỏ bừa.
  assert.deepEqual(problems({ ...real, stale: 180 }), []);
  // Báo lỗi đúng lý do: giảm nhịp về 1 giây vi phạm hạn mức giờ; pha 30 giây cả ngày chỉ vi phạm ngân sách cả vòng đời.
  assert.match(problems({ ...real, every: 1 })[0], /cửa sổ giờ/);
  const longLate = problems({ ...real, fast: real.keep });
  assert.equal(longLate.length, 1, longLate.join("\n"));
  assert.match(longLate[0], /ngân sách/);
});

test("đọc hằng báo lỗi rõ khi không thấy hay không phải số học thuần", () => {
  assert.equal(rustConst("pub const POLL_EVERY_CARD_SECS: u64 = 5;\n", "POLL_EVERY_CARD_SECS", "x.rs"), 5);
  assert.equal(rustConst("const KEEP_AFTER_EXPIRY_SECS: i64 = 24 * 3600;\n", "KEEP_AFTER_EXPIRY_SECS", "x.rs"), 86400);
  assert.equal(tsConst("export const CREEM_CHECKOUT_TTL_SECONDS = 30 * 60;\n", "CREEM_CHECKOUT_TTL_SECONDS", "x.ts"), 1800);
  assert.equal(orderPollLimit("export const LIMITS = {\n  order_poll: 600,\n} as const;\n", "x.ts"), 600);
  assert.throws(() => rustConst("const OTHER: u64 = 1;\n", "POLL_EVERY_CARD_SECS", "x.rs"), /x\.rs: không thấy hằng POLL_EVERY_CARD_SECS/);
  assert.throws(() => tsConst("const OTHER = 1;\n", "WINDOW_SECONDS", "x.ts"), /x\.ts: không thấy hằng WINDOW_SECONDS/);
  assert.throws(() => rustConst("const A: u64 = SOMETHING * 2;\n", "A", "x.rs"), /không phải số học thuần/);
  assert.throws(() => orderPollLimit("export const LIMITS = {};\n", "x.ts"), /không thấy hạn mức order_poll/);
  assert.throws(() => externalHosts("const X: u8 = 1;", "x.rs"), /không thấy EXTERNAL_HOSTS/);
  assert.deepEqual(
    externalHosts('pub const EXTERNAL_HOSTS: &[&str] = &[\n    // "chú thích.example",\n    "a.example",\n    "b.example",\n];\n', "x.rs"),
    ["a.example", "b.example"],
  );
});
