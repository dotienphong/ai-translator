// Thanh lọc của trang danh sách (spec giao diện mới, mục 2): hàng ô lọc (Select, DateInput, SearchInput), hành động bên phải,
// dưới là chip cho mỗi bộ lọc đang bật (bấm X để bỏ từng cái), nút "Xóa lọc" và dòng đếm kết quả bên phải.
import type { FormEvent, ReactNode } from "react";
import { Button } from "./Button";
import { IconClose, IconFilter } from "./icons";

export interface FilterChip {
  key: string;
  /** Tên bộ lọc, ví dụ "Trạng thái". */
  name: string;
  /** Giá trị đang chọn, ví dụ "Đã trả". */
  value: string;
  onRemove(): void;
}

export interface FilterBarProps {
  /** Các ô lọc. */
  children: ReactNode;
  chips?: readonly FilterChip[];
  /** Bỏ mọi bộ lọc. Có từ hai chip trở lên thì hiện nút "Xóa lọc". */
  onClear?(): void;
  /** Dòng đếm kết quả, ví dụ "12 đơn" hay "50 dòng đầu". */
  count?: ReactNode;
  /** Nút bên phải hàng ô lọc (nút "Lọc" của form, "Cấp license mới…"). */
  actions?: ReactNode;
  /** Có thì thanh là <form>: Enter trong ô nhập gửi form. */
  onSubmit?(e: FormEvent<HTMLFormElement>): void;
  /** Tên vùng cho trình đọc màn hình. Mặc định "Bộ lọc". */
  label?: string;
  className?: string;
}

export function FilterBar({ children, chips = [], onClear, count, actions, onSubmit, label = "Bộ lọc", className }: FilterBarProps) {
  const cls = className ? `filterbar ${className}` : "filterbar";
  const body = (
    <>
      <div className="filterbar-row">
        <div className="filterbar-controls">{children}</div>
        {actions && <div className="filterbar-actions">{actions}</div>}
      </div>
      {(chips.length > 0 || count !== undefined) && (
        <div className="filterbar-meta">
          {chips.length > 0 ? (
            <div className="filterbar-chips">
              <IconFilter size={14} />
              <ul className="chips" aria-label="Bộ lọc đang bật">
                {chips.map((c) => (
                  <li key={c.key} className="chip">
                    <span className="chip-name">{c.name}:</span> <span className="chip-value">{c.value}</span>
                    <button type="button" className="chip-remove bare" aria-label={`Bỏ lọc ${c.name}: ${c.value}`} title="Bỏ lọc này" onClick={c.onRemove}>
                      <IconClose size={14} strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
              {onClear && chips.length > 1 && (
                <Button variant="ghost" size="sm" className="filterbar-clear" onClick={onClear}>
                  Xóa lọc
                </Button>
              )}
            </div>
          ) : (
            <span />
          )}
          {count !== undefined && (
            <p className="filterbar-count" aria-live="polite">
              {count}
            </p>
          )}
        </div>
      )}
    </>
  );
  if (onSubmit) {
    return (
      <form className={cls} aria-label={label} onSubmit={onSubmit}>
        {body}
      </form>
    );
  }
  return (
    <div className={cls} role="group" aria-label={label}>
      {body}
    </div>
  );
}
