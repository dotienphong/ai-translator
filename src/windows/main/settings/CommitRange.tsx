import { useState } from "react";

// Thanh trượt chỉ gửi giá trị khi thả chuột, nhấc phím hay rời ô, để kéo không gửi hàng chục lần `update_settings`.
export function CommitRange({
  id,
  min,
  max,
  step,
  value,
  format,
  onCommit,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span>{format(shown)}</span>
    </>
  );
}
