// Hộp xác nhận của mọi thao tác ghi (spec Web Admin §4.4): mức thường (ô Lý do khi API cần note) và mức không hoàn tác
// được (thêm ô gõ chữ xác nhận).
import { type FormEvent, type ReactNode, useState } from "react";
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

export function ConfirmDialog(p: ConfirmDialogProps) {
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = note.trim();
  const noteOk = !p.needsNote || (trimmed.length >= 1 && trimmed.length <= 500);
  const typedOk = p.typeToConfirm === undefined || typed === p.typeToConfirm;
  const ready = noteOk && typedOk && p.extraValid !== false && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await p.onConfirm(trimmed);
      p.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (err instanceof ApiError && err.status === 409) p.onConflict?.();
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={submit}>
        <h2 id="dialog-title">{p.title}</h2>
        <div className="dialog-desc">{p.description}</div>
        {p.children}
        {p.needsNote && (
          <label>
            Lý do (bắt buộc, ghi vào nhật ký)
            <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {p.typeToConfirm !== undefined && (
          <label>
            <span>
              Gõ <code>{p.typeToConfirm}</code> để xác nhận
            </span>
            <input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
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
