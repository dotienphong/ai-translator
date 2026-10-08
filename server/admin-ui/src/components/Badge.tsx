// Huy hiệu trạng thái (spec giao diện mới, mục 2): chấm màu và chữ, năm tông. Màu không bao giờ đứng một mình: luôn có chữ.
import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "bad" | "info" | "neutral";
/** `muted` là tên cũ của `neutral` (các trang chưa viết lại còn dùng). */
export type Tone = BadgeTone | "muted";

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  /** Biểu tượng thay cho chấm màu (ví dụ ổ khóa cho Khóa tạm). */
  icon?: ReactNode;
  /** false: bỏ chấm màu (chỉ chữ trên nền nhạt), dùng cho nhãn phụ như tên gói. */
  dot?: boolean;
  /** Viền nhẹ (nổi rõ hơn trên nền nhạt, ví dụ trong PageHeader). */
  outline?: boolean;
  className?: string;
  title?: string;
}

export function Badge({ tone = "neutral", children, icon, dot = true, outline = false, className, title }: BadgeProps) {
  const t = tone === "muted" ? "neutral" : tone;
  // Giữ lớp badge-muted cho tông trung tính: CSS và test cũ tìm theo nó.
  const cls = ["badge", `badge-${t === "neutral" ? "muted" : t}`, icon ? "has-icon" : !dot && "no-dot", outline && "outline", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} title={title}>
      {icon}
      {children}
    </span>
  );
}
