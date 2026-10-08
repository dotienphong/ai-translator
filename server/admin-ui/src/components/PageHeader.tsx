// Đầu trang dùng chung (spec giao diện mới, mục 2): đường dẫn phụ (trang chi tiết), tiêu đề h1, huy hiệu, mô tả, vùng hành
// động bên phải tự xuống dòng trên màn hẹp.
import type { ReactNode } from "react";
import { Link } from "../router";
import { IconChevronRight } from "./icons";

export interface Crumb {
  label: string;
  /** Bỏ trống ở mục cuối (trang hiện tại). */
  to?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  breadcrumb?: readonly Crumb[];
  /** Nút nhỏ ngay sau tiêu đề, ngoài h1 (Hiện và Chép của key che). */
  titleAside?: ReactNode;
  /** Huy hiệu trạng thái, nằm cạnh tiêu đề. */
  badges?: ReactNode;
  description?: ReactNode;
  /** Nút hành động chính của trang. */
  actions?: ReactNode;
}

export function PageHeader({ title, breadcrumb, titleAside, badges, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="breadcrumb" aria-label="Đường dẫn">
          <ol>
            {breadcrumb.map((c, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <li key={`${i}-${c.label}`}>
                  {i > 0 && <IconChevronRight size={14} />}
                  {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span aria-current={last ? "page" : undefined}>{c.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="page-header-row">
        <div className="page-header-text">
          {/* Huy hiệu nằm ngoài h1 để tên tiêu đề (trình đọc màn hình, test) chỉ là chữ tiêu đề. */}
          <div className="page-title-row">
            {/* tabIndex -1: đích focus khi nút vừa bấm biến mất (useFocusTrap) hay thông báo vừa đóng. */}
            <h1 className="page-title" tabIndex={-1}>
              {title}
            </h1>
            {titleAside && <div className="page-title-aside">{titleAside}</div>}
            {badges && <div className="page-badges">{badges}</div>}
          </div>
          {description && <div className="page-desc">{description}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
