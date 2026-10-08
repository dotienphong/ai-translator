// Trạng thái trống (spec giao diện mới, mục 2): hình nhỏ SVG, tiêu đề, gợi ý, hành động. Bốn biến thể: chưa có dữ liệu,
// không có kết quả (bộ lọc), mọi thứ ổn (không còn việc), lỗi. Không bao giờ để chữ trần hay vùng trắng.
import type { ReactNode } from "react";
import { IconAlert, IconBox, IconCheck, IconSearch } from "./icons";

export type EmptyVariant = "empty" | "no-results" | "success" | "error";

export interface EmptyStateProps {
  title: ReactNode;
  /** Câu gợi ý bước tiếp theo. */
  hint?: ReactNode;
  /** Nút hay liên kết (ví dụ "Xóa lọc"). */
  action?: ReactNode;
  variant?: EmptyVariant;
  /** Thay hình mặc định của biến thể. */
  icon?: ReactNode;
  /** Gọn (trong bảng, trong thẻ nhỏ). */
  compact?: boolean;
  className?: string;
}

const DEFAULT_ICON: Record<EmptyVariant, ReactNode> = {
  empty: <IconBox size={22} />,
  "no-results": <IconSearch size={22} />,
  success: <IconCheck size={22} strokeWidth={2.25} />,
  error: <IconAlert size={22} />,
};

export function EmptyState({ title, hint, action, variant = "empty", icon, compact = false, className }: EmptyStateProps) {
  const cls = ["empty-state", `is-${variant}`, compact && "compact", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {/* Hình: ô tròn màu nhạt theo biến thể, hai vòng đồng tâm mờ phía sau (vẽ bằng CSS). */}
      <span className="empty-art" aria-hidden="true">
        {icon ?? DEFAULT_ICON[variant]}
      </span>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
