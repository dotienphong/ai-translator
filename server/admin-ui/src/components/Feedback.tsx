// Thông báo (spec giao diện mới, mục 2). ErrorBox: lỗi tải dữ liệu, có nút Thử lại. Notice: kết quả thao tác quan trọng,
// đứng yên tới khi người vận hành đóng. Toast: kết quả thao tác nhẹ (chép, lưu nháp), nổi ở góc dưới phải, tự đóng.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ApiError } from "../api/client";
import { Button, IconButton } from "./Button";
import { IconAlert, IconCheckCircle, IconClose, IconInfo, IconWarning } from "./icons";

export function ErrorBox({ error, onRetry, title }: { error: ApiError; onRetry?: () => void; title?: string }) {
  return (
    <div className="error-box" role="alert">
      <IconAlert size={20} />
      <div className="feedback-text">
        {title && <strong>{title}</strong>}
        <span>{error.message}</span>
      </div>
      {onRetry && error.code !== "session_expired" && (
        <Button size="sm" onClick={onRetry} className="feedback-action">
          Thử lại
        </Button>
      )}
    </div>
  );
}

export type NoticeTone = "ok" | "info" | "warn";

const NOTICE_ICON: Record<NoticeTone, ReactNode> = {
  ok: <IconCheckCircle size={20} />,
  info: <IconInfo size={20} />,
  warn: <IconWarning size={20} />,
};

export function Notice({ text, onClose, tone = "ok" }: { text: ReactNode; onClose(): void; tone?: NoticeTone }) {
  return (
    <div className={`notice tone-${tone}`} role="status">
      {NOTICE_ICON[tone]}
      <div className="feedback-text">
        <span>{text}</span>
      </div>
      <IconButton label="Đóng" icon={<IconClose size={18} />} size="sm" onClick={onClose} className="feedback-close" />
    </div>
  );
}

/* ---------- Toast ---------- */

export type ToastTone = "ok" | "info" | "warn" | "bad";

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastApi {
  /** Hiện một thông báo nổi, tự đóng sau `ms` (mặc định 4 giây). */
  show(text: string, opts?: { tone?: ToastTone; ms?: number }): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Gửi thông báo nổi. Ngoài ToastProvider (test, trang lẻ) thì không làm gì. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOAST;
}
const NOOP_TOAST: ToastApi = { show: () => {} };

export const TOAST_MS = 4000;
/** Tối đa bấy nhiêu thông báo cùng lúc; cái cũ nhất bị bỏ trước. */
const TOAST_MAX = 3;

const TOAST_ICON: Record<ToastTone, ReactNode> = {
  ok: <IconCheckCircle size={18} />,
  info: <IconInfo size={18} />,
  warn: <IconWarning size={18} />,
  bad: <IconAlert size={18} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (text: string, opts?: { tone?: ToastTone; ms?: number }) => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, text, tone: opts?.tone ?? "ok" }].slice(-TOAST_MAX));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts?.ms ?? TOAST_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Vùng luôn có trên trang (rỗng khi không có gì) để trình đọc màn hình đọc thông báo mới. */}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast tone-${t.tone}`}>
            {TOAST_ICON[t.tone]}
            <span className="toast-text">{t.text}</span>
            <IconButton label="Đóng thông báo" icon={<IconClose size={16} />} size="sm" onClick={() => dismiss(t.id)} className="toast-close" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
