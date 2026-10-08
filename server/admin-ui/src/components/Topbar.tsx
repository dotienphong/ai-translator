// Thanh trên (spec giao diện mới, mục 2): nút menu (điện thoại), ô tra cứu, nhãn môi trường, chip người vận hành.
import type { Ref } from "react";
import { IconMenu, IconUser } from "./icons";
import { SearchBox } from "./SearchBox";

export interface TopbarProps {
  /** Email người vận hành (Cloudflare Access); null khi đang tải hay tải lỗi. */
  operator: string | null;
  operatorLoading: boolean;
  menuOpen: boolean;
  onMenu(): void;
  menuButtonRef?: Ref<HTMLButtonElement>;
}

export function Topbar({ operator, operatorLoading, menuOpen, onMenu, menuButtonRef }: TopbarProps) {
  const initial = operator?.trim().charAt(0).toUpperCase() ?? "";
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          ref={menuButtonRef}
          type="button"
          className="icon-btn menu-btn"
          aria-label="Mở menu"
          aria-expanded={menuOpen}
          aria-controls="thanh-ben"
          onClick={onMenu}
        >
          <IconMenu size={22} />
        </button>
        <SearchBox />
        <div className="topbar-end">
          {/* Chỉ có một môi trường (production): nhắc rằng mọi thao tác chạm dữ liệu thật. Điện thoại hẹp chỉ còn chấm: chữ
              Production vẫn có cho trình đọc màn hình (ẩn bằng clip), title nói đủ tên môi trường khi giữ hay rê lên chấm. */}
          <span className="env-badge" title="Production: dữ liệu thật, mọi thao tác ghi đều có hiệu lực ngay">
            <span className="env-dot" aria-hidden="true" />
            <span className="env-badge-text">Production</span>
          </span>
          {operator ? (
            <span className="operator" title={operator}>
              <span className="avatar" aria-hidden="true">
                {initial || <IconUser />}
              </span>
              <span className="operator-email">{operator}</span>
            </span>
          ) : operatorLoading ? (
            <span className="operator is-loading" aria-hidden="true">
              <span className="avatar">
                <IconUser />
              </span>
              <span className="operator-email" />
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
