import { useState } from "react";
import { maskKey } from "../format";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      setDone(false);
    }
  }
  return (
    <button type="button" className="link" onClick={copy}>
      {done ? "Đã chép" : "Chép"}
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
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="key-title">
        <h2 id="key-title">Key mới</h2>
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
