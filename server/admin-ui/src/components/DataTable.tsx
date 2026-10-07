import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell(row: T): ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T, index: number): string;
  empty: string;
  hasMore?: boolean;
  loading?: boolean;
  onMore?(): void;
}

/** Bảng dữ liệu; trên màn hình hẹp, CSS đổi mỗi dòng thành một thẻ, nhãn cột lấy từ data-label. */
export function DataTable<T>({ columns, rows, rowKey, empty, hasMore, loading, onMore }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)}>
                {columns.map((c) => (
                  <td key={c.header} data-label={c.header}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {(hasMore || (loading && rows.length === 0)) && (
        <div className="table-more">
          {hasMore ? (
            <button type="button" onClick={onMore} disabled={loading}>
              {loading ? "Đang tải…" : "Tải thêm"}
            </button>
          ) : (
            <span className="muted">Đang tải…</span>
          )}
        </div>
      )}
    </div>
  );
}
