// Kết quả tra cứu theo email hay license key (spec Web Admin §4.2). Từ khóa lấy từ kho trong bộ nhớ (search.ts).
import { useEffect } from "react";
import { api } from "../api/endpoints";
import { licenseColumns, orderColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { nowSec } from "../format";
import { useLoad } from "../hooks";
import { navigate } from "../router";
import { singleTarget, useSearch } from "../search";

export function SearchPage() {
  const s = useSearch();
  const res = useLoad(() => (s ? api.lookup(s.query) : Promise.resolve(null)), [s?.seq]);
  useEffect(() => {
    if (!res.data) return;
    const to = singleTarget(res.data);
    if (to) navigate(to, { replace: true });
  }, [res.data]);
  if (!s) return <p className="muted">Nhập email hay license key vào ô tra cứu ở trên.</p>;
  const now = nowSec();
  return (
    <>
      <h1>Kết quả tra cứu</h1>
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.loading && <p className="muted">Đang tìm…</p>}
      {res.data && !res.loading && (
        <>
          {res.data.licenses.length === 0 && res.data.orders.length === 0 && <p>Không tìm thấy gì.</p>}
          {res.data.licenses.length > 0 && (
            <>
              <h2>License</h2>
              <DataTable columns={licenseColumns(now)} rows={res.data.licenses} rowKey={(l) => l.id} rowHref={(l) => `/licenses/${l.id}`} empty="" />
            </>
          )}
          {res.data.orders.length > 0 && (
            <>
              <h2>Đơn hàng</h2>
              <DataTable columns={orderColumns(now)} rows={res.data.orders} rowKey={(o) => String(o.order_code)} rowHref={(o) => `/orders/${o.order_code}`} empty="" />
            </>
          )}
        </>
      )}
    </>
  );
}
