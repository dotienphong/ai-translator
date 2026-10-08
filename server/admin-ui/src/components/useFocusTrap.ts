// Bẫy focus của hộp thoại (spec giao diện mới, mục 2): Tab và Shift+Tab chỉ đi vòng trong hộp; đóng hộp thì trả focus về
// phần tử đã mở nó. Phần tử đó không còn (trang tải lại sau thao tác: nút Thu hồi…, Gỡ…, Cấp key mới… biến mất) hay không
// nhận được focus (bị khóa) thì focus vào thông báo kết quả của trang, không có thì vào tiêu đề trang: không để rơi về body.
// Không tự focus khi mở: mỗi hộp tự chọn ô nhận focus đầu tiên.
import { type RefObject, useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("inert") && !el.closest("[inert]"));
}

/** Focus vào tiêu đề trang (h1 của PageHeader, tabIndex -1); trang không có tiêu đề thì vào vùng nội dung. */
export function focusPageTitle(): void {
  const target = document.querySelector<HTMLElement>(".page-title") ?? document.querySelector<HTMLElement>("main");
  target?.focus({ preventScroll: true });
}

/** Đích dự phòng khi trả focus: thông báo kết quả đang hiện (Notice), không có thì tiêu đề trang. */
export function focusPageStart(): void {
  const notice = document.querySelector<HTMLElement>("[data-notice]");
  if (notice) notice.focus({ preventScroll: true });
  else focusPageTitle();
}

/** Trả focus về `opener` nếu nó còn trên trang và nhận được focus; không thì về đích dự phòng (focusPageStart). */
export function restoreFocus(opener: HTMLElement | null): void {
  if (opener?.isConnected) {
    opener.focus({ preventScroll: true });
    if (document.activeElement === opener) return;
  }
  focusPageStart();
}

/** Cuộn phần tử vào tầm nhìn (khối gần nhất; không cuộn mượt khi người dùng giảm chuyển động) rồi đưa focus vào nó. */
export function revealAndFocus(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const reduce = typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // jsdom không có scrollIntoView.
  el.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    // Phần tử đang có focus lúc hộp mở (thường là nút vừa bấm): trả focus về đây khi hộp đóng.
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (e.key !== "Tab" || !root) return;
      const items = focusableIn(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreFocus(opener);
    };
  }, [ref]);
}
