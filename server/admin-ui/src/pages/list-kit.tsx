// Phần chung của bốn trang danh sách (Đơn hàng, License, Máy & dùng thử, Nhật ký; spec giao diện mới mục 2): đầu trang có
// giờ cập nhật và nút Làm mới, mốc "bây giờ" của lần tải, dòng đếm kết quả, trạng thái rỗng phân biệt "chưa có dữ liệu"
// với "không có kết quả khớp bộ lọc", ô SegmentedControl có nhãn như các ô lọc khác.
//
// Bấm hàng: trang mà mỗi dòng là một thực thể có trang riêng (đơn, license, máy) cho bấm cả hàng để mở; ô định danh vẫn
// là liên kết thật (bàn phím, trình đọc màn hình, mở thẻ mới), bôi chọn chữ không mở trang (DataTable rowHref). Nhật ký:
// mỗi dòng là một sự kiện, không có trang riêng và có thể trỏ tới hai nơi (license, đơn), nên chỉ có liên kết.
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "../components/Button";
import type { DataTableProps } from "../components/DataTable";
import { countText } from "../components/DataTable";
import { IconClock, IconClose, IconRefresh } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { type SegmentOption, SegmentedControl } from "../components/SegmentedControl";
import { SkeletonLine } from "../components/Skeleton";
import { fmtHm, nowSec } from "../format";
import type { Paged } from "../hooks";

export interface ListView {
  /** Mốc giây của lần tải xong gần nhất; null khi chưa tải xong lần nào. */
  loadedAt: number | null;
  /** Mốc cho thời gian tương đối trong bảng. */
  now: number;
  /** Lần tải đầu, chưa có dòng nào: bảng hiện dòng chờ. */
  firstLoad: boolean;
  /** Dòng đang hiện thuộc bộ lọc cũ (kết quả của bộ lọc mới đang về). */
  stale: boolean;
}

/** Theo dõi lần tải của usePaged: `filterKey` đổi khi bộ lọc đổi (usePaged giữ dòng cũ trong lúc tải bộ lọc mới). */
export function useListView<T>(list: Paged<T>, filterKey: string): ListView {
  const [shown, setShown] = useState<{ key: string; at: number } | null>(null);
  // Chạy khi lần tải xong (loading về false): ghi lại dòng đang hiện thuộc bộ lọc nào, tải xong lúc nào.
  useEffect(() => {
    if (!list.loading) setShown({ key: filterKey, at: nowSec() });
  }, [list.loading]);
  const firstLoad = list.loading && list.rows.length === 0 && shown === null;
  return { loadedAt: shown?.at ?? null, now: shown?.at ?? nowSec(), firstLoad, stale: shown !== null && shown.key !== filterKey };
}

export function ListHeader({
  title,
  description,
  view,
  loading,
  onReload,
  actions,
}: {
  title: string;
  description: string;
  view: ListView;
  loading: boolean;
  onReload(): void;
  /** Nút đứng trước Làm mới (chế độ xem…) hay sau (hành động chính). */
  actions?: { before?: ReactNode; after?: ReactNode };
}) {
  return (
    <PageHeader
      title={title}
      description={
        <p className="page-meta">
          <span>{description}</span>
          {view.loadedAt !== null && (
            <span className="page-meta-time">
              <IconClock size={14} />
              <span>Cập nhật lúc {fmtHm(view.loadedAt)}</span>
            </span>
          )}
        </p>
      }
      actions={
        <>
          {actions?.before}
          <Button icon={<IconRefresh size={16} />} loading={loading} onClick={onReload}>
            Làm mới
          </Button>
          {actions?.after}
        </>
      }
    />
  );
}

/** Dòng đếm của FilterBar: "12 đơn", "50+ đơn" (còn trang sau); đang tải thì thanh chờ cùng cỡ. */
export function ResultCount({ n, unit, hasMore, view }: { n: number; unit: string; hasMore: boolean; view: ListView }) {
  if (view.firstLoad || view.stale) {
    return (
      <span className="count-wait">
        <SkeletonLine width="xs" size="sm" />
        <span className="sr-only">Đang tải…</span>
      </span>
    );
  }
  const text = countText(n, unit, hasMore);
  const cut = text.indexOf(" ");
  return (
    <>
      <strong>{text.slice(0, cut)}</strong>
      {text.slice(cut)}
    </>
  );
}

/**
 * Thuộc tính trạng thái rỗng cho DataTable: cùng tiêu đề, nhưng khi đang lọc thì biểu tượng kính lúp, gợi ý "không khớp bộ
 * lọc" và nút xóa lọc; khi không lọc thì gợi ý dữ liệu sẽ đến từ đâu.
 */
export function emptyProps<T>(
  filtered: boolean,
  onClear: () => void,
  hint: { empty: ReactNode; filtered: ReactNode },
): Pick<DataTableProps<T>, "emptyVariant" | "emptyHint" | "emptyAction"> {
  if (!filtered) return { emptyHint: hint.empty };
  return {
    emptyVariant: "no-results",
    emptyHint: hint.filtered,
    emptyAction: (
      <Button size="sm" icon={<IconClose size={16} />} onClick={onClear}>
        Xóa bộ lọc
      </Button>
    ),
  };
}

/** "2026-10-05" (giá trị ô ngày) thành "05/10/2026" cho chip lọc. */
export function isoDay(v: string): string {
  return v.split("-").reverse().join("/");
}

/** SegmentedControl có nhãn nhỏ phía trên, thẳng hàng với Select và ô ngày trong FilterBar. Nhãn đọc qua aria-label. */
export function SegmentField<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly SegmentOption<NoInfer<V>>[];
  onChange(v: NoInfer<V>): void;
}) {
  return (
    <div className="field seg-field">
      <span className="field-label" aria-hidden="true">
        {label}
      </span>
      <SegmentedControl label={label} value={value} options={options} onChange={onChange} className="seg-fill" />
    </div>
  );
}
