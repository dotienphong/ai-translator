import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerVoice } from "../../lib/ipc";
import { NO_VOICES, mergeVoices } from "../../lib/speakers";
import {
  MENU_GAP,
  MENU_MARGIN,
  type MenuRoom,
  SpeakerMenu,
  type SpeakerMenuProps,
  composing,
  dismissal,
  firstClick,
  menuPlacement,
  menuScroll,
  mergeTargets,
  revealMenu,
} from "./SpeakerMenu";

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
// ngoài mép cửa sổ. Từ khi menu đặt theo chỗ trống (`menuPlacement`), `revealMenu` chỉ còn là dự phòng: cuộn khung bằng `scrollTop`
// mà khung không nhúc nhích. Màn hình `transcript-speakers-menu*` của `check-i18n` đo bằng DOM thật.
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

// Thử app dev thật (03b Task 23, ảnh `m9d-*`): ở WKWebView menu của nhãn gần đáy luôn mở xuống; bấm "Gộp vào người khác ▸" thì danh
// sách người nằm hết dưới mép khung. Menu đặt theo chỗ trống (QĐ 20): đủ chỗ dưới thì mở xuống, thiếu dưới mà đủ trên thì lật lên,
// thiếu cả hai thì mở xuống rồi cuộn đúng khung cuộn (không dựa vào `scrollIntoView`). Số đo lấy từ trang xem trước (Chrome không đầu,
// 960x640 và 720x480; menu có bốn người tham dự cao 281 px).
describe("menuPlacement, menuScroll", () => {
  const room = (patch: Partial<MenuRoom>): MenuRoom => ({
    menuHeight: 281,
    labelTop: 205,
    labelBottom: 228,
    viewTop: 0,
    viewBottom: 640,
    ...patch,
  });
  // Chỗ menu cần ngoài chiều cao của nó: khoảng hở với nhãn và lề tới mép khung.
  const extra = MENU_GAP + MENU_MARGIN;

  it("đủ chỗ dưới nhãn: mở xuống, không cuộn", () => {
    const r = room({});
    expect(menuPlacement(r)).toBe("down");
    expect(menuScroll(r, "down")).toBe(0);
    // Vừa khít (đáy menu cộng lề đúng bằng mép dưới khung) vẫn là đủ.
    const exact = room({ viewBottom: 228 + 281 + extra });
    expect(menuPlacement(exact)).toBe("down");
    expect(menuScroll(exact, "down")).toBe(0);
  });

  it("thiếu chỗ dưới, đủ chỗ trên (nhãn dòng gần đáy, dòng cuối): lật lên, không cuộn", () => {
    for (const r of [room({ labelTop: 451, labelBottom: 474 }), room({ labelTop: 545, labelBottom: 568 })]) {
      expect(menuPlacement(r)).toBe("up");
      expect(menuScroll(r, "up")).toBe(0);
    }
    // Ảnh m9d: khung cuộn bắt đầu dưới thanh tiêu đề (32 px, cao 602 px), nhãn ở y≈588 của khung, đáy nhãn lấn mép dưới.
    expect(menuPlacement(room({ menuHeight: 120, labelTop: 620, labelBottom: 643, viewTop: 32, viewBottom: 634 }))).toBe("up");
    // Vừa khít phía trên vẫn là đủ.
    expect(menuPlacement(room({ labelTop: 281 + extra, labelBottom: 281 + extra + 23, viewBottom: 400 }))).toBe("up");
  });

  it("thiếu cả hai phía (cửa sổ nhỏ 720x480): mở xuống, cuộn vừa đủ thấy cả menu kèm lề", () => {
    const r = room({ viewBottom: 480 });
    expect(menuPlacement(r)).toBe("down");
    expect(menuScroll(r, "down")).toBe(228 + 281 + extra - 480);
  });

  it("cửa sổ nhỏ, nhãn gần đáy 720x480: vẫn lật lên được thì lật lên", () => {
    const r = room({ labelTop: 451, labelBottom: 474, viewBottom: 480 });
    expect(menuPlacement(r)).toBe("up");
    expect(menuScroll(r, "up")).toBe(0);
  });

  it("menu cao hơn khung: cuộn tới khi nhãn sát mép trên (còn lề), không đẩy nhãn ra khỏi khung", () => {
    const r = room({ menuHeight: 600, labelTop: 300, labelBottom: 323, viewBottom: 480 });
    expect(menuPlacement(r)).toBe("down");
    expect(menuScroll(r, "down")).toBe(300 - MENU_MARGIN);
  });

  it("nhãn nằm dưới mép khung (chưa cuộn tới): không lật lên ra ngoài khung, mở xuống rồi cuộn tới", () => {
    const r = room({ labelTop: 545, labelBottom: 568, viewBottom: 480 });
    expect(menuPlacement(r)).toBe("down");
    expect(menuScroll(r, "down")).toBe(568 + 281 + extra - 480);
  });

  it("menu đổi chiều cao khi đang mở (bung danh sách gộp): mở xuống thì giữ, mở lên thì giữ khi còn đủ chỗ trên", () => {
    // Đang mở xuống, bung ra thì thiếu chỗ dưới dù trên đủ: không nhảy lên trên nhãn, cuộn thêm.
    const grown = room({ menuHeight: 345, labelTop: 400, labelBottom: 423, viewBottom: 640 });
    expect(menuPlacement(grown)).toBe("up");
    expect(menuPlacement(grown, "down")).toBe("down");
    expect(menuScroll(grown, "down")).toBe(423 + 345 + extra - 640);
    // Đang mở lên, còn đủ chỗ trên: giữ.
    expect(menuPlacement(room({ menuHeight: 345, labelTop: 545, labelBottom: 568 }), "up")).toBe("up");
    // Đang mở lên, bung ra thì tràn mép trên: mở xuống (cuộn được, phần menu dưới nhãn kéo dài vùng cuộn).
    expect(menuPlacement(room({ menuHeight: 345, labelTop: 300, labelBottom: 323 }), "up")).toBe("down");
  });
});

// Cú bấm thứ hai của một cú bấm đúp không gộp: bung danh sách gộp ở menu mở lên (hay cuộn khung để thấy danh sách) dời mục "Gộp vào
// người khác ▸" khỏi con trỏ, cú bấm thứ hai rơi vào một người, mà gộp không tách lại được (QĐ 20).
describe("firstClick", () => {
  it("chuột bấm một lần hay phím (detail 0): nhận; cú bấm thứ hai, thứ ba liền nhau: bỏ", () => {
    expect(firstClick(0)).toBe(true);
    expect(firstClick(1)).toBe(true);
    expect(firstClick(2)).toBe(false);
    expect(firstClick(3)).toBe(false);
  });
});
