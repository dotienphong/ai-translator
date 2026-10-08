// Lưới nhãn và giá trị cho thẻ "Thông tin" (spec giao diện mới, mục 2): mỗi dòng có thể có nút chép, chữ mono, huy hiệu.
// Là <dl>: trình đọc màn hình đọc từng cặp nhãn và giá trị. Màn hẹp: nhãn nằm trên giá trị.
import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";

export interface KeyValueItem {
  label: ReactNode;
  /** null hay undefined thì hiện "—". */
  value: ReactNode;
  /** Chuỗi được chép khi bấm nút chép (thường là giá trị đầy đủ). Không truyền thì không có nút. */
  copy?: string;
  /** Tên thứ được chép cho trình đọc màn hình, ví dụ "email". Mặc định là nhãn nếu nhãn là chữ. */
  copyWhat?: string;
  /** Chữ mono (id, mã máy, key). */
  mono?: boolean;
  /** Huy hiệu sau giá trị. */
  badge?: ReactNode;
  /** Dòng phụ nhỏ dưới giá trị. */
  hint?: ReactNode;
  /** Ẩn dòng (giữ mảng gọn ở chỗ gọi). */
  hidden?: boolean;
}

export function KeyValue({ items, className, columns = 1 }: { items: readonly KeyValueItem[]; className?: string; columns?: 1 | 2 }) {
  const cls = ["kv", columns === 2 && "kv-2", className].filter(Boolean).join(" ");
  return (
    <dl className={cls}>
      {items
        .filter((it) => !it.hidden)
        .map((it, i) => {
          const empty = it.value === null || it.value === undefined || it.value === "";
          const what = it.copyWhat ?? (typeof it.label === "string" ? it.label.toLowerCase() : undefined);
          return (
            <div className="kv-row" key={typeof it.label === "string" ? it.label : i}>
              <dt>{it.label}</dt>
              <dd>
                <span className="kv-value">
                  <span className={[it.mono && "mono", empty && "kv-empty"].filter(Boolean).join(" ") || undefined}>{empty ? "—" : it.value}</span>
                  {it.badge}
                  {it.copy !== undefined && !empty && <CopyButton text={it.copy} appearance="icon" what={what} />}
                </span>
                {it.hint && <span className="kv-hint">{it.hint}</span>}
              </dd>
            </div>
          );
        })}
    </dl>
  );
}
