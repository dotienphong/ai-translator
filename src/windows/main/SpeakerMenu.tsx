import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../i18n";
import type { SpeakerVoice } from "../../lib/ipc";
import { MAX_SPEAKER_NAME, type VoiceMap, isolateName, speakerColor } from "../../lib/speakers";

export interface SpeakerMenuProps {
  lang: UiLanguage;
  // Giọng của nhãn vừa bấm.
  voice: SpeakerVoice;
  voices: VoiceMap;
  // Tên người tham dự đọc được (kế hoạch 04); rỗng thì không có mục "Chọn người trong cuộc họp".
  participants: readonly string[];
  onRename(name: string): void;
  onMerge(into: number): void;
  onClose(): void;
}

// Giọng gộp được vào: giọng chưa bị gộp vào giọng khác, khác giọng đang mở (tính theo giọng nó đang hiện như).
export function mergeTargets(voices: VoiceMap, voice: SpeakerVoice): SpeakerVoice[] {
  const self = voice.mergedInto ?? voice.id;
  return [...voices.values()].filter((v) => v.mergedInto === null && v.id !== self);
}

// Cách menu đóng, tách khỏi component để test trong Node (không DOM). `inside(target)`: mục tiêu bấm nằm trong menu hay trên nhãn
// của chính dòng này.
// - Bấm ra ngoài đóng menu ở `click`, không ở `mousedown` (rà soát lần 2, B-Q-mới 2): menu của dòng gần cuối kéo dài vùng cuộn; đóng
//   lúc nhấn làm vùng cuộn co lại, nội dung dịch đi dưới con trỏ trước lúc thả, và cú bấm rơi vào chỗ khác. Đóng ở `click` thì cú bấm
//   tới đúng nút (nhãn dòng khác, nút Xuất…) trước, menu gỡ sau.
// - Cú nhấn bắt đầu trong menu (kéo chọn chữ trong ô tên rồi thả ra ngoài) không đóng menu. Mỗi `mousedown` ghi lại cú nhấn mới, nên
//   cú nhấn trong menu mà thả ngoài cửa sổ (không có `click`) không treo tới cú bấm chuột sau; `click` từ bàn phím (`detail` 0, không
//   có `mousedown` đi trước) không dùng cú nhấn cũ (rà soát lần 3).
// - Phím của bộ gõ đang ghép chữ (Nhật, Trung, Hàn) không đóng menu: `isComposing`, hay `keyCode` 229 (WebKit gửi phím kết thúc ghép
//   chữ với `isComposing` false), xem `composing`.
// - Bấm lại chính nhãn: bỏ qua; `onClick` của nhãn đóng menu (`openMenu` bấm lại để đóng). Đóng ở đây thì `onClick` đó mở lại menu
//   với ô tên bị đặt lại (rà soát B-Q1).
// - Chỉ trả focus về nhãn khi đóng bằng Esc lúc focus ở trong menu, hay bằng Lưu, chọn người, gộp (`willClose`, rà soát B-N7). Đóng
//   bằng chuột (kể cả bấm lại nhãn) thì để focus ở nơi trình duyệt đặt (rà soát lần 2).
// Phần của `KeyboardEvent` mà menu cần.
export interface KeyInput {
  key: string;
  isComposing: boolean;
  keyCode: number;
}

// Phím đang thuộc bộ gõ ghép chữ (rà soát lần 3): không đóng menu, không gửi tên.
export function composing(e: KeyInput): boolean {
  return e.isComposing || e.keyCode === 229;
}

export interface Dismissal<T> {
  down(target: T): void;
  // `pointer`: cú bấm đến từ chuột hay chạm (`MouseEvent.detail > 0`).
  click(target: T, pointer: boolean): void;
  key(e: KeyInput, focusInside: boolean): void;
  willClose(): void;
  restoreFocus(): boolean;
}

export function dismissal<T>(inside: (target: T) => boolean, onClose: () => void): Dismissal<T> {
  let pressedInside = false;
  let restore = false;
  return {
    down(target) {
      restore = false;
      pressedInside = inside(target);
    },
    click(target, pointer) {
      const fromInside = pointer && pressedInside;
      pressedInside = false;
      if (fromInside || inside(target)) return;
      restore = false;
      onClose();
    },
    key(e, focusInside) {
      if (e.key !== "Escape" || composing(e)) return;
      restore = focusInside;
      onClose();
    },
    willClose() {
      restore = true;
    },
    restoreFocus() {
      return restore;
    },
  };
}

// Dự phòng của `placeMenu`: cuộn khung bằng `scrollTop` mà khung không nhúc nhích thì nhờ trình duyệt cuộn menu vào khung.
// `block: "nearest"`: menu đã thấy trọn thì không cuộn, thiếu bao nhiêu cuộn bấy nhiêu (không canh giữa hay đầu khung làm nội dung
// nhảy). Không dùng làm đường chính: ở WKWebView thật (03b Task 23, ảnh `m9d-*`) menu của nhãn gần đáy vẫn nằm sát hay dưới mép
// khung. `?.`: môi trường không có DOM (test Node) không có `scrollIntoView`.
export function revealMenu(el: { scrollIntoView?(options?: ScrollIntoViewOptions): void } | null | undefined): void {
  el?.scrollIntoView?.({ block: "nearest" });
}

// Hướng mở của menu so với nhãn (QĐ 20): "down" dưới nhãn (CSS `.speaker-menu`), "up" trên nhãn (`.speaker-menu.up`).
export type MenuPlacement = "down" | "up";

// Số đo để đặt menu, px, cùng hệ tọa độ của `getBoundingClientRect()`: chiều cao menu, mép trên và dưới của nhãn, phần đang thấy
// của khung cuộn (giao với cửa sổ).
export interface MenuRoom {
  menuHeight: number;
  labelTop: number;
  labelBottom: number;
  viewTop: number;
  viewBottom: number;
}

// Khoảng hở giữa nhãn và menu (CSS: mở xuống `top: 2.6rem`, mở lên `bottom: calc(100% - 0.5rem)`, chừng 3–4 px ở cỡ chữ 14 px).
export const MENU_GAP = 4;
// Lề tới mép khung, để thấy cả viền và bóng của menu (menu sát mép trông như bị cắt, ảnh m9d).
export const MENU_MARGIN = 8;

const fitsDown = (r: MenuRoom) =>
  r.labelBottom + MENU_GAP >= r.viewTop && r.labelBottom + MENU_GAP + r.menuHeight + MENU_MARGIN <= r.viewBottom;
// Mép dưới của menu (ngay trên nhãn) cũng phải trong khung: nhãn nằm dưới mép khung (chưa cuộn tới) thì menu lật lên vẫn ngoài khung.
const fitsUp = (r: MenuRoom) =>
  r.labelTop - MENU_GAP <= r.viewBottom && r.labelTop - MENU_GAP - r.menuHeight - MENU_MARGIN >= r.viewTop;

// Chọn hướng mở theo chỗ trống (thử app dev thật, 03b Task 23): đủ chỗ dưới nhãn thì mở xuống; thiếu dưới mà đủ trên thì lật lên;
// thiếu cả hai thì mở xuống (phần menu dưới nhãn kéo dài vùng cuộn nên cuộn tới được, `menuScroll`). `current`: hướng đang mở khi
// menu đổi chiều cao (bung danh sách gộp): mở xuống thì giữ (cuộn thêm, không nhảy lên trên nhãn); mở lên thì giữ khi còn đủ chỗ
// trên, không thì mở xuống (phần tràn mép trên của khung không cuộn tới được).
export function menuPlacement(room: MenuRoom, current?: MenuPlacement): MenuPlacement {
  if (current === "down") return "down";
  if (current === "up") return fitsUp(room) ? "up" : "down";
  if (fitsDown(room)) return "down";
  return fitsUp(room) ? "up" : "down";
}

// Số px cần cuộn khung xuống để thấy trọn menu kèm lề ở hướng `placement`, nhưng không đẩy nhãn khỏi mép trên (menu cao hơn khung
// thì nhãn dừng ở mép trên, còn lề). Mở lên thì 0: `menuPlacement` chỉ chọn mở lên khi đủ chỗ.
export function menuScroll(room: MenuRoom, placement: MenuPlacement): number {
  if (placement === "up") return 0;
  const over = room.labelBottom + MENU_GAP + room.menuHeight + MENU_MARGIN - room.viewBottom;
  return Math.max(0, Math.min(over, room.labelTop - MENU_MARGIN - room.viewTop));
}

// Cú bấm được nhận ở mục gộp (`MouseEvent.detail`): bấm chuột một lần (1) hay phím (0). Cú bấm thứ hai, thứ ba của một cú bấm đúp
// thì bỏ: bung danh sách gộp ở menu mở lên (danh sách đẩy mục "Gộp vào người khác ▸" lên trên) hay cuộn khung để thấy danh sách làm
// mục đó rời khỏi con trỏ, cú bấm thứ hai rơi vào một người, mà gộp không tách lại được (QĐ 20).
export function firstClick(detail: number): boolean {
  return detail <= 1;
}

// Khung cuộn thật của menu: phần tử tổ tiên gần nhất có `overflow-y` cuộn được (cửa sổ chính: `main.content`), không có thì cả tài
// liệu.
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/^(auto|scroll|overlay)$/.test(getComputedStyle(p).overflowY)) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

// Đo menu, nhãn và phần đang thấy của khung cuộn (vùng trong của khung, giao với cửa sổ).
function measureRoom(menu: HTMLElement, chip: HTMLElement, scroller: HTMLElement): MenuRoom {
  const label = chip.getBoundingClientRect();
  const whole = scroller === document.scrollingElement || scroller === document.documentElement;
  const top = whole ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
  const bottom = whole ? window.innerHeight : top + scroller.clientHeight;
  return {
    menuHeight: menu.getBoundingClientRect().height,
    labelTop: label.top,
    labelBottom: label.bottom,
    viewTop: Math.max(0, top),
    viewBottom: Math.min(window.innerHeight, bottom),
  };
}

// Đặt menu theo chỗ trống (QĐ 20), không dựa vào `scrollIntoView`: đo ngay sau khi vẽ (trước khi trình duyệt hiện), chọn hướng
// (`menuPlacement`), gắn lớp `up` ngay để phép cuộn tính trên vị trí mới, rồi cuộn đúng khung cuộn bằng `scrollTop` khi cần
// (`menuScroll`). Cuộn mà khung không nhúc nhích thì dự phòng bằng `revealMenu`. Trả về hướng đã chọn.
function placeMenu(menu: HTMLElement, chip: HTMLElement, current: MenuPlacement | undefined): MenuPlacement {
  const scroller = scrollParent(menu);
  const room = measureRoom(menu, chip, scroller);
  const placement = menuPlacement(room, current);
  menu.classList.toggle("up", placement === "up");
  const delta = menuScroll(room, placement);
  if (delta > 0) {
    const before = scroller.scrollTop;
    scroller.scrollTop = before + delta;
    if (scroller.scrollTop === before) revealMenu(menu);
  }
  return placement;
}

// Menu của nhãn người nói trong bản chép lời (spec 2026-10-26-phan-biet-nguoi-noi §8.2): ô "Đổi tên" (≤ 40 ký tự; để trống rồi Lưu
// là trở về tên tự động, QĐ 11), "Chọn người trong cuộc họp" (khi đọc được người tham dự), "Gộp vào người khác ▸". Áp cho mọi câu
// của giọng đó trong phiên. Esc hay bấm ra ngoài thì đóng; cách đóng và trả focus: `dismissal`.
export function SpeakerMenu({ lang, voice, voices, participants, onRename, onMerge, onClose }: SpeakerMenuProps) {
  const t = (key: MessageKey, params?: Params) => translate(lang, key, params);
  const [name, setName] = useState(voice.source === "voice" ? "" : voice.label);
  const [merging, setMerging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Cách đóng của lần mở này (tạo trong effect); Lưu, chọn người, gộp báo trước rằng menu sắp đóng (`willClose`).
  const dismiss = useRef<Dismissal<EventTarget | null> | null>(null);
  // Hướng mở (QĐ 20, `placeMenu`): state để lớp `up` giữ nguyên qua các lần vẽ lại (bản chép lời tới thêm câu), ref để lần đặt sau
  // biết hướng đang mở.
  const [placement, setPlacement] = useState<MenuPlacement>("down");
  const placed = useRef<MenuPlacement | undefined>(undefined);
  const others = mergeTargets(voices, voice);
  // Đặt menu khi vừa mở và mỗi khi chiều cao của nó đổi: bung hay gập danh sách gộp, thêm giọng, thêm người tham dự. Layout effect:
  // đo và cuộn trước khi trình duyệt hiện menu, nên không thấy menu nhảy; chạy trước effect focus ô tên bên dưới, nên ô tên đã ở
  // trong khung khi được focus.
  useLayoutEffect(() => {
    const menu = box.current;
    const chip = menu?.parentElement?.querySelector<HTMLElement>("button.spk-chip");
    if (!menu || !chip) return;
    placed.current = placeMenu(menu, chip, placed.current);
    setPlacement(placed.current);
  }, [merging, others.length, participants.length]);
  useEffect(() => {
    input.current?.focus();
    // Nhãn của chính dòng này (menu nằm trong cùng `li` với nhãn).
    const chip = box.current?.parentElement?.querySelector<HTMLButtonElement>("button.spk-chip") ?? null;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (box.current?.contains(target) === true || chip?.contains(target) === true);
    const d = dismissal(inside, onClose);
    dismiss.current = d;
    const onDown = (e: MouseEvent) => d.down(e.target);
    const onClick = (e: MouseEvent) => d.click(e.target, e.detail > 0);
    // Esc trong lúc gõ bằng bộ gõ (tiếng Nhật, Trung, Hàn) chỉ hủy chữ đang ghép, không đóng menu (`composing`).
    const onKey = (e: KeyboardEvent) => d.key(e, box.current?.contains(document.activeElement) === true);
    // Pha capture của `document`: chạy trước mọi phần tử của trang, và không bắt chính cú bấm vừa mở menu (effect gắn listener khi
    // cú bấm đó đã qua pha capture của `document`).
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      dismiss.current = null;
      // Focus đang ở trong menu vừa gỡ (rơi về `body`): trả về nhãn để người dùng bàn phím không mất chỗ; `preventScroll` để khung
      // không nhảy.
      if (d.restoreFocus() && chip?.isConnected) chip.focus({ preventScroll: true });
    };
  }, [onClose]);
  const title = t("transcript.speaker.rename", { name: isolateName(voice.label) });
  return (
    <div className={placement === "up" ? "speaker-menu up" : "speaker-menu"} role="dialog" aria-label={title} ref={box}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          dismiss.current?.willClose();
          onRename(name);
        }}
      >
        <label className="menu-head" htmlFor="speaker-name">
          {title}
        </label>
        <div className="menu-row">
          <input
            id="speaker-name"
            type="text"
            ref={input}
            value={name}
            maxLength={MAX_SPEAKER_NAME}
            placeholder={t("transcript.speaker.rename.placeholder")}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            // Enter kết thúc ghép chữ của bộ gõ không gửi tên (WebKit: `keyCode` 229, rà soát lần 3).
            onKeyDown={(e) => {
              if (e.key === "Enter" && composing(e.nativeEvent)) e.preventDefault();
            }}
          />
          <button type="submit">{t("transcript.speaker.rename.save")}</button>
        </div>
      </form>
      {participants.length > 0 && (
        <>
          <div className="menu-sep" />
          <div className="menu-head">{t("transcript.speaker.participants")}</div>
          {participants.map((p, i) => (
            <button
              key={`${i}:${p}`}
              type="button"
              className="menu-item"
              aria-current={p === voice.label ? "true" : undefined}
              onClick={() => {
                dismiss.current?.willClose();
                onRename(p);
              }}
            >
              {p}
            </button>
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <div className="menu-sep" />
          <button type="button" className="menu-item" aria-expanded={merging} onClick={() => setMerging((m) => !m)}>
            {`${t("transcript.speaker.merge")} ▸`}
          </button>
          {merging &&
            others.map((o) => (
              <button
                key={o.id}
                type="button"
                className="menu-item sub"
                style={{ "--spk": speakerColor(o.color) } as CSSProperties}
                onClick={(e) => {
                  // Cú bấm thứ hai của cú bấm đúp vào "Gộp vào người khác ▸" không gộp nhầm (`firstClick`).
                  if (!firstClick(e.detail)) return;
                  dismiss.current?.willClose();
                  onMerge(o.id);
                }}
              >
                <span className="dot" aria-hidden="true" />
                {o.label}
              </button>
            ))}
        </>
      )}
    </div>
  );
}
