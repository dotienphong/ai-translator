// Nút chép vào bộ nhớ tạm (spec giao diện mới, mục 2): đổi thành "Đã chép" 1,5 giây, báo cho trình đọc màn hình qua vùng
// aria-live. Chỉ chép đúng chuỗi được truyền: muốn chép key đầy đủ thì trang phải truyền key đầy đủ, nút không tự tìm.
import { useEffect, useRef, useState } from "react";
import { buttonClass, type ButtonSize } from "./Button";
import { IconCheck, IconCopy } from "./icons";

/** Thời gian giữ chữ "Đã chép" (hay "Không chép được") trước khi trở lại "Chép". */
export const COPY_RESET_MS = 1500;

type CopyState = "idle" | "done" | "failed";

/**
 * Chép `text`: Clipboard API (chỉ có trên trang an toàn), không có hay bị từ chối thì thử cách cũ bằng một ô ẩn và
 * execCommand("copy"). Trả về true khi chép được.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Bị chặn (quyền, trang không có focus): thử cách cũ bên dưới.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  const active = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "copy-buffer";
  document.body.appendChild(area);
  try {
    area.focus({ preventScroll: true });
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    active?.focus?.();
  }
}

export interface CopyButtonProps {
  /** Chuỗi được chép, nguyên văn. */
  text: string;
  /** Chữ của nút lúc rảnh. Mặc định "Chép". */
  label?: string;
  /**
   * link: nút chữ có biểu tượng (mặc định, đứng cạnh giá trị); icon: chỉ biểu tượng (trong KeyValue, bảng);
   * button: nút viền đầy đủ (trong hộp hiện key).
   */
  appearance?: "link" | "icon" | "button";
  size?: ButtonSize;
  /** Tên thứ được chép cho trình đọc màn hình ở kiểu icon, ví dụ "key" thành "Chép key". */
  what?: string;
  className?: string;
}

const LABELS: Record<Exclude<CopyState, "idle">, string> = { done: "Đã chép", failed: "Không chép được" };

export function CopyButton({ text, label = "Chép", appearance = "link", size = "sm", what, className }: CopyButtonProps) {
  // Mỗi lần bấm là một đối tượng mới để bộ hẹn giờ tính lại từ đầu.
  const [state, setState] = useState<{ kind: CopyState }>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (state.kind === "idle") return;
    const t = setTimeout(() => setState({ kind: "idle" }), COPY_RESET_MS);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    const ok = await copyText(text);
    if (alive.current) setState({ kind: ok ? "done" : "failed" });
  }

  const idleName = appearance === "icon" && what ? `${label} ${what}` : label;
  const name = state.kind === "idle" ? idleName : LABELS[state.kind];
  const cls = buttonClass({
    variant: appearance === "button" ? "secondary" : "ghost",
    size,
    className: ["copy-btn", appearance === "link" && "link", appearance === "icon" && "icon-only", `is-${state.kind}`, className]
      .filter(Boolean)
      .join(" "),
  });
  const glyph = state.kind === "done" ? <IconCheck size={16} strokeWidth={2.25} /> : <IconCopy size={16} />;
  return (
    <>
      <button type="button" className={cls} onClick={copy} aria-label={appearance === "icon" ? name : undefined} title={appearance === "icon" ? name : undefined}>
        {glyph}
        {appearance !== "icon" && <span className="btn-label">{name}</span>}
      </button>
      {/* Vùng thông báo luôn có sẵn (rỗng lúc rảnh) để trình đọc màn hình đọc khi chữ đổi. */}
      <span className="sr-only" role="status">
        {state.kind === "done" ? "Đã chép vào bộ nhớ tạm" : state.kind === "failed" ? "Không chép được, hãy chọn và chép tay" : ""}
      </span>
    </>
  );
}
