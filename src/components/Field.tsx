import type { ReactNode } from "react";

// Một dòng cài đặt (kiểu bảng cài đặt của hệ điều hành): nhãn và mô tả ngắn bên trái, điều khiển bên phải; cửa sổ hẹp thì
// điều khiển xuống dòng dưới nhãn. Các dòng trong cùng một `.card` cách nhau bằng đường kẻ mảnh.
// `htmlFor`: nhãn là `<label>` gắn với điều khiển; không có thì nhãn là chữ thường (điều khiển tự có `aria-label`).
export function Field({
  label,
  htmlFor,
  hint,
  hintId,
  children,
  wide,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  hintId?: string;
  children?: ReactNode;
  /** Điều khiển chiếm cả dòng dưới nhãn (danh sách ô chọn, ô màu…). */
  wide?: boolean;
}) {
  return (
    <div className={wide ? "field wide" : "field"}>
      <div className="field-text">
        {htmlFor ? (
          <label className="field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        )}
        {hint && (
          <p className="hint" id={hintId}>
            {hint}
          </p>
        )}
      </div>
      {children !== undefined && <div className="field-control">{children}</div>}
    </div>
  );
}

// Nhóm lựa chọn (ô tick, nút radio) có nhãn chung: `fieldset` với `legend` cho trình đọc màn hình, nhãn hiện ra giống
// `Field`.
export function FieldSet({
  legend,
  hint,
  children,
  wide = true,
  className,
}: {
  legend: string;
  hint?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={["field", wide ? "wide" : "", className ?? ""].filter(Boolean).join(" ")}>
      <legend className="sr-only">{legend}</legend>
      <div className="field-text">
        <span className="field-label" aria-hidden="true">
          {legend}
        </span>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <div className="field-control">{children}</div>
    </fieldset>
  );
}

// Tiêu đề nhỏ của một nhóm cài đặt, đứng trên `.card`.
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 className="section-title" id={id}>
      {children}
    </h2>
  );
}
