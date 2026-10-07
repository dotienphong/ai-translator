// Trang mở đầu (spec Web Admin §4.2): ba số nhanh và sáu nhóm việc cần xử lý.
import type { ReactNode } from "react";
import { api } from "../api/endpoints";
import type { AlertRow, LicenseRow, OrderRow, Queue, QueueGroup } from "../api/types";
import { ErrorBox } from "../components/Feedback";
import { fmtDateTime, fmtVnd, maskKey } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";

export function QueuePage() {
  const queue = useLoad(() => api.queue(), []);
  const summary = useLoad(() => api.summary(), []);
  return (
    <>
      <h1>Việc cần xử lý</h1>
      {summary.error && <ErrorBox error={summary.error} onRetry={summary.reload} />}
      {summary.data && (
        <div className="tiles">
          <Tile label="Doanh thu hôm nay" value={fmtVnd(summary.data.revenue_today)} />
          <Tile label="Đơn đã trả 7 ngày" value={String(summary.data.paid_orders_7d)} />
          <Tile label="License còn hạn" value={String(summary.data.active_licenses)} />
        </div>
      )}
      {queue.error && <ErrorBox error={queue.error} onRetry={queue.reload} />}
      {queue.loading && !queue.data && <p className="muted">Đang tải…</p>}
      {queue.data && <Groups q={queue.data} />}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
    </div>
  );
}

function Groups({ q }: { q: Queue }) {
  const total = q.needs_review.count + q.underpaid.count + q.email_failed.count + q.locked.count + q.conflict.count + q.alerts.count;
  if (total === 0) return <p className="all-clear">Không có việc gì cần xử lý.</p>;
  return (
    <>
      <Group title="Đã nhận tiền nhưng license đã thu hồi" hint="Mở đơn, chọn Cấp key mới hoặc Ghi đã hoàn tiền." group={q.needs_review} render={orderItem} />
      <Group title="Chuyển thiếu trong 30 ngày" hint="Khách chuyển bù thì mở đơn, bấm Cấp tay." group={q.underpaid} render={orderItem} />
      <Group title="Đã trả nhưng khách chưa nhận email key" hint="Mở license của đơn, bấm Gửi lại email; gửi được thì đơn rời nhóm này." group={q.email_failed} render={emailItem} />
      <Group title="License đang khóa tạm" hint="Xác minh với khách rồi bấm Mở khóa." group={q.locked} render={licenseItem} />
      <Group title="License đang xung đột máy" hint="Hỏi khách máy nào đang dùng, gỡ máy còn lại." group={q.conflict} render={licenseItem} />
      <Group title="Cảnh báo vận hành chưa gửi email" hint="Cron gửi email cảnh báo mỗi giờ. Còn ở đây lâu thì kiểm cron." group={q.alerts} render={alertItem} />
    </>
  );
}

function Group<T>({ title, hint, group, render }: { title: string; hint: string; group: QueueGroup<T>; render(item: T): ReactNode }) {
  if (group.count === 0) return null;
  return (
    <section className="queue-group">
      <h2>
        {title} <span className="count">{group.count}</span>
      </h2>
      <p className="muted">{hint}</p>
      <ul>
        {group.items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
      {group.count > group.items.length && <p className="muted">và {group.count - group.items.length} mục khác</p>}
    </section>
  );
}

const orderItem = (o: OrderRow) => (
  <>
    <Link to={`/orders/${o.order_code}`}>Đơn #{o.order_code}</Link> · {o.email ?? "—"} · {fmtVnd(o.amount_paid)} / {fmtVnd(o.amount)} ·{" "}
    {fmtDateTime(o.created_at)}
  </>
);

const emailItem = (o: OrderRow) => (
  <>
    {o.license_id ? (
      <Link to={`/licenses/${o.license_id}`}>License của đơn #{o.order_code}</Link>
    ) : (
      <Link to={`/orders/${o.order_code}`}>Đơn #{o.order_code}</Link>
    )}{" "}
    · {o.email ?? "—"} · thôi gửi lúc {fmtDateTime(o.email_gave_up_at)}
  </>
);

const licenseItem = (l: LicenseRow) => (
  <>
    <Link to={`/licenses/${l.id}`}>
      <code>{maskKey(l.license_key)}</code>
    </Link>{" "}
    · {l.email ?? "—"} · {l.active_devices} máy đang kích hoạt
  </>
);

const alertItem = (a: AlertRow) => (
  <>
    <code>{a.kind}</code> · {a.count} lần, đã báo {a.notified_count} · từ {fmtDateTime(a.window_start)}
  </>
);
