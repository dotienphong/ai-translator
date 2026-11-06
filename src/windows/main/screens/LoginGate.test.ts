import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, translate, UI_LANGUAGES, type UiLanguage } from "../../../i18n";
import { ACCOUNT_ERROR_CODES, accountErrorKey } from "../../../lib/account";
import type { AccountView, Screen } from "../../../lib/ipc";
import { GoogleSignInButton } from "../../../components/GoogleSignInButton";
import { SCREENS } from "../navigation";
import { gateBlocks, LoginGateView, type LoginGateViewProps } from "./LoginGate";

// Màn đăng nhập (spec 2026-11-05-dang-nhap-google §6.3) vẽ bằng `react-dom/server` trong Node (như UpgradeView.test.ts); bấm thử bằng
// cách gọi lại hàm mà view truyền cho phần tử (như VoiceScreen.test.ts).

const view = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: true, ...patch });

const props = (patch: Partial<LoginGateViewProps> = {}): LoginGateViewProps => ({
  lang: "vi",
  view: view(),
  error: null,
  busy: false,
  consented: false,
  sessionActive: false,
  onConsent: () => {},
  onSignIn: () => {},
  onCancel: () => {},
  onUpgrade: () => {},
  onSupport: () => {},
  ...patch,
});

const html = (patch: Partial<LoginGateViewProps> = {}) => renderToStaticMarkup(createElement(LoginGateView, props(patch)));
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const text = (lang: UiLanguage, key: MessageKey) => esc(translate(lang, key));

// Các phần tử của cây React mà view trả về (không mở các component con: chỉ đọc props của chúng).
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
const tree = (patch: Partial<LoginGateViewProps> = {}) => elements(LoginGateView(props(patch)));
const signInButton = (patch: Partial<LoginGateViewProps> = {}) => tree(patch).find((e) => e.type === GoogleSignInButton);
const consentBox = (patch: Partial<LoginGateViewProps> = {}) =>
  tree(patch).find((e) => e.type === "input" && e.props.type === "checkbox");
const button = (patch: Partial<LoginGateViewProps>, key: MessageKey) =>
  tree(patch).find((e) => e.type === "button" && e.props.children === translate(patch.lang ?? "vi", key));

describe("gateBlocks: màn nào bị thay bằng LoginGate", () => {
  const GATED: Screen[] = ["home", "compose", "voice"];

  it("cổng bật: chỉ thân của Màn hình chính, Gõ dịch, Giọng đọc bị thay", () => {
    for (const screen of SCREENS) expect(gateBlocks(screen, view(), false), screen).toBe(GATED.includes(screen));
  });

  it("Lịch sử, Bản chép lời, Từ điển, Cài đặt, Nâng cấp, Hỗ trợ, Giới thiệu không bao giờ bị chặn", () => {
    for (const screen of ["history", "transcript", "glossary", "settings", "upgrade", "support", "about"] as const) {
      for (const v of [view(), view({ state: "signingIn" }), null]) expect(gateBlocks(screen, v, false), screen).toBe(false);
    }
  });

  // Fix round 1: "Để sau" ở bước Đăng nhập của onboarding chỉ là cờ cục bộ của onboarding; `gateBlocks` không nhận cờ đó, nên
  // sau onboarding máy chưa đăng nhập (cổng đóng) vẫn thấy màn đăng nhập ở ba màn dịch, kèm liên kết Nâng cấp và Hỗ trợ.
  it("sau khi bấm Để sau ở onboarding: cổng vẫn chặn Màn hình chính, Gõ dịch, Giọng đọc", () => {
    for (const screen of ["home", "compose", "voice"] as const) expect(gateBlocks(screen, view(), false), screen).toBe(true);
    expect(html()).toContain(text("vi", "account.gate.upgrade"));
    expect(html()).toContain(text("vi", "account.gate.support"));
  });

  it("chưa có câu trả lời đầu tiên của get_account (view null): không chặn gì, không nháy màn đăng nhập", () => {
    for (const screen of SCREENS) expect(gateBlocks(screen, null, false), screen).toBe(false);
  });

  it("cổng mở (gói trả phí, server tắt đăng nhập, đã đăng nhập): không chặn gì", () => {
    for (const v of [view({ gate: false }), view({ state: "signedIn", email: "an@example.com", gate: false })]) {
      for (const screen of SCREENS) expect(gateBlocks(screen, v, false), screen).toBe(false);
    }
  });

  it("phiên đang dịch: không chặn (phiên đang chạy được chạy hết, nút Dừng phải còn đó)", () => {
    for (const screen of SCREENS) expect(gateBlocks(screen, view(), true), screen).toBe(false);
  });
});

describe("LoginGateView", () => {
  it("có tiêu đề, lời giải thích, ô đồng ý và nút đăng nhập", () => {
    const markup = html();
    expect(markup).toContain(text("vi", "account.gate.title"));
    expect(markup).toContain(text("vi", "account.gate.body"));
    expect(markup).toContain(text("vi", "account.gate.consent"));
    expect(markup).toContain(text("vi", "account.gate.signIn"));
  });

  it("chưa tick đồng ý: nút đăng nhập bị khóa; tick rồi thì bấm được", () => {
    expect(signInButton({ consented: false })?.props.disabled).toBe(true);
    expect(signInButton({ consented: true })?.props.disabled).toBe(false);
    expect(html({ consented: false })).toMatch(/<button(?=[^>]*disabled="")(?=[^>]*class="google-signin")[^>]*>/);
    expect(html({ consented: true })).not.toMatch(/<button(?=[^>]*disabled="")(?=[^>]*class="google-signin")[^>]*>/);
  });

  it("ô đồng ý: bỏ tick sẵn, đổi thì báo onConsent đúng giá trị", () => {
    const calls: boolean[] = [];
    const box = consentBox({ onConsent: (v) => calls.push(v) });
    expect(box?.props.checked).toBe(false);
    (box?.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    (box?.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    expect(calls).toEqual([true, false]);
    expect(consentBox({ consented: true })?.props.checked).toBe(true);
  });

  it("bấm Đăng nhập gọi onSignIn với ngôn ngữ giao diện", () => {
    for (const lang of UI_LANGUAGES) {
      const calls: string[] = [];
      const b = signInButton({ lang, consented: true, onSignIn: (l) => calls.push(l) });
      (b?.props.onClick as () => void)();
      expect(calls, lang).toEqual([lang]);
    }
  });

  it("đang phiên dịch: nút đăng nhập bị khóa dù đã tick (không gọi server tài khoản lúc đang dịch)", () => {
    expect(signInButton({ consented: true, sessionActive: true })?.props.disabled).toBe(true);
  });

  it("đang chờ đăng nhập trên trình duyệt: câu chờ, nút Hủy (gọi onCancel), không còn nút đăng nhập", () => {
    for (const patch of [{ view: view({ state: "signingIn" }) }, { busy: true }]) {
      const markup = html({ ...patch, consented: true });
      expect(markup).toContain(text("vi", "account.gate.waiting"));
      expect(markup).toContain(text("vi", "account.gate.cancel"));
      expect(signInButton({ ...patch, consented: true })).toBeUndefined();
      let cancelled = 0;
      (button({ ...patch, consented: true, onCancel: () => (cancelled += 1) }, "account.gate.cancel")?.props.onClick as () => void)();
      expect(cancelled).toBe(1);
    }
    expect(html()).not.toContain(text("vi", "account.gate.waiting"));
    expect(html()).not.toContain(text("vi", "account.gate.cancel"));
  });

  it("lỗi hiện đúng câu theo mã (vi, en)", () => {
    for (const lang of ["vi", "en"] as const) {
      for (const code of ["accountNetwork", "accountDenied", "accountFailed", "accountExpired", "accountBusy", "accountUnavailable", "accountStorage"]) {
        const markup = html({ lang, error: { code, field: null } });
        expect(markup, `${lang} ${code}`).toContain(text(lang, accountErrorKey(code)));
        expect(markup, `${lang} ${code}`).toContain('role="alert"');
      }
    }
    expect(html({ lang: "en", error: { code: "accountNetwork", field: null } })).toContain(esc(translate("en", "error.accountNetwork")));
  });

  it("mã lạ thì câu chung; người dùng tự hủy (accountCancelled) thì không hiện gì", () => {
    expect(html({ error: { code: "weird", field: null } })).toContain(text("vi", "error.unknown"));
    const cancelled = html({ error: { code: "accountCancelled", field: null } });
    expect(cancelled).not.toContain('role="alert"');
    expect(cancelled).not.toContain(text("vi", "error.accountCancelled"));
    expect(html()).not.toContain('role="alert"');
  });

  it("liên kết Nâng cấp và Hỗ trợ bấm được và gọi đúng hàm", () => {
    const calls: string[] = [];
    const p = { onUpgrade: () => calls.push("upgrade"), onSupport: () => calls.push("support") };
    const upgrade = button(p, "account.gate.upgrade");
    const support = button(p, "account.gate.support");
    expect(upgrade?.props.disabled).toBeFalsy();
    expect(support?.props.disabled).toBeFalsy();
    (upgrade?.props.onClick as () => void)();
    (support?.props.onClick as () => void)();
    expect(calls).toEqual(["upgrade", "support"]);
    // Kể cả khi đang chờ đăng nhập: mua gói không cần đăng nhập.
    expect(button({ ...p, busy: true }, "account.gate.upgrade")).toBeDefined();
  });

  it("không có hàm Nâng cấp/Hỗ trợ (bước Onboarding) thì không có hai liên kết", () => {
    const markup = html({ onUpgrade: undefined, onSupport: undefined });
    expect(markup).not.toContain(text("vi", "account.gate.upgrade"));
    expect(markup).not.toContain(text("vi", "account.gate.support"));
  });
});

describe("chữ của màn đăng nhập ở năm ngôn ngữ", () => {
  const KEYS: MessageKey[] = [
    "account.gate.title",
    "account.gate.body",
    "account.gate.consent",
    "account.gate.signIn",
    "account.gate.waiting",
    "account.gate.cancel",
    "account.gate.upgrade",
    "account.gate.support",
    "onboarding.account.title",
    ...ACCOUNT_ERROR_CODES.map((code) => accountErrorKey(code)),
  ];

  it("đủ khóa, không rỗng, các ngôn ngữ khác en đều đã dịch", () => {
    for (const lang of UI_LANGUAGES) {
      for (const key of KEYS) {
        const s = translate(lang, key);
        expect(typeof s, `${lang} ${key}`).toBe("string");
        expect(s.trim(), `${lang} ${key}`).not.toBe("");
        if (lang !== "en") expect(s, `${lang} ${key}`).not.toBe(translate("en", key));
      }
    }
  });

  it("accountErrorKey trả đúng khóa của từ điển (kiểu MessageKey)", () => {
    const key: MessageKey = accountErrorKey("accountNetwork");
    expect(key).toBe("error.accountNetwork");
    expect(accountErrorKey("nope")).toBe("error.unknown");
  });

  it("lời giải thích không nói app \"chỉ nhận\" email (server còn giữ mã định danh Google)", () => {
    expect(translate("en", "account.gate.body")).not.toMatch(/\bonly\b/i);
    expect(translate("vi", "account.gate.body")).not.toContain("chỉ nhận");
  });

  it("Để sau ở năm ngôn ngữ: có nhãn và lời giải thích, đã dịch", () => {
    for (const lang of UI_LANGUAGES) {
      for (const key of ["onboarding.account.later", "onboarding.account.laterHint"] as MessageKey[]) {
        expect(translate(lang, key)?.trim(), `${lang} ${key}`).toBeTruthy();
        if (lang !== "en") expect(translate(lang, key), `${lang} ${key}`).not.toBe(translate("en", key));
      }
    }
  });

  it("nút đăng nhập nói rõ là Google ở mọi ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) expect(translate(lang, "account.gate.signIn"), lang).toContain("Google");
  });
});
