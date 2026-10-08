// Danh sách đơn (spec Web Admin §4.2; giao diện mới mục 2): lọc theo trạng thái, gói, khoảng ngày tạo (server lọc); bấm
// hàng để mở đơn. Hàng chuyển thiếu, cần xử lý, lỗi có chấm tông ở đầu.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { OrderStatus } from "../api/types";
import { Card } from "../components/Card";
import { orderColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox } from "../components/Feedback";
import { DateInput, RANGE_ERROR, Select } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { Button } from "../components/Button";
import { ORDER_LABELS, PLAN_LABELS } from "../components/StatusBadge";
import { usePaged } from "../hooks";
import { emptyProps, isoDay, ListHeader, ResultCount, useListView } from "./list-kit";

const STATUS_OPTIONS = [["", "Tất cả"], ...(Object.entries(ORDER_LABELS) as [OrderStatus, string][])] as const;
export const PLAN_OPTIONS = [["", "Tất cả"], ...Object.entries(PLAN_LABELS)] as const;

const NO_FILTER = { status: "", plan: "", from: "", to: "" };

/** Trạng thái lọc ban đầu từ `?status=` (liên kết từ trang Tổng quan, Việc cần xử lý); giá trị ngoài danh sách thì bỏ. */
function initialStatus(): string {
  const v = new URLSearchParams(window.location.search).get("status") ?? "";
  return Object.hasOwn(ORDER_LABELS, v) ? v : "";
}

export function OrdersPage() {
  const [f, setF] = useState(() => ({ ...NO_FILTER, status: initialStatus() }));
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  // Khoảng ngày ngược thì không gọi API, chỉ báo lỗi.
  const rangeInvalid = f.from !== "" && f.to !== "" && f.from > f.to;
  const list = usePaged(
    (cursor) => (rangeInvalid ? Promise.resolve({ items: [], next_cursor: null }) : api.orders({ ...f, cursor })),
    [f.status, f.plan, f.from, f.to],
  );
  const view = useListView(list, JSON.stringify(f));
  const chips: FilterChip[] = [];
  if (f.status) chips.push({ key: "status", name: "Trạng thái", value: ORDER_LABELS[f.status as OrderStatus], onRemove: () => set({ status: "" }) });
  if (f.plan) chips.push({ key: "plan", name: "Gói", value: PLAN_LABELS[f.plan as keyof typeof PLAN_LABELS], onRemove: () => set({ plan: "" }) });
  if (f.from) chips.push({ key: "from", name: "Từ ngày", value: isoDay(f.from), onRemove: () => set({ from: "" }) });
  if (f.to) chips.push({ key: "to", name: "Đến ngày", value: isoDay(f.to), onRemove: () => set({ to: "" }) });
  const clear = () => setF(NO_FILTER);

  return (
    <>
      <ListHeader
        title="Đơn hàng"
        description="Mọi đơn mua và gia hạn, mới nhất ở trên."
        view={view}
        loading={list.loading}
        onReload={list.reload}
      />
      <FilterBar
        chips={chips}
        onClear={clear}
        count={rangeInvalid || (list.error && list.rows.length === 0) ? undefined : <ResultCount n={list.rows.length} unit="đơn" hasMore={list.hasMore} view={view} />}
        error={rangeInvalid ? RANGE_ERROR : undefined}
      >
        <Select label="Trạng thái" value={f.status} options={STATUS_OPTIONS} onChange={(status) => set({ status })} />
        <Select label="Gói" value={f.plan} options={PLAN_OPTIONS} onChange={(plan) => set({ plan })} />
        <DateInput label="Tạo từ ngày" value={f.from} invalid={rangeInvalid} onChange={(from) => set({ from })} />
        <DateInput label="Đến ngày" value={f.to} invalid={rangeInvalid} onChange={(to) => set({ to })} />
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách đơn" />}
      {rangeInvalid ? (
        <Card aria-label="Khoảng ngày không hợp lệ">
          <EmptyState
            variant="no-results"
            title="Khoảng ngày bị ngược"
            hint="Ngày bắt đầu đang sau ngày kết thúc. Sửa một trong hai ô, hay bỏ khoảng ngày để xem lại mọi đơn."
            action={
              <Button size="sm" onClick={() => set({ from: "", to: "" })}>
                Bỏ khoảng ngày
              </Button>
            }
          />
        </Card>
      ) : (
        !(list.error && list.rows.length === 0) && (
          <Card flush aria-label="Danh sách đơn" className="list-card">
            <DataTable
              flush
              caption="Danh sách đơn"
              columns={orderColumns(view.now)}
              rows={list.rows}
              rowKey={(o) => String(o.order_code)}
              rowHref={(o) => `/orders/${o.order_code}`}
              empty="Không có đơn nào"
              {...emptyProps(chips.length > 0, clear, {
                empty: "Đơn mới hiện ở đây khi khách bấm mua hay gia hạn trong app.",
                filtered: "Không có đơn khớp bộ lọc đang chọn. Bỏ bớt điều kiện hay xóa hết bộ lọc.",
              })}
              hasMore={list.hasMore}
              loading={list.loading}
              stale={view.stale}
              onMore={list.more}
              summary={list.hasMore ? `Đang hiện ${list.rows.length} đơn mới nhất` : undefined}
              skeletonRows={8}
            />
          </Card>
        )
      )}
    </>
  );
}
