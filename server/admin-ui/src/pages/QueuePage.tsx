// Trang mở đầu (spec Web Admin §4.2; giao diện mới mục 2): ba số nhanh và sáu nhóm việc cần xử lý, nhóm nặng nhất ở trên.
// Mỗi nhóm là một thẻ tông nguy hiểm hay cảnh báo; mỗi việc là một dòng (thông tin chính, số tiền hay trạng thái, thời
// gian tương đối, nút mở). Cả dòng bấm được: nút "Mở…" là link thật, vùng bấm của nó phủ cả dòng (CSS .q-go::after).
// Sau mỗi lần tải xong, số việc được đẩy vào kho dùng chung để huy hiệu ở thanh bên khớp với trang (queue-store.ts).
import { type ComponentType, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { api } from "../api/endpoints";
import type { AlertRow, LicenseRow, OrderRow, Queue, QueueGroup } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, type CardTone } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox } from "../components/Feedback";
import {
  IconAlert,
  IconArrowRight,
  IconCart,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCoins,
  IconKey,
  IconLock,
  IconMail,
  IconMonitor,
  type IconProps,
  IconRefresh,
  IconWarning,
} from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { RelTime } from "../components/RelTime";
import { LoadingBlock, SkeletonLine, SkeletonStat } from "../components/Skeleton";
import { Stat, StatGrid } from "../components/Stat";
import { PLAN_LABELS } from "../components/StatusBadge";
import { daysLeft, fmtDate, fmtDateTime, fmtHm, fmtInt, fmtVnd, maskKey, nowSec } from "../format";
import { useLoad } from "../hooks";
import { queueTotal, setQueueCount } from "../queue-store";
import { Link } from "../router";

export function QueuePage() {
  const queue = useLoad(() => api.queue(), []);
  const summary = useLoad(() => api.summary(), []);
  // Mốc "bây giờ" của lần tải: thời gian tương đối của mọi dòng tính theo cùng một mốc, và là giờ cập nhật ở đầu trang.
  const loadedAt = useMemo(() => (queue.data ? nowSec() : null), [queue.data]);
  useEffect(() => {
    if (queue.data) setQueueCount(queueTotal(queue.data));
  }, [queue.data]);
  const reload = () => {
    queue.reload();
    summary.reload();
  };
  const total = queue.data ? queueTotal(queue.data) : null;

  return (
    <>
      <PageHeader
        title="Việc cần xử lý"
        badges={
          total === null ? undefined : total > 0 ? (
            <Badge tone="warn" outline>{`${fmtInt(total)} việc đang chờ`}</Badge>
          ) : (
            <Badge tone="ok" outline>
              Đã xử lý hết
            </Badge>
          )
        }
        description={
          <p className="page-meta">
            <span>Đơn, license và cảnh báo cần người vận hành xem; nhóm nặng nhất ở trên.</span>
            {loadedAt !== null && (
              <span className="page-meta-time">
                <IconClock size={14} />
                <span>Cập nhật lúc {fmtHm(loadedAt)}</span>
              </span>
            )}
          </p>
        }
        actions={
          <Button icon={<IconRefresh size={16} />} loading={queue.loading || summary.loading} onClick={reload}>
            Làm mới
          </Button>
        }
      />

      {summary.error ? (
        <ErrorBox error={summary.error} onRetry={summary.reload} title="Không tải được số nhanh" />
      ) : summary.data ? (
        <StatGrid label="Số nhanh">
          <Stat label="Doanh thu hôm nay" value={fmtVnd(summary.data.revenue_today)} icon={<IconCoins />} tone="brand" />
          <Stat label="Đơn đã trả 7 ngày" value={fmtInt(summary.data.paid_orders_7d)} icon={<IconCart />} tone="info" />
          <Stat label="License còn hạn" value={fmtInt(summary.data.active_licenses)} icon={<IconKey />} tone="ok" />
        </StatGrid>
      ) : (
        <LoadingBlock label="Đang tải số nhanh…">
          <StatGrid>
            <SkeletonStat note={false} />
            <SkeletonStat note={false} />
            <SkeletonStat note={false} />
          </StatGrid>
        </LoadingBlock>
      )}

      {queue.error && <ErrorBox error={queue.error} onRetry={queue.reload} title="Không tải được hàng đợi" />}
      {queue.loading && !queue.data && <QueueSkeleton />}
      {queue.data && loadedAt !== null && <Groups q={queue.data} now={loadedAt} />}
    </>
  );
}

/* ---------- Nhóm việc ---------- */

function Groups({ q, now }: { q: Queue; now: number }) {
  if (queueTotal(q) === 0) {
    return (
      <Card aria-label="Không có việc cần xử lý" className="q-clear">
        <EmptyState
          variant="success"
          title="Không có việc gì cần xử lý"
          hint="Không có đơn kẹt tiền hay email key, không có license bị khóa hay xung đột máy, không có cảnh báo chưa gửi."
          action={
            <Button to="/overview" iconEnd={<IconArrowRight size={16} />}>
              Xem Tổng quan
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <div className="q-groups">
      <Group
        tone="danger"
        icon={IconAlert}
        title="Đã nhận tiền nhưng license đã thu hồi"
        hint="Mở đơn, chọn Cấp key mới hoặc Ghi đã hoàn tiền."
        group={q.needs_review}
        more={{ to: "/orders?status=paid_needs_review", where: "danh sách đơn cần xử lý" }}
        kind="order"
        rowKey={(o) => String(o.order_code)}
        render={(o) => <OrderItem o={o} now={now} />}
      />
      <Group
        tone="danger"
        icon={IconMail}
        title="Đã trả nhưng khách chưa nhận email key"
        hint="Mở license của đơn, bấm Gửi lại email; gửi được thì đơn rời nhóm này."
        group={q.email_failed}
        kind="order"
        rowKey={(o) => String(o.order_code)}
        render={(o) => <EmailItem o={o} now={now} />}
      />
      <Group
        tone="warn"
        icon={IconCoins}
        title="Chuyển thiếu trong 30 ngày"
        hint="Khách chuyển bù thì mở đơn, bấm Cấp tay."
        group={q.underpaid}
        more={{ to: "/orders?status=underpaid", where: "danh sách đơn chuyển thiếu" }}
        kind="order"
        rowKey={(o) => String(o.order_code)}
        render={(o) => <OrderItem o={o} now={now} />}
      />
      <Group
        tone="warn"
        icon={IconLock}
        title="License đang khóa tạm"
        hint="Xác minh với khách rồi bấm Mở khóa."
        group={q.locked}
        more={{ to: "/licenses?state=locked", where: "danh sách license khóa tạm" }}
        kind="license"
        rowKey={(l) => l.id}
        render={(l) => <LicenseItem l={l} now={now} when="locked" />}
      />
      <Group
        tone="warn"
        icon={IconMonitor}
        title="License đang xung đột máy"
        hint="Hỏi khách máy nào đang dùng, gỡ máy còn lại."
        group={q.conflict}
        more={{ to: "/licenses?state=conflict", where: "danh sách license xung đột máy" }}
        kind="license"
        rowKey={(l) => l.id}
        render={(l) => <LicenseItem l={l} now={now} when="expires" />}
      />
      <Group
        tone="warn"
        icon={IconWarning}
        title="Cảnh báo vận hành chưa gửi email"
        hint="Cron gửi email cảnh báo mỗi giờ. Còn ở đây lâu thì kiểm cron."
        group={q.alerts}
        // Danh sách đầy đủ ở trang Hệ thống: đã có nút ở đầu thẻ, nên "và N mục khác" chỉ là chữ (không hai lối cùng chỗ).
        actions={
          <Button to="/system" variant="ghost" size="sm" iconEnd={<IconArrowRight size={16} />}>
            Mở Hệ thống
          </Button>
        }
        kind="alert"
        rowKey={(a) => `${a.kind}|${a.window_start}`}
        render={(a) => <AlertItem a={a} now={now} />}
      />
    </div>
  );
}

interface GroupProps<T> {
  tone: CardTone;
  icon: ComponentType<IconProps>;
  title: string;
  hint: string;
  group: QueueGroup<T>;
  /** Danh sách đầy đủ ở trang khác: "và N mục khác" thành liên kết tới đó. */
  more?: { to: string; where: string };
  actions?: ReactNode;
  /** Bố cục cột của các dòng (đơn, license, cảnh báo). */
  kind: "order" | "license" | "alert";
  rowKey(item: T): string;
  render(item: T): ReactNode;
}

/** Số dòng hiện sẵn mỗi nhóm; nhiều hơn thì gấp lại (nút Hiện thêm) để mọi nhóm đều lọt vào màn hình đầu. */
export const ROWS_SHOWN = 5;

function Group<T>({ tone, icon: Icon, title, hint, group, more, actions, kind, rowKey, render }: GroupProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (group.count === 0) return null;
  const rest = group.count - group.items.length;
  const restText = `và ${fmtInt(rest)} mục khác`;
  // Gấp chỉ khi giấu được từ hai dòng trở lên (không có nút "Hiện thêm 1 dòng").
  const foldable = group.items.length > ROWS_SHOWN + 1;
  const items = foldable && !expanded ? group.items.slice(0, ROWS_SHOWN) : group.items;
  const hidden = group.items.length - ROWS_SHOWN;
  const restEl =
    rest > 0 ? (
      more ? (
        <Link to={more.to} className="q-more">
          <span>{restText}</span>
          <span className="sr-only">{`, mở ${more.where}`}</span>
          <IconArrowRight size={16} />
        </Link>
      ) : (
        <span className="q-more-text">{restText}</span>
      )
    ) : null;
  return (
    <Card
      tone={tone}
      icon={<Icon size={18} />}
      title={
        <span className="q-title">
          <span>{title}</span>
          <span className={`q-count tone-${tone}`} aria-hidden="true">
            {fmtInt(group.count)}
          </span>
          <span className="sr-only">{`, ${group.count} việc`}</span>
        </span>
      }
      description={hint}
      actions={actions}
      flush
      footer={
        foldable || restEl ? (
          <>
            {foldable ? (
              <Button
                variant="ghost"
                size="sm"
                className="q-fold"
                aria-expanded={expanded}
                aria-controls={listId}
                icon={expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                onClick={() => setExpanded((x) => !x)}
              >
                {expanded ? "Thu gọn" : `Hiện thêm ${hidden} dòng`}
              </Button>
            ) : (
              <span />
            )}
            {restEl}
          </>
        ) : undefined
      }
      className="q-group"
    >
      <ul className={`q-list q-${kind}`} id={listId}>
        {items.map((item, i) => (
          <li key={`${rowKey(item)}|${i}`} className="q-row">
            {render(item)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Dòng việc ---------- */

/** Nút mở trang chi tiết: chữ ngắn hiện ra, tên đầy đủ (bắt đầu bằng chữ hiện ra, kèm mã) cho trình đọc màn hình; vùng bấm
 *  phủ cả dòng. */
function Go({ to, label, target }: { to: string; label: string; target: string }) {
  return (
    <span className="q-act">
      <Button to={to} variant="ghost" size="sm" iconEnd={<IconArrowRight size={16} />} className="q-go" aria-label={`${label} ${target}`}>
        {label}
      </Button>
    </span>
  );
}

function When({ sec, now, prefix }: { sec: number; now: number; prefix?: string }) {
  return (
    <span className="q-when">
      <RelTime sec={sec} now={now} className="q-rel" />
      <span className="q-sub">{`${prefix ?? ""}${fmtDateTime(sec)}`}</span>
    </span>
  );
}

function OrderItem({ o, now }: { o: OrderRow; now: number }) {
  const short = o.amount_paid < o.amount;
  return (
    <>
      <span className="q-main">
        <span className="q-id">{`Đơn #${o.order_code}`}</span>
        <span className="q-sub q-email">{o.email ?? "Không có email"}</span>
      </span>
      <span className="q-meta">
        <span className="q-amount">
          {fmtVnd(o.amount_paid)}
          {short && <span className="q-of">{` / ${fmtVnd(o.amount)}`}</span>}
        </span>
        {short ? (
          <span className="q-sub q-short">{`thiếu ${fmtVnd(o.amount - o.amount_paid)}`}</span>
        ) : (
          <span className="q-sub">{`Gói ${PLAN_LABELS[o.plan] ?? o.plan}`}</span>
        )}
      </span>
      <When sec={o.created_at} now={now} />
      <Go to={`/orders/${o.order_code}`} label="Mở đơn" target={`#${o.order_code}`} />
    </>
  );
}

function EmailItem({ o, now }: { o: OrderRow; now: number }) {
  return (
    <>
      <span className="q-main">
        <span className="q-id">{`Đơn #${o.order_code}`}</span>
        <span className="q-sub q-email">{o.email ?? "Không có email"}</span>
      </span>
      <span className="q-meta">
        <span className="q-status">
          <IconMail size={14} />
          {o.email_gave_up_at === null ? "chưa gửi được sau 24 giờ" : `thôi gửi lúc ${fmtDateTime(o.email_gave_up_at)}`}
        </span>
        <span className="q-sub">{fmtVnd(o.amount_paid)}</span>
      </span>
      <When sec={o.created_at} now={now} />
      {o.license_id ? (
        <Go to={`/licenses/${o.license_id}`} label="Mở license" target={`của đơn #${o.order_code}`} />
      ) : (
        <Go to={`/orders/${o.order_code}`} label="Mở đơn" target={`#${o.order_code}`} />
      )}
    </>
  );
}

function LicenseItem({ l, now, when }: { l: LicenseRow; now: number; when: "locked" | "expires" }) {
  const key = maskKey(l.license_key);
  return (
    <>
      <span className="q-main">
        <code className="q-id q-key">{key}</code>
        <span className="q-sub q-email">{l.email ?? "Không có email"}</span>
      </span>
      <span className="q-meta">
        <span className="q-devices">{`${l.active_devices} máy đang kích hoạt`}</span>
        <span className="q-sub">{`Gói ${PLAN_LABELS[l.plan] ?? l.plan}`}</span>
      </span>
      {when === "locked" && l.locked_at !== null ? (
        <When sec={l.locked_at} now={now} prefix="khóa lúc " />
      ) : (
        <span className="q-when">
          <span className="q-rel">{daysLeft(l.expires_at, now)}</span>
          <span className="q-sub">{`hết hạn ${fmtDate(l.expires_at)}`}</span>
        </span>
      )}
      <Go to={`/licenses/${l.id}`} label="Mở license" target={key} />
    </>
  );
}

function AlertItem({ a, now }: { a: AlertRow; now: number }) {
  return (
    <>
      <span className="q-main">
        <code className="q-id q-kind">{a.kind}</code>
        <span className="q-sub">{`từ ${fmtDateTime(a.window_start)}`}</span>
      </span>
      <span className="q-meta">
        <span className="q-devices">{`${fmtInt(a.count)} lần`}</span>
        <span className="q-sub">{`đã báo ${a.notified_count}`}</span>
      </span>
      <span className="q-when">
        <RelTime sec={a.window_start} now={now} className="q-rel" />
      </span>
      <span className="q-act" />
    </>
  );
}

/* ---------- Khung chờ ---------- */

/** Hai thẻ chờ cùng khung với thẻ nhóm việc: đầu thẻ (ô biểu tượng, tiêu đề, gợi ý) và ba dòng. */
function QueueSkeleton() {
  return (
    <LoadingBlock label="Đang tải việc cần xử lý…" className="q-groups">
      {[0, 1].map((c) => (
        <div key={c} className="ui-card q-group q-skel" aria-hidden="true">
          <div className="ui-card-head">
            <span className="skel q-skel-icon" />
            <div className="ui-card-heading">
              <SkeletonLine width="md" size="md" />
              <SkeletonLine width="lg" size="sm" />
            </div>
          </div>
          <div className="ui-card-body flush">
            <ul className="q-list q-order">
              {[0, 1, 2].map((r) => (
                <li key={r} className="q-row">
                  <span className="q-main">
                    <SkeletonLine width="sm" />
                    <SkeletonLine width="md" size="xs" />
                  </span>
                  <span className="q-meta">
                    <SkeletonLine width="lg" />
                    <SkeletonLine width="sm" size="xs" />
                  </span>
                  <span className="q-when">
                    <SkeletonLine width="md" />
                    <SkeletonLine width="lg" size="xs" />
                  </span>
                  <span className="q-act">
                    <span className="skel q-skel-btn" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </LoadingBlock>
  );
}
