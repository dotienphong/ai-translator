import { useState } from "react";

// Thanh trượt chỉ gửi giá trị khi thả chuột, nhấc phím hay rời ô, để kéo không gửi hàng chục lần `update_settings`.
// `onDraft`: giá trị đang kéo (chưa gửi), để phần xem trước đổi ngay theo.
export function CommitRange({
  id,
  min,
  max,
  step,
  value,
  format,
  onCommit,
  onDraft,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  onDraft?: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
    onDraft?.(null);
  };
  return (
    <span className="range">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => {
          setDraft(Number(e.target.value));
          onDraft?.(Number(e.target.value));
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="value">{format(shown)}</span>
    </span>
  );
}
