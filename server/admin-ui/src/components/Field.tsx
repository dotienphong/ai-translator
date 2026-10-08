// Ô nhập có nhãn (spec giao diện mới, mục 2): ô chọn, ô ngày, ô tìm kiếm. Nhãn nhỏ nằm trên ô; cùng kiểu dùng trong FilterBar
// và hộp thoại. Ô tìm có biểu tượng kính lúp và nút xóa nhanh.
import { type ReactNode, useId } from "react";
import { IconButton } from "./Button";
import { IconClose, IconSearch } from "./icons";

export function Select({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange(v: string): void;
  className?: string;
}) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Thông báo khi khoảng ngày bị ngược (giá trị ISO YYYY-MM-DD nên so sánh chuỗi được). */
export const RANGE_ERROR = "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc";

export function DateInput({
  label,
  value,
  onChange,
  invalid,
  className,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  /** Đánh dấu ô sai (viền đỏ, aria-invalid), ví dụ khoảng ngày ngược. */
  invalid?: boolean;
  className?: string;
}) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span className="field-label">{label}</span>
      <input type="date" value={value} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Ô tìm trong danh sách: kính lúp bên trái, nút xóa khi có chữ. `hideLabel`: nhãn chỉ cho trình đọc màn hình. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  hideLabel = false,
  className,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={["field", "field-search", className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "field-label"}>
        {label}
      </label>
      <div className="search-input">
        <IconSearch size={16} />
        <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        {value !== "" && <IconButton label="Xóa chữ đã gõ" icon={<IconClose size={16} />} size="sm" onClick={() => onChange("")} className="search-clear" />}
      </div>
    </div>
  );
}

/** Ô có nhãn tự do (bọc input hay select của trang): cùng khung với Select và DateInput; `hint`, `error` dưới ô. */
export function Field({ label, children, hint, error, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string }) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
