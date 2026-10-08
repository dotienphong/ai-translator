// Thanh lọc của trang danh sách (spec giao diện mới, mục 2): hàng ô lọc (Select, DateInput, SearchInput), hành động bên phải,
// dưới là chip cho mỗi bộ lọc đang bật (bấm X để bỏ từng cái), nút "Xóa lọc" và dòng đếm kết quả bên phải.
// collapsible: trên điện thoại hàng ô lọc gấp lại sau nút "Bộ lọc" (chip và dòng đếm vẫn hiện); máy tính không đổi.
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Button } from "./Button";
import { IconChevronDown, IconClose, IconFilter } from "./icons";

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
  /** Lỗi của bộ lọc (khoảng ngày ngược…): dòng đỏ dưới hàng ô lọc, role="alert". */
  error?: ReactNode;
  /** Tên vùng cho trình đọc màn hình. Mặc định "Bộ lọc". */
  label?: string;
  className?: string;
  /**
   * Điện thoại (≤ 800px): gấp hàng ô lọc sau nút "Bộ lọc" (aria-expanded), để kết quả không bị đẩy khỏi màn hình đầu.
   * Ô lọc vẫn nằm trong DOM (giữ giá trị đang gõ); chip của bộ lọc đang bật và dòng đếm luôn hiện.
   */
  collapsible?: boolean;
}

export function FilterBar({ children, chips = [], onClear, count, actions, error, onSubmit, label = "Bộ lọc", className, collapsible }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const rowId = useId();
  const cls = ["filterbar", collapsible && "is-collapsible", collapsible && open && "is-open", className].filter(Boolean).join(" ");
  const body = (
    <>
      {collapsible && (
        <Button
          className="filterbar-toggle"
          icon={<IconFilter size={16} />}
          iconEnd={<IconChevronDown size={16} className="filterbar-chevron" />}
          aria-expanded={open}
          aria-controls={rowId}
          onClick={() => setOpen((o) => !o)}
        >
          {chips.length > 0 ? `Bộ lọc (${chips.length} đang bật)` : "Bộ lọc"}
        </Button>
      )}
      <div className="filterbar-row" id={rowId}>
        <div className="filterbar-controls">{children}</div>
        {actions && <div className="filterbar-actions">{actions}</div>}
      </div>
      {error && (
        <p className="field-error filterbar-error" role="alert">
          {error}
        </p>
      )}
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
