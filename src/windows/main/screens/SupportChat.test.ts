import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import type { SupportView } from "../../../lib/ipc";
import { counterLabel, enterSends, SupportChat, type SupportChatProps } from "./SupportChat";

// Màn hình Hỗ trợ vẽ bằng `react-dom/server` trong Node (như UpgradeView.test.ts): lời chào, dòng phụ và chân khung đúng hợp đồng
// phía khách ở năm ngôn ngữ; ô "Gửi kèm thông tin máy" chỉ trước tin đầu tiên; trạng thái từng tin; thẻ email; chế độ tắt, đóng.

const view = (patch: Partial<SupportView> = {}): SupportView => ({
  enabled: true,
  closed: false,
  hasConversation: false,
  messages: [],
  unread: false,
  rev: 1,
  ...patch,
});

const LINE = "AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi";

const props = (patch: Partial<SupportChatProps> = {}): SupportChatProps => ({
  lang: "vi",
  view: view(),
  pending: [],
  withMachineInfo: true,
  machineInfo: LINE,
  emailCard: "hidden",
  emailError: null,
  error: null,
  deleting: false,
  loading: false,
  log: { status: "idle" },
  onSend: () => {},
  onRetry: () => {},
  onToggleMachineInfo: () => {},
  onSaveEmail: () => {},
  onDismissEmail: () => {},
  onDelete: () => {},
  onAttachLog: () => {},
  ...patch,
});

const html = (patch: Partial<SupportChatProps> = {}) => renderToStaticMarkup(createElement(SupportChat, props(patch)));

// Chữ của từ điển như trong HTML (React thoát các ký tự đặc biệt).
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const textIn = (lang: UiLanguage) => (key: MessageKey, params?: Params) => esc(translate(lang, key, params));
const text = textIn("vi");
// Chữ trong HTML, bỏ thẻ: để so cả câu có liên kết ở giữa.
const plain = (markup: string) => markup.replace(/<[^>]+>/g, "");

const withConversation = view({
  hasConversation: true,
  messages: [
    { id: 1, sender: "customer", text: "Phụ đề không hiện khi họp Teams", createdAt: 1 },
    { id: 2, sender: "owner", text: "Bạn đang dùng macOS bản nào?", createdAt: 2 },
  ],
});

describe("SupportChat: chữ của hợp đồng phía khách", () => {
  // Hợp đồng `2026-10-22-chat-ho-tro-00-tong-quan.md`, mục "Hợp đồng phía khách".
  const CONTRACT: Record<UiLanguage, { greeting: string; subtitle: string; foot: string }> = {
    vi: {
      greeting: "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English.",
      subtitle: "Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời",
      foot: "Tin nhắn được lưu 90 ngày · Quyền riêng tư",
    },
    en: {
      greeting: "Hi 👋 How can we help? You can write in English or Vietnamese.",
      subtitle: "A real person replies, not a bot · no guaranteed response time",
      foot: "Messages are kept for 90 days · Privacy",
    },
    ja: {
      greeting: "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。",
      subtitle: "ボットではなく人が返信します · 返信時間は保証していません",
      foot: "メッセージは 90 日間保存されます · プライバシー",
    },
    zh: {
      greeting: "你好 👋 有什么可以帮你？如果可以，请用英文书写。",
      subtitle: "由真人回复，不是机器人 · 不保证回复时间",
      foot: "消息保存 90 天 · 隐私",
    },
    ko: {
      greeting: "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요.",
      subtitle: "봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다",
      foot: "메시지는 90일간 보관됩니다 · 개인정보",
    },
  };

  it.each(Object.entries(CONTRACT) as [UiLanguage, (typeof CONTRACT)["vi"]][])("%s: lời chào, dòng phụ, chân khung", (lang, c) => {
    const markup = html({ lang });
    expect(plain(markup)).toContain(c.greeting);
    expect(plain(markup)).toContain(c.subtitle);
    const foot = markup.match(/<p class="hint support-foot">(.*?)<\/p>/)?.[1] ?? "";
    expect(plain(foot)).toBe(c.foot);
    expect(foot).toContain(`<button class="link" aria-expanded="false">${esc(translate(lang, "support.privacy"))}</button>`);
  });
});

describe("SupportChat: ô thông tin máy, tin nhắn", () => {
  it("chưa có cuộc chat: ô tích sẵn, dòng thông tin máy hiện nguyên văn, chưa có menu ⋯", () => {
    const markup = html();
    expect(markup).toContain('<input type="checkbox" aria-describedby="support-machine-hint" checked=""/>');
    expect(markup).toContain(text("support.machineInfo"));
    expect(markup).toContain(text("support.machineInfo.hint"));
    expect(markup).toContain(`<code class="support-machine-line">${esc(LINE)}</code>`);
    expect(markup).not.toContain(text("support.menu"));
  });

  it("bỏ tích thì không hiện dòng thông tin máy", () => {
    const markup = html({ withMachineInfo: false });
    expect(markup).toContain('<input type="checkbox" aria-describedby="support-machine-hint"/>');
    expect(markup).not.toContain("support-machine-line");
  });

  it("đã có cuộc chat: không còn ô tích; có menu ⋯; tin khách ghi Đã gửi, tin chủ dự án không có trạng thái", () => {
    const markup = html({ view: withConversation });
    expect(markup).not.toContain("support-machine");
    expect(markup).toContain(`aria-label="${text("support.menu")}"`);
    expect(markup).toContain(
      `<div class="msg customer"><span class="sr-only">${text("support.from.you")}: </span><p class="msg-text">Phụ đề không hiện khi họp Teams</p><span class="msg-status">${text("support.sent")}</span></div>`,
    );
    expect(markup).toContain(
      `<div class="msg owner"><span class="sr-only">${text("support.from.owner")}: </span><p class="msg-text">Bạn đang dùng macOS bản nào?</p></div>`,
    );
    expect(markup).toContain('role="log"');
    expect(markup).not.toContain('aria-busy="true"');
  });

  it("tin đang gửi và tin gửi lỗi: câu lỗi đúng mã và nút gửi lại", () => {
    const markup = html({
      view: withConversation,
      pending: [
        { localId: 1, text: "Còn đó không?", status: "sending", error: null },
        { localId: 2, text: "Alo", status: "failed", error: { code: "supportRateLimited", field: null } },
      ],
    });
    expect(markup).toContain(`<p class="msg-text">Còn đó không?</p><span class="msg-status">${text("support.sending")}</span>`);
    expect(markup).toContain('class="msg customer failed"');
    expect(markup).toContain(`<span class="msg-status error">${text("error.supportRateLimited")}</span>`);
    expect(markup).toContain(text("support.failed"));
  });

  it("ô trống thì nút Gửi bị khóa; có nút Đính kèm log", () => {
    const markup = html();
    expect(markup).toMatch(/<button type="submit" class="primary" disabled="">.*?<\/button>/);
    expect(markup).toContain(text("support.attachLog"));
    expect(markup).toContain(`placeholder="${text("support.placeholder")}"`);
  });

  it("Đính kèm log: đang gửi thì khóa nút; lỗi thì hiện câu lỗi của luồng Gửi log cho hỗ trợ", () => {
    expect(html({ log: { status: "sending" } })).toContain(text("support.attachLog.sending"));
    expect(html({ log: { status: "failed", code: "reportRateLimited" } })).toContain(text("error.reportRateLimited"));
  });

  it("lỗi lúc mở màn hình hiện ở ô báo lỗi", () => {
    expect(html({ error: { code: "supportOffline", field: null } })).toContain(
      `<p class="note error" role="alert">`,
    );
  });
});

describe("SupportChat: thẻ email, chế độ tắt và đóng", () => {
  it("thẻ email: hỏi (ô email, nút Lưu, nút đóng thẻ), đã lưu, email sai, ẩn", () => {
    const asking = html({ view: withConversation, emailCard: "asking" });
    expect(asking).toContain(`<label for="support-email">${text("support.email.prompt")}</label>`);
    expect(asking).toContain('type="email"');
    expect(asking).toContain(text("support.email.save"));
    expect(asking).toContain(`aria-label="${text("common.dismiss")}"`);
    expect(html({ view: withConversation, emailCard: "saved" })).toContain(text("support.email.saved"));
    const invalid = html({ view: withConversation, emailCard: "asking", emailError: { code: "supportInvalid", field: "email" } });
    expect(invalid).toContain(text("support.email.invalid"));
    expect(invalid).toContain('aria-invalid="true"');
    expect(html({ view: withConversation })).not.toContain("support-email");
  });

  it("chat tắt: ô nhập thành dòng email support@, lịch sử vẫn hiện, không có thẻ email", () => {
    const markup = html({ view: { ...withConversation, enabled: false }, emailCard: "asking" });
    expect(markup).not.toContain("<textarea");
    expect(markup).toContain(text("error.supportDisabled"));
    expect(markup).toContain("support@aitranslator.vn");
    expect(markup).toContain("Phụ đề không hiện khi họp Teams");
    expect(markup).not.toContain("support-email");
  });

  it("cuộc chat bị chặn: dòng cuộc trò chuyện đã đóng thay ô nhập", () => {
    const markup = html({ view: { ...withConversation, closed: true } });
    expect(markup).not.toContain("<textarea");
    expect(markup).toContain(text("error.supportClosed"));
  });
});

describe("SupportChat: bàn phím và trình đọc màn hình", () => {
  const key = (patch: Partial<Parameters<typeof enterSends>[0]> = {}) => ({
    key: "Enter",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    keyCode: 13,
    ...patch,
  });

  it("chỉ Enter trơn mới gửi: bộ gõ đang soạn (isComposing hay keyCode 229 của WKWebView) và phím bổ trợ thì không", () => {
    expect(enterSends(key())).toBe(true);
    expect(enterSends(key({ isComposing: true }))).toBe(false);
    expect(enterSends(key({ keyCode: 229 }))).toBe(false);
    expect(enterSends(key({ shiftKey: true }))).toBe(false);
    expect(enterSends(key({ metaKey: true }))).toBe(false);
    expect(enterSends(key({ ctrlKey: true }))).toBe(false);
    expect(enterSends(key({ altKey: true }))).toBe(false);
    expect(enterSends(key({ key: "a", keyCode: 65 }))).toBe(false);
  });

  it("bộ đếm ký tự: hai số cùng cách định dạng theo ngôn ngữ giao diện", () => {
    expect(counterLabel("en", 1234)).toBe("1,234/1,000 characters");
    expect(counterLabel("vi", 1234)).toBe("1.234/1.000 ký tự");
    expect(counterLabel("en", 950)).toBe("950/1,000 characters");
  });

  it("danh sách tin là role=log, aria-busy lúc tải lần đầu", () => {
    expect(html({ loading: true })).toContain('role="log" aria-busy="true"');
    expect(html({ loading: false })).not.toContain("aria-busy");
  });

  it("menu ⋯ không khai role=menu (không có phím mũi tên và Esc)", () => {
    expect(html({ view: withConversation })).not.toMatch(/role="menu/);
  });

  it("vùng hỏi lại trước khi xóa luôn có trong trang với role=status", () => {
    expect(html({ view: withConversation })).toContain('role="status"');
  });

  it("lỗi Đính kèm log và lỗi email có role=alert", () => {
    expect(html({ log: { status: "failed", code: "reportRateLimited" } })).toContain('<p class="note error" role="alert">');
    const invalid = html({ view: withConversation, emailCard: "asking", emailError: { code: "supportInvalid", field: "email" } });
    expect(invalid).toContain('<p class="note error" role="alert">');
  });
});
