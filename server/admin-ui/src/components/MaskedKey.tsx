// Key license che mặc định (spec Web Admin §4.2) và hộp hiện key một lần sau thao tác cấp key (§4.6).
import { useEffect, useId, useRef, useState } from "react";
import { maskKey } from "../format";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { IconEye, IconEyeOff, IconKey } from "./icons";
import { useFocusTrap } from "./useFocusTrap";

export { CopyButton } from "./CopyButton";

/** Nút Hiện / Ẩn của key che (trang tự giữ trạng thái khi chữ key nằm chỗ khác, ví dụ tiêu đề trang license). */
export function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle(): void }) {
  return (
    <Button variant="ghost" size="sm" className="link" icon={shown ? <IconEyeOff size={16} /> : <IconEye size={16} />} onClick={onToggle}>
      {shown ? "Ẩn" : "Hiện"}
    </Button>
  );
}

/** Key che mặc định; bấm Hiện để xem, Chép để chép key đầy đủ (nút chép nhận key đầy đủ, chữ trên trang vẫn che). */
export function MaskedKey({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={shown ? "masked-key is-shown" : "masked-key"}>
      <code>{shown ? value : maskKey(value)}</code>
      <RevealToggle shown={shown} onToggle={() => setShown((s) => !s)} />
      <CopyButton text={value} />
    </span>
  );
}

/**
 * Hộp hiện key một lần, sau thao tác cấp key. `title` đổi khi key không mới (cấp tay cho đơn gia hạn hay đổi gói).
 * Không đóng bằng Esc hay bấm ra ngoài: đóng nhầm là mất key; chỉ nút Xong mới đóng.
 */
export function KeyReveal({ licenseKey, title = "Key mới", onClose }: { licenseKey: string; title?: string; onClose(): void }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  // Mở hộp: focus vào nút Chép (việc thường làm tiếp theo).
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".copy-btn")?.focus();
  }, []);
  return (
    <div className="overlay">
      <div ref={ref} className="dialog tone-ok" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-head">
          <span className="dialog-icon" aria-hidden="true">
            <IconKey size={20} />
          </span>
          <div className="dialog-heading">
            <h2 id={titleId}>{title}</h2>
            <p className="dialog-desc">
              Server đã thử gửi key qua email cho khách; nếu khách báo không nhận được, dùng Gửi lại email ở trang license. Hộp này chỉ hiện key một
              lần.
            </p>
          </div>
        </div>
        <div className="dialog-body">
          <div className="key-box">
            <code className="key-full">{licenseKey}</code>
            <CopyButton text={licenseKey} appearance="button" size="md" label="Chép key" />
          </div>
        </div>
        <div className="dialog-actions">
          <Button variant="primary" onClick={onClose}>
            Xong
          </Button>
        </div>
      </div>
    </div>
  );
}
