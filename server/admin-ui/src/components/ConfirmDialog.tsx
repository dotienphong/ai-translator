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
  /**
   * Trang tải lại dữ liệu. Gọi ngay khi server trả 409 hay 404 (trạng thái đã đổi); với lỗi không rõ kết quả thì
   * chỉ gọi khi người vận hành đóng hộp (tải lại ngay mà lỗi thì trang bỏ hộp đi, cảnh báo biến mất).
   */
  onConflict?(): void;
}

/** Lỗi 5xx mà server biết chắc chưa ghi gì: thử lại được như lỗi thường. */
const NOT_WRITTEN = new Set(["temporarily_unavailable", "pricing_not_configured", "key_check_failed", "payment_provider_error"]);

/** Lỗi mà ta không chắc thao tác đã chạy chưa: mất kết nối, máy chủ 5xx (trừ mã chắc chắn chưa ghi), hay lỗi không phải ApiError. */
function isUncertain(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.status === 0) return true;
  return err.status >= 500 && !NOT_WRITTEN.has(err.code);
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

  // Đóng hộp (nút Hủy, Esc): đóng khi đang không rõ kết quả thì trang mới tải lại, để người vận hành đã đọc cảnh báo.
  function close() {
    if (uncertain) p.onConflict?.();
    p.onClose();
  }

  // Esc đóng hộp, trừ lúc đang chờ server (đóng giữa chừng thì không thấy kết quả).
  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, uncertain, p.onClose, p.onConflict]);

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
        // Chưa tải lại trang ở đây: đợi người vận hành đóng hộp (close).
        setUncertain(true);
      } else {
        inFlight.current = false;
        if (err instanceof ApiError && (err.status === 409 || err.status === 404)) p.onConflict?.();
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
          <button type="button" onClick={close} disabled={busy}>
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
