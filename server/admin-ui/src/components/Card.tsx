// Thẻ và nhóm (spec giao diện mới, mục 2). Card: đầu thẻ (biểu tượng, tiêu đề, mô tả, vùng hành động), thân, chân; tông
// cảnh báo hay nguy hiểm thêm vạch nhấn bên trái và nền đầu thẻ nhạt. Section: nhóm nhỏ có tiêu đề chữ hoa (kiểu group-title).
import { type ReactNode, useId } from "react";

export type CardTone = "default" | "info" | "ok" | "warn" | "danger";
type HeadingLevel = 2 | 3 | 4;

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Biểu tượng nhỏ trước tiêu đề (đặt trong ô màu theo tông). */
  icon?: ReactNode;
  /** Nút, liên kết hay huy hiệu ở góc phải đầu thẻ. */
  actions?: ReactNode;
  /** Chân thẻ: nút phụ, dòng ghi chú. */
  footer?: ReactNode;
  tone?: CardTone;
  /** Thân không đệm (bảng, danh sách sát mép thẻ). */
  flush?: boolean;
  /** Cấp tiêu đề (mặc định 2). Thẻ nằm trong một Section có tiêu đề h2 thì dùng 3. */
  level?: HeadingLevel;
  className?: string;
  /** Tên vùng khi thẻ không có tiêu đề hiển thị. */
  "aria-label"?: string;
  children?: ReactNode;
}

export function Card({ title, description, icon, actions, footer, tone = "default", flush = false, level = 2, className, children, ...rest }: CardProps) {
  const titleId = useId();
  const H = `h${level}` as const;
  const cls = ["ui-card", tone !== "default" && `tone-${tone}`, className].filter(Boolean).join(" ");
  const hasHead = title !== undefined || actions !== undefined;
  return (
    <section className={cls} aria-labelledby={title !== undefined ? titleId : undefined} aria-label={title === undefined ? rest["aria-label"] : undefined}>
      {hasHead && (
        <header className="ui-card-head">
          {icon && <span className="ui-card-icon">{icon}</span>}
          <div className="ui-card-heading">
            {title !== undefined && (
              <H id={titleId} className="ui-card-title">
                {title}
              </H>
            )}
            {description && <div className="ui-card-desc">{description}</div>}
          </div>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </header>
      )}
      {children !== undefined && children !== null && <div className={flush ? "ui-card-body flush" : "ui-card-body"}>{children}</div>}
      {footer && <footer className="ui-card-foot">{footer}</footer>}
    </section>
  );
}

export interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ở cuối dòng tiêu đề: nút nhỏ hay liên kết "Xem tất cả". */
  actions?: ReactNode;
  level?: HeadingLevel;
  className?: string;
  children: ReactNode;
}

/** Nhóm nội dung của một trang: tiêu đề nhỏ chữ hoa (Tiền, Khách hàng…), có thể kèm mô tả và hành động. */
export function Section({ title, description, actions, level = 2, className, children }: SectionProps) {
  const titleId = useId();
  const H = `h${level}` as const;
  return (
    <section className={className ? `ui-section ${className}` : "ui-section"} aria-labelledby={titleId}>
      <div className="ui-section-head">
        <div className="ui-section-heading">
          <H id={titleId} className="group-title">
            {title}
          </H>
          {description && <p className="ui-section-desc">{description}</p>}
        </div>
        {actions && <div className="ui-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
