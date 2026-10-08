// Cột dùng chung cho các bảng đơn, license, nhật ký: trang danh sách, bảng con của trang chi tiết và trang tra cứu.
// `now` (giây) là mốc của lần tải: mọi thời gian tương đối trong bảng tính theo cùng một mốc.
import type { ReactNode } from "react";
import type { AuditRow, LicenseAuditRow, LicenseDetail, LicenseRow, OrderRow, OrderStatus } from "../api/types";
import { ACTOR_LABELS, type ActorKind, actionLabel, actionTone, actorKind } from "../audit-labels";
import { daysLeft, fmtAgo, fmtDate, fmtDateTime, fmtDetail, fmtHm, fmtVnd, maskKey } from "../format";
import { Link } from "../router";
import { Badge } from "./Badge";
import type { Column } from "./DataTable";
import { IconCoins, IconMonitor, IconRefresh, IconUser } from "./icons";
import { RelTime } from "./RelTime";
import { LicenseBadges, OrderStatusBadge, PLAN_LABELS } from "./StatusBadge";

const DAY = 86400;

/* ---------- Ô dùng chung ---------- */

/** Ô hai dòng: giá trị chính, dưới là dòng phụ nhỏ (ngày giờ đầy đủ, số còn thiếu…). */
export function Cell2({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <span className="cell-2">
      <span>{main}</span>
      {sub !== undefined && <span className="cell-sub">{sub}</span>}
    </span>
  );
}

/** Thời gian tương đối, dưới là ngày giờ đầy đủ GMT+7. Mốc từ 30 ngày trước trở đi thì dòng trên đã là ngày, dòng dưới chỉ
 *  còn giờ (không lặp ngày hai lần). */
export function WhenCell({ sec, now }: { sec: number; now: number }) {
  const absolute = fmtAgo(sec, now) === fmtDate(sec);
  return <Cell2 main={<RelTime sec={sec} now={now} />} sub={absolute ? fmtHm(sec) : fmtDateTime(sec)} />;
}

/** Email cắt bằng dấu chấm lửng (đầy đủ ở title); không có thì ghi rõ. */
export function EmailCell({ email }: { email: string | null }) {
  return email ? (
    <span className="cell-email" title={email}>
      {email}
    </span>
  ) : (
    <span className="cell-none">Không có email</span>
  );
}

/** Chấm tông trong lề trái của hàng cần để mắt (mã vẫn thẳng cột với tiêu đề). Chỉ để nhìn: huy hiệu trạng thái đã nói. */
function Flag({ tone }: { tone?: "warn" | "bad" }) {
  return tone ? <span className={`row-flag tone-${tone}`} aria-hidden="true" /> : null;
}

/* ---------- Đơn ---------- */

const ORDER_FLAG: Partial<Record<OrderStatus, "warn" | "bad">> = { underpaid: "warn", paid_needs_review: "bad", failed: "bad" };

function Amount({ o }: { o: OrderRow }) {
  if (o.amount_paid === o.amount) return fmtVnd(o.amount);
  // Chưa nhận đồng nào: số cần trả, chữ mờ (đơn chờ trả, hết hạn link, đã hủy).
  if (o.amount_paid === 0) {
    return (
      <span className="cell-none" title={`Chưa nhận tiền, cần trả ${fmtVnd(o.amount)}`}>
        {fmtVnd(o.amount)}
      </span>
    );
  }
  const short = o.amount - o.amount_paid;
  return (
    <Cell2
      main={
        <>
          {fmtVnd(o.amount_paid)}
          <span className="cell-of">{` / ${fmtVnd(o.amount)}`}</span>
        </>
      }
      sub={short > 0 ? <span className="text-warn">{`thiếu ${fmtVnd(short)}`}</span> : `dư ${fmtVnd(-short)}`}
    />
  );
}

export function orderColumns(now: number): Column<OrderRow>[] {
  return [
    {
      header: "Mã đơn",
      cell: (o) => (
        <span className="cell-id">
          <Flag tone={ORDER_FLAG[o.status]} />
          <Link to={`/orders/${o.order_code}`} className="row-id">
            #{o.order_code}
          </Link>
        </span>
      ),
    },
    { header: "Tạo lúc", nowrap: true, cell: (o) => <WhenCell sec={o.created_at} now={now} /> },
    { header: "Email", cell: (o) => <EmailCell email={o.email} /> },
    { header: "Gói", cell: (o) => PLAN_LABELS[o.plan] ?? o.plan },
    { header: "Số tiền", align: "right", nowrap: true, cell: (o) => <Amount o={o} /> },
    { header: "Trạng thái", aside: true, cell: (o) => <OrderStatusBadge status={o.status} /> },
  ];
}

/* ---------- License ---------- */

export type LicenseLike = LicenseRow | LicenseDetail;

export function activeDevices(l: LicenseLike): number {
  return "active_devices" in l ? l.active_devices : l.activations.filter((a) => a.deactivated_at === null).length;
}

function Expiry({ l, now }: { l: LicenseLike; now: number }) {
  const left = l.expires_at - now;
  // Còn dưới 7 ngày (và chưa thu hồi): tông cảnh báo; đã hết hạn hay đã thu hồi: chữ mờ.
  const cls = l.revoked_at !== null || left <= 0 ? "cell-none" : left < 7 * DAY ? "text-warn" : undefined;
  return <Cell2 main={<span className={cls}>{daysLeft(l.expires_at, now)}</span>} sub={fmtDate(l.expires_at)} />;
}

export function licenseColumns(now: number): Column<LicenseLike>[] {
  return [
    {
      header: "Key",
      cell: (l) => (
        <Link to={`/licenses/${l.id}`} className="row-id mono">
          {maskKey(l.license_key)}
        </Link>
      ),
    },
    { header: "Email", cell: (l) => <EmailCell email={l.email} /> },
    { header: "Gói", cell: (l) => PLAN_LABELS[l.plan] ?? l.plan },
    { header: "Hạn dùng", nowrap: true, cell: (l) => <Expiry l={l} now={now} /> },
    {
      header: "Số máy",
      align: "right",
      cell: (l) => {
        const n = activeDevices(l);
        return (
          <span className={n > 1 ? "text-warn" : n === 0 ? "cell-none" : undefined} title={`${n} máy đang kích hoạt`}>
            {n}
          </span>
        );
      },
    },
    {
      header: "Trạng thái",
      aside: true,
      cell: (l) => (
        <span className="cell-badges">
          <LicenseBadges
            license={{ revoked_at: l.revoked_at, expires_at: l.expires_at, locked_at: l.locked_at, conflict: activeDevices(l) > 1 }}
            now={now}
          />
        </span>
      ),
    },
  ];
}

/* ---------- Nhật ký ---------- */

export type AnyAudit = AuditRow | LicenseAuditRow;

const ACTOR_ICON: Record<ActorKind, ReactNode> = {
  admin: <IconUser size={13} />,
  api: <IconMonitor size={13} />,
  webhook: <IconCoins size={13} />,
  reconcile: <IconRefresh size={13} />,
};

/** Tác nhân: huy hiệu trung tính có biểu tượng theo loại (không dùng màu ngữ nghĩa cho phân loại); tên đầy đủ ở title. */
export function ActorBadge({ actor }: { actor: string }) {
  const k = actorKind(actor);
  return (
    <Badge icon={k ? ACTOR_ICON[k] : undefined} dot={false} title={actor} className="actor-badge">
      {k ? ACTOR_LABELS[k] : actor}
    </Badge>
  );
}

/** Tên dễ đọc (có chấm tông) và mã hành động (mono); mã lạ thì chỉ có mã. */
export function ActionCell({ action }: { action: string }) {
  const label = actionLabel(action);
  return (
    <span className="cell-action">
      <span className={`act-dot tone-${actionTone(action)}`} aria-hidden="true" />
      <Cell2 main={label ?? <code>{action}</code>} sub={label ? <code>{action}</code> : undefined} />
    </span>
  );
}

/** Liên kết tới license và đơn của dòng nhật ký. `omit`: bỏ liên kết tới chính trang đang xem (nhật ký trong trang đơn). */
export function AuditLinks({ a, omit }: { a: AnyAudit; omit?: "order" }) {
  return (
    <span className="cell-links">
      {"license_id" in a && a.license_id && (
        <Link to={`/licenses/${a.license_id}`}>
          <span className="link-kind">License</span> <span className="mono">{a.license_id.slice(0, 8)}</span>
        </Link>
      )}
      {a.order_code !== null && omit !== "order" && (
        <Link to={`/orders/${a.order_code}`}>
          <span className="link-kind">Đơn</span> <span className="mono">#{a.order_code}</span>
        </Link>
      )}
    </span>
  );
}

export function auditColumns(now: number): Column<AnyAudit>[] {
  return [
    { header: "Thời điểm", nowrap: true, cell: (a) => <WhenCell sec={a.at} now={now} /> },
    { header: "Tác nhân", cell: (a) => <ActorBadge actor={a.actor} /> },
    { header: "Hành động", primary: true, cell: (a) => <ActionCell action={a.action} /> },
    { header: "Liên quan", cell: (a) => <AuditLinks a={a} /> },
    {
      header: "Chi tiết",
      cell: (a) => {
        const d = fmtDetail(a.detail);
        return d ? (
          <span className="cell-detail" title={d}>
            {d}
          </span>
        ) : null;
      },
    },
  ];
}
