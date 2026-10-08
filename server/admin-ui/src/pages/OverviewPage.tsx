// Trang Tổng quan (spec Web Admin phần 2, mục 4): số liệu từ GET /admin/stats, bốn nhóm Tiền, Khách hàng, Sức khỏe, Sử dụng.
import { api } from "../api/endpoints";
import type { GrantKind, OrderStatus, Stats } from "../api/types";
import { ChartCard } from "../components/ChartCard";
import { ErrorBox } from "../components/Feedback";
import { ORDER_LABELS, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDay, fmtHm, fmtMonth, fmtVnd } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";

/** Trạng thái đơn cần người xem khi số lớn hơn 0: nổi bật và dẫn tới danh sách đã lọc. */
const PROBLEM_STATUSES: readonly OrderStatus[] = ["underpaid", "failed", "paid_needs_review"];

const GRANT_LABELS: Record<GrantKind, string> = { new: "Mua mới", extend: "Gia hạn", change: "Đổi gói", other: "Khác" };
const GRANT_KINDS = Object.keys(GRANT_LABELS) as GrantKind[];
const STATUSES = Object.keys(ORDER_LABELS) as OrderStatus[];

/** " (33%)" khi `total` lớn hơn 0, chuỗi rỗng nếu không (tránh chia cho 0). */
const rate = (part: number, total: number) => (total > 0 ? ` (${Math.round((part * 100) / total)}%)` : "");

export function OverviewPage() {
  const stats = useLoad(() => api.stats(), []);
  return (
    <>
      <h1>Tổng quan</h1>
      <div className="overview-bar">
        <button type="button" onClick={stats.reload} disabled={stats.loading}>
          Làm mới
        </button>
        {stats.data && <span className="muted">Cập nhật lúc {fmtHm(stats.data.generated_at)}</span>}
      </div>
      {stats.error && <ErrorBox error={stats.error} onRetry={stats.reload} />}
      {stats.loading && !stats.data && <p className="muted">Đang tải…</p>}
      {stats.data && <Content s={stats.data} />}
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {note && <span className="tile-note">{note}</span>}
    </div>
  );
}

function Content({ s }: { s: Stats }) {
  const { money, customers, health, usage } = s;
  return (
    <>
      <div className="tiles">
        <Tile label="Doanh thu hôm nay" value={fmtVnd(money.today)} />
        <Tile label="Doanh thu 7 ngày" value={fmtVnd(money.last_7d)} />
        <Tile label="Doanh thu tháng này" value={fmtVnd(money.this_month)} note={`Tháng trước: ${fmtVnd(money.last_month)}`} />
        <Tile label="License đang hoạt động" value={String(usage.active_licenses)} />
        <Tile label="Máy đang kích hoạt" value={String(usage.active_devices)} />
      </div>

      <h2 className="group-title">Tiền</h2>
      <div className="chart-grid">
        <ChartCard
          title="Doanh thu 30 ngày gần nhất"
          labelHeader="Ngày"
          format={fmtVnd}
          series={[{ key: "revenue", label: "Doanh thu" }]}
          data={money.daily.map((d) => ({ label: fmtDay(d.day), revenue: d.revenue }))}
        />
        <ChartCard
          title="Doanh thu 12 tháng, theo gói"
          labelHeader="Tháng"
          stacked
          format={fmtVnd}
          series={[
            { key: "monthly", label: PLAN_LABELS.monthly },
            { key: "yearly", label: PLAN_LABELS.yearly },
          ]}
          data={money.monthly.map((m) => ({ label: fmtMonth(m.month), monthly: m.monthly.revenue, yearly: m.yearly.revenue }))}
        />
      </div>

      <h2 className="group-title">Khách hàng</h2>
      <div className="chart-grid">
        <section className="panel">
          <h3>Dùng thử sang trả phí</h3>
          <ul className="plain">
            <li>{`30 ngày gần nhất: ${customers.trials_30d} máy dùng thử, đã mua ${customers.trials_30d_purchased}${rate(customers.trials_30d_purchased, customers.trials_30d)}`}</li>
            <li>{`Từ trước đến nay: ${customers.trials_total} máy dùng thử, đã mua ${customers.trials_total_purchased}${rate(customers.trials_total_purchased, customers.trials_total)}`}</li>
          </ul>
          <h3>Đơn đã trả trong 30 ngày</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Loại</th>
                  <th>Số đơn</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {GRANT_KINDS.map((k) => (
                  <tr key={k}>
                    <td data-label="Loại">{GRANT_LABELS[k]}</td>
                    <td data-label="Số đơn">{customers.grants_30d[k].orders}</td>
                    <td data-label="Doanh thu">{fmtVnd(customers.grants_30d[k].revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <ChartCard
          title="Mua mới, gia hạn, đổi gói theo tháng"
          labelHeader="Tháng"
          stacked
          series={GRANT_KINDS.map((k) => ({ key: k, label: GRANT_LABELS[k] }))}
          data={customers.grants_monthly.map((m) => ({ label: fmtMonth(m.month), new: m.new, extend: m.extend, change: m.change, other: m.other }))}
        />
      </div>

      <h2 className="group-title">Sức khỏe</h2>
      <div className="chart-grid">
        <section className="panel">
          <h3>Đơn 30 ngày theo trạng thái</h3>
          <ul className="status-list">
            {STATUSES.map((st) => {
              const n = health.orders_30d[st];
              const body = (
                <>
                  <span>{ORDER_LABELS[st]}</span>
                  <strong>{n}</strong>
                </>
              );
              return (
                <li key={st}>
                  {PROBLEM_STATUSES.includes(st) && n > 0 ? (
                    <Link to={`/orders?status=${st}`} className="attention">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel">
          <h3>Cần chú ý</h3>
          <ul className="plain">
            <li>{`Sắp hết hạn trong 7 ngày: ${health.expiring_7d}`}</li>
            <li>{`Sắp hết hạn trong 30 ngày: ${health.expiring_30d}`}</li>
            <li>
              {health.email.paid_with_email_30d > 0
                ? `Email key đã gửi: ${health.email.sent}/${health.email.paid_with_email_30d}`
                : "Chưa có đơn nào có email trong 30 ngày"}
            </li>
          </ul>
        </section>
      </div>

      <h2 className="group-title">Sử dụng</h2>
      <div className="chart-grid">
        <section className="panel">
          <h3>Máy</h3>
          <ul className="plain">
            <li>{`Đang kích hoạt: ${usage.active_devices}`}</li>
            <li>{`Hoạt động trong 7 ngày gần nhất: ${usage.devices_7d}`}</li>
            <li>{`Dùng thử còn hạn: ${usage.trials_active}`}</li>
          </ul>
        </section>
        <ChartCard
          title="Máy dùng thử mới mỗi ngày"
          labelHeader="Ngày"
          series={[{ key: "count", label: "Máy dùng thử mới" }]}
          data={usage.new_trials_daily.map((d) => ({ label: fmtDay(d.day), count: d.count }))}
        />
      </div>
    </>
  );
}
