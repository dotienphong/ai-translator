// Hộp xác nhận của mọi thao tác ghi (spec Web Admin §4.4): mức thường (ô Lý do khi API cần note) và mức không hoàn tác
// được (thêm ô gõ chữ xác nhận).
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { Button } from "./Button";
import { IconAlert, IconCheck, IconInfo, IconWarning } from "./icons";
import { useFocusTrap } from "./useFocusTrap";

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
  /**
   * Tông của hộp: danger thêm biểu tượng cảnh báo đỏ và nút xác nhận nền đỏ. Mặc định: danger khi có typeToConfirm
   * (thao tác không hoàn tác được), thường thì default.
   */
  tone?: "default" | "danger";
}

/** Lỗi 5xx mà server biết chắc chưa ghi gì: thử lại được như lỗi thường. */
const NOT_WRITTEN = new Set(["temporarily_unavailable", "pricing_not_configured", "key_check_failed", "payment_provider_error"]);

/**
 * Lỗi mà ta không chắc thao tác đã chạy chưa: mất kết nối, máy chủ 5xx (trừ mã chắc chắn chưa ghi), server trả 2xx nhưng
 * JSON hỏng (client.ts đổi thành http_<status>: thao tác có thể đã ghi), hay lỗi không phải ApiError.
 * Phiên Access hết hạn thì chắc chắn chưa ghi (Access chặn trước khi request tới Worker), dù status là 0 hay 2xx (trang đăng nhập).
 */
function isUncertain(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.code === "session_expired") return false;
  if (err.status === 0) return true;
  if (err.status >= 200 && err.status < 300) return true;
  return err.status >= 500 && !NOT_WRITTEN.has(err.code);
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const noteId = useId();
  const typedId = useId();
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

  // Bẫy focus trong hộp và trả focus về nút đã mở hộp khi đóng. Gọi trước hiệu ứng focus bên dưới để nhớ đúng nút đó.
  useFocusTrap(formRef);

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

  const danger = (p.tone ?? (p.typeToConfirm !== undefined ? "danger" : "default")) === "danger";
  return (
    <div className="overlay">
      <form
        ref={formRef}
        className={danger ? "dialog tone-danger" : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onSubmit={submit}
      >
        <div className="dialog-head">
          <span className="dialog-icon" aria-hidden="true">
            {danger ? <IconWarning size={20} /> : <IconInfo size={20} />}
          </span>
          <div className="dialog-heading">
            <h2 id={titleId}>{p.title}</h2>
            <div className="dialog-desc" id={descId}>
              {p.description}
            </div>
          </div>
        </div>
        <div className="dialog-body">
          {p.children}
          {p.needsNote && (
            <div className="dialog-field">
              <label htmlFor={noteId}>
                Lý do <span className="field-req">bắt buộc</span>
              </label>
              <textarea
                id={noteId}
                ref={noteRef}
                value={note}
                maxLength={500}
                rows={3}
                aria-describedby={`${noteId}-hint`}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="field-hint" id={`${noteId}-hint`}>
                <span>Ghi vào nhật ký cùng thao tác.</span>
                <span className="field-count" aria-hidden="true">
                  {note.length}/500
                </span>
              </p>
            </div>
          )}
          {p.typeToConfirm !== undefined && (
            <div className={typedOk ? "dialog-field type-confirm is-match" : "dialog-field type-confirm"}>
              <label htmlFor={typedId}>
                Gõ <code>{p.typeToConfirm}</code> để xác nhận
              </label>
              <div className="type-confirm-input">
                <input
                  id={typedId}
                  ref={typedRef}
                  value={typed}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(e) => setTyped(e.target.value)}
                />
                {typedOk && <IconCheck size={18} strokeWidth={2.25} />}
              </div>
            </div>
          )}
          {error && (
            <div className={uncertain ? "dialog-error is-uncertain" : "dialog-error"} role="alert">
              {uncertain ? <IconWarning size={18} /> : <IconAlert size={18} />}
              <div>
                <p>{error}</p>
                {uncertain && <p>Không chắc thao tác đã chạy chưa. Đóng hộp, tải lại trang và xem Nhật ký trước khi thử lại.</p>}
              </div>
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <Button onClick={close} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant={danger ? "danger-solid" : "primary"} disabled={!ready} loading={busy}>
            {busy ? "Đang làm…" : p.confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
