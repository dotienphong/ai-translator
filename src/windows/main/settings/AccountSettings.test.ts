import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, translate, UI_LANGUAGES, type UiLanguage } from "../../../i18n";
import type { AccountView } from "../../../lib/ipc";
import {
  type AccountSettingsViewProps,
  AccountSettingsView,
  settingsErrorKey,
} from "./AccountSettings";

// Cài đặt › Tài khoản (spec 2026-11-05-dang-nhap-google §6.3, §5.5): email, Đăng xuất, Xóa tài khoản có xác nhận. Vẽ bằng
// `react-dom/server` trong Node; bấm thử bằng cách gọi lại hàm view truyền cho phần tử. Luồng thật (gọi lệnh) test ở
// store/accountSettings.test.ts.


// Đọc file bằng `node:fs` nạp động (dự án không cài kiểu của Node), như overlay.css.test.ts.
type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
const readSource = async (url: URL) => ((await import("node:fs" as string)) as Fs).readFileSync(url, "utf8");

const signedIn = (): AccountView => ({ state: "signedIn", email: "an.nguyen@example.com", gate: false });
const anonymous = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: false, ...patch });

const props = (patch: Partial<AccountSettingsViewProps> = {}): AccountSettingsViewProps => ({
  lang: "vi",
  view: signedIn(),
  error: null,
  action: null,
  busy: false,
  sessionActive: false,
  confirming: false,
  link: null,
  onSignOut: () => {},
  onAskDelete: () => {},
  onCancelDelete: () => {},
  onConfirmDelete: () => {},
  onCancelSignIn: () => {},
  ...patch,
});

const html = (patch: Partial<AccountSettingsViewProps> = {}) =>
  renderToStaticMarkup(createElement(AccountSettingsView, props(patch)));
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
// Chữ của một phần tử (gộp các chuỗi con; bỏ qua biểu tượng).
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}
const tree = (patch: Partial<AccountSettingsViewProps> = {}) => elements(AccountSettingsView(props(patch)));
const button = (patch: Partial<AccountSettingsViewProps>, label: string) =>
  tree(patch).find((e) => e.type === "button" && textOf(e.props.children as ReactNode) === label);
const vi = (key: MessageKey) => translate("vi", key);

describe("AccountSettingsView: đã đăng nhập", () => {
  it("hiện email, nút Đăng xuất và nút Xóa tài khoản", () => {
    const markup = html();
    expect(markup).toContain("an.nguyen@example.com");
    expect(button({}, vi("account.settings.signOut"))).toBeDefined();
    expect(button({}, vi("account.settings.delete"))).toBeDefined();
    expect(markup).not.toContain(text("vi", "account.settings.notSignedIn"));
  });

  it("Đăng xuất gọi onSignOut ngay (không cần xác nhận)", () => {
    let calls = 0;
    (button({ onSignOut: () => (calls += 1) }, vi("account.settings.signOut"))?.props.onClick as () => void)();
    expect(calls).toBe(1);
  });

  it("Xóa tài khoản chỉ mở bước xác nhận (onAskDelete), chưa xóa; chưa có hộp xác nhận", () => {
    const calls: string[] = [];
    const p = { onAskDelete: () => calls.push("ask"), onConfirmDelete: () => calls.push("confirm") };
    (button(p, vi("account.settings.delete"))?.props.onClick as () => void)();
    expect(calls).toEqual(["ask"]);
    expect(html()).not.toContain(text("vi", "account.settings.delete.ask"));
  });

  it("bước xác nhận: câu hỏi, nút Xóa (danger) gọi onConfirmDelete, nút Hủy gọi onCancelDelete; nút Xóa mở đầu biến mất", () => {
    const calls: string[] = [];
    const p = {
      confirming: true,
      onConfirmDelete: () => calls.push("confirm"),
      onCancelDelete: () => calls.push("cancel"),
      onAskDelete: () => calls.push("ask"),
    };
    expect(html(p)).toContain(text("vi", "account.settings.delete.ask"));
    const confirm = tree(p).find((e) => e.type === "button" && e.props.className === "danger");
    expect(textOf(confirm?.props.children as ReactNode)).toBe(vi("account.settings.delete.confirm"));
    (confirm?.props.onClick as () => void)();
    (button(p, vi("common.cancel"))?.props.onClick as () => void)();
    expect(calls).toEqual(["confirm", "cancel"]);
    // Trong lúc hỏi, nút mở đầu không còn (cùng kiểu DeleteModelsAndData).
    expect(tree(p).filter((e) => e.type === "button" && e.props.onClick === p.onAskDelete)).toHaveLength(0);
  });

  it("lời xóa nói đúng xóa gì và giữ gì (spec §5.5, server/src/account.ts), vi và en", () => {
    const hintVi = vi("account.settings.delete.hint");
    // Chỉ email trong bản ghi tài khoản bị xóa; máy chủ giữ mã định danh và các mốc thời gian (không kèm email).
    for (const word of ["chỉ xóa email", "mã định danh", "ngày tạo", "đăng nhập gần nhất", "đồng ý", "ngôn ngữ", "mốc dùng thử", "thời điểm xóa", "license"]) {
      expect(hintVi, word).toContain(word);
    }
    const hintEn = translate("en", "account.settings.delete.hint");
    for (const word of ["only your Google email", "identifier", "creation date", "last sign-in", "consent", "language", "trial dates", "time of deletion", "license"]) {
      expect(hintEn, word).toContain(word);
    }
    // Email dùng để mua gói nằm ở license và đơn hàng, xóa qua Hỗ trợ.
    const licenseVi = vi("account.settings.delete.hint.license");
    for (const word of ["License key", "Email", "mua gói", "đơn hàng", "Hỗ trợ"]) expect(licenseVi, word).toContain(word);
    const licenseEn = translate("en", "account.settings.delete.hint.license");
    for (const word of ["license key", "email", "buy", "order", "Support"]) expect(licenseEn, word).toContain(word);
    const askVi = vi("account.settings.delete.ask");
    expect(askVi).toContain("gói trả phí vẫn dùng bình thường");
    expect(askVi).toContain("đăng nhập lại");
    // Không hứa "xóa sạch" hay "không thể khôi phục": máy chủ còn giữ dữ liệu bí danh và email mua gói.
    for (const s of [hintVi, licenseVi, askVi, hintEn, licenseEn, translate("en", "account.settings.delete.ask")]) {
      expect(s).not.toMatch(/xóa (toàn bộ|sạch|hết)|vĩnh viễn|all (your )?data|permanently|completely|everything/i);
    }
    // Cả hai câu giải thích nằm trên màn hình.
    expect(html()).toContain(text("vi", "account.settings.delete.hint"));
    expect(html()).toContain(text("vi", "account.settings.delete.hint.license"));
  });

  it("đang dịch: Đăng xuất vẫn bấm được (không gọi mạng); Xóa tài khoản bị khóa và có câu giải thích", () => {
    expect(button({ sessionActive: true }, vi("account.settings.signOut"))?.props.disabled).toBe(false);
    expect(button({ sessionActive: true }, vi("account.settings.delete"))?.props.disabled).toBe(true);
    expect(html({ sessionActive: true })).toContain(text("vi", "account.settings.translating"));
    expect(html()).not.toContain(text("vi", "account.settings.translating"));
  });

  it("đang dịch mà đang mở hộp xác nhận: nút Xóa trong hộp bị khóa", () => {
    const confirm = tree({ confirming: true, sessionActive: true }).find((e) => e.type === "button" && e.props.className === "danger");
    expect(confirm?.props.disabled).toBe(true);
  });

  it("đang bận (busy): cả Đăng xuất lẫn Xóa đều bị khóa, tránh bấm đôi", () => {
    expect(button({ busy: true }, vi("account.settings.signOut"))?.props.disabled).toBe(true);
    expect(button({ busy: true }, vi("account.settings.delete"))?.props.disabled).toBe(true);
    const confirm = tree({ confirming: true, busy: true }).find((e) => e.type === "button" && e.props.className === "danger");
    expect(confirm?.props.disabled).toBe(true);
  });
});

describe("AccountSettingsView: lỗi", () => {
  it("xóa lỗi: vẫn hiện email và các nút (vẫn đăng nhập), câu lỗi riêng của việc xóa, có role=alert", () => {
    const markup = html({ action: "delete", error: { code: "accountFailed", field: null } });
    expect(markup).toContain("an.nguyen@example.com");
    expect(markup).toContain(text("vi", "account.settings.error.deleteFailed"));
    expect(markup).toContain('role="alert"');
    expect(button({}, vi("account.settings.delete"))).toBeDefined();
    // Không dùng câu "Đăng nhập không thành" của luồng đăng nhập cho việc xóa.
    expect(markup).not.toContain(text("vi", "error.accountFailed"));
  });

  it("đăng xuất lỗi: câu riêng của việc đăng xuất", () => {
    const markup = html({ action: "signOut", error: { code: "accountFailed", field: null } });
    expect(markup).toContain(text("vi", "account.settings.error.signOutFailed"));
  });

  it("lỗi không phải do thao tác của màn này (action null) thì không hiện; người dùng tự hủy cũng không", () => {
    expect(html({ action: null, error: { code: "accountNetwork", field: null } })).not.toContain('role="alert"');
    expect(html({ action: "delete", error: { code: "accountCancelled", field: null } })).not.toContain('role="alert"');
  });

  it("bảng chọn câu lỗi theo thao tác và mã", () => {
    expect(settingsErrorKey("delete", "accountNetwork")).toBe("error.accountNetwork");
    expect(settingsErrorKey("signOut", "accountNetwork")).toBe("error.accountNetwork");
    // Dịch vụ tài khoản tạm ngừng: câu riêng của thao tác ("Chưa xóa được tài khoản. Bạn vẫn đang đăng nhập."), không phải "Đăng nhập đang tạm ngừng".
    expect(settingsErrorKey("delete", "accountUnavailable")).toBe("account.settings.error.deleteFailed");
    expect(settingsErrorKey("signOut", "accountUnavailable")).toBe("account.settings.error.signOutFailed");
    expect(settingsErrorKey("delete", "accountBusy")).toBe("account.settings.error.busy");
    expect(settingsErrorKey("signOut", "accountBusy")).toBe("account.settings.error.busy");
    expect(settingsErrorKey("delete", "accountStorage")).toBe("account.settings.error.deleteStorage");
    expect(settingsErrorKey("signOut", "accountStorage")).toBe("account.settings.error.signOutStorage");
    expect(settingsErrorKey("delete", "accountFailed")).toBe("account.settings.error.deleteFailed");
    expect(settingsErrorKey("delete", "weird")).toBe("account.settings.error.deleteFailed");
    expect(settingsErrorKey("signOut", "accountDenied")).toBe("account.settings.error.signOutFailed");
  });
});

describe("AccountSettingsView: chưa đăng nhập, chưa biết, đang chờ", () => {
  it("chưa đăng nhập: một dòng báo, không có email, không có Đăng xuất hay Xóa tài khoản", () => {
    const markup = html({ view: anonymous() });
    expect(markup).toContain(text("vi", "account.settings.notSignedIn"));
    expect(button({ view: anonymous() }, vi("account.settings.signOut"))).toBeUndefined();
    expect(button({ view: anonymous() }, vi("account.settings.delete"))).toBeUndefined();
    expect(markup).not.toContain(text("vi", "account.settings.delete.hint"));
  });

  it("chưa đăng nhập, máy gói trả phí: hiện khối liên kết được truyền vào; không có thì thôi", () => {
    const link = createElement("div", { id: "link-slot" }, "x");
    expect(html({ view: anonymous(), link })).toContain('id="link-slot"');
    expect(html({ view: anonymous(), link: null })).not.toContain("link-slot");
  });

  it("view null (chưa biết, hay dịch vụ tài khoản không dùng được): câu nhẹ nhàng, không nút, không ném lỗi", () => {
    const markup = html({ view: null });
    expect(markup).toContain(text("vi", "account.settings.unknown"));
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain('role="alert"');
  });

  it("view null kèm lỗi accountUnavailable: thêm câu tạm ngừng, vẫn không nút", () => {
    const markup = html({ view: null, error: { code: "accountUnavailable", field: null } });
    expect(markup).toContain(text("vi", "account.settings.unknown"));
    expect(markup).toContain(text("vi", "error.accountUnavailable"));
    expect(markup).not.toContain("<button");
  });

  it("đang chờ đăng nhập (signingIn): câu chờ và nút Hủy gọi onCancelSignIn, không có Xóa tài khoản", () => {
    let cancelled = 0;
    const p = { view: anonymous({ state: "signingIn" }), onCancelSignIn: () => (cancelled += 1) };
    expect(html(p)).toContain(text("vi", "account.gate.waiting"));
    (button(p, vi("account.gate.cancel"))?.props.onClick as () => void)();
    expect(cancelled).toBe(1);
    expect(button(p, vi("account.settings.delete"))).toBeUndefined();
  });
});

describe("nhóm Tài khoản trong Cài đặt", () => {
  it("SettingsScreen có nhóm account, đặt AccountSettings trong SafeBoundary", async () => {
    const source = await readSource(new URL("../screens/SettingsScreen.tsx", import.meta.url));
    expect(source).toContain('"account"');
    expect(source).toMatch(/<SafeBoundary[^>]*>\s*<AccountSettings\s*\/>\s*<\/SafeBoundary>/);
  });
});

describe("chữ của Cài đặt › Tài khoản ở năm ngôn ngữ", () => {
  const KEYS: MessageKey[] = [
    "settings.group.account",
    "account.settings.email",
    "account.settings.signOut",
    "account.settings.signOut.hint",
    "account.settings.notSignedIn",
    "account.settings.unknown",
    "account.settings.delete",
    "account.settings.delete.hint",
    "account.settings.delete.hint.license",
    "account.settings.delete.ask",
    "account.settings.delete.confirm",
    "account.settings.translating",
    "account.settings.error.busy",
    "account.settings.error.deleteFailed",
    "account.settings.error.deleteStorage",
    "account.settings.error.signOutFailed",
    "account.settings.error.signOutStorage",
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

  it("câu xóa tài khoản ở mọi ngôn ngữ nhắc tới email, và câu về email mua gói nhắc tới Hỗ trợ", () => {
    for (const lang of UI_LANGUAGES) {
      expect(translate(lang, "account.settings.delete.hint").toLowerCase(), lang).toMatch(/email|メール|邮箱|이메일/);
      expect(translate(lang, "account.settings.delete.hint.license").toLowerCase(), lang).toMatch(/email|メール|邮箱|이메일/);
      expect(translate(lang, "account.settings.delete.hint.license"), lang).toMatch(/Hỗ trợ|Support|サポート|客服|지원/);
    }
  });
});
