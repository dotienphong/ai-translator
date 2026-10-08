// Bảng dữ liệu (spec giao diện mới, mục 2): tiêu đề dính khi cuộn trong khung, hàng sáng lên khi rê chuột hay khi có focus
// bên trong, cột số căn phải, dòng chờ đúng kích thước khi tải lần đầu, trạng thái rỗng bằng EmptyState, "Tải thêm" ở chân.
// Màn hẹp (≤ 800px): CSS đổi mỗi dòng thành một thẻ; cột chính thành dòng tiêu đề, cột khác là cặp nhãn và giá trị
// (nhãn lấy từ data-label).
import type { ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState, type EmptyVariant } from "./EmptyState";
import { IconChevronDown } from "./icons";
import { SkeletonRows } from "./Skeleton";

export interface Column<T> {
  header: string;
  cell(row: T): ReactNode;
  /** Căn phải cho số và tiền (số tabular), giữa cho biểu tượng. */
  align?: "left" | "right" | "center";
  /** Nhãn ngắn hơn trên điện thoại (thẻ chật hơn bảng). */
  mobileLabel?: string;
  /** Cột chính: trên điện thoại là dòng đầu của thẻ, chữ đậm, không nhãn. Không cột nào đánh dấu thì cột đầu là cột chính. */
  primary?: boolean;
  /** Ẩn trên điện thoại (thông tin phụ đã có ở chỗ khác). */
  hideOnMobile?: boolean;
  /** Không xuống dòng (ngày giờ, số tiền). */
  nowrap?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T, index: number): string;
  /** Tiêu đề trạng thái rỗng, ví dụ "Không có đơn nào". */
  empty: string;
  /** Gợi ý dưới tiêu đề rỗng. */
  emptyHint?: ReactNode;
  /** Hành động của trạng thái rỗng (ví dụ nút Xóa lọc). */
  emptyAction?: ReactNode;
  /** no-results khi đang lọc; mặc định empty. */
  emptyVariant?: EmptyVariant;
  hasMore?: boolean;
  loading?: boolean;
  onMore?(): void;
  /** Dòng chữ ở chân bảng, bên trái (ví dụ "50 dòng đầu"). */
  summary?: ReactNode;
  /** Giới hạn chiều cao, cuộn trong khung, tiêu đề dính. */
  maxHeight?: "sm" | "md" | "lg";
  /** Tên bảng cho trình đọc màn hình (caption ẩn). */
  caption?: string;
  /** Số dòng chờ khi tải lần đầu. Mặc định 5. */
  skeletonRows?: number;
  /** Nằm trong Card (thân flush): bỏ viền, bóng và bo góc riêng. */
  flush?: boolean;
}

const ALIGN_CLASS = { left: "", right: "num", center: "center" } as const;

function cellClass<T>(c: Column<T>, primary: boolean): string | undefined {
  const cls = [
    ALIGN_CLASS[c.align ?? "left"],
    c.nowrap && "nowrap",
    primary && "dt-primary",
    c.header === "" && "dt-actions",
    c.hideOnMobile && "hide-mobile",
  ]
    .filter(Boolean)
    .join(" ");
  return cls || undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  emptyHint,
  emptyAction,
  emptyVariant = "empty",
  hasMore,
  loading,
  onMore,
  summary,
  maxHeight,
  caption,
  skeletonRows = 5,
  flush = false,
}: DataTableProps<T>) {
  const primaryIndex = Math.max(
    0,
    columns.findIndex((c) => c.primary),
  );
  const firstLoad = Boolean(loading) && rows.length === 0;
  const wrapCls = ["table-wrap", "dt", maxHeight && `scroll-${maxHeight}`].filter(Boolean).join(" ");
  const showFoot = Boolean(hasMore) || (summary !== undefined && rows.length > 0);
  return (
    <div className={flush ? "dt-frame flush" : "dt-frame"}>
      {/* Khung có giới hạn chiều cao thì cuộn được bằng bàn phím (tabIndex). */}
      <div className={wrapCls} aria-busy={firstLoad || undefined} tabIndex={maxHeight ? 0 : undefined}>
        <table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={`${i}-${c.header}`} scope="col" className={cellClass(c, false)}>
                  {c.header === "" ? <span className="sr-only">Thao tác</span> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {firstLoad ? (
              <SkeletonRows rows={skeletonRows} columns={columns.length} />
            ) : rows.length === 0 ? (
              <tr className="dt-empty-row">
                <td colSpan={columns.length} className="empty">
                  {empty === "" ? null : <EmptyState compact variant={emptyVariant} title={empty} hint={emptyHint} action={emptyAction} />}
                </td>
              </tr>
            ) : (
              rows.map((r, ri) => (
                <tr key={rowKey(r, ri)}>
                  {columns.map((c, i) => (
                    <td key={`${i}-${c.header}`} data-label={c.mobileLabel ?? c.header} className={cellClass(c, i === primaryIndex)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {firstLoad && (
          <span className="sr-only" role="status">
            Đang tải…
          </span>
        )}
      </div>
      {showFoot && (
        <div className={hasMore ? "dt-foot table-more" : "dt-foot"}>
          {summary !== undefined && rows.length > 0 ? <span className="dt-summary">{summary}</span> : <span />}
          {hasMore && (
            <Button size="sm" icon={<IconChevronDown size={16} />} onClick={onMore} disabled={loading} loading={loading}>
              {loading ? "Đang tải…" : "Tải thêm"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Chữ đếm dòng cho chân bảng hay FilterBar: "12 đơn" khi đã hết, "50 đơn đầu, còn nữa" khi còn trang sau. */
export function countText(n: number, unit: string, hasMore: boolean): string {
  const num = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return hasMore ? `${num} ${unit} đầu, còn nữa` : `${num} ${unit}`;
}
