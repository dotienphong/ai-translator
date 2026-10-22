// Kiểm giao diện app ở các ngôn ngữ giao diện (spec 2026-10-12-ui-ja-zh-ko-design.md §7) trên trang xem trước
// (vite.config.ts, IPC giả): DOM thật trong Chrome không đầu (qua website/tools/browser/cdp.mjs, không thêm thư viện), ở
// cỡ cửa sổ mặc định (960×640) và nhỏ nhất (720×480). Với mỗi màn hình: thuộc tính <html lang> đúng; trang không cuộn ngang;
// chữ của nút, nhãn, tiêu đề không tràn khỏi ô; ô chọn ngôn ngữ có đủ 5 mục. Màn hình Nâng cấp có thêm điều kiện thanh toán
// (spec 2026-10-14): ba bước đánh số (spec 2026-10-22); hai cách trả (VND, USD) khi server bán cả hai, chỉ VietQR khi chưa bán
// thẻ; cách trả chọn sẵn theo ngôn ngữ (vi: VND, còn lại: USD); đơn đang chờ khóa gói và cách
// trả đúng loại tiền của đơn (kể cả đơn dựng lại `amount 0, currency ""`); đơn thẻ không có ô email, mã QR, đúng hai nút, có
// câu bên bán lại (merchant of record) và câu quá giờ hẹn trả; bấm thật thì `start_checkout` nhận đúng gói và loại tiền, đổi
// cách trả thì ô đồng ý bỏ tick. Báo cáo lỗi (spec 2026-10-17 §5): ô tích sẵn ở bước Điều khoản (không bắt buộc, bấm Tiếp lưu đúng lựa
// chọn), công tắc ở Quyền riêng tư (bấm thì lưu), nút "Gửi log cho hỗ trợ" ở Giới thiệu (đang gửi, mã báo cáo, nút Sao chép, ba câu
// lỗi). Gõ dịch (spec 2026-10-17-go-dich §1.2–§1.4): nhóm Cài đặt "Gõ dịch" (macOS có quyền, chưa có quyền; Windows không có mục
// tự dán), và ô soạn (compose.html, 560×420) ở từng trạng thái: trống, đang dịch, đang nạp model, đã dịch, đã là ngôn ngữ đích,
// lỗi, bị chặn vì bản quyền, hộp quyền Trợ năng, chỉ chép, giao diện tối. Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): mục Hỗ
// trợ giữa Nâng cấp và Giới thiệu, chấm đỏ, chữ của hợp đồng phía khách, ô "Gửi kèm thông tin máy", gửi bằng Enter (Shift+Enter xuống
// dòng), tin gửi lỗi và gửi lại, thẻ email, menu ⋯ xóa, đính kèm log, chính sách mở trong app, chat tắt và cuộc chat đóng. Ảnh PNG
// cho người kiểm xem ở
// target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai
// thì in ra và thoát mã 1; không mở được trang thì báo ngay và thoát mã 1. Chrome luôn đóng (xóa thư mục hồ sơ tạm) khi xong.
//
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 &   # trang xem trước, cổng 1431
//   node scripts/ui-preview/check-i18n.mjs [mã ngôn ngữ…]                            # không có mã: ja zh ko
//   ONLY=about,onboarding-2 node scripts/ui-preview/check-i18n.mjs vi                # chỉ các màn hình có tên bắt đầu bằng một trong các tiền tố đó
//
// Chạy thử với `vi en` trước để biết lỗi có sẵn (không do ngôn ngữ mới): chỉ sửa lỗi riêng của ja, zh, ko. Mỗi lần chạy kiểm
// chữ của ngôn ngữ được chọn (ví dụ `cardNote` có "Creem", `bankOnly` thì không): đủ năm ngôn ngữ thì chạy `vi en ja zh ko`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../website/tools/browser/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../target/ui-preview/ui-ja-zh-ko");
const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:1431";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
// Phiên bản thật của app: màn hình Giới thiệu của trang xem trước phải ghi đúng số này (IPC giả đọc cùng file).
const APP_VERSION = JSON.parse(readFileSync(path.resolve(here, "../../src-tauri/tauri.conf.json"), "utf8")).version;

// Không mở được trang xem trước (Vite chưa chạy, sai cổng): các điều kiện sau đó vô nghĩa, nên dừng ngay thay vì báo từng ô.
class OpenError extends Error {}

const args = process.argv.slice(2);
const LANGS = args.length > 0 ? args : ["ja", "zh", "ko"];
// Biến ONLY (tiền tố tên màn hình, cách nhau bằng dấu phẩy) giới hạn các màn hình được kiểm: chạy nhanh khi chỉ sửa một màn hình.
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const wanted = (name) => !ONLY || ONLY.some((prefix) => name.startsWith(prefix));
// Giá trị `lang` của trang theo ngôn ngữ giao diện (`htmlLang` ở src/i18n/index.ts) và thứ tự `UI_LANGUAGES`.
const HTML_LANG = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
const UI_ORDER = ["vi", "en", "ja", "zh", "ko"];

const WINDOWS = [
  { name: "960x640", width: 960, height: 640 },
  { name: "720x480", width: 720, height: 480 },
];

// ---------------------------------------------------------------- màn hình Nâng cấp: biểu thức chạy trong trang

// Biểu thức async chạy trong trang, có `t(khóa, tham số)` cho chữ của ngôn ngữ đang kiểm (cùng từ điển với giao diện, nạp qua
// Vite), để điều kiện về chữ không chép lại câu chữ (i18n đổi thì điều kiện không đổi).
const inPage = (lang, body) =>
  `(async () => { const { translate } = await import("/src/i18n/index.ts"); const t = (k, p) => translate(${JSON.stringify(lang)}, k, p); ${body} })()`;

const radios = (name) => `[...document.querySelectorAll('input[name="${name}"]')]`;
const bodyHas = (text) => [`document.body.textContent.includes(${JSON.stringify(text)})`, `có chữ ${JSON.stringify(text)}`];
const bodyHasNot = (text) => [`!document.body.textContent.includes(${JSON.stringify(text)})`, `không có chữ ${JSON.stringify(text)}`];

// Cách trả: đúng hai ô VND và USD; ô `checked` được chọn và nhãn nhìn thấy của ô đó ghi đúng loại tiền (đọc `closest("label")`,
// không chỉ thuộc tính value); `locked`: cả hai ô bị khóa (đang có đơn chờ), không thì bấm được.
const method = (checked, locked) => [
  `(() => {
    const r = ${radios("method")};
    const on = r.filter((x) => x.checked);
    const text = on.length === 1 ? on[0].closest("label").textContent : "";
    const other = ${JSON.stringify(checked)} === "VND" ? "USD" : "VND";
    return r.map((x) => x.value).join() === "VND,USD" && on.length === 1 && on[0].value === ${JSON.stringify(checked)}
      && text.includes(${JSON.stringify(checked)}) && !text.includes(other) && r.every((x) => x.disabled === ${locked});
  })()`,
  `hai cách trả VND, USD; chọn ${checked} (nhãn của ô được chọn cũng ghi ${checked}); ${locked ? "cả hai ô bị khóa" : "cả hai ô bấm được"}`,
];

// Ba gói trả phí: `checked` được chọn; `locked`: cả ba bị khóa.
const planRadios = (checked, locked) => [
  `(() => { const r = ${radios("plan")}; const on = r.filter((x) => x.checked); return r.length === 3 && on.length === 1 && on[0].value === ${JSON.stringify(checked)} && r.every((x) => x.disabled === ${locked}); })()`,
  `ba gói, chọn ${checked}, ${locked ? "cả ba bị khóa" : "cả ba bấm được"}`,
];

// Server chỉ bán VND: bước 1 vẫn có, đúng một ô VietQR đang chọn (spec 2026-10-22 §2).
const onlyVnd = [
  `(() => { const r = ${radios("method")}; return r.length === 1 && r[0].value === "VND" && r[0].checked && !!document.querySelector("#upgrade-method-label"); })()`,
  "bước 1 chỉ có một ô VietQR, đang chọn (server chỉ bán VND)",
];

// Đang có đơn chờ: không còn form tạo đơn (không ô email, không ô đồng ý).
const noForm = [`!document.querySelector("#upgrade-email") && !document.querySelector("form.card")`, "không có form tạo đơn (ô email)"];

// Ghi chú cách trả ở bước 1 (`.method-notes` trong `.upgrade-step` đầu tiên), theo thứ tự hiện.
const notes = (lang, keys) => [
  inPage(
    lang,
    `const s = document.querySelector(".upgrade-step"); const h = [...(s?.querySelectorAll(".method-notes p.hint") ?? [])].map((p) => p.textContent); return JSON.stringify(h) === JSON.stringify(${JSON.stringify(keys)}.map((k) => t(k)));`,
  ),
  `ghi chú ở bước 1 đúng ${keys.join(" + ")}`,
];

// Ba bước đánh số (spec 2026-10-22 §2): đúng ba tiêu đề h2 theo thứ tự, số 1, 2, 3 chỉ để nhìn, chữ đúng ba khóa; bảng gói ở
// bước 2.
const steps = (lang) =>
  inPage(
    lang,
    `const h = [...document.querySelectorAll(".upgrade-step > h2.step-title")]; const keys = ["upgrade.method", "upgrade.step.plan", "upgrade.step.pay"]; return h.length === 3 && h.every((x, i) => x.querySelector(".step-no").textContent === String(i + 1) && x.querySelector(".step-no").getAttribute("aria-hidden") === "true" && x.lastElementChild.textContent === t(keys[i])) && !!document.querySelectorAll(".upgrade-step")[1].querySelector("ul.plans");`,
  );

// Cách trả chọn sẵn theo ngôn ngữ của lượt chạy (spec 2026-10-22 §3): tiếng Việt là VietQR, ngôn ngữ khác là thẻ quốc tế.
const defaultMethod = (lang) => (lang === "vi" ? "VND" : "USD");

// VietQR đang chọn, chưa có đơn: giá VND, ghi chú VietQR, không nhắc Creem, một mục gập pháp lý.
const vndChosen = (lang) => [
  method("VND", false),
  planRadios("monthly", false),
  bodyHas("50.000 đ"),
  bodyHas("269.000 đ"),
  bodyHas("500.000 đ"),
  bodyHasNot("$"),
  notes(lang, ["upgrade.bankOnly"]),
  noCreemHint,
  bodyHasNot("merchant of record"),
  [`document.querySelectorAll("details.legal-details").length === 1`, "chỉ một mục gập pháp lý (chính sách), chưa có EULA của đơn thẻ"],
];

// Thẻ quốc tế đang chọn, chưa có đơn: giá USD, ghi chú cardNote (có Creem) và câu merchant of record, câu đồng ý của thẻ, nút
// trả bằng trình duyệt, thêm mục gập EULA.
const usdChosen = (lang) => [
  method("USD", false),
  planRadios("monthly", false),
  bodyHas("$3.99"),
  bodyHas("$21.99"),
  bodyHas("$39.99"),
  bodyHasNot("50.000 đ"),
  notes(lang, ["upgrade.cardNote", "upgrade.cardMor"]),
  bodyHas("merchant of record"),
  [
    inPage(
      lang,
      `return document.querySelector(".consent").textContent === t("upgrade.consentCard") && document.querySelector('form.card button[type="submit"]').textContent.includes(t("upgrade.payCard"));`,
    ),
    "câu đồng ý của thẻ (upgrade.consentCard) và nút upgrade.payCard",
  ],
  [`document.querySelectorAll("details.legal-details").length === 2`, "hai mục gập pháp lý (chính sách và EULA)"],
];

// Mọi p.hint của trang đều không nhắc Creem (không có đơn thẻ, không bán USD: khách không cần biết tới cổng thẻ).
const noCreemHint = [
  `[...document.querySelectorAll("p.hint")].every((p) => !p.textContent.includes("Creem"))`,
  'không p.hint nào chứa "Creem"',
];

// Mã đơn mẫu của tauri-mock.ts.
const QR_CODE = 1000428;
const CARD_CODE = 1000429;

// Dòng trạng thái của đơn (`.order-status`) đúng câu của khóa này; `not`: khóa không được hiện.
const status = (lang, key, code, not = []) => [
  inPage(
    lang,
    `const s = document.querySelector(".order-status"); return !!s && s.textContent.includes(t(${JSON.stringify(key)}, { code: ${code} })) && ${JSON.stringify(not)}.every((k) => !s.textContent.includes(t(k, { code: ${code} })));`,
  ),
  `dòng trạng thái đơn là ${key}${not.length > 0 ? `, không phải ${not.join(", ")}` : ""}`,
];

// Đơn thẻ đang chờ (không mã QR, trang thanh toán mở ở trình duyệt).
const cardOrder = (lang) => [
  [
    `(() => { const c = document.querySelector(".checkout.browser"); return !!c && !c.querySelector(".qr") && c.querySelectorAll("button").length === 2; })()`,
    "đơn thẻ: thẻ thanh toán một cột, không mã QR, đúng hai nút",
  ],
  [
    inPage(
      lang,
      `const c = document.querySelector(".checkout.browser"); return c.querySelector("h3.card-title").textContent === t("upgrade.browser.title") && c.querySelector("button").textContent.includes(t("upgrade.reopen"));`,
    ),
    "đơn thẻ: có tiêu đề upgrade.browser.title và nút upgrade.reopen",
  ],
  bodyHas("merchant of record"),
  noForm,
];

// Đơn VietQR đang chờ: mã QR vẽ trong app, đúng hai nút.
const qrOrder = (lang) => [
  [
    `(() => { const c = document.querySelector(".checkout:not(.browser)"); return !!c && !!c.querySelector(".qr svg") && c.querySelectorAll("button").length === 2; })()`,
    "đơn VietQR: có mã QR (svg), không phải thẻ một cột, đúng hai nút",
  ],
  [inPage(lang, `return document.querySelector(".checkout h3.card-title").textContent === t("upgrade.scan");`), "đơn VietQR: có tiêu đề upgrade.scan"],
  bodyHasNot("merchant of record"),
  noForm,
];

// Gõ chữ vào ô đang nhận bàn phím (sự kiện `input` thật để React nhận).
async function type(page, selector, text) {
  await page.focus(selector);
  await page.s.send("Input.insertText", { text });
  await sleep(100);
}

const EMAIL = "khach@example.com";
const consentIs = (on) => [`document.querySelector(".consent input").checked === ${on}`, `ô đồng ý ${on ? "được tick" : "bỏ tick"}`];
const payDisabled = (on) => [`document.querySelector('form.card button[type="submit"]').disabled === ${on}`, `nút trả tiền ${on ? "bị khóa" : "bấm được"}`];
// Lần gọi `start_checkout` cuối cùng của IPC giả (window.__ipcCalls, tauri-mock.ts): đủ một lần, đúng gói, loại tiền, email,
// đồng ý và gia hạn.
const startedWith = (plan, currency) => [
  `(() => {
    const calls = window.__ipcCalls.filter((c) => c.cmd === "start_checkout");
    const a = calls[0]?.args ?? {};
    return calls.length === 1 && a.plan === ${JSON.stringify(plan)} && a.currency === ${JSON.stringify(currency)} && a.email === ${JSON.stringify(EMAIL)} && a.consent === true && a.renew === false;
  })()`,
  `bấm trả tiền gửi đúng start_checkout (gói ${plan}, loại tiền ${currency}, email, đồng ý, không gia hạn)`,
];

// Bấm thật: chọn gói 6 Months, sang thẻ (giao diện tiếng Việt chọn sẵn VietQR), tick đồng ý rồi đổi cách trả (ô đồng ý phải tự
// bỏ tick, cả hai chiều), trả bằng thẻ.
async function startByCard(page, ck, lang) {
  await page.click('.plan:has(input[value="six_months"]) label');
  await page.click('.pay-method:has(input[value="USD"])');
  await ck(...method("USD", false));
  await type(page, "#upgrade-email", EMAIL);
  await page.click(".consent");
  await ck(...consentIs(true));
  await page.click('.pay-method:has(input[value="VND"])');
  await ck(...method("VND", false));
  await ck(...consentIs(false));
  await ck(...payDisabled(true));
  await page.click(".consent");
  await ck(...consentIs(true));
  await page.click('.pay-method:has(input[value="USD"])');
  await ck(...method("USD", false));
  await ck(...consentIs(false));
  await page.click(".consent");
  await ck(...consentIs(true));
  await ck(...payDisabled(false));
  await page.click('form.card button[type="submit"]');
  await sleep(500);
  await ck(...startedWith("six_months", "USD"));
  await ck(...method("USD", true));
  await ck(...planRadios("six_months", true));
  await ck(`document.querySelector(".order-code").textContent.includes("$21.99")`, "đơn thẻ của gói 6 Months ghi $21.99");
  for (const check of cardOrder(lang)) await ck(...check);
}

// Bấm thật: chọn chuyển khoản VietQR (VND; ở tiếng Việt đã chọn sẵn, bấm lại không đổi gì), gói mặc định Monthly.
async function startByQr(page, ck, lang) {
  await page.click('.pay-method:has(input[value="VND"])');
  await type(page, "#upgrade-email", EMAIL);
  await page.click(".consent");
  await ck(...consentIs(true));
  await page.click('form.card button[type="submit"]');
  await sleep(500);
  await ck(...startedWith("monthly", "VND"));
  await ck(...method("VND", true));
  await ck(...planRadios("monthly", true));
  await ck(`document.querySelector(".order-code").textContent.includes("50.000 đ")`, "đơn VietQR của gói Monthly ghi 50.000 đ");
  for (const check of qrOrder(lang)) await ck(...check);
}

// Bấm thật sang cách trả không được chọn sẵn: chữ, giá và ghi chú đổi theo cách đó.
async function pickOtherMethod(page, ck, lang) {
  const other = defaultMethod(lang) === "VND" ? "USD" : "VND";
  await page.click(`.pay-method:has(input[value="${other}"])`);
  await sleep(200);
  for (const check of other === "VND" ? vndChosen(lang) : usdChosen(lang)) await ck(...check);
}

// ---------------------------------------------------------------- báo cáo lỗi (spec 2026-10-17 §5)

// Mã báo cáo mẫu của tauri-mock.ts (lệnh giả `send_log_report`, trả sau nửa giây).
const REPORT_ID = "R-7F3K-92QD";
const SEND_BUTTON = ".about-logs .actions > button:nth-child(2)";
const REPORT_BOX = ".about-logs .log-report";
const NEXT_BUTTON = ".onboarding-actions button.primary";
// Lần gọi `update_settings` có đụng `sendErrorReports` của IPC giả (window.__ipcCalls).
const reportSettingCalls = `window.__ipcCalls.filter((c) => c.cmd === "update_settings" && "sendErrorReports" in (c.args?.patch ?? {}))`;

// Bấm thật "Gửi log cho hỗ trợ": đang gửi thì nút khóa (chống bấm đúp) và đổi chữ; xong thì có mã báo cáo, lời dặn đọc mã cho hỗ trợ và
// nút Sao chép; bấm Sao chép thì hiện một kết quả (đã chép, hay lỗi chép: Chrome không đầu có thể không cho ghi clipboard).
async function sendReport(page, ck, lang) {
  await page.click(SEND_BUTTON);
  await sleep(150);
  await ck(`document.querySelector(${JSON.stringify(SEND_BUTTON)}).disabled === true`, "đang gửi: nút Gửi log bị khóa");
  await ck(
    inPage(lang, `return document.querySelector(${JSON.stringify(SEND_BUTTON)}).textContent.includes(t("about.sendLogs.sending"));`),
    "đang gửi: nút ghi about.sendLogs.sending",
  );
  await sleep(800);
  await ck(`document.querySelector(${JSON.stringify(`${REPORT_BOX} .report-code`)})?.textContent === ${JSON.stringify(REPORT_ID)}`, `hiện mã báo cáo ${REPORT_ID}`);
  await ck(
    inPage(
      lang,
      `const s = document.querySelector(${JSON.stringify(REPORT_BOX)}).textContent; return s.includes(t("about.sendLogs.sent")) && s.includes(t("about.sendLogs.codeHint"));`,
    ),
    "có câu about.sendLogs.sent và lời dặn about.sendLogs.codeHint",
  );
  await ck(
    inPage(lang, `const b = document.querySelector(${JSON.stringify(SEND_BUTTON)}); return !b.disabled && b.textContent.includes(t("about.sendLogs"));`),
    "gửi xong: nút Gửi log bấm được lại, ghi about.sendLogs",
  );
  await ck(`${"window.__ipcCalls"}.filter((c) => c.cmd === "send_log_report").length === 1`, "đúng một lệnh send_log_report");
  await ck(
    inPage(lang, `return document.querySelector(${JSON.stringify(`${REPORT_BOX} .actions > button`)}).textContent.includes(t("about.sendLogs.copy"));`),
    "có nút Sao chép mã (about.sendLogs.copy)",
  );
  await page.click(`${REPORT_BOX} .actions > button`);
  await sleep(300);
  await ck(
    inPage(
      lang,
      `const s = document.querySelector(${JSON.stringify(REPORT_BOX)}).textContent; return s.includes(t("about.sendLogs.copied")) || s.includes(t("error.copyFailed"));`,
    ),
    "bấm Sao chép thì hiện kết quả (đã chép hay lỗi chép)",
  );
}

// Gửi lỗi (`report=failed|ratelimited|rejected` của IPC giả): câu lỗi đúng mã nằm dưới nút, không có mã báo cáo, nút bấm được lại, lỗi không
// lên thanh báo lỗi chung.
const reportFails = (code) => async (page, ck, lang) => {
  await page.click(SEND_BUTTON);
  await sleep(900);
  await ck(
    inPage(lang, `const n = document.querySelector(${JSON.stringify(`${REPORT_BOX} .note.error`)}); return !!n && n.textContent.trim() === t("error.${code}");`),
    `câu lỗi là error.${code}`,
  );
  await ck(`!document.querySelector(${JSON.stringify(`${REPORT_BOX} .report-code`)})`, "không có mã báo cáo");
  await ck(`document.querySelector(${JSON.stringify(SEND_BUTTON)}).disabled === false`, "nút Gửi log bấm được lại");
  await ck(`!document.querySelector(".notice.error")`, "lỗi không lên thanh báo lỗi chung (Notice)");
};

// Bước Điều khoản: ô báo cáo lỗi tích sẵn và không bắt buộc (bỏ tích vẫn bấm được Tiếp); bấm Tiếp lưu đúng lựa chọn vào cài đặt.
const reportsConsent = (optOut) => async (page, ck) => {
  const box = ".consent:nth-of-type(2) input";
  await ck(`document.querySelector(${JSON.stringify(box)}).checked === true`, "ô báo cáo lỗi tích sẵn");
  await ck(`document.querySelector(${JSON.stringify(NEXT_BUTTON)}).disabled === true`, "chưa đồng ý Chính sách thì chưa bấm được Tiếp (dù ô báo cáo đã tích)");
  await page.click(".consent:nth-of-type(1)");
  await ck(`document.querySelector(${JSON.stringify(NEXT_BUTTON)}).disabled === false`, "đồng ý Chính sách thì bấm được Tiếp");
  if (optOut) {
    await page.click(".consent:nth-of-type(2)");
    await ck(`document.querySelector(${JSON.stringify(box)}).checked === false`, "bỏ tích được ô báo cáo lỗi");
    await ck(`document.querySelector(${JSON.stringify(NEXT_BUTTON)}).disabled === false`, "bỏ tích ô báo cáo lỗi vẫn bấm được Tiếp");
    await page.click(".consent:nth-of-type(2)");
    await ck(`document.querySelector(${JSON.stringify(box)}).checked === true`, "tích lại được ô báo cáo lỗi");
    await page.click(".consent:nth-of-type(2)");
  }
  await page.click(NEXT_BUTTON);
  await sleep(300);
  await ck(
    `(() => { const c = ${reportSettingCalls}; return c.length === 1 && c[0].args.patch.sendErrorReports === ${!optOut}; })()`,
    `bấm Tiếp lưu đúng một lần sendErrorReports = ${!optOut}`,
  );
};

// Cài đặt › Quyền riêng tư: bấm công tắc báo cáo lỗi thì lưu giá trị mới; bấm lần nữa thì lưu lại giá trị cũ.
async function toggleReportsSwitch(page, ck) {
  await page.click("label[for='error-reports']");
  await sleep(300);
  await ck(`(() => { const c = ${reportSettingCalls}; return c.length === 1 && c[0].args.patch.sendErrorReports === false; })()`, "bấm công tắc thì lưu sendErrorReports = false");
  await ck(`document.querySelector("#error-reports").checked === false`, "công tắc chuyển sang tắt");
  await page.click("label[for='error-reports']");
  await sleep(300);
  await ck(`(() => { const c = ${reportSettingCalls}; return c.length === 2 && c[1].args.patch.sendErrorReports === true; })()`, "bấm lần nữa thì lưu sendErrorReports = true");
}

// ---------------------------------------------------------------- chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4)

const TEXTAREA = ".support-compose textarea";
const TWO_LINES = JSON.stringify("Dòng một\ndòng hai");
const SEND = '.support-compose button[type="submit"]';
// Các lần gọi một lệnh của IPC giả (window.__ipcCalls).
const callsOf = (cmd) => `window.__ipcCalls.filter((c) => c.cmd === ${JSON.stringify(cmd)})`;

// Shift+Enter trong ô nhập: xuống dòng (trình duyệt tự chèn, giao diện không chặn).
async function shiftEnter(page) {
  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 };
  await page.s.send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...key });
  await page.s.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  await sleep(100);
}

// Bấm thật: gõ hai dòng (Shift+Enter xuống dòng), Enter gửi; đang gửi hiện "Đang gửi…"; lệnh gửi nhận đúng chữ và cờ thông tin
// máy (tích sẵn); gửi xong tin ghi "Đã gửi", ô tích biến mất, thẻ email hiện; lưu email thì gọi lệnh lưu và thẻ báo đã lưu.
async function supportSendFirst(page, ck, lang) {
  await type(page, TEXTAREA, "Dòng một");
  await shiftEnter(page);
  await type(page, TEXTAREA, "dòng hai");
  await ck(`document.querySelector(${JSON.stringify(TEXTAREA)}).value === ${TWO_LINES}`, "Shift+Enter xuống dòng, không gửi");
  await ck(`${callsOf("support_send")}.length === 0`, "chưa gửi gì");
  await page.press("Enter");
  await sleep(150);
  await ck(
    inPage(lang, `return document.querySelector(".msg.customer.sending .msg-status")?.textContent === t("support.sending");`),
    "đang gửi: tin hiện ngay với support.sending",
  );
  await ck(`document.querySelector(${JSON.stringify(TEXTAREA)}).value === ""`, "gửi thì ô nhập trống");
  await sleep(700);
  await ck(
    `(() => { const c = ${callsOf("support_send")}; return c.length === 1 && c[0].args.text === ${TWO_LINES} && c[0].args.withMachineInfo === true; })()`,
    "Enter gửi đúng một lệnh support_send, kèm thông tin máy (ô tích sẵn)",
  );
  await ck(
    inPage(lang, `const m = document.querySelector(".msg.customer:not(.sending)"); return !!m && m.querySelector(".msg-status").textContent === t("support.sent");`),
    "gửi xong: tin ghi support.sent",
  );
  await ck(`!document.querySelector(".support-machine")`, "đã có cuộc chat: ô Gửi kèm thông tin máy biến mất");
  await ck(
    inPage(lang, `return document.querySelector(".support-email label")?.textContent === t("support.email.prompt");`),
    "sau tin đầu tiên: thẻ email (support.email.prompt)",
  );
  await type(page, "#support-email", "khach@example.com");
  await page.click('.support-email button[type="submit"]');
  await sleep(500);
  await ck(
    `(() => { const c = ${callsOf("support_set_email")}; return c.length === 1 && c[0].args.email === "khach@example.com"; })()`,
    "Lưu gọi support_set_email với đúng email",
  );
  await ck(inPage(lang, `return document.querySelector(".support-email").textContent.includes(t("support.email.saved"));`), "thẻ báo support.email.saved");
}

// Bấm thật: gửi lỗi (`send=ratelimited`): tin ở lại với câu lỗi đúng mã và nút gửi lại; bấm gửi lại thì gọi lệnh lần nữa với đúng chữ.
async function supportSendFails(page, ck, lang) {
  await type(page, TEXTAREA, "Còn đó không?");
  await page.click(SEND);
  await sleep(800);
  await ck(
    inPage(
      lang,
      `const m = document.querySelector(".msg.customer.failed"); return !!m && m.querySelector(".msg-status.error").textContent === t("error.supportRateLimited") && m.querySelector(".msg-retry").textContent === t("support.failed");`,
    ),
    "gửi lỗi: câu error.supportRateLimited và nút support.failed",
  );
  await page.click(".msg-retry");
  await sleep(800);
  await ck(
    `(() => { const c = ${callsOf("support_send")}; return c.length === 2 && c.every((x) => x.args.text === "Còn đó không?" && x.args.withMachineInfo === false); })()`,
    "gửi lại đúng nội dung đó (đã có cuộc chat: không kèm thông tin máy)",
  );
}

// Bấm thật: menu ⋯ › Xóa cuộc trò chuyện hỏi lại; Hủy thì không xóa; đồng ý thì gọi lệnh xóa, về trạng thái mới (ô tích hiện lại).
async function supportDelete(page, ck, lang) {
  await page.click(".support-menu > button");
  await ck(inPage(lang, `return document.querySelector(".support-menu-list button")?.textContent === t("support.delete");`), "menu ⋯ có support.delete");
  await page.click(".support-menu-list button");
  await ck(inPage(lang, `return document.querySelector(".support-chat .confirm span")?.textContent === t("support.delete.confirm");`), "hỏi lại trước khi xóa");
  await page.click(".support-chat .confirm button:not(.danger)");
  await ck(`!document.querySelector(".support-chat .confirm") && ${callsOf("support_delete")}.length === 0`, "Hủy thì không xóa");
  await page.click(".support-menu > button");
  await page.click(".support-menu-list button");
  await page.click(".support-chat .confirm button.danger");
  await sleep(300);
  await ck(`${callsOf("support_delete")}.length === 1`, "đồng ý thì gọi đúng một lệnh support_delete");
  await ck(`document.querySelectorAll(".support-log .msg").length === 1 && !!document.querySelector(".support-machine")`, "về trạng thái mới: chỉ còn lời chào, ô tích hiện lại");
}

// Bấm thật: chưa có cuộc chat, chat đã tắt (`send=disabled`): gửi tin đầu thì tin đó báo lỗi và ô nhập thành dòng chat tắt.
async function supportSendDisabled(page, ck, lang) {
  await type(page, TEXTAREA, "Chào");
  await page.press("Enter");
  await sleep(800);
  await ck(
    inPage(lang, `return document.querySelector(".msg.customer.failed .msg-status.error")?.textContent === t("error.supportDisabled");`),
    "tin đầu báo lỗi error.supportDisabled",
  );
  await ck(
    inPage(lang, `return !document.querySelector(${JSON.stringify(TEXTAREA)}) && document.querySelector(".support-blocked")?.textContent === t("error.supportDisabled");`),
    "ô nhập thành dòng error.supportDisabled",
  );
}

// Bấm thật: "Đính kèm log" chạy lệnh của nút Gửi log cho hỗ trợ, rồi gửi tin chứa mã báo cáo.
async function supportAttachLog(page, ck, lang) {
  await page.click(".support-actions button.ghost");
  await sleep(1400);
  await ck(`${callsOf("send_log_report")}.length === 1`, "đúng một lệnh send_log_report");
  await ck(
    inPage(lang, `const c = ${callsOf("support_send")}; return c.length === 1 && c[0].args.text === t("support.logMessage", { id: "R-7F3K-92QD" });`),
    "gửi tin support.logMessage với mã R-7F3K-92QD",
  );
}

// Bấm thật: "Quyền riêng tư" ở chân khung mở chính sách ngay trong app.
async function supportPrivacy(page, ck) {
  await page.click(".support-foot button.link");
  await sleep(900);
  await ck(`!!document.querySelector(".support-privacy .legal")`, "mở chính sách quyền riêng tư trong app");
}

// [tên, tham số URL, tùy chọn { prepare: biểu thức chạy trước khi kiểm, wait: ms, interact: async (page, ck, lang) bấm thật }]
const SCREENS = [
  ["home", "screen=home"],
  ["home-running", "screen=home&session=running"],
  ["home-dark", "screen=home&theme=dark"],
  ["home-notice-update", "screen=home&notice=update"],
  ["home-notice-hotkeys", "screen=home&notice=hotkeys"],
  ["transcript", "screen=transcript"],
  ["history", "screen=history"],
  ["glossary", "screen=glossary"],
  ["settings-general", "screen=settings&group=general"],
  ["settings-subtitles", "screen=settings&group=subtitles"],
  ["settings-subtitles-dark", "screen=settings&group=subtitles&theme=dark"],
  ["settings-audio", "screen=settings&group=audio"],
  ["settings-model", "screen=settings&group=model"],
  ["settings-hotkeys", "screen=settings&group=hotkeys"],
  ["settings-license", "screen=settings&group=license"],
  ["settings-privacy", "screen=settings&group=privacy", { interact: toggleReportsSwitch }],
  // Người dùng đã tắt báo cáo lỗi (reports=0): công tắc tắt.
  ["settings-privacy-off", "screen=settings&group=privacy&reports=0"],
  // Gõ dịch (spec 2026-10-17-go-dich §1.4): macOS đã cấp quyền Trợ năng, chưa cấp (ax=0); Windows không có mục tự dán.
  ["settings-compose", "screen=settings&group=compose"],
  ["settings-compose-noax", "screen=settings&group=compose&ax=0"],
  ["settings-compose-windows", "screen=settings&group=compose&platform=windows"],
  // Nâng cấp (spec 2026-10-14, 2026-10-22): ba bước; cách trả chọn sẵn theo ngôn ngữ của lượt chạy (vi: VietQR, còn lại: thẻ).
  ["upgrade", "screen=upgrade&plan=free"],
  // Bấm sang cách trả còn lại: chữ, giá và ghi chú của cách đó.
  ["upgrade-other", "screen=upgrade&plan=free", { interact: pickOtherMethod }],
  // Server chưa bán USD: bước 1 chỉ có một ô VietQR, ở mọi ngôn ngữ.
  ["upgrade-vnd-only", "screen=upgrade&plan=free&usd=0"],
  // Đơn VietQR đang chờ: ô VietQR khóa ở mọi ngôn ngữ (cách trả của đơn, không theo ngôn ngữ); đơn do bản app cũ lưu (đọc lại
  // với số tiền 0, loại tiền rỗng) cũng vậy.
  ["upgrade-qr", "screen=upgrade&plan=free&checkout=1"],
  ["upgrade-qr-old", "screen=upgrade&plan=free&checkout=1&pending=old"],
  // Đơn thẻ đang chờ (không mã QR): ô thẻ khóa ở mọi ngôn ngữ, kể cả tiếng Việt; đơn cũ (số tiền 0, loại tiền rỗng); đơn quá
  // giờ hẹn trả mà server còn báo chờ.
  ["upgrade-card", "screen=upgrade&plan=free&checkout=card"],
  ["upgrade-card-old", "screen=upgrade&plan=free&checkout=card&pending=old"],
  ["upgrade-card-late", "screen=upgrade&plan=free&checkout=card&late=1"],
  // Giờ đóng băng (now=): đồng hồ của cả trang khớp, nên đơn thẻ mới (hạn 30 phút sau giờ đó) không bị coi là quá hạn dù giờ thật
  // đã xa hơn nhiều.
  ["upgrade-card-frozen", "screen=upgrade&plan=free&checkout=card&now=2026-01-01T00:00:00Z"],
  // Bấm thật (tên có "start": ảnh chụp là màn hình sau khi tạo đơn).
  ["upgrade-start-card", "screen=upgrade&plan=free", { interact: startByCard }],
  ["upgrade-start-qr", "screen=upgrade&plan=free", { interact: startByQr }],
  // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4).
  ["support", "screen=support"],
  ["support-windows", "screen=support&platform=windows"],
  ["support-chat", "screen=support&chat=open"],
  ["support-chat-dark", "screen=support&chat=open&theme=dark"],
  ["support-unread", "screen=home&chat=unread"],
  ["support-off", "screen=support&chat=open&support=off"],
  ["support-closed", "screen=support&chat=open&support=closed"],
  ["support-send", "screen=support", { interact: supportSendFirst }],
  ["support-send-failed", "screen=support&chat=open&send=ratelimited", { interact: supportSendFails }],
  ["support-send-disabled", "screen=support&send=disabled", { interact: supportSendDisabled }],
  ["support-delete", "screen=support&chat=open", { interact: supportDelete }],
  ["support-log", "screen=support&chat=open", { interact: supportAttachLog }],
  ["support-privacy", "screen=support", { interact: supportPrivacy }],
  ["about", "screen=about"],
  // Nút "Gửi log cho hỗ trợ" (spec 2026-10-17 §5): bấm thật ra mã báo cáo, và ba lỗi của lệnh.
  ["about-report-sent", "screen=about", { interact: sendReport }],
  ["about-report-failed", "screen=about&report=failed", { interact: reportFails("reportFailed") }],
  ["about-report-ratelimited", "screen=about&report=ratelimited", { interact: reportFails("reportRateLimited") }],
  ["about-report-rejected", "screen=about&report=rejected", { interact: reportFails("reportRejected") }],
  ["onboarding-1", "onboarding=1"],
  // Bước điều khoản: mở khung EULA để thấy dòng báo "văn bản đang bằng English" của ja, zh, ko.
  [
    "onboarding-2",
    "onboarding=2",
    { prepare: `document.querySelector("details.legal-details summary").click()`, wait: 900 },
  ],
  // Bước điều khoản, bấm thật (spec 2026-10-17 §5): giữ ô báo cáo lỗi tích sẵn rồi Tiếp (lưu true), hay bỏ tích rồi Tiếp (lưu false).
  ["onboarding-2-reports-on", "onboarding=2", { interact: reportsConsent(false) }],
  ["onboarding-2-reports-off", "onboarding=2", { interact: reportsConsent(true) }],
  ...Array.from({ length: 7 }, (_, i) => [`onboarding-${i + 3}`, `onboarding=${i + 3}${i === 1 ? "&download=1" : ""}`]),
];
// Ô soạn Gõ dịch (compose.html): [tên, tham số URL, điều kiện riêng]. Trang tự gõ chữ mẫu (trừ `empty`) rồi chờ dịch như thật,
// nên chờ thêm trước khi kiểm.
const has = (selector, what) => [`!!document.querySelector(${JSON.stringify(selector)})`, what];
const COMPOSES = [
  [
    "compose-empty",
    "state=empty",
    // `:focus` không khớp khi chính trang không được focus (Chrome không đầu); `activeElement` thì vẫn đúng.
    [
      [`document.activeElement?.tagName === "TEXTAREA"`, "con trỏ nằm sẵn trong ô gõ"],
      has("footer", "có gợi ý phím"),
      // Hộp gợi ý chữ của macOS nuốt phím Enter đầu tiên khi còn sửa chính tả (spike S2): ô gõ phải tắt.
      [`(() => { const t = document.querySelector("textarea"); return t?.spellcheck === false && t?.getAttribute("autocorrect") === "off"; })()`, "ô gõ tắt sửa chính tả và tự sửa chữ"],
    ],
  ],
  [
    "compose-reopen",
    "state=reopen",
    // Esc rồi ⌃⌥G: bản nháp còn đó phải được chọn sẵn để chữ mới gõ đè (đo ở Teams 2026-10-18: không chọn thì chữ mới chèn trước
    // bản nháp, mở lại ba lần ra 62, 93, 124 ký tự). WebKit đặt lại con trỏ về đầu ô khi trang nhận focus sau lệnh chọn, nên giả
    // lập đúng thế rồi bắn `focus`; đã bấm chuột hay bấm phím trong bản nháp (người dùng tự đặt con trỏ) thì không chọn lại.
    [
      [
        `(() => { const t = document.querySelector("textarea"); t.setSelectionRange(0, 0); window.dispatchEvent(new Event("focus")); return t.value.length > 0 && t.selectionStart === 0 && t.selectionEnd === t.value.length; })()`,
        "mở lại khi còn bản nháp: bản nháp được chọn sẵn kể cả khi trang nhận focus sau đó",
      ],
      [
        `(() => { const t = document.querySelector("textarea"); t.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); t.setSelectionRange(2, 2); window.dispatchEvent(new Event("focus")); return t.selectionStart === 2 && t.selectionEnd === 2; })()`,
        "đã bấm phím di chuyển trong bản nháp thì không chọn lại",
      ],
    ],
  ],
  ["compose-typing", "state=typing", [has(".translation.stale", "bản dịch đang về hiện mờ")]],
  ["compose-loading", "state=loading", [has(".status:not(:empty)", "dòng trạng thái báo đang nạp model")]],
  ["compose-done", "state=done", [has(".translation:not(.stale)", "bản dịch đủ hiện rõ")]],
  ["compose-same", "state=same", [has(".status:not(:empty)", "báo đã là ngôn ngữ đích")]],
  ["compose-failed", "state=failed", [has(".box.error", "có hộp lỗi")]],
  ["compose-blocked", "state=blocked", [has(".box.error button", "hộp lỗi có nút Nâng cấp")]],
  [
    "compose-permission",
    "state=permission",
    [[`document.querySelectorAll(".box:not(.error) button").length === 2`, "hộp quyền có hai nút"]],
  ],
  ["compose-copy", "state=done&paste=0", [[`document.querySelector("footer")?.textContent.includes("⌘V") === true`, "gợi ý ghi ⌘V"]]],
  ["compose-dark", "state=done&theme=dark", [[`document.documentElement.dataset.theme === "dark"`, "giao diện tối"]]],
];

const OVERLAYS = [
  ["overlay", "session=running"],
  ["overlay-live", "session=running&live=alone"],
];

// Phần tử có chữ tràn khỏi ô: tối đa 8, mỗi phần tử một dòng mô tả. Dấu "…" có chủ ý (text-overflow: ellipsis) không tính.
const AUDIT = `(() => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push("trang cuộn ngang " + de.scrollWidth + " > " + de.clientWidth);
  const boxes = [...document.querySelectorAll("button, summary, label, th, td, option, .choice-title, h1, h2, h3, h4")];
  for (const el of boxes) {
    // Bỏ phần tử ẩn có chủ ý (.sr-only rộng 1 px, dành cho trình đọc màn hình).
    if (el.clientWidth <= 2) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.push("chữ tràn khỏi ô: " + el.tagName.toLowerCase() + " " + JSON.stringify((el.textContent || "").trim().slice(0, 40)));
    }
  }
  return out.slice(0, 8);
})()`;

// Điều kiện riêng của từng màn hình: danh sách [biểu thức phải ra true, mô tả].
const EXTRA = {
  "settings-general": (lang) => [
    [
      `(() => { const s = document.querySelector("#ui-language"); return !!s && s.options.length === 5 && s.value === ${JSON.stringify(lang)}; })()`,
      "ô chọn ngôn ngữ giao diện có đủ 5 mục và chọn đúng ngôn ngữ",
    ],
  ],
  "onboarding-1": (lang) => [
    [
      `(() => { const r = [...document.querySelectorAll('input[name="ui-language"]')]; return r.length === 5 && r.filter((x) => x.checked).length === 1 && r[${UI_ORDER.indexOf(lang)}].checked; })()`,
      "bước 1 có 5 ô chọn và chọn sẵn đúng ngôn ngữ",
    ],
  ],
  // Ba bước; chọn sẵn cách trả theo ngôn ngữ; nhãn "Cách thanh toán" nhìn thấy được (không chỉ aria-label). Mỗi ngôn ngữ: câu
  // cardNote có "Creem", bankOnly thì không.
  upgrade: (lang) => [
    [steps(lang), "ba bước 1 Cách thanh toán, 2 Chọn gói, 3 Thanh toán; bảng gói ở bước 2"],
    [
      inPage(
        lang,
        `const l = document.querySelector("#upgrade-method-label"); const g = document.querySelector('[role="radiogroup"]'); const b = l?.getBoundingClientRect(); return !!l && l.textContent === t("upgrade.method") && getComputedStyle(l).visibility === "visible" && b.width > 20 && b.height > 8 && g.getAttribute("aria-labelledby") === "upgrade-method-label";`,
      ),
      'nhãn "Cách thanh toán" (upgrade.method) có chữ nhìn thấy và gắn với nhóm radio (aria-labelledby)',
    ],
    ...(defaultMethod(lang) === "VND" ? vndChosen(lang) : usdChosen(lang)),
    [
      inPage(lang, `return t("upgrade.cardNote").includes("Creem") && !t("upgrade.bankOnly").includes("Creem");`),
      'chữ của ngôn ngữ này: upgrade.cardNote có "Creem", upgrade.bankOnly thì không',
    ],
  ],
  // Server chưa bán USD (bảng giá không có giá USD): bước 1 chỉ có VietQR, ở mọi ngôn ngữ; chỉ VND, không nhắc Creem; câu đồng
  // ý của VietQR.
  "upgrade-vnd-only": (lang) => [
    [steps(lang), "vẫn đủ ba bước khi chỉ bán VND"],
    onlyVnd,
    planRadios("monthly", false),
    bodyHas("50.000 đ"),
    bodyHasNot("$"),
    notes(lang, ["upgrade.bankOnly"]),
    noCreemHint,
    bodyHasNot("merchant of record"),
    [
      inPage(lang, `return document.querySelector(".consent").textContent === t("upgrade.consent");`),
      "câu đồng ý của VietQR (upgrade.consent), không phải của thẻ",
    ],
  ],
  // Đơn VietQR: ô VND bị khóa ở mọi ngôn ngữ (cả đơn cũ chưa có loại tiền); giá VND; câu VietQR.
  "upgrade-qr": (lang) => [
    method("VND", true),
    planRadios("monthly", true),
    ...qrOrder(lang),
    status(lang, "upgrade.order.waiting", QR_CODE, ["upgrade.order.waitingCard", "upgrade.order.waitingCardLate"]),
    [`document.querySelector(".order-code").textContent.includes("50.000 đ")`, "đơn ghi số tiền 50.000 đ"],
    notes(lang, ["upgrade.bankOnly"]),
  ],
  "upgrade-qr-old": (lang) => [
    method("VND", true),
    planRadios("monthly", true),
    ...qrOrder(lang),
    [`!document.querySelector(".order-code").textContent.includes("·")`, "đơn cũ (số tiền 0): không hiện dòng số tiền"],
  ],
  // Đơn thẻ: ô thẻ và các gói bị khóa, giá USD, đúng hai nút, không form, có tiêu đề và nút mở lại; dòng trạng thái là
  // "chờ xác nhận" (chưa quá giờ), cùng lời dặn mở trình duyệt và lời dặn dưới nút.
  "upgrade-card": (lang) => [
    method("USD", true),
    planRadios("monthly", true),
    ...cardOrder(lang),
    status(lang, "upgrade.order.waitingCard", CARD_CODE, ["upgrade.order.waitingCardLate"]),
    [`document.querySelector(".order-code").textContent.includes("$3.99")`, "đơn ghi số tiền $3.99"],
    [
      inPage(
        lang,
        `const h = [...document.querySelectorAll(".checkout.browser p.hint")].map((p) => p.textContent); return h.includes(t("upgrade.browser.note")) && h.includes(t("upgrade.browser.cancelNote"));`,
      ),
      "có lời dặn upgrade.browser.note và upgrade.browser.cancelNote",
    ],
    notes(lang, ["upgrade.cardNote", "upgrade.cardMor"]),
  ],
  // Đơn thẻ bản app cũ lưu (số tiền 0, loại tiền rỗng): vẫn khóa đúng USD (suy theo không có mã QR).
  "upgrade-card-old": (lang) => [
    method("USD", true),
    planRadios("monthly", true),
    ...cardOrder(lang),
    bodyHas("$3.99"),
    [`!document.querySelector(".order-code").textContent.includes("·")`, "đơn cũ (số tiền 0): không hiện dòng số tiền"],
  ],
  // Đơn thẻ quá giờ hẹn trả mà server còn báo chờ: câu "đã quá giờ hẹn trả" (đừng trả lại), không phải câu chờ thường.
  "upgrade-card-late": (lang) => [
    method("USD", true),
    ...cardOrder(lang),
    status(lang, "upgrade.order.waitingCardLate", CARD_CODE, ["upgrade.order.waitingCard"]),
  ],
  "upgrade-card-frozen": (lang) => [
    [`Date.now() === Date.parse("2026-01-01T00:00:00Z")`, "now= đóng băng Date.now của trang"],
    status(lang, "upgrade.order.waitingCard", CARD_CODE, ["upgrade.order.waitingCardLate"]),
  ],
  about: (lang) => [
    [inPage(lang, `return document.body.textContent.includes(t("about.version", { version: ${JSON.stringify(APP_VERSION)} }));`), `màn hình Giới thiệu ghi phiên bản ${APP_VERSION} (của tauri.conf.json)`],
    [
      inPage(
        lang,
        `const b = [...document.querySelectorAll(".about-logs .actions > button")]; return b.length === 2 && b[0].textContent.includes(t("about.openLogs")) && b[1].textContent.includes(t("about.sendLogs")) && !b[1].disabled;`,
      ),
      "hai nút cạnh nhau: Mở thư mục log và Gửi log cho hỗ trợ (bấm được)",
    ],
    [inPage(lang, `return document.querySelector(".about-logs > p.hint").textContent === t("about.logsHint");`), "câu giải thích about.logsHint"],
    [
      `(() => { const r = document.querySelector(${JSON.stringify(REPORT_BOX)}); return r?.getAttribute("role") === "status" && r.children.length === 0; })()`,
      "vùng kết quả role=status có sẵn trong DOM và còn rỗng",
    ],
  ],
  "settings-privacy": (lang) => [
    [
      `(() => { const e = document.querySelector("#error-reports"); return !!e && e.type === "checkbox" && e.checked === true && !e.disabled && e.getAttribute("aria-describedby") === "error-reports-hint"; })()`,
      "công tắc báo cáo lỗi: bật, bấm được (không cần gói Pro), gắn lời giải thích bằng aria-describedby",
    ],
    [
      inPage(
        lang,
        `return document.querySelector("label[for='error-reports']").textContent === t("settings.privacy.errorReports") && document.querySelector("#error-reports-hint").textContent === t("settings.privacy.errorReports.hint");`,
      ),
      "nhãn settings.privacy.errorReports và lời giải thích settings.privacy.errorReports.hint",
    ],
  ],
  // Chưa có cuộc chat: chữ của hợp đồng phía khách, ô tích sẵn và dòng thông tin máy, mục Hỗ trợ giữa Nâng cấp và Giới thiệu, mở màn
  // hình không gọi lệnh nào ra mạng.
  support: (lang) => [
    [inPage(lang, `return document.querySelector(".support-head .hint").textContent === t("support.subtitle");`), "dòng phụ support.subtitle"],
    [inPage(lang, `return document.querySelector(".support-log .msg.owner .msg-text").textContent === t("support.greeting");`), "lời chào support.greeting"],
    [
      inPage(lang, `return document.querySelector(".support-foot").textContent === t("support.footer") + " · " + t("support.privacy");`),
      "chân khung support.footer · support.privacy",
    ],
    [`document.querySelector(".support-machine input[type=checkbox]")?.checked === true`, "ô Gửi kèm thông tin máy tích sẵn"],
    [`document.querySelector(".support-machine-line")?.textContent.includes(" · UI ") === true`, "dòng thông tin máy hiện nguyên văn"],
    [`document.querySelector(${JSON.stringify(SEND)}).disabled === true`, "ô trống: nút Gửi bị khóa"],
    [
      `${callsOf("support_screen")}.some((c) => c.args.open === true) && window.__ipcCalls.every((c) => !["support_fetch", "support_send", "support_set_email", "support_delete"].includes(c.cmd))`,
      "mở màn hình khi chưa có cuộc chat: chỉ báo mở, không lệnh nào gọi mạng",
    ],
    [
      inPage(
        lang,
        `const b = [...document.querySelectorAll(".nav button")]; return b.length === 8 && b[5].textContent === t("nav.upgrade") && b[6].textContent === t("nav.support") && b[6].getAttribute("aria-current") === "page" && b[7].textContent === t("nav.about");`,
      ),
      "mục Hỗ trợ nằm giữa Nâng cấp và Giới thiệu",
    ],
    [`!document.querySelector(".nav-dot")`, "không có chấm đỏ"],
  ],
  "support-windows": () => [
    [`document.querySelector(".support-machine-line")?.textContent.includes("Windows 11 (26100)") === true`, "dòng thông tin máy của Windows"],
  ],
  // Đã có cuộc chat: lấy cả cuộc chat, không còn ô tích, có menu ⋯.
  "support-chat": (lang) => [
    [`document.querySelectorAll(".support-log .msg").length === 3`, "lời chào và hai tin của cuộc chat"],
    [`!document.querySelector(".support-machine")`, "không còn ô Gửi kèm thông tin máy"],
    [inPage(lang, `return document.querySelector(".support-menu > button")?.getAttribute("aria-label") === t("support.menu");`), "có menu ⋯ (support.menu)"],
    [`${callsOf("support_fetch")}.length > 0`, "đã có cuộc chat: lấy cả cuộc chat"],
  ],
  // Câu trả lời chưa xem: chấm đỏ ở mục Hỗ trợ, nhãn của nút nói có câu trả lời mới.
  "support-unread": (lang) => [
    [
      inPage(lang, `const b = [...document.querySelectorAll(".nav button")][6]; return !!b.querySelector(".nav-dot") && b.getAttribute("aria-label") === t("support.unread");`),
      "mục Hỗ trợ có chấm đỏ và nhãn support.unread",
    ],
  ],
  "support-off": (lang) => [
    [`!document.querySelector(${JSON.stringify(TEXTAREA)})`, "chat tắt: không có ô nhập"],
    [inPage(lang, `return document.querySelector(".support-blocked").textContent === t("error.supportDisabled");`), "dòng error.supportDisabled thay ô nhập"],
    [`document.querySelectorAll(".support-log .msg").length === 3`, "lịch sử cũ vẫn hiện"],
  ],
  "support-closed": (lang) => [
    [`!document.querySelector(${JSON.stringify(TEXTAREA)})`, "cuộc chat đóng: không có ô nhập"],
    [inPage(lang, `return document.querySelector(".support-blocked").textContent === t("error.supportClosed");`), "dòng error.supportClosed thay ô nhập"],
  ],
  "settings-privacy-off": () => [[`document.querySelector("#error-reports").checked === false`, "reports=0: công tắc báo cáo lỗi tắt"]],
  "onboarding-2": (lang) => {
    const note = ["ja", "zh", "ko"].includes(lang);
    return [
      [
        note
          ? `(() => { const p = document.querySelector(".legal p.hint"); return !!p && p.textContent.includes("English"); })()`
          : `!document.querySelector(".legal p.hint")`,
        note ? "khung EULA có dòng báo văn bản đang bằng English" : "khung EULA không có dòng báo (có bản đúng ngôn ngữ)",
      ],
      [
        `(() => { const c = document.querySelectorAll(".consent input"); return c.length === 2 && c[0].checked === false && c[1].checked === true; })()`,
        "hai ô tích: ô đồng ý Chính sách bỏ tick, ô báo cáo lỗi tích sẵn",
      ],
      [
        inPage(
          lang,
          `const l = document.querySelectorAll(".consent")[1]; return l.textContent === t("onboarding.terms.reports") && document.querySelector("#terms-reports-hint").textContent === t("onboarding.terms.reports.hint") && l.querySelector("input").getAttribute("aria-describedby") === "terms-reports-hint";`,
        ),
        "ô báo cáo lỗi có chữ onboarding.terms.reports, lời giải thích onboarding.terms.reports.hint gắn bằng aria-describedby",
      ],
    ];
  },
};

async function check(label, page, expression, what) {
  const value = await page.eval(expression).catch((e) => `lỗi: ${e.message}`);
  if (value !== true) failures.push(`${label}: ${what} (được ${JSON.stringify(value)})`);
}

async function visit(browser, lang, win, name, url, { prepare, wait = 700, transparent = false, audit = true, interact } = {}, extras = []) {
  const label = `${lang}/${win.name}/${name}`;
  const page = await browser.newPage({ width: win.width, height: win.height, dpr: 1 });
  try {
    if (transparent) await page.s.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    try {
      await page.goto(url);
    } catch (e) {
      throw new OpenError(`${label}: không mở được ${url}: ${e.message}`);
    }
    await sleep(800);
    // Trang lỗi của Chrome (chrome-error://…) cũng bắn sự kiện load: phải ở đúng trang xem trước.
    const href = await page.eval("location.href").catch(() => "");
    if (!String(href).startsWith(`${BASE}/`)) throw new OpenError(`${label}: ${url} không mở ra trang xem trước (đang ở ${JSON.stringify(href)})`);
    if (prepare) {
      await page.eval(prepare);
      await sleep(wait);
    }
    await check(label, page, `document.documentElement.lang === ${JSON.stringify(HTML_LANG[lang])}`, `<html lang> phải là ${HTML_LANG[lang]}`);
    if (audit) {
      const issues = await page.eval(AUDIT).catch((e) => [`lỗi: ${e.message}`]);
      for (const issue of issues) failures.push(`${label}: ${issue}`);
    }
    for (const [expression, what] of extras) await check(label, page, expression, what);
    if (interact) {
      try {
        await interact(page, (expression, what) => check(label, page, expression, what), lang);
      } catch (e) {
        failures.push(`${label}: bấm thử không chạy được: ${e.message}`);
      }
    }
    const shot = await page.s.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(out, `${lang}.${win.name}.${name}.png`), Buffer.from(shot.data, "base64"));
    // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
    failures.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `${label}: ${e}`));
  } finally {
    await page.close();
  }
}

// Vite chưa chạy hay sai cổng: báo một dòng rõ ràng, chưa cần mở Chrome.
try {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`Không mở được trang xem trước ${BASE}: ${e.message}\nChạy Vite trước (xem đầu file), hay đặt PREVIEW_URL.`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
try {
  for (const lang of LANGS) {
    for (const win of WINDOWS) {
      for (const [name, query, options] of SCREENS) {
        if (!wanted(name)) continue;
        await visit(browser, lang, win, name, `${BASE}/?${query}&lang=${lang}`, options, EXTRA[name]?.(lang));
      }
    }
    for (const [name, query, extras] of COMPOSES) {
      if (!wanted(name)) continue;
      const url = `${BASE}/compose.html?${query}&lang=${lang}`;
      await visit(browser, lang, { name: "560x420", width: 560, height: 420 }, name, url, { prepare: "1", wait: 1200, transparent: true }, extras);
    }
    for (const [name, query] of OVERLAYS) {
      if (!wanted(name)) continue;
      await visit(browser, lang, { name: "900x300", width: 900, height: 300 }, name, `${BASE}/overlay.html?${query}&lang=${lang}`, {
        transparent: true,
        audit: false,
      });
    }
    console.log(`${lang}: xong`);
  }
} catch (e) {
  // Không mở được một trang giữa chừng: dừng ngay (các điều kiện sau đó vô nghĩa); lỗi khác của script thì ném tiếp.
  if (!(e instanceof OpenError)) throw e;
  failures.push(e.message);
} finally {
  // Dù đạt, sai hay lỗi: tắt Chrome và xóa thư mục hồ sơ tạm của nó.
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} điều kiện sai:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nĐạt: ${LANGS.join(", ")}. Ảnh ở ${out}`);
