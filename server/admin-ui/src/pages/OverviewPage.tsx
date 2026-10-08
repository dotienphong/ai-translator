// Trang Tổng quan (spec Web Admin phần 2, mục 4; giao diện mới mục 2): số liệu từ GET /admin/stats, năm ô số và bốn nhóm
// Tiền, Khách hàng, Sức khỏe, Sử dụng. Biểu đồ trong ChartCard (bảng màu dataviz); thanh tỷ lệ là SVG (CSP không cho
// style inline nên bề rộng nằm ở thuộc tính width của <rect>, không ở style).
import type { ReactNode } from "react";
import { api } from "../api/endpoints";
import type { GrantKind, OrderStatus, Stats } from "../api/types";
import { Button } from "../components/Button";
import { Card, Section } from "../components/Card";
import { ChartCard } from "../components/ChartCard";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import {
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconCoins,
  IconKey,
  IconMail,
  IconMonitor,
  IconRefresh,
} from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Stat, StatGrid, type StatTone } from "../components/Stat";
import { ORDER_LABELS, ORDER_TONES, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDay, fmtHm, fmtInt, fmtMonth, fmtVnd } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";
import { OVERVIEW_DESC, OverviewSkeleton } from "./OverviewSkeleton";

/** Trạng thái đơn cần người xem khi số lớn hơn 0: nổi bật và dẫn tới danh sách đã lọc. */
const PROBLEM_STATUSES: readonly OrderStatus[] = ["underpaid", "failed", "paid_needs_review"];

const GRANT_LABELS: Record<GrantKind, string> = { new: "Mua mới", extend: "Gia hạn", change: "Đổi gói", other: "Khác" };
const GRANT_KINDS = Object.keys(GRANT_LABELS) as GrantKind[];
const STATUSES = Object.keys(ORDER_LABELS) as OrderStatus[];

/** Phần trăm làm tròn; null khi `total` bằng 0 (tránh chia cho 0). */
const pct = (part: number, total: number): number | null => (total > 0 ? Math.round((part * 100) / total) : null);
/** " (33%)" khi có tỷ lệ, chuỗi rỗng nếu không. */
const rate = (part: number, total: number) => {
  const p = pct(part, total);
  return p === null ? "" : ` (${p}%)`;
};

export function OverviewPage() {
  const stats = useLoad(() => api.stats(), []);
  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={
          <p className="page-meta">
            <span>{OVERVIEW_DESC}</span>
            {stats.data && (
              <span className="page-meta-time">
                <IconClock size={14} />
                <span>Cập nhật lúc {fmtHm(stats.data.generated_at)}</span>
              </span>
            )}
          </p>
        }
        actions={
          <Button icon={<IconRefresh size={16} />} loading={stats.loading} onClick={stats.reload}>
            Làm mới
          </Button>
        }
      />
      {stats.error && <ErrorBox error={stats.error} onRetry={stats.reload} title="Không tải được số liệu" />}
      {stats.loading && !stats.data && <OverviewSkeleton />}
      {stats.data && <Content s={stats.data} />}
    </>
  );
}

function Content({ s }: { s: Stats }) {
  const { money, customers, health, usage } = s;
  return (
    <>
      <StatGrid label="Số chính" className="ov-stats">
        <Stat label="Doanh thu hôm nay" value={fmtVnd(money.today)} icon={<IconCoins />} tone="brand" />
        <Stat label="Doanh thu 7 ngày" value={fmtVnd(money.last_7d)} icon={<IconCoins />} tone="brand" />
        <Stat
          label="Doanh thu tháng này"
          value={fmtVnd(money.this_month)}
          note={`Tháng trước: ${fmtVnd(money.last_month)}`}
          icon={<IconCalendar />}
          tone="brand"
        />
        <Stat label="License đang hoạt động" value={fmtInt(usage.active_licenses)} note="Còn hạn, chưa thu hồi" icon={<IconKey />} tone="ok" />
        <Stat
          label="Máy đang kích hoạt"
          value={fmtInt(usage.active_devices)}
          note={`${fmtInt(usage.devices_7d)} máy có hoạt động trong 7 ngày`}
          icon={<IconMonitor />}
          tone="info"
        />
      </StatGrid>

      <Section title="Tiền" description="Tiền đã nhận của đơn đã trả; ngày và tháng tính theo giờ Việt Nam.">
        <div className="chart-grid">
          <ChartCard
            title="Doanh thu 30 ngày gần nhất"
            description="Mỗi cột là một ngày"
            unit="Đơn vị: đồng"
            labelHeader="Ngày"
            format={fmtVnd}
            series={[{ key: "revenue", label: "Doanh thu" }]}
            data={money.daily.map((d) => ({ label: fmtDay(d.day), revenue: d.revenue }))}
          />
          <ChartCard
            title="Doanh thu 12 tháng, theo gói"
            description="Cột chồng: Monthly và Yearly"
            unit="Đơn vị: đồng"
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
      </Section>

      <Section title="Khách hàng" description="Máy dùng thử chuyển sang mua, và đơn đã trả theo loại.">
        <div className="chart-grid">
          <Card title="Dùng thử sang trả phí" description="Máy dùng thử đã mua ít nhất một gói" level={3} className="ov-fill">
            <div className="ov-ratios">
              <TrialRatio label="30 ngày gần nhất" trials={customers.trials_30d} bought={customers.trials_30d_purchased} />
              <TrialRatio label="Từ trước đến nay" trials={customers.trials_total} bought={customers.trials_total_purchased} />
            </div>
          </Card>
          <GrantsCard grants={customers.grants_30d} />
          <div className="ov-span">
            <ChartCard
              title="Mua mới, gia hạn, đổi gói theo tháng"
              description="Số đơn đã trả mỗi tháng, theo loại"
              unit="Số đơn"
              labelHeader="Tháng"
              integer
              stacked
              series={GRANT_KINDS.map((k) => ({ key: k, label: GRANT_LABELS[k] }))}
              data={customers.grants_monthly.map((m) => ({ label: fmtMonth(m.month), new: m.new, extend: m.extend, change: m.change, other: m.other }))}
            />
          </div>
        </div>
      </Section>

      <Section title="Sức khỏe" description="Đơn theo trạng thái, license sắp hết hạn và email gửi key.">
        <div className="ov-split">
          <StatusCard orders={health.orders_30d} />
          <Card title="Cần chú ý" description="License sắp hết hạn, email key trong 30 ngày" level={3} className="ov-fill">
            <MetricList>
              <Metric
                icon={<IconClock />}
                tone={health.expiring_7d > 0 ? "warn" : "default"}
                label="Sắp hết hạn trong 7 ngày"
                hint="Nhắc khách gia hạn sớm"
                value={fmtInt(health.expiring_7d)}
              />
              <Metric icon={<IconCalendar />} label="Sắp hết hạn trong 30 ngày" hint="Kể cả 7 ngày tới" value={fmtInt(health.expiring_30d)} />
              {health.email.paid_with_email_30d > 0 ? (
                <Metric
                  icon={<IconMail />}
                  tone={health.email.sent < health.email.paid_with_email_30d ? "warn" : "ok"}
                  label="Email key đã gửi"
                  hint={`${pct(health.email.sent, health.email.paid_with_email_30d)}% số đơn đã trả có email`}
                  value={`${fmtInt(health.email.sent)}/${fmtInt(health.email.paid_with_email_30d)}`}
                />
              ) : (
                <Metric icon={<IconMail />} label="Email key đã gửi" hint="Chưa có đơn nào có email trong 30 ngày" value="—" />
              )}
            </MetricList>
          </Card>
        </div>
      </Section>

      <Section title="Sử dụng" description="Máy đang dùng app và máy dùng thử mới.">
        <div className="ov-split">
          <Card title="Máy" description="Theo lần kiểm license gần nhất của app" level={3} className="ov-fill">
            <MetricList>
              <Metric icon={<IconMonitor />} tone="info" label="Đang kích hoạt" hint="Máy gắn với license còn hạn" value={fmtInt(usage.active_devices)} />
              <Metric icon={<IconClock />} label="Hoạt động trong 7 ngày gần nhất" hint="Có gọi API trong 7 ngày" value={fmtInt(usage.devices_7d)} />
              <Metric icon={<IconKey />} label="Dùng thử còn hạn" hint="Gói Free, chưa hết 10 ngày" value={fmtInt(usage.trials_active)} />
            </MetricList>
          </Card>
          <ChartCard
            title="Máy dùng thử mới mỗi ngày"
            description="Máy bắt đầu dùng thử lần đầu"
            unit="Số máy"
            labelHeader="Ngày"
            integer
            series={[{ key: "count", label: "Máy dùng thử mới" }]}
            data={usage.new_trials_daily.map((d) => ({ label: fmtDay(d.day), count: d.count }))}
          />
        </div>
      </Section>
    </>
  );
}

/* ---------- Thanh tỷ lệ (SVG) ---------- */

function RatioBar({ value, className }: { value: number; className?: string }) {
  // Có giá trị thì luôn thấy một mẩu (tối thiểu 1,5%), 0 thì chỉ có rãnh.
  const w = value <= 0 ? 0 : Math.max(1.5, Math.min(100, value));
  return (
    <svg className={className ? `ratio-bar ${className}` : "ratio-bar"} width="100%" height="8" aria-hidden="true" focusable="false">
      <rect className="ratio-track" x="0" y="0" width="100%" height="8" rx="4" />
      {w > 0 && <rect className="ratio-fill" x="0" y="0" width={`${w}%`} height="8" rx="4" />}
    </svg>
  );
}

/** Một dòng phễu dùng thử: câu đầy đủ cho trình đọc màn hình; phần nhìn (tỷ lệ lớn, thanh, ghi chú) ẩn với trình đọc. */
function TrialRatio({ label, trials, bought }: { label: string; trials: number; bought: number }) {
  const p = pct(bought, trials);
  return (
    <div className="ov-ratio">
      <p className="sr-only">{`${label}: ${trials} máy dùng thử, đã mua ${bought}${rate(bought, trials)}`}</p>
      <div className="ov-ratio-vis" aria-hidden="true">
        <div className="ov-ratio-head">
          <span className="ov-ratio-label">{label}</span>
          <strong className="ov-ratio-pct">{p === null ? "—" : `${p}%`}</strong>
        </div>
        <RatioBar value={p ?? 0} />
        <span className="ov-ratio-note">
          {trials > 0 ? (
            <>
              <strong>{fmtInt(bought)}</strong>
              {` đã mua trên ${fmtInt(trials)} máy dùng thử`}
            </>
          ) : (
            "Chưa có máy dùng thử"
          )}
        </span>
      </div>
    </div>
  );
}

/* ---------- Đơn đã trả 30 ngày theo loại ---------- */

interface GrantRow {
  /** "total": dòng tổng ở cuối bảng (số thẳng cột với các dòng trên). */
  kind: GrantKind | "total";
  orders: number;
  revenue: number;
}

const GRANT_COLUMNS: Column<GrantRow>[] = [
  {
    header: "Loại",
    cell: (r) =>
      r.kind === "total" ? (
        "Tổng"
      ) : (
        <span className="ov-kind">
          <span className={`chart-swatch s-${GRANT_KINDS.indexOf(r.kind)}`} aria-hidden="true" />
          {GRANT_LABELS[r.kind]}
        </span>
      ),
  },
  { header: "Số đơn", align: "right", cell: (r) => fmtInt(r.orders) },
  { header: "Doanh thu", align: "right", nowrap: true, cell: (r) => fmtVnd(r.revenue) },
];

function GrantsCard({ grants }: { grants: Stats["customers"]["grants_30d"] }) {
  const kinds: GrantRow[] = GRANT_KINDS.map((k) => ({ kind: k, ...grants[k] }));
  const total: GrantRow = {
    kind: "total",
    orders: kinds.reduce((n, r) => n + r.orders, 0),
    revenue: kinds.reduce((n, r) => n + r.revenue, 0),
  };
  return (
    <Card title="Đơn đã trả trong 30 ngày" description="Màu khớp với biểu đồ theo tháng bên dưới" level={3} flush className="ov-grants">
      <DataTable
        flush
        mobile="table"
        caption="Đơn đã trả trong 30 ngày theo loại"
        columns={GRANT_COLUMNS}
        rows={[...kinds, total]}
        rowKey={(r) => r.kind}
        empty=""
      />
    </Card>
  );
}

/* ---------- Đơn theo trạng thái ---------- */

function StatusCard({ orders }: { orders: Record<OrderStatus, number> }) {
  const total = STATUSES.reduce((n, st) => n + orders[st], 0);
  return (
    <Card title="Đơn 30 ngày theo trạng thái" description={`${fmtInt(total)} đơn tạo trong 30 ngày; trạng thái đỏ mở danh sách đã lọc`} level={3}>
      <ul className="ov-status-list">
        {STATUSES.map((st) => {
          const n = orders[st];
          const attention = PROBLEM_STATUSES.includes(st) && n > 0;
          const body = (
            <>
              <span className={`ov-dot tone-${attention ? "bad" : ORDER_TONES[st]}`} aria-hidden="true" />
              <span className="ov-status-label">{ORDER_LABELS[st]}</span>
              <RatioBar value={pct(n, total) ?? 0} className={`tone-${attention ? "bad" : ORDER_TONES[st]}`} />
              <strong className="ov-status-n">{fmtInt(n)}</strong>
              <span className="ov-status-go">{attention && <IconArrowRight size={16} />}</span>
            </>
          );
          return (
            <li key={st} className={["ov-status", attention && "is-attention", n === 0 && "is-zero"].filter(Boolean).join(" ")}>
              {attention ? (
                <Link to={`/orders?status=${st}`} className="ov-status-row">
                  {body}
                </Link>
              ) : (
                <div className="ov-status-row">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Danh sách chỉ số (Cần chú ý, Máy) ---------- */

function MetricList({ children }: { children: ReactNode }) {
  return <ul className="metric-list">{children}</ul>;
}

function Metric({ icon, label, hint, value, tone = "default" }: { icon: ReactNode; label: string; hint?: string; value: string; tone?: StatTone }) {
  return (
    <li className={`metric tone-${tone}`}>
      <span className="metric-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="metric-text">
        <span className="metric-label">{label}</span>
        {hint && <span className="metric-hint">{hint}</span>}
      </span>
      <strong className="metric-value">{value}</strong>
    </li>
  );
}
