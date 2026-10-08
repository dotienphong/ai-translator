// Bảng dữ liệu (spec giao diện mới, mục 2): tiêu đề dính khi cuộn trong khung, hàng sáng lên khi rê chuột hay khi có focus
// bên trong, cột số căn phải, dòng chờ đúng kích thước khi tải lần đầu, trạng thái rỗng bằng EmptyState, "Tải thêm" ở chân.
// Màn hẹp (≤ 800px): CSS đổi mỗi dòng thành một thẻ; cột chính thành dòng tiêu đề, cột khác là cặp nhãn và giá trị
// (nhãn lấy từ data-label).
// Hàng mở được (rowHref): bấm chuột vào chỗ nào trên hàng cũng mở trang của dòng; liên kết thật trong ô định danh vẫn là
// lối vào cho bàn phím và trình đọc màn hình (hàng không nhận focus riêng). Bôi chọn chữ, bấm vào liên kết hay nút khác
// trong hàng thì không mở; giữ Ctrl, Cmd hay Shift thì mở thẻ mới.
import type { MouseEvent, ReactNode } from "react";
import { navigate } from "../router";
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
  /** Trên điện thoại: nằm cùng dòng đầu với cột chính, bên phải (huy hiệu trạng thái). */
  aside?: boolean;
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
  /** Trên điện thoại: "cards" (mặc định) đổi mỗi dòng thành thẻ có nhãn; "table" giữ dạng bảng (bảng nhỏ, ít cột). */
  mobile?: "cards" | "table";
  /** Đường dẫn trang của dòng: cả hàng bấm được (xem đầu tệp). */
  rowHref?(row: T): string;
  /** Các dòng đang hiện là của bộ lọc cũ, kết quả mới đang về: làm mờ và đặt aria-busy. */
  stale?: boolean;
}

function openRow(e: MouseEvent<HTMLTableRowElement>, href: string) {
  if (e.button !== 0 || (e.target as Element).closest("a, button, input, select, textarea, label")) return;
  if (window.getSelection()?.toString()) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey) window.open(href, "_blank", "noopener");
  else navigate(href);
}

const ALIGN_CLASS = { left: "", right: "num", center: "center" } as const;

function cellClass<T>(c: Column<T>, primary: boolean): string | undefined {
  const cls = [
    ALIGN_CLASS[c.align ?? "left"],
    c.nowrap && "nowrap",
    primary && "dt-primary",
    c.header === "" && "dt-actions",
    c.aside && "dt-aside",
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
  mobile = "cards",
  rowHref,
  stale = false,
}: DataTableProps<T>) {
  const primaryIndex = Math.max(
    0,
    columns.findIndex((c) => c.primary),
  );
  const firstLoad = Boolean(loading) && rows.length === 0;
  const wrapCls = ["table-wrap", "dt", maxHeight && `scroll-${maxHeight}`, mobile === "table" && "keep-table", stale && "is-stale"].filter(Boolean).join(" ");
  const showFoot = Boolean(hasMore) || (summary !== undefined && rows.length > 0);
  return (
    <div className={flush ? "dt-frame flush" : "dt-frame"}>
      {/* Khung có giới hạn chiều cao thì cuộn được bằng bàn phím (tabIndex). */}
      <div className={wrapCls} aria-busy={firstLoad || stale || undefined} tabIndex={maxHeight ? 0 : undefined}>
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
              <SkeletonRows rows={skeletonRows} columns={columns.length} cellClass={columns.map((c) => ALIGN_CLASS[c.align ?? "left"] || undefined)} />
            ) : rows.length === 0 ? (
              <tr className="dt-empty-row">
                <td colSpan={columns.length} className="empty">
                  {empty === "" ? null : <EmptyState compact variant={emptyVariant} title={empty} hint={emptyHint} action={emptyAction} />}
                </td>
              </tr>
            ) : (
              rows.map((r, ri) => {
                const href = rowHref?.(r);
                return (
                <tr key={rowKey(r, ri)} className={href ? "is-link" : undefined} onClick={href ? (e) => openRow(e, href) : undefined}>
                  {columns.map((c, i) => (
                    <td key={`${i}-${c.header}`} data-label={c.mobileLabel ?? c.header} className={cellClass(c, i === primaryIndex)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        {firstLoad && (
          <span className="sr-only" role="status">
            Đang tải…
          </span>
        )}
      </div>
      {showFoot && <MoreFoot summary={rows.length > 0 ? summary : undefined} hasMore={hasMore} loading={loading} onMore={onMore} />}
    </div>
  );
}

/** Chân danh sách: dòng đếm bên trái, nút "Tải thêm" (trang kế theo con trỏ). Dùng chung cho bảng và dòng thời gian. */
export function MoreFoot({ summary, hasMore, loading, onMore }: { summary?: ReactNode; hasMore?: boolean; loading?: boolean; onMore?(): void }) {
  return (
    <div className={hasMore ? "dt-foot table-more" : "dt-foot"}>
      {summary !== undefined ? <span className="dt-summary">{summary}</span> : <span />}
      {hasMore && (
        <Button size="sm" icon={<IconChevronDown size={16} />} onClick={onMore} disabled={loading} loading={loading}>
          {loading ? "Đang tải…" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}

/** Chữ đếm dòng cho chân bảng hay FilterBar: "12 đơn" khi đã hết, "50+ đơn" khi còn trang sau (server không trả tổng). */
export function countText(n: number, unit: string, hasMore: boolean): string {
  const num = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${num}${hasMore ? "+" : ""} ${unit}`;
}
