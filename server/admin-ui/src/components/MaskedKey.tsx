import { useEffect, useId, useState } from "react";
import { maskKey } from "../format";

const COPY_LABELS = { idle: "Chép", done: "Đã chép", failed: "Không chép được" };

export function CopyButton({ text }: { text: string }) {
  // Mỗi lần bấm là một đối tượng mới để bộ hẹn giờ 2 giây tính lại từ đầu.
  const [state, setState] = useState<{ kind: keyof typeof COPY_LABELS }>({ kind: "idle" });
  useEffect(() => {
    if (state.kind === "idle") return;
    const t = setTimeout(() => setState({ kind: "idle" }), 2000);
    return () => clearTimeout(t);
  }, [state]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState({ kind: "done" });
    } catch {
      setState({ kind: "failed" });
    }
  }
  return (
    <button type="button" className="link" onClick={copy}>
      {COPY_LABELS[state.kind]}
    </button>
  );
}

/** Key che mặc định (spec Web Admin §4.2); bấm Hiện để xem, Chép để chép key đầy đủ. */
export function MaskedKey({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="masked-key">
      <code>{shown ? value : maskKey(value)}</code>
      <button type="button" className="link" onClick={() => setShown((s) => !s)}>
        {shown ? "Ẩn" : "Hiện"}
      </button>
      <CopyButton text={value} />
    </span>
  );
}

/** Hộp hiện key mới một lần, sau thao tác cấp key (spec §4.6). */
export function KeyReveal({ licenseKey, onClose }: { licenseKey: string; onClose(): void }) {
  const titleId = useId();
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Key mới</h2>
        <p>Key đã được gửi qua email cho khách. Hộp này chỉ hiện một lần.</p>
        <p>
          <code className="key-full">{licenseKey}</code> <CopyButton text={licenseKey} />
        </p>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
