// Khung chờ (spec giao diện mới, mục 2 và 4: "không dịch chuyển bố cục khi tải"): thanh, ô số, dòng bảng có đúng kích thước
// của thứ sắp hiện. Ánh sáng lướt nhẹ, tắt khi người dùng chọn giảm chuyển động (base.css). Các thanh là aria-hidden;
// LoadingBlock bọc chúng, đặt aria-busy và đọc "Đang tải…" cho trình đọc màn hình.
import type { ReactNode } from "react";

export type SkeletonWidth = "xs" | "sm" | "md" | "lg" | "xl" | "full";

/** Một thanh chữ. `size` theo cỡ chữ sẽ hiện (xs 12px … stat 24px); `width` theo độ dài chữ dự kiến. */
export function SkeletonLine({
  width = "md",
  size = "md",
  className,
}: {
  width?: SkeletonWidth;
  size?: "xs" | "sm" | "md" | "lg" | "stat" | "title";
  className?: string;
}) {
  return <span className={["skel", "skel-line", `w-${width}`, `fs-${size}`, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}

/** Hình chữ nhật tùy ý (biểu đồ, ảnh): cao theo lớp `h-*`. */
export function SkeletonBlock({ height = "md", className }: { height?: "sm" | "md" | "lg" | "chart"; className?: string }) {
  return <span className={["skel", "skel-block", `h-${height}`, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}

/** Cùng khung với Stat: nhãn, số, ghi chú. Đặt trong StatGrid. */
export function SkeletonStat({ note = true }: { note?: boolean }) {
  return (
    <div className="stat is-skeleton" aria-hidden="true">
      <span className="stat-label">
        <SkeletonLine width="md" size="sm" />
      </span>
      <span className="stat-value">
        <SkeletonLine width="lg" size="stat" />
      </span>
      <span className="stat-foot">{note && <SkeletonLine width="sm" size="xs" />}</span>
    </div>
  );
}

const ROW_WIDTHS: readonly SkeletonWidth[] = ["md", "lg", "sm", "xl", "md", "sm"];

/** Các dòng <tr> chờ cho thân bảng (cùng chiều cao dòng thật). Dùng trong <tbody>. `cellClass`: lớp căn lề của từng cột. */
export function SkeletonRows({ rows = 5, columns, cellClass }: { rows?: number; columns: number; cellClass?: readonly (string | undefined)[] }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="skel-row" aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className={cellClass?.[c]}>
              <SkeletonLine width={ROW_WIDTHS[(r + c) % ROW_WIDTHS.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Bảng chờ đầy đủ (đầu bảng có chữ thật, thân là SkeletonRows), cùng khung với DataTable. */
export function SkeletonTable({ headers, rows = 5 }: { headers: readonly string[]; rows?: number }) {
  return (
    <LoadingBlock>
      <div className="table-wrap dt">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={`${i}-${h}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SkeletonRows rows={rows} columns={headers.length} />
          </tbody>
        </table>
      </div>
    </LoadingBlock>
  );
}

/**
 * Vùng đang tải: aria-busy, và một dòng ẩn "Đang tải…" (hay `label`) cho trình đọc màn hình. Không có children thì vẽ ba
 * thanh chữ mặc định.
 */
export function LoadingBlock({ label = "Đang tải…", children, className }: { label?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={className ? `loading-block ${className}` : "loading-block"} aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {children ?? (
        <div className="skel-stack">
          <SkeletonLine width="xl" />
          <SkeletonLine width="lg" />
          <SkeletonLine width="md" />
        </div>
      )}
    </div>
  );
}
