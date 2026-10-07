// Hộp xác nhận của mọi thao tác ghi (spec Web Admin §4.4): mức thường (ô Lý do khi API cần note) và mức không hoàn tác
// được (thêm ô gõ chữ xác nhận).
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../api/client";

export interface ConfirmDialogProps {
  title: string;
  /** Hậu quả của thao tác. */
  description: ReactNode;
  confirmLabel: string;
  /** API cần `note`: có ô Lý do, bắt buộc 1–500 ký tự. */
  needsNote: boolean;
  /** Thao tác không hoàn tác được: phải gõ đúng chữ này. */
  typeToConfirm?: string;
  /** Ô nhập thêm của trang (số ngày, email…). */
  children?: ReactNode;
  /** false: ô nhập thêm chưa hợp lệ. */
  extraValid?: boolean;
  onConfirm(note: string): Promise<void>;
  onClose(): void;
  /** Server trả 409 (trạng thái đã đổi): trang tải lại dữ liệu. */
  onConflict?(): void;
}

/** Lỗi mà ta không chắc thao tác đã chạy chưa: mất kết nối, máy chủ 5xx, hay lỗi không phải ApiError. */
function isUncertain(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const titleId = useId();
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chốt đồng bộ: hai lần gửi form trong cùng một lượt cập nhật vẫn chỉ gọi onConfirm một lần.
  const inFlight = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const trimmed = note.trim();
  const noteOk = !p.needsNote || (trimmed.length >= 1 && trimmed.length <= 500);
  const typedOk = p.typeToConfirm === undefined || typed === p.typeToConfirm;
  const ready = noteOk && typedOk && p.extraValid !== false && !busy && !uncertain;

  // Mở hộp: focus vào ô nhập đầu tiên (Lý do, rồi ô gõ chữ xác nhận, rồi ô nhập thêm của trang), không vào nút xác nhận.
  useEffect(() => {
    const first = noteRef.current ?? typedRef.current ?? formRef.current?.querySelector<HTMLElement>("input, textarea, select");
    first?.focus();
  }, []);

  // Esc đóng hộp, trừ lúc đang chờ server (đóng giữa chừng thì không thấy kết quả).
  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, p.onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await p.onConfirm(trimmed);
      p.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lỗi không xác định");
      if (isUncertain(err)) {
        // Không chắc đã chạy chưa (gia hạn, cấp license mới không idempotent): khóa nút xác nhận tới khi đóng hộp.
        setUncertain(true);
        p.onConflict?.();
      } else {
        inFlight.current = false;
        if (err instanceof ApiError && err.status === 409) p.onConflict?.();
      }
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <form ref={formRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId}>{p.title}</h2>
        <div className="dialog-desc">{p.description}</div>
        {p.children}
        {p.needsNote && (
          <label>
            Lý do (bắt buộc, ghi vào nhật ký)
            <textarea ref={noteRef} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {p.typeToConfirm !== undefined && (
          <label>
            <span>
              Gõ <code>{p.typeToConfirm}</code> để xác nhận
            </span>
            <input ref={typedRef} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        {error && (
          <div className="error" role="alert">
            <p>{error}</p>
            {uncertain && <p>Không chắc thao tác đã chạy chưa. Đóng hộp, tải lại trang và xem Nhật ký trước khi thử lại.</p>}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={p.onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className={p.typeToConfirm !== undefined ? "danger solid" : "primary"} disabled={!ready}>
            {busy ? "Đang làm…" : p.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
