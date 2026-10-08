// Cột dùng chung cho các bảng đơn, license, nhật ký.
import type { AuditRow, LicenseAuditRow, LicenseDetail, LicenseRow, OrderRow } from "../api/types";
import { daysLeft, fmtDate, fmtDateTime, fmtDetail, fmtVnd, maskKey } from "../format";
import { Link } from "../router";
import type { Column } from "./DataTable";
import { LicenseBadges, OrderStatusBadge, PLAN_LABELS } from "./StatusBadge";

export const orderColumns: Column<OrderRow>[] = [
  { header: "Mã đơn", cell: (o) => <Link to={`/orders/${o.order_code}`}>#{o.order_code}</Link> },
  { header: "Tạo lúc", cell: (o) => fmtDateTime(o.created_at), nowrap: true },
  { header: "Email", cell: (o) => o.email ?? "—" },
  { header: "Gói", cell: (o) => PLAN_LABELS[o.plan] },
  {
    header: "Số tiền",
    align: "right",
    nowrap: true,
    cell: (o) => (o.amount_paid === o.amount ? fmtVnd(o.amount) : `${fmtVnd(o.amount_paid)} / ${fmtVnd(o.amount)}`),
  },
  { header: "Trạng thái", cell: (o) => <OrderStatusBadge status={o.status} /> },
];

export type LicenseLike = LicenseRow | LicenseDetail;

export function activeDevices(l: LicenseLike): number {
  return "active_devices" in l ? l.active_devices : l.activations.filter((a) => a.deactivated_at === null).length;
}

export function licenseColumns(now: number): Column<LicenseLike>[] {
  return [
    {
      header: "Key",
      cell: (l) => (
        <Link to={`/licenses/${l.id}`}>
          <code>{maskKey(l.license_key)}</code>
        </Link>
      ),
    },
    { header: "Email", cell: (l) => l.email ?? "—" },
    { header: "Gói", cell: (l) => PLAN_LABELS[l.plan] },
    { header: "Hết hạn", cell: (l) => `${fmtDate(l.expires_at)} (${daysLeft(l.expires_at, now)})` },
    { header: "Máy", align: "right", cell: (l) => String(activeDevices(l)) },
    {
      header: "Trạng thái",
      cell: (l) => (
        <LicenseBadges
          license={{ revoked_at: l.revoked_at, expires_at: l.expires_at, locked_at: l.locked_at, conflict: activeDevices(l) > 1 }}
          now={now}
        />
      ),
    },
  ];
}

export type AnyAudit = AuditRow | LicenseAuditRow;

export const auditColumns: Column<AnyAudit>[] = [
  { header: "Thời điểm", cell: (a) => fmtDateTime(a.at), nowrap: true },
  { header: "Ai", cell: (a) => a.actor },
  { header: "Việc", cell: (a) => <code>{a.action}</code> },
  {
    header: "License",
    cell: (a) => ("license_id" in a && a.license_id ? <Link to={`/licenses/${a.license_id}`}>{a.license_id.slice(0, 8)}</Link> : ""),
  },
  { header: "Đơn", cell: (a) => (a.order_code !== null ? <Link to={`/orders/${a.order_code}`}>#{a.order_code}</Link> : "") },
  { header: "Chi tiết", cell: (a) => <span className="detail">{fmtDetail(a.detail)}</span> },
];
