// Bẫy focus của hộp thoại (spec giao diện mới, mục 2): Tab và Shift+Tab chỉ đi vòng trong hộp; đóng hộp thì trả focus về
// phần tử đã mở nó (nếu phần tử đó còn trên trang). Không tự focus khi mở: mỗi hộp tự chọn ô nhận focus đầu tiên.
import { type RefObject, useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("inert") && !el.closest("[inert]"));
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    // Phần tử đang có focus lúc hộp mở (thường là nút vừa bấm): trả focus về đây khi hộp đóng.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}
