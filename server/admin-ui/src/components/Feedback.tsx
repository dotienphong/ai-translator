// Thông báo (spec giao diện mới, mục 2). ErrorBox: lỗi tải dữ liệu, có nút Thử lại. Notice: kết quả thao tác ghi, đứng yên
// tới khi người vận hành đóng, luôn nằm trong một vùng aria-live có sẵn trên trang (NoticeRegion) để trình đọc màn hình đọc
// chắc chắn; thông báo mới thì cuộn tới và nhận focus (nút đã mở hộp thường biến mất sau khi trang tải lại).
import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "../api/client";
import { Button, IconButton } from "./Button";
import { IconAlert, IconCheckCircle, IconClose, IconInfo, IconWarning } from "./icons";
import { focusPageTitle, revealAndFocus } from "./useFocusTrap";

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

/**
 * Một thông báo kết quả. Không tự mang role: vùng live (NoticeRegion) bọc ngoài, có sẵn trước khi chữ xuất hiện, mới chắc
 * được đọc. tabIndex -1: nhận focus bằng mã sau thao tác (data-notice: đích trả focus của useFocusTrap).
 */
export function Notice({ text, onClose, tone = "ok", ref }: { text: ReactNode; onClose(): void; tone?: NoticeTone; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={`notice tone-${tone}`} tabIndex={-1} data-notice="">
      {NOTICE_ICON[tone]}
      <div className="feedback-text">
        <span>{text}</span>
      </div>
      <IconButton label="Đóng" icon={<IconClose size={18} />} size="sm" onClick={onClose} className="feedback-close" />
    </div>
  );
}

export interface NoticeMessage {
  /** Tăng mỗi lần show(): cùng chữ mà bấm lại vẫn là thông báo mới (cuộn tới, nhận focus, được đọc lại). */
  id: number;
  text: ReactNode;
  tone: NoticeTone;
}

export interface NoticeHandle {
  notice: NoticeMessage | null;
  show(text: ReactNode, tone?: NoticeTone): void;
  clear(): void;
}

/** Trạng thái thông báo kết quả của một trang; trang đặt <NoticeRegion> ở chỗ thông báo hiện (ngay dưới đầu trang). */
export function useNotice(): NoticeHandle {
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const seq = useRef(0);
  const show = useCallback((text: ReactNode, tone: NoticeTone = "ok") => {
    seq.current += 1;
    setNotice({ id: seq.current, text, tone });
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  return { notice, show, clear };
}

/**
 * Vùng thông báo luôn có trong DOM (rỗng khi không có gì): role="status" aria-live="polite" aria-atomic. Thông báo mới thì
 * cuộn vào tầm nhìn (khối gần nhất, không cuộn mượt khi người dùng giảm chuyển động) và nhận focus. Đóng thông báo thì
 * focus về đầu trang (nút Đóng biến mất cùng thông báo).
 * Trang có nhánh lỗi (tải lại thất bại) cũng đặt vùng này đúng vị trí đó để thông báo không mất khi trang đổi nhánh.
 */
export function NoticeRegion({ handle }: { handle: NoticeHandle }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = handle.notice?.id;
  useEffect(() => {
    if (id !== undefined) revealAndFocus(ref.current);
  }, [id]);
  const n = handle.notice;
  return (
    <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">
      {n && (
        <Notice
          key={n.id}
          ref={ref}
          text={n.text}
          tone={n.tone}
          onClose={() => {
            // Nút Đóng đang có focus sắp biến mất cùng thông báo: chuyển focus lên tiêu đề trang trước (không rơi về body).
            focusPageTitle();
            handle.clear();
          }}
        />
      )}
    </div>
  );
}

/**
 * Vùng kết quả luôn có trong DOM của một công cụ (trang Công cụ): như NoticeRegion nhưng nội dung do trang vẽ. `resultKey`
 * đổi (kết quả mới) thì cuộn tới và đưa focus vào phần tử con đầu tiên (phải có tabIndex -1).
 */
export function ResultRegion({ resultKey, children }: { resultKey: number | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resultKey !== null) revealAndFocus(ref.current?.firstElementChild as HTMLElement | null);
  }, [resultKey]);
  return (
    <div ref={ref} className="result-region" role="status" aria-live="polite" aria-atomic="true">
      {children}
    </div>
  );
}
