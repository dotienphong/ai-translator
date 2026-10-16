// Kiểm giao diện app ở các ngôn ngữ giao diện (spec 2026-10-12-ui-ja-zh-ko-design.md §7) trên trang xem trước
// (vite.config.ts, IPC giả): DOM thật trong Chrome không đầu (qua website/tools/browser/cdp.mjs, không thêm thư viện), ở
// cỡ cửa sổ mặc định (960×640) và nhỏ nhất (720×480). Với mỗi màn hình: thuộc tính <html lang> đúng; trang không cuộn ngang;
// chữ của nút, nhãn, tiêu đề không tràn khỏi ô; ô chọn ngôn ngữ có đủ 5 mục. Màn hình Nâng cấp có thêm điều kiện thanh toán
// (spec 2026-10-14): hai cách trả (VND, USD) chỉ khi server bán cả hai và chọn sẵn theo gợi ý; đơn đang chờ khóa gói và cách
// trả đúng loại tiền của đơn (kể cả đơn dựng lại `amount 0, currency ""`); đơn thẻ không có ô email, mã QR, đúng hai nút, có
// câu bên bán lại (merchant of record) và câu quá giờ hẹn trả; bấm thật thì `start_checkout` nhận đúng gói và loại tiền, đổi
// cách trả thì ô đồng ý bỏ tick. Ảnh PNG cho người kiểm xem ở target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai
// thì in ra và thoát mã 1; không mở được trang thì báo ngay và thoát mã 1. Chrome luôn đóng (xóa thư mục hồ sơ tạm) khi xong.
//
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 &   # trang xem trước, cổng 1431
//   node scripts/ui-preview/check-i18n.mjs [mã ngôn ngữ…]                            # không có mã: ja zh ko
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

// Không có ô cách trả nào (server chỉ bán VND): không nhóm radio, không nhãn "Cách thanh toán".
const noMethod = [
  `${radios("method")}.length === 0 && !document.querySelector("#upgrade-method-label")`,
  "không có lựa chọn cách trả (server chỉ bán VND)",
];

// Đang có đơn chờ: không còn form tạo đơn (không ô email, không ô đồng ý).
const noForm = [`!document.querySelector("#upgrade-email") && !document.querySelector("form.card")`, "không có form tạo đơn (ô email)"];

// Các câu ghi chú dưới bảng giá, theo thứ tự hiện.
const notes = (lang, keys) => [
  inPage(
    lang,
    `const h = [...document.querySelectorAll(".plan-notes p.hint")].map((p) => p.textContent); return JSON.stringify(h) === JSON.stringify(${JSON.stringify(keys)}.map((k) => t(k)));`,
  ),
  `ghi chú dưới bảng giá đúng ${keys.join(" + ")}`,
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
      `const c = document.querySelector(".checkout.browser"); return c.querySelector("h2.card-title").textContent === t("upgrade.browser.title") && c.querySelector("button").textContent.includes(t("upgrade.reopen"));`,
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
  [inPage(lang, `return document.querySelector(".checkout h2.card-title").textContent === t("upgrade.scan");`), "đơn VietQR: có tiêu đề upgrade.scan"],
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

// Bấm thật: chọn gói 6 Months, tick đồng ý rồi đổi cách trả (ô đồng ý phải tự bỏ tick, cả hai chiều), trả bằng thẻ.
async function startByCard(page, ck, lang) {
  await page.click('.plan:has(input[value="six_months"]) label');
  await type(page, "#upgrade-email", EMAIL);
  await page.click(".consent");
  await ck(...consentIs(true));
  await page.click('.choice:has(input[value="VND"])');
  await ck(...method("VND", false));
  await ck(...consentIs(false));
  await ck(...payDisabled(true));
  await page.click(".consent");
  await ck(...consentIs(true));
  await page.click('.choice:has(input[value="USD"])');
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

// Bấm thật: khách có gợi ý USD chọn chuyển khoản VietQR (VND), gói mặc định Monthly.
async function startByQr(page, ck, lang) {
  await page.click('.choice:has(input[value="VND"])');
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
  ["settings-privacy", "screen=settings&group=privacy"],
  // Nâng cấp (spec 2026-10-14). Khách ở Việt Nam (server gợi ý VND): chọn sẵn VietQR.
  ["upgrade", "screen=upgrade&plan=free"],
  // Khách ở nước ngoài (gợi ý USD): chọn sẵn thẻ quốc tế.
  ["upgrade-intl", "screen=upgrade&plan=free&suggest=usd"],
  // Server chưa bán USD: không có lựa chọn cách trả, kể cả khi gợi ý là USD (không bán được thì quay về VND).
  ["upgrade-vnd-only", "screen=upgrade&plan=free&usd=0"],
  ["upgrade-usd-off", "screen=upgrade&plan=free&usd=0&suggest=usd"],
  // Đơn VietQR đang chờ; khách có gợi ý USD mở lại app vẫn thấy ô VietQR (cách trả của đơn, không theo gợi ý); đơn do bản app
  // cũ lưu (đọc lại với số tiền 0, loại tiền rỗng) cũng vậy.
  ["upgrade-qr", "screen=upgrade&plan=free&checkout=1"],
  ["upgrade-qr-intl", "screen=upgrade&plan=free&suggest=usd&checkout=1"],
  ["upgrade-qr-old", "screen=upgrade&plan=free&suggest=usd&checkout=1&pending=old"],
  // Đơn thẻ đang chờ (không mã QR); khách ở Việt Nam (gợi ý VND) mở lại app vẫn thấy ô thẻ; đơn cũ (số tiền 0, loại tiền
  // rỗng); đơn quá giờ hẹn trả mà server còn báo chờ.
  ["upgrade-card", "screen=upgrade&plan=free&suggest=usd&checkout=card"],
  ["upgrade-card-vn", "screen=upgrade&plan=free&checkout=card"],
  ["upgrade-card-old", "screen=upgrade&plan=free&checkout=card&pending=old"],
  ["upgrade-card-late", "screen=upgrade&plan=free&suggest=usd&checkout=card&late=1"],
  // Giờ đóng băng (now=): đồng hồ của cả trang khớp, nên đơn thẻ mới (hạn 30 phút sau giờ đó) không bị coi là quá hạn dù giờ thật
  // đã xa hơn nhiều.
  ["upgrade-card-frozen", "screen=upgrade&plan=free&checkout=card&now=2026-01-01T00:00:00Z"],
  // Bấm thật (tên có "start": ảnh chụp là màn hình sau khi tạo đơn).
  ["upgrade-start-card", "screen=upgrade&plan=free&suggest=usd", { interact: startByCard }],
  ["upgrade-start-qr", "screen=upgrade&plan=free&suggest=usd", { interact: startByQr }],
  ["about", "screen=about"],
  ["onboarding-1", "onboarding=1"],
  // Bước điều khoản: mở khung EULA để thấy dòng báo "văn bản đang bằng English" của ja, zh, ko.
  [
    "onboarding-2",
    "onboarding=2",
    { prepare: `document.querySelector("details.legal-details summary").click()`, wait: 900 },
  ],
  ...Array.from({ length: 7 }, (_, i) => [`onboarding-${i + 3}`, `onboarding=${i + 3}${i === 1 ? "&download=1" : ""}`]),
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
  // Có hai cách trả (server bán cả VND lẫn USD), chọn sẵn VietQR theo gợi ý; giá VND; nhãn "Cách thanh toán" nhìn thấy được
  // (không chỉ aria-label); ghi chú là câu VietQR, không nhắc Creem. Mỗi ngôn ngữ: câu cardNote có "Creem", bankOnly thì không.
  upgrade: (lang) => [
    method("VND", false),
    planRadios("monthly", false),
    bodyHas("50.000 đ"),
    bodyHas("269.000 đ"),
    bodyHas("500.000 đ"),
    bodyHasNot("$"),
    [
      inPage(
        lang,
        `const l = document.querySelector("#upgrade-method-label"); const g = document.querySelector('[role="radiogroup"]'); const b = l?.getBoundingClientRect(); return !!l && l.textContent === t("upgrade.method") && getComputedStyle(l).visibility === "visible" && b.width > 20 && b.height > 8 && g.getAttribute("aria-labelledby") === "upgrade-method-label";`,
      ),
      'nhãn "Cách thanh toán" (upgrade.method) có chữ nhìn thấy và gắn với nhóm radio (aria-labelledby)',
    ],
    notes(lang, ["upgrade.bankOnly"]),
    noCreemHint,
    bodyHasNot("merchant of record"),
    [
      inPage(lang, `return t("upgrade.cardNote").includes("Creem") && !t("upgrade.bankOnly").includes("Creem");`),
      'chữ của ngôn ngữ này: upgrade.cardNote có "Creem", upgrade.bankOnly thì không',
    ],
    [`document.querySelectorAll("details.legal-details").length === 1`, "chỉ một mục gập pháp lý (chính sách), chưa có EULA của đơn thẻ"],
  ],
  // Chọn sẵn thẻ theo gợi ý USD: giá USD, câu cardNote (có Creem) và câu merchant of record, câu đồng ý của thẻ, nút trả bằng
  // trình duyệt, thêm mục gập EULA.
  "upgrade-intl": (lang) => [
    method("USD", false),
    planRadios("monthly", false),
    bodyHas("$3.99"),
    bodyHas("$21.99"),
    bodyHas("$39.99"),
    bodyHasNot("50.000 đ"),
    notes(lang, ["upgrade.cardNote", "upgrade.cardMor"]),
    [`document.querySelector(".plan-notes p.hint").textContent.includes("Creem")`, 'ghi chú cách trả của thẻ nhắc "Creem"'],
    bodyHas("merchant of record"),
    [
      inPage(
        lang,
        `return document.querySelector(".consent").textContent === t("upgrade.consentCard") && document.querySelector('form.card button[type="submit"]').textContent.includes(t("upgrade.payCard"));`,
      ),
      "câu đồng ý của thẻ (upgrade.consentCard) và nút upgrade.payCard",
    ],
    [`document.querySelectorAll("details.legal-details").length === 2`, "hai mục gập pháp lý (chính sách và EULA)"],
  ],
  // Server chưa bán USD (bảng giá không có giá USD): không có lựa chọn cách trả, chỉ VND, không nhắc Creem.
  "upgrade-vnd-only": (lang) => [
    noMethod,
    planRadios("monthly", false),
    bodyHas("50.000 đ"),
    bodyHasNot("$"),
    notes(lang, ["upgrade.bankOnly"]),
    noCreemHint,
    bodyHasNot("merchant of record"),
    [`!!document.querySelector("#upgrade-email")`, "có form tạo đơn (ô email)"],
  ],
  "upgrade-usd-off": (lang) => [
    noMethod,
    bodyHas("50.000 đ"),
    bodyHasNot("$"),
    notes(lang, ["upgrade.bankOnly"]),
    noCreemHint,
    [
      inPage(lang, `return document.querySelector(".consent").textContent === t("upgrade.consent");`),
      "câu đồng ý của VietQR (upgrade.consent), không phải của thẻ: server gợi ý USD nhưng không bán",
    ],
  ],
  // Đơn VietQR: ô VND bị khóa dù server gợi ý USD (cả đơn cũ chưa có loại tiền); giá VND; câu VietQR.
  "upgrade-qr": (lang) => [
    method("VND", true),
    planRadios("monthly", true),
    ...qrOrder(lang),
    status(lang, "upgrade.order.waiting", QR_CODE, ["upgrade.order.waitingCard", "upgrade.order.waitingCardLate"]),
    [`document.querySelector(".order-code").textContent.includes("50.000 đ")`, "đơn ghi số tiền 50.000 đ"],
    notes(lang, ["upgrade.bankOnly"]),
  ],
  "upgrade-qr-intl": (lang) => [method("VND", true), planRadios("monthly", true), ...qrOrder(lang), bodyHas("50.000 đ"), notes(lang, ["upgrade.bankOnly"])],
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
  // Khách ở Việt Nam (gợi ý VND) có đơn thẻ: ô được chọn là ô có chữ USD (đọc nhãn), không theo gợi ý.
  "upgrade-card-vn": (lang) => [method("USD", true), planRadios("monthly", true), ...cardOrder(lang), bodyHas("$3.99")],
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
  ],
  "onboarding-2": (lang) => {
    const note = ["ja", "zh", "ko"].includes(lang);
    return [
      [
        note
          ? `(() => { const p = document.querySelector(".legal p.hint"); return !!p && p.textContent.includes("English"); })()`
          : `!document.querySelector(".legal p.hint")`,
        note ? "khung EULA có dòng báo văn bản đang bằng English" : "khung EULA không có dòng báo (có bản đúng ngôn ngữ)",
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
        await visit(browser, lang, win, name, `${BASE}/?${query}&lang=${lang}`, options, EXTRA[name]?.(lang));
      }
    }
    for (const [name, query] of OVERLAYS) {
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
