import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, translate, UI_LANGUAGES, type UiLanguage } from "../../i18n";
import type { AccountView, LicensePlan } from "../../lib/ipc";
import { bannerVisible, canLink, LinkAccountBannerView, type LinkAccountBannerViewProps } from "./LinkAccountBanner";

// Banner "Liên kết tài khoản Google" cho máy có gói trả phí mà chưa đăng nhập (spec 2026-11-05-dang-nhap-google §6.3, L5): tắt được,
// không chặn gì. Phần hiển thị ở `LinkAccountBannerView` (test trong Node như LoginGate.test.ts).


// Đọc file bằng `node:fs` nạp động (dự án không cài kiểu của Node), như overlay.css.test.ts.
type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
const readSource = async (url: URL) => ((await import("node:fs" as string)) as Fs).readFileSync(url, "utf8");

const view = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: false, ...patch });
const PLANS: LicensePlan[] = ["free", "monthly", "six_months", "yearly"];

const props = (patch: Partial<LinkAccountBannerViewProps> = {}): LinkAccountBannerViewProps => ({
  lang: "vi",
  view: view(),
  error: null,
  busy: false,
  consented: false,
  sessionActive: false,
  onConsent: () => {},
  onLink: () => {},
  onCancel: () => {},
  onLater: () => {},
  ...patch,
});

const html = (patch: Partial<LinkAccountBannerViewProps> = {}) =>
  renderToStaticMarkup(createElement(LinkAccountBannerView, props(patch)));
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const text = (lang: UiLanguage, key: MessageKey) => esc(translate(lang, key));

function elements(node: unknown, out: ReactElement<Record<string, unknown>>[] = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) elements(n, out);
    return out;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.props) {
    out.push(el);
    elements(el.props.children, out);
  }
  return out;
}
const tree = (patch: Partial<LinkAccountBannerViewProps> = {}) => {
  const root = LinkAccountBannerView(props(patch));
  return root ? elements(root) : [];
};
const button = (patch: Partial<LinkAccountBannerViewProps>, key: MessageKey) =>
  tree(patch).find((e) => e.type === "button" && e.props.children === translate(patch.lang ?? "vi", key));
const consentBox = (patch: Partial<LinkAccountBannerViewProps> = {}) =>
  tree(patch).find((e) => e.type === "input" && e.props.type === "checkbox");

describe("canLink / bannerVisible: khi nào hiện banner", () => {
  it("chỉ máy gói trả phí chưa đăng nhập; Free thì không bao giờ", () => {
    for (const plan of PLANS) {
      expect(bannerVisible(plan, view(), false), plan).toBe(plan !== "free");
      // Cổng bật hay tắt cũng vậy: quyết định theo gói và trạng thái đăng nhập.
      expect(bannerVisible(plan, view({ gate: true }), false), `${plan} gate`).toBe(plan !== "free");
    }
  });

  it("đã đăng nhập: không hiện, ở mọi gói", () => {
    for (const plan of PLANS) {
      expect(bannerVisible(plan, view({ state: "signedIn", email: "an@example.com" }), false), plan).toBe(false);
    }
  });

  it("chưa biết trạng thái tài khoản (view null) hay chưa biết gói (null): không hiện gì", () => {
    for (const plan of PLANS) expect(bannerVisible(plan, null, false), plan).toBe(false);
    expect(bannerVisible(null, view(), false)).toBe(false);
    expect(bannerVisible(null, null, false)).toBe(false);
  });

  it("đã bấm Để sau (trong phiên này): ẩn", () => {
    expect(bannerVisible("monthly", view(), true)).toBe(false);
  });

  it("đang chờ đăng nhập (signingIn) mà gói trả phí: vẫn hiện để còn nút Hủy; Free thì không", () => {
    expect(bannerVisible("yearly", view({ state: "signingIn" }), false)).toBe(true);
    expect(bannerVisible("free", view({ state: "signingIn" }), false)).toBe(false);
  });

  it("canLink không phụ thuộc Để sau (Cài đặt › Tài khoản vẫn cho liên kết sau khi bấm Để sau)", () => {
    expect(canLink("monthly", view())).toBe(true);
    expect(canLink("free", view())).toBe(false);
    expect(canLink("monthly", null)).toBe(false);
    expect(canLink(null, view())).toBe(false);
    expect(canLink("monthly", view({ state: "signedIn", email: "a@b.c" }))).toBe(false);
  });
});

describe("LinkAccountBannerView", () => {
  it("có lời giải thích, ô đồng ý (cùng chữ với màn đăng nhập), nút Liên kết và nút Để sau", () => {
    const markup = html();
    expect(markup).toContain(text("vi", "account.link.body"));
    expect(markup).toContain(text("vi", "account.gate.consent"));
    expect(markup).toContain(">Liên kết tài khoản Google<");
    expect(markup).toContain(">Để sau<");
  });

  it("view null: không vẽ gì", () => {
    expect(LinkAccountBannerView(props({ view: null }))).toBeNull();
  });

  it("ô đồng ý không tick sẵn; chưa tick thì nút Liên kết bị khóa, tick rồi thì bấm được", () => {
    expect(consentBox()?.props.checked).toBe(false);
    expect(button({ consented: false }, "account.link.button")?.props.disabled).toBe(true);
    expect(button({ consented: true }, "account.link.button")?.props.disabled).toBe(false);
  });

  it("đổi ô đồng ý báo onConsent đúng giá trị", () => {
    const calls: boolean[] = [];
    const box = consentBox({ onConsent: (v) => calls.push(v) });
    (box?.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    (box?.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    expect(calls).toEqual([true, false]);
  });

  it("bấm Liên kết gọi onLink với ngôn ngữ giao diện", () => {
    for (const lang of UI_LANGUAGES) {
      const calls: string[] = [];
      const b = button({ lang, consented: true, onLink: (l) => calls.push(l) }, "account.link.button");
      (b?.props.onClick as () => void)();
      expect(calls, lang).toEqual([lang]);
    }
  });

  it("bấm Để sau gọi onLater, không cần tick đồng ý", () => {
    let later = 0;
    const b = button({ consented: false, onLater: () => (later += 1) }, "account.link.later");
    expect(b?.props.disabled).toBe(false);
    (b?.props.onClick as () => void)();
    expect(later).toBe(1);
  });

  it("đang dịch: cả hai nút đều bị khóa, kể cả đã tick; ô đồng ý không khóa (không chặn gì)", () => {
    expect(button({ consented: true, sessionActive: true }, "account.link.button")?.props.disabled).toBe(true);
    expect(button({ consented: true, sessionActive: true }, "account.link.later")?.props.disabled).toBe(true);
  });

  it("không có onLater (khối trong Cài đặt): không có nút Để sau", () => {
    expect(html({ onLater: undefined })).not.toContain(">Để sau<");
    expect(button({ onLater: undefined }, "account.link.later")).toBeUndefined();
  });

  it("đang chờ trình duyệt (signingIn hay busy): câu chờ và nút Hủy gọi onCancel, không còn nút Liên kết và Để sau", () => {
    for (const patch of [{ view: view({ state: "signingIn" }) }, { busy: true }]) {
      const markup = html({ ...patch, consented: true });
      expect(markup).toContain(text("vi", "account.gate.waiting"));
      expect(markup).not.toContain(">Liên kết tài khoản Google<");
      expect(markup).not.toContain(">Để sau<");
      let cancelled = 0;
      (button({ ...patch, consented: true, onCancel: () => (cancelled += 1) }, "account.gate.cancel")?.props.onClick as () => void)();
      expect(cancelled).toBe(1);
    }
  });

  it("lỗi hiện đúng câu theo mã; tài khoản tạm ngừng (accountUnavailable) là câu nhẹ nhàng, không chặn nút Để sau", () => {
    for (const code of ["accountNetwork", "accountDenied", "accountFailed", "accountExpired", "accountBusy", "accountUnavailable", "accountStorage"]) {
      const markup = html({ error: { code, field: null } });
      expect(markup, code).toContain('role="alert"');
    }
    const unavailable = html({ error: { code: "accountUnavailable", field: null } });
    expect(unavailable).toContain(text("vi", "error.accountUnavailable"));
    expect(button({ error: { code: "accountUnavailable", field: null } }, "account.link.later")?.props.disabled).toBe(false);
    expect(html({ error: { code: "weird", field: null } })).toContain(text("vi", "error.unknown"));
  });

  it("người dùng tự hủy (accountCancelled) không phải lỗi; không lỗi thì không có thanh báo", () => {
    expect(html({ error: { code: "accountCancelled", field: null } })).not.toContain('role="alert"');
    expect(html()).not.toContain('role="alert"');
  });

  it("không chặn thao tác nào: không hộp thoại, không modal, không lớp phủ", () => {
    const markup = html({ consented: true });
    for (const banned of ['role="dialog"', "aria-modal", "<dialog", "inert", "overlay", "backdrop"]) {
      expect(markup, banned).not.toContain(banned);
    }
    // Không ô nhập nào tự lấy focus của người đang dùng app.
    expect(markup).not.toContain("autofocus");
  });
});

describe("không chặn, không lưu", () => {
  const read = (path: string) => readSource(new URL(path, import.meta.url));

  it("CSS của banner không dùng vị trí fixed, absolute hay sticky (không phủ lên nút Bắt đầu/Dừng)", async () => {
    const css = await read("../../styles/main.css");
    const rules = [...css.matchAll(/(^|\})\s*([^{}]*\.link-account[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, , selector, body] of rules) {
      expect(body, selector).not.toMatch(/position\s*:\s*(fixed|absolute|sticky)/);
      expect(body, selector).not.toMatch(/z-index/);
    }
  });

  it("Để sau chỉ nằm trong bộ nhớ: banner không gọi IPC lưu cài đặt, không dùng localStorage", async () => {
    const source = await read("./LinkAccountBanner.tsx");
    for (const banned of ["update_settings", "localStorage", "sessionStorage", "invoke("]) {
      expect(source, banned).not.toContain(banned);
    }
    expect(source).toContain("useLinkBanner");
  });

  it("Màn hình chính đặt banner trong SafeBoundary, sau thẻ có nút Bắt đầu/Dừng", async () => {
    const home = await read("./screens/Home.tsx");
    expect(home).toMatch(/<SafeBoundary[^>]*>\s*<LinkAccountBanner\s*\/>\s*<\/SafeBoundary>/);
    expect(home.indexOf("<LinkAccountBanner")).toBeGreaterThan(home.indexOf("toggleSession()"));
  });
});

describe("chữ của banner ở năm ngôn ngữ", () => {
  const KEYS: MessageKey[] = ["account.link.body", "account.link.button", "account.link.later"];

  it("đủ khóa, không rỗng, các ngôn ngữ khác en đều đã dịch", () => {
    for (const lang of UI_LANGUAGES) {
      for (const key of KEYS) {
        const s = translate(lang, key);
        expect(s.trim(), `${lang} ${key}`).not.toBe("");
        if (lang !== "en") expect(s, `${lang} ${key}`).not.toBe(translate("en", key));
      }
    }
  });

  it("vi đúng chữ của yêu cầu; nút nói rõ là Google ở mọi ngôn ngữ", () => {
    expect(translate("vi", "account.link.button")).toBe("Liên kết tài khoản Google");
    expect(translate("vi", "account.link.later")).toBe("Để sau");
    for (const lang of UI_LANGUAGES) expect(translate(lang, "account.link.button"), lang).toContain("Google");
  });

  it("lời giải thích không hứa lợi ích mà spec chưa nói và nói rõ là không bắt buộc", () => {
    expect(translate("vi", "account.link.body")).toContain("không bắt buộc");
    expect(translate("en", "account.link.body")).toMatch(/optional/i);
  });
});
