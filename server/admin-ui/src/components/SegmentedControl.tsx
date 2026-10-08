// Công tắc nhiều lựa chọn nhỏ (spec giao diện mới, mục 2: chế độ bảng hay dòng thời gian của Nhật ký). Theo mẫu radiogroup
// của WAI-ARIA: Tab vào lựa chọn đang bật, mũi tên trái/phải (lên/xuống), Home, End đổi lựa chọn ngay.
import { type KeyboardEvent, type ReactNode, useRef } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  /** Tên nhóm cho trình đọc màn hình, ví dụ "Cách xem". */
  label: string;
  value: V;
  options: readonly SegmentOption<NoInfer<V>>[];
  onChange(v: NoInfer<V>): void;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  }

  return (
    <div className={["segmented", size === "sm" && "sm", className].filter(Boolean).join(" ")} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={on ? "segment bare is-on" : "segment bare"}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
