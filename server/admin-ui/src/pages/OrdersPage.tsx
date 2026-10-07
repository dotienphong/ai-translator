import { useState } from "react";
import { api } from "../api/endpoints";
import type { OrderStatus } from "../api/types";
import { orderColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { DateInput, RANGE_ERROR, Select } from "../components/Field";
import { ORDER_LABELS, PLAN_LABELS } from "../components/StatusBadge";
import { usePaged } from "../hooks";

const STATUS_OPTIONS = [["", "Tất cả"], ...(Object.entries(ORDER_LABELS) as [OrderStatus, string][])] as const;
export const PLAN_OPTIONS = [["", "Tất cả"], ...Object.entries(PLAN_LABELS)] as const;

export function OrdersPage() {
  const [f, setF] = useState({ status: "", plan: "", from: "", to: "" });
  // Khoảng ngày ngược thì không gọi API, chỉ báo lỗi.
  const rangeInvalid = f.from !== "" && f.to !== "" && f.from > f.to;
  const list = usePaged(
    (cursor) => (rangeInvalid ? Promise.resolve({ items: [], next_cursor: null }) : api.orders({ ...f, cursor })),
    [f.status, f.plan, f.from, f.to],
  );
  return (
    <>
      <h1>Đơn hàng</h1>
      <div className="filters">
        <Select label="Trạng thái" value={f.status} options={STATUS_OPTIONS} onChange={(status) => setF({ ...f, status })} />
        <Select label="Gói" value={f.plan} options={PLAN_OPTIONS} onChange={(plan) => setF({ ...f, plan })} />
        <DateInput label="Tạo từ ngày" value={f.from} onChange={(from) => setF({ ...f, from })} />
        <DateInput label="Đến ngày" value={f.to} onChange={(to) => setF({ ...f, to })} />
        {rangeInvalid && (
          <span className="error" role="alert">
            {RANGE_ERROR}
          </span>
        )}
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!rangeInvalid && (
        <DataTable
          columns={orderColumns}
          rows={list.rows}
          rowKey={(o) => String(o.order_code)}
          empty="Không có đơn nào"
          hasMore={list.hasMore}
          loading={list.loading}
          onMore={list.more}
        />
      )}
    </>
  );
}
