import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerVoice } from "../../lib/ipc";
import { NO_VOICES, mergeVoices } from "../../lib/speakers";
import { SpeakerMenu, type SpeakerMenuProps, composing, dismissal, mergeTargets, revealMenu } from "./SpeakerMenu";

const v = (id: number, label: string, patch: Partial<SpeakerVoice> = {}): SpeakerVoice => ({
  id,
  label,
  color: id - 1,
  source: "user",
  room: false,
  mergedInto: null,
  ...patch,
});

// Giọng 4 đã gộp tay vào giọng 1 (hiện như "Lan Nguyễn").
const voices = mergeVoices(NO_VOICES, [
  v(1, "Lan Nguyễn", { source: "name" }),
  v(2, "Minh Trần"),
  v(3, "Người 3", { source: "voice" }),
  v(4, "Lan Nguyễn", { mergedInto: 1, color: 0 }),
]);
const get = (id: number) => voices.get(id) as SpeakerVoice;

const props = (patch: Partial<SpeakerMenuProps> = {}): SpeakerMenuProps => ({
  lang: "vi",
  voice: get(3),
  voices,
  participants: [],
  onRename: () => {},
  onMerge: () => {},
  onClose: () => {},
  ...patch,
});

const html = (p: SpeakerMenuProps) => renderToStaticMarkup(createElement(SpeakerMenu, p));

// Spec 2026-10-26-phan-biet-nguoi-noi §8.2: ô "Đổi tên" (≤ 40 ký tự), "Chọn người trong cuộc họp" (danh sách người tham dự), "Gộp
// vào người khác ▸".
describe("SpeakerMenu", () => {
  it("đổi tên: tiêu đề có nhãn, ô tối đa 40 ký tự, trống khi đang là nhãn tự động; có tên thì điền sẵn", () => {
    const markup = html(props());
    expect(markup).toContain('aria-label="Đổi tên “\u2068Người 3\u2069”"');
    expect(markup).toMatch(/<input id="speaker-name" type="text"/);
    expect(markup).toMatch(/<input id="speaker-name"[^>]*maxlength="40"/i);
    expect(markup).toMatch(/<input id="speaker-name"[^>]*value=""/);
    expect(html(props({ voice: get(2) }))).toMatch(/<input id="speaker-name"[^>]*value="Minh Trần"/);
    expect(markup).toContain(">Lưu</button>");
  });

  it("người tham dự chỉ khi đọc được; tên đang dùng được đánh dấu", () => {
    expect(html(props())).not.toContain("Chọn người trong cuộc họp");
    const markup = html(props({ voice: get(1), participants: ["Lan Nguyễn", "Hoa Phạm"] }));
    expect(markup).toContain("Chọn người trong cuộc họp");
    expect(markup).toContain('<button type="button" class="menu-item" aria-current="true">Lan Nguyễn</button>');
    expect(markup).toContain('<button type="button" class="menu-item">Hoa Phạm</button>');
    // Rà soát B-N6: hai người tham dự cùng tên (kế hoạch 04 có thể trả "Guest" hai lần) vẫn vẽ đủ hai mục.
    const twice = html(props({ participants: ["Guest", "Guest"] }));
    expect(twice.split(">Guest</button>").length - 1).toBe(2);
  });

  it("gộp: chỉ liệt kê giọng khác chưa bị gộp; chỉ có một giọng thì không có mục gộp", () => {
    expect(mergeTargets(voices, get(3)).map((x) => x.id)).toEqual([1, 2]);
    expect(mergeTargets(voices, get(4)).map((x) => x.id)).toEqual([2, 3]);
    expect(html(props())).toContain("Gộp vào người khác ▸");
    const only = mergeVoices(NO_VOICES, [v(1, "Lan")]);
    expect(html(props({ voice: only.get(1) as SpeakerVoice, voices: only }))).not.toContain("Gộp vào người khác");
  });
});

// Cách menu đóng (rà soát B-Q1; rà soát lần 2: B-Q-mới 2 và trả focus). Mục tiêu bấm giả là chuỗi: "menu" và "chip" (nhãn của chính
// dòng này) ở trong, mọi chuỗi khác ở ngoài.
describe("dismissal", () => {
  const setup = () => {
    let closes = 0;
    const d = dismissal<string>(
      (target) => target === "menu" || target === "chip",
      () => {
        closes += 1;
      },
    );
    return { d, closes: () => closes };
  };
  // Phím thường (không qua bộ gõ).
  const key = (name: string) => ({ key: name, isComposing: false, keyCode: name === "Escape" ? 27 : 13 });

  it("bấm ra ngoài: đóng ở `click`, không đóng lúc nhấn (cú bấm tới đúng nút trước, menu gỡ sau)", () => {
    const { d, closes } = setup();
    d.down("other-chip");
    expect(closes()).toBe(0);
    d.click("other-chip", true);
    expect(closes()).toBe(1);
    expect(d.restoreFocus()).toBe(false);
  });

  it("bấm trong menu, bấm lại chính nhãn, kéo chọn chữ từ ô tên rồi thả ra ngoài: không đóng", () => {
    const { d, closes } = setup();
    d.down("menu");
    d.click("menu", true);
    d.down("chip");
    d.click("chip", true);
    d.down("menu");
    d.click("row", true);
    expect(closes()).toBe(0);
    d.down("other");
    d.click("other", true);
    expect(closes()).toBe(1);
  });

  it("nhấn trong menu rồi thả ngoài cửa sổ (không có `click`): cú bấm ra ngoài kế tiếp vẫn đóng menu", () => {
    const { d, closes } = setup();
    d.down("menu");
    // Bấm nút khác bằng bàn phím: `click` có `detail` 0, không có `mousedown` đi trước.
    d.click("other", false);
    expect(closes()).toBe(1);
    d.down("menu");
    // Cú nhấn chuột kế tiếp đặt lại cú nhấn còn treo.
    d.down("other");
    d.click("other", true);
    expect(closes()).toBe(2);
  });

  it("trả focus về nhãn chỉ khi đóng bằng Esc (focus trong menu), Lưu, chọn người hay gộp; đóng bằng chuột thì không", () => {
    const { d, closes } = setup();
    d.key(key("Enter"), true);
    expect(closes()).toBe(0);
    d.key(key("Escape"), false);
    expect([closes(), d.restoreFocus()]).toEqual([1, false]);
    d.key(key("Escape"), true);
    expect([closes(), d.restoreFocus()]).toEqual([2, true]);
    d.willClose();
    expect(d.restoreFocus()).toBe(true);
    // Lưu lỗi (menu còn mở) rồi người dùng bấm chỗ khác: không kéo focus về nhãn.
    d.down("other");
    expect(d.restoreFocus()).toBe(false);
    // Như trên, nhưng bấm nút khác bằng bàn phím (`click` không có `mousedown` đi trước).
    d.willClose();
    d.click("other", false);
    expect(d.restoreFocus()).toBe(false);
  });

  it("phím của bộ gõ đang ghép chữ (`isComposing`, hay `keyCode` 229 trên WebKit) không đóng menu, không gửi tên", () => {
    const { d, closes } = setup();
    d.key({ key: "Escape", isComposing: true, keyCode: 27 }, true);
    // WebKit (WKWebView của app trên macOS): phím kết thúc ghép chữ tới với `isComposing` false và `keyCode` 229.
    d.key({ key: "Escape", isComposing: false, keyCode: 229 }, true);
    expect(closes()).toBe(0);
    expect(composing({ key: "Enter", isComposing: false, keyCode: 229 })).toBe(true);
    expect(composing(key("Enter"))).toBe(false);
    d.key(key("Escape"), true);
    expect(closes()).toBe(1);
  });
});

// Nghiệm thu Task 21: ở cửa sổ 960x640 nhãn dòng thứ tư đã nằm trong khung nên `focus()` không cuộn, nửa dưới menu (cả mục Gộp) ra
// ngoài mép cửa sổ. Menu vừa mở thì cuộn vừa đủ để thấy trọn; màn hình `transcript-speakers-menu` của `check-i18n` đo bằng DOM thật.
describe("revealMenu", () => {
  it("cuộn vừa đủ (`nearest`): đã thấy trọn thì không cuộn, thiếu bao nhiêu cuộn bấy nhiêu, không canh giữa hay đầu khung", () => {
    const calls: (ScrollIntoViewOptions | undefined)[] = [];
    revealMenu({ scrollIntoView: (options) => void calls.push(options) });
    expect(calls).toEqual([{ block: "nearest" }]);
  });

  it("chưa gắn phần tử hay môi trường không có `scrollIntoView` (Node): không lỗi", () => {
    expect(() => revealMenu(null)).not.toThrow();
    expect(() => revealMenu(undefined)).not.toThrow();
    expect(() => revealMenu({})).not.toThrow();
  });
});
