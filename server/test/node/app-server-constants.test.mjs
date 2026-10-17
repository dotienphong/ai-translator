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

test("mọi host trang thanh toán Creem của server (CREEM_CHECKOUT_HOST, CREEM_CHECKOUT_HOST_WWW) có trong EXTERNAL_HOSTS của app", () => {
  const creem = source(CREEM);
  const hosts = externalHosts(source(NAVIGATION), NAVIGATION);
  for (const name of ["CREEM_CHECKOUT_HOST", "CREEM_CHECKOUT_HOST_WWW"]) {
    const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*"([^"]+)"\\s*;`, "m").exec(creem);
    assert.ok(m, `${CREEM}: không thấy hằng ${name} (đổi tên hay đổi dạng khai báo thì sửa test này theo)`);
    assert.ok(
      hosts.includes(m[1]),
      `server trả trang thanh toán ở ${m[1]} nhưng EXTERNAL_HOSTS của app chỉ có ${hosts.join(", ")}: app sẽ chặn không mở được`,
    );
  }
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

// ---------------------------------------------------------------------------------------------------------------------
// Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md §1, §2, §3). App (Rust, src-tauri/src/
// diagnostics/) và server (TypeScript, server/src/error-reports.ts, ratelimit.ts) cùng nói một hợp đồng: trần log, trần báo cáo,
// bảng ký tự mã báo cáo, các loại báo cáo, gói bản quyền, ngôn ngữ giao diện, giới hạn tần suất. Lệch một chỗ là server trả 400
// hay 413 cho mọi báo cáo của app, và app thì lặng lẽ bỏ báo cáo (lỗi gửi tự động không hiện ra giao diện), nên chỉ test này bắt được.
// ---------------------------------------------------------------------------------------------------------------------

const DIAG_REPORT = "src-tauri/src/diagnostics/report.rs";
const DIAG_LOGS = "src-tauri/src/diagnostics/logs.rs";
const DIAG_QUEUE = "src-tauri/src/diagnostics/queue.rs";
const DIAG_MOD = "src-tauri/src/diagnostics/mod.rs";
const ERROR_REPORTS = "server/src/error-reports.ts";
const TOKEN = "server/src/token.ts";

/** Chuỗi `const NAME = "…";` của TypeScript (có hay không `export`). */
function tsString(text, name, file) {
  const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*"([^"]*)"\\s*;`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy hằng chuỗi ${name}`);
  return m[1];
}

/** Chuỗi `const NAME: &str = "…";` của Rust. */
function rustString(text, name, file) {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*:\\s*&(?:'static\\s+)?str\\s*=\\s*"([^"]*)"\\s*;`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy hằng chuỗi ${name}`);
  return m[1];
}

/** Giá trị số của một khóa trong `const NAME = { khóa: biểu thức, … }` của TypeScript. */
function tsObjectNumber(text, name, key, file) {
  const object = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*\\{([^}]*)\\}`, "m").exec(text);
  if (!object) throw new Error(`${file}: không thấy hằng đối tượng ${name}`);
  const entry = new RegExp(`\\b${key}\\s*:\\s*([\\d_\\s*+\\-()]+?)\\s*(?:,|$)`).exec(object[1]);
  if (!entry) throw new Error(`${file}: ${name} không có khóa ${key}`);
  return arithmetic(entry[1], `${file}: ${name}.${key}`);
}

/** Các chuỗi trong `const NAME = [ "a", "b" ]` của TypeScript (bỏ phần `...khác` và `as const`). */
function tsStrings(text, name, file) {
  const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy mảng ${name}`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

/** Các chuỗi trong `const NAME: [&str; N] = [ "a", "b" ];` của Rust. */
function rustStrings(text, name, file) {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*:\\s*\\[&str;\\s*\\d+\\]\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy mảng ${name}`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

/** Mọi chuỗi vế phải của các nhánh `Prefix::Biến => "chuỗi"` trong file Rust. */
function rustMatchStrings(text, prefix, file) {
  const found = [...text.matchAll(new RegExp(`${prefix}::\\w+\\s*=>\\s*"([^"]*)"`, "g"))].map((x) => x[1]);
  if (found.length === 0) throw new Error(`${file}: không thấy nhánh ${prefix}::… => "…"`);
  return found;
}

/** Các ký tự của một lớp regex dạng `[0-9A-HJKMNP-TV-Z]` (chỉ khoảng `a-b` và ký tự đơn). */
function classChars(cls) {
  const body = cls.replace(/^\[|\]$/g, "");
  const out = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i + 1] === "-" && i + 2 < body.length) {
      for (let c = body.charCodeAt(i); c <= body.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c));
      i += 2;
    } else out.push(body[i]);
  }
  return out.sort().join("");
}

const sorted = (list) => [...list].sort();

test("trần từng log của app (24, 16, 16 KiB) bằng LOG_LIMITS của server", () => {
  const logs = source(DIAG_LOGS);
  const server = source(ERROR_REPORTS);
  for (const [rust, key] of [["APP_LOG_MAX_BYTES", "app"], ["ASR_LOG_MAX_BYTES", "asr"], ["LLAMA_LOG_MAX_BYTES", "llama"]]) {
    assert.equal(rustConst(logs, rust, DIAG_LOGS), tsObjectNumber(server, "LOG_LIMITS", key, ERROR_REPORTS), `${rust} lệch LOG_LIMITS.${key}`);
  }
  assert.equal(rustConst(logs, "APP_LOG_MAX_BYTES", DIAG_LOGS), 24 * 1024, "spec §2: 24 KiB cho app.log");
});

test("trần báo cáo của app nằm giữa tổng ba trần log và trần thân request của server", () => {
  const caps = ["APP_LOG_MAX_BYTES", "ASR_LOG_MAX_BYTES", "LLAMA_LOG_MAX_BYTES"].map((n) => rustConst(source(DIAG_LOGS), n, DIAG_LOGS));
  const report = rustConst(source(DIAG_REPORT), "MAX_REPORT_BYTES", DIAG_REPORT);
  const body = tsConst(source(ERROR_REPORTS), "MAX_BODY_BYTES", ERROR_REPORTS);
  assert.equal(report, 64 * 1024, "spec §2: báo cáo tối đa 64 KB");
  assert.ok(report > caps.reduce((a, b) => a + b, 0), "phải còn chỗ cho phần thông tin máy ngoài ba log");
  assert.ok(report <= body, `app gửi tới ${report} byte nhưng server chỉ nhận ${body}: báo cáo đầy log bị 413`);
});

test("câu lỗi tối đa và dấu vân tay của báo cáo gửi tay giống nhau ở app và server", () => {
  const rust = source(DIAG_REPORT);
  const server = source(ERROR_REPORTS);
  assert.equal(rustConst(rust, "MAX_MESSAGE_CHARS", DIAG_REPORT), tsConst(server, "MAX_MESSAGE_CHARS", ERROR_REPORTS));
  assert.equal(rustString(rust, "ZERO_FINGERPRINT", DIAG_REPORT), tsString(server, "ZERO_FINGERPRINT", ERROR_REPORTS));
});

test("bảng ký tự mã báo cáo của app (Crockford base32) bằng lớp ký tự của REPORT_ID và của key bản quyền ở server", () => {
  const alphabet = /ID_ALPHABET:\s*&\[u8;\s*32\]\s*=\s*b"([^"]+)"/.exec(source(DIAG_REPORT));
  assert.ok(alphabet, `${DIAG_REPORT}: không thấy ID_ALPHABET`);
  const id = /REPORT_ID\s*=\s*\/\^R-(\[[^\]]+\])\{4\}-(\[[^\]]+\])\{4\}\$\//.exec(source(ERROR_REPORTS));
  assert.ok(id, `${ERROR_REPORTS}: không thấy REPORT_ID dạng /^R-[…]{4}-[…]{4}$/`);
  assert.equal(classChars(id[1]), classChars(id[2]), "hai nhóm của mã báo cáo dùng cùng một lớp ký tự");
  assert.equal(classChars(id[1]), sorted(alphabet[1]).join(""), "app sinh ký tự ngoài lớp mà server nhận (hay ngược lại)");
  assert.equal(sorted(alphabet[1]).join(""), sorted(tsString(source("server/src/license-key.ts"), "KEY_ALPHABET", "server/src/license-key.ts")).join(""));
});

test("các loại báo cáo của app bằng REPORT_KINDS của server", () => {
  const rust = rustMatchStrings(source(DIAG_REPORT), "Kind", DIAG_REPORT);
  assert.deepEqual(sorted(rust), sorted(tsStrings(source(ERROR_REPORTS), "REPORT_KINDS", ERROR_REPORTS)));
});

test("tên gói app gửi là free cộng PLAN_CODES của server; ngôn ngữ giao diện app gửi bằng UI_LANGS của server", () => {
  const server = source(ERROR_REPORTS);
  assert.match(server, /REPORT_PLANS\s*=\s*\["free",\s*\.\.\.PLAN_CODES\]/, `${ERROR_REPORTS}: REPORT_PLANS không còn là ["free", ...PLAN_CODES]`);
  const paid = tsStrings(source(TOKEN), "PLAN_CODES", TOKEN);
  assert.deepEqual(sorted(rustStrings(source(DIAG_MOD), "PLAN_CODES", DIAG_MOD)), sorted(["free", ...paid]));
  assert.deepEqual(sorted(rustMatchStrings(source(DIAG_MOD), "UiLanguage", DIAG_MOD)), sorted(tsStrings(server, "UI_LANGS", ERROR_REPORTS)));
});

test("giới hạn gửi của app (spec §1) đúng số đã chốt và nằm trong hạn mức của server", () => {
  const queue = source(DIAG_QUEUE);
  const ratelimit = source(RATELIMIT);
  assert.equal(rustConst(queue, "MAX_PER_DAY", DIAG_QUEUE), 5, "tối đa 5 báo cáo mỗi ngày");
  assert.equal(rustConst(queue, "QUEUE_CAP", DIAG_QUEUE), 5, "hàng đợi tối đa 5");
  assert.equal(rustConst(queue, "PER_FINGERPRINT_SECONDS", DIAG_QUEUE), 24 * 3600, "1 báo cáo mỗi dấu vân tay mỗi 24 giờ");
  assert.equal(rustConst(queue, "MAX_ATTEMPTS", DIAG_QUEUE), 3, "thử lại tối đa 3 lần");
  assert.equal(rustConst(source(DIAG_MOD), "FIRST_SEND_DELAY_SECS", DIAG_MOD), 10, "gửi nền sau khi app chạy 10 giây");
  const limit = (name) => tsObjectNumber(ratelimit, "LIMITS", name, RATELIMIT);
  assert.equal(limit("diag_ip"), 30);
  assert.equal(limit("diag_device"), 3);
  assert.equal(limit("diag_global"), 120);
  // Một máy xếp hàng tối đa 5 mỗi ngày: không bao giờ làm chạm hạn mức theo IP hay toàn hệ thống của một giờ.
  assert.ok(rustConst(queue, "MAX_PER_DAY", DIAG_QUEUE) <= limit("diag_ip"));
  assert.ok(limit("diag_device") <= limit("diag_ip") && limit("diag_ip") <= limit("diag_global"));
});

test("hàm đọc hằng của báo cáo lỗi báo rõ khi không thấy, và hiểu đúng các dạng khai báo", () => {
  assert.equal(tsString('export const ZERO_FINGERPRINT = "0000";\n', "ZERO_FINGERPRINT", "x.ts"), "0000");
  assert.equal(rustString('pub const ZERO_FINGERPRINT: &str = "0000";\n', "ZERO_FINGERPRINT", "x.rs"), "0000");
  assert.equal(tsObjectNumber("export const LOG_LIMITS = { app: 24 * 1024, asr: 16 * 1024 } as const;", "LOG_LIMITS", "asr", "x.ts"), 16384);
  assert.equal(tsObjectNumber("export const LIMITS = {\n  diag_ip: 30,\n  diag_device: 3,\n} as const;", "LIMITS", "diag_device", "x.ts"), 3);
  assert.deepEqual(tsStrings('export const K = ["a", "b"] as const;', "K", "x.ts"), ["a", "b"]);
  assert.deepEqual(tsStrings('export const K = ["free", ...PLAN_CODES] as const;', "K", "x.ts"), ["free"]);
  assert.deepEqual(rustStrings('const P: [&str; 2] = ["a", "b"];', "P", "x.rs"), ["a", "b"]);
  assert.deepEqual(rustMatchStrings('Kind::A => "a",\n Kind::B => "b",', "Kind", "x.rs"), ["a", "b"]);
  assert.equal(classChars("[0-9A-C]"), "0123456789ABC");
  assert.throws(() => tsString("const X = 1;", "Y", "x.ts"), /x\.ts: không thấy hằng chuỗi Y/);
  assert.throws(() => rustString("const X: u8 = 1;", "Y", "x.rs"), /x\.rs: không thấy hằng chuỗi Y/);
  assert.throws(() => tsObjectNumber("export const O = { a: 1 };", "O", "b", "x.ts"), /không có khóa b/);
  assert.throws(() => tsStrings("const Z = 1;", "K", "x.ts"), /không thấy mảng K/);
  assert.throws(() => rustMatchStrings("nothing", "Kind", "x.rs"), /không thấy nhánh Kind/);
});
