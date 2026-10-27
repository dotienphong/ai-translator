import { type CSSProperties, useEffect, useRef, useState } from "react";
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

// Menu vừa mở thì cuộn khung vừa đủ để thấy trọn menu (nghiệm thu Task 21). `focus()` ô tên chỉ cuộn khi ô tên nằm ngoài khung; ở cửa
// sổ 960x640 nhãn dòng thứ tư đã nằm trong khung nên không cuộn gì, còn nửa dưới menu (cả mục "Gộp vào người khác ▸") ra ngoài mép
// cửa sổ, người dùng phải tự cuộn mới thấy. Vùng cuộn thật là khung `.content` của cửa sổ chính (menu `position: absolute` trong `li`,
// `.transcript` không cắt phần tràn, QĐ 20). `block: "nearest"`: menu đã thấy trọn thì không cuộn, thiếu bao nhiêu cuộn bấy nhiêu
// (không canh giữa hay đầu khung làm nội dung nhảy); đặt sau `focus()` để cộng với phần cuộn do `focus()` làm. `?.`: môi trường không
// có DOM (test Node) không có `scrollIntoView`.
export function revealMenu(el: { scrollIntoView?(options?: ScrollIntoViewOptions): void } | null | undefined): void {
  el?.scrollIntoView?.({ block: "nearest" });
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
  useEffect(() => {
    input.current?.focus();
    revealMenu(box.current);
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
  const others = mergeTargets(voices, voice);
  return (
    <div className="speaker-menu" role="dialog" aria-label={title} ref={box}>
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
                onClick={() => {
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
