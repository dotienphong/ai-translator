// Trang thử thành phần (chỉ có ở dev server, đường dẫn /__gallery): mọi thành phần dùng chung ở mọi trạng thái, để chụp ảnh
// và tự phê bình. main.tsx nạp tệp này bằng import() động trong nhánh import.meta.env.DEV: bản build không có nó
// (src/dev/gallery-build.test.ts kiểm). Trạng thái hover, focus, active được mô phỏng bằng lớp .is-hover, .is-focus,
// .is-active. Hộp thoại mở bằng ?dialog=confirm|danger|uncertain|reveal|extra.
import { type ReactNode, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import type { OrderRow } from "../api/types";
import { Badge } from "../components/Badge";
import { Button, ButtonGroup, IconButton } from "../components/Button";
import { Card, Section } from "../components/Card";
import { ChartCard, ChartTooltip } from "../components/ChartCard";
import { orderColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { type Column, countText, DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, Notice, ToastProvider, useToast } from "../components/Feedback";
import { DateInput, Field, SearchInput, Select } from "../components/Field";
import { FilterBar } from "../components/FilterBar";
import {
  IconArrowRight,
  IconBan,
  IconCart,
  IconCheck,
  IconClock,
  IconCoins,
  IconCopy,
  IconExternal,
  IconKey,
  IconMail,
  IconMonitor,
  IconPlus,
  IconRefresh,
  IconTable,
  IconTimeline,
  IconTool,
  IconUnlock,
  IconWarning,
} from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { KeyReveal, MaskedKey } from "../components/MaskedKey";
import { SegmentedControl } from "../components/SegmentedControl";
import { LoadingBlock, SkeletonBlock, SkeletonLine, SkeletonStat, SkeletonTable } from "../components/Skeleton";
import { Stat, StatGrid } from "../components/Stat";
import { LicenseBadges, ORDER_LABELS, OrderStatusBadge } from "../components/StatusBadge";
import { Timeline } from "../components/Timeline";
import "./gallery.css";

/** Chuỗi đặc trưng của trang thử: test bản build tìm chuỗi này trong dist/ để chắc trang không lọt vào. */
export const GALLERY_MARKER = "Trang thử thành phần (chỉ dev)";

const NOW = 1_791_500_000;
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

function order(code: number, status: OrderRow["status"], amount = 500000, paid = amount): OrderRow {
  return {
    order_code: code,
    provider: "payos",
    plan: amount >= 500000 ? "yearly" : "monthly",
    amount,
    amount_paid: paid,
    currency: "VND",
    email: `khach${code % 7}@example.com`,
    status,
    grant_kind: null,
    license_id: null,
    renew_license_id: null,
    created_at: NOW - (code % 13) * 3600,
    paid_at: null,
    email_sent_at: null,
    email_gave_up_at: null,
  };
}

const ORDERS: OrderRow[] = [
  order(1000012, "paid"),
  order(1000011, "underpaid", 500000, 200000),
  order(1000010, "pending", 50000, 0),
  order(1000009, "paid_needs_review"),
  order(1000008, "refunded", 50000),
  order(1000007, "expired", 50000, 0),
];

function GalleryBlock({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="g-block" id={id} aria-labelledby={`${id}-t`}>
      <header className="g-block-head">
        <h2 id={`${id}-t`}>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="g-row">
      {label && <span className="g-label">{label}</span>}
      <div className="g-items">{children}</div>
    </div>
  );
}

function Buttons() {
  const variants = ["primary", "secondary", "ghost", "danger", "danger-solid"] as const;
  return (
    <GalleryBlock id="button" title="Button, IconButton, ButtonGroup" note="Bốn kiểu (thêm nguy hiểm nền đặc), ba cỡ, trạng thái mô phỏng bằng lớp .is-*">
      {variants.map((v) => (
        <Row key={v} label={v}>
          <Button variant={v}>Mặc định</Button>
          <Button variant={v} className="is-hover">
            Rê chuột
          </Button>
          <Button variant={v} className="is-focus">
            Focus
          </Button>
          <Button variant={v} className="is-active">
            Đang nhấn
          </Button>
          <Button variant={v} disabled>
            Khóa
          </Button>
          <Button variant={v} loading>
            Đang làm…
          </Button>
        </Row>
      ))}
      <Row label="cỡ">
        <Button size="sm" variant="primary" icon={<IconPlus size={16} />}>
          Nhỏ 32px
        </Button>
        <Button size="md" variant="primary" icon={<IconPlus />}>
          Vừa 40px
        </Button>
        <Button size="lg" variant="primary" icon={<IconPlus />}>
          Lớn 48px
        </Button>
        <Button size="sm">Nhỏ</Button>
        <Button>Vừa</Button>
        <Button size="lg">Lớn</Button>
      </Row>
      <Row label="biểu tượng, link">
        <Button icon={<IconRefresh />}>Làm mới</Button>
        <Button variant="primary" iconEnd={<IconArrowRight />}>
          Tiếp tục
        </Button>
        <Button to="/orders" iconEnd={<IconArrowRight size={16} />} size="sm">
          Link router
        </Button>
        <Button href="https://example.com" target="_blank" variant="ghost" iconEnd={<IconExternal size={16} />}>
          Link ngoài
        </Button>
        <Button to="/orders" disabled>
          Link khóa
        </Button>
        <Button variant="danger" icon={<IconBan />}>
          Thu hồi…
        </Button>
      </Row>
      <Row label="IconButton">
        <IconButton label="Làm mới" icon={<IconRefresh />} />
        <IconButton label="Làm mới" icon={<IconRefresh />} className="is-hover" />
        <IconButton label="Làm mới" icon={<IconRefresh />} className="is-focus" />
        <IconButton label="Chép" icon={<IconCopy />} variant="secondary" />
        <IconButton label="Chép" icon={<IconCopy size={16} />} variant="secondary" size="sm" />
        <IconButton label="Thêm" icon={<IconPlus />} variant="primary" />
        <IconButton label="Đang tải" icon={<IconRefresh />} variant="secondary" loading />
        <IconButton label="Khóa" icon={<IconRefresh />} variant="secondary" disabled />
      </Row>
      <Row label="ButtonGroup">
        <ButtonGroup label="Thao tác license">
          <Button icon={<IconClock />}>Gia hạn…</Button>
          <Button icon={<IconMail />}>Gửi lại email…</Button>
          <Button icon={<IconUnlock />}>Mở khóa…</Button>
        </ButtonGroup>
        <ButtonGroup label="Khoảng thời gian" attached>
          <Button size="sm">7 ngày</Button>
          <Button size="sm" className="is-hover">
            30 ngày
          </Button>
          <Button size="sm">12 tháng</Button>
        </ButtonGroup>
      </Row>
    </GalleryBlock>
  );
}

function Badges() {
  return (
    <GalleryBlock id="badge" title="Badge" note="Chấm màu và chữ, năm tông; nhãn nghiệp vụ giữ nguyên chữ tiếng Việt">
      <Row label="tông">
        <Badge tone="ok">Còn hạn</Badge>
        <Badge tone="warn">Xung đột máy</Badge>
        <Badge tone="bad">Đã thu hồi</Badge>
        <Badge tone="info">Đang xử lý</Badge>
        <Badge tone="neutral">Hết hạn</Badge>
      </Row>
      <Row label="biến thể">
        <Badge tone="neutral" dot={false}>
          Yearly
        </Badge>
        <Badge tone="warn" icon={<IconWarning size={12} strokeWidth={2.25} />}>
          Có biểu tượng
        </Badge>
        <Badge tone="ok" outline>
          Viền
        </Badge>
        <Badge tone="bad" outline>
          Viền đỏ
        </Badge>
      </Row>
      <Row label="đơn">
        {(Object.keys(ORDER_LABELS) as OrderRow["status"][]).map((s) => (
          <OrderStatusBadge key={s} status={s} />
        ))}
      </Row>
      <Row label="license">
        <LicenseBadges license={{ revoked_at: null, expires_at: NOW + 99, locked_at: NOW - 5, conflict: true }} now={NOW} />
        <LicenseBadges license={{ revoked_at: NOW - 9, expires_at: NOW + 99, locked_at: null, conflict: false }} now={NOW} />
        <LicenseBadges license={{ revoked_at: null, expires_at: NOW - 9, locked_at: null, conflict: false }} now={NOW} />
      </Row>
    </GalleryBlock>
  );
}

function Cards() {
  return (
    <GalleryBlock id="card" title="Card, Section" note="Đầu thẻ (biểu tượng, tiêu đề, mô tả, hành động), thân, chân; tông có vạch nhấn">
      <div className="g-grid">
        <Card
          title="Thông tin"
          description="Dữ liệu của license, chỉ đọc"
          icon={<IconKey size={18} />}
          actions={
            <Button size="sm" variant="ghost" icon={<IconRefresh size={16} />}>
              Tải lại
            </Button>
          }
          footer={<span>Cập nhật lúc 14:01</span>}
        >
          <p className="muted">Thân thẻ: nội dung tự do. Đệm 20px, khoảng cách theo thang 4px.</p>
        </Card>
        <Card title="Chỉ có tiêu đề">
          <p className="muted">Không mô tả, không hành động.</p>
        </Card>
        <Card title="Cần chú ý" description="Ba license sắp hết hạn trong 7 ngày" tone="warn" icon={<IconWarning size={18} />}>
          <p className="muted">Tông cảnh báo: vạch nhấn vàng ở mép trái.</p>
        </Card>
        <Card
          title="Khu vực nguy hiểm"
          description="Thao tác không hoàn tác được"
          tone="danger"
          icon={<IconBan size={18} />}
          footer={
            <Button variant="danger" size="sm" icon={<IconBan size={16} />}>
              Thu hồi license…
            </Button>
          }
        >
          <p className="muted">Mọi máy đang dùng key này về Free ở lần kiểm tra kế tiếp.</p>
        </Card>
        <Card title="Thông tin (tông info)" tone="info" icon={<IconMonitor size={18} />}>
          <p className="muted">Vạch nhấn xanh thương hiệu.</p>
        </Card>
        <Card title="Thành công" tone="ok" icon={<IconCheck size={18} />}>
          <p className="muted">Vạch nhấn xanh lục.</p>
        </Card>
      </div>
      <Section title="Section: nhóm nhỏ" description="Tiêu đề chữ hoa, mô tả và hành động tùy chọn" actions={<Button size="sm" variant="ghost" iconEnd={<IconArrowRight size={16} />}>Xem tất cả</Button>}>
        <Card title="Bảng trong thẻ (thân flush)" description="Đầu thẻ có đường kẻ, bảng sát mép" flush actions={<Badge tone="info">6 đơn</Badge>}>
          <DataTable flush columns={orderColumns(NOW)} rows={ORDERS.slice(0, 3)} rowKey={(o) => String(o.order_code)} empty="Không có đơn nào" />
        </Card>
      </Section>
    </GalleryBlock>
  );
}

function Stats() {
  return (
    <GalleryBlock id="stat" title="Stat, StatGrid" note="Nhãn dài xuống hai dòng không làm lệch số (subgrid); số tabular">
      <StatGrid label="Số liệu chính">
        <Stat label="Doanh thu hôm nay" value="100.000 đ" icon={<IconCoins />} tone="brand" />
        <Stat label="Doanh thu 7 ngày" value="850.000 đ" delta={{ label: "+12%", direction: "up" }} note="so với 7 ngày trước" />
        <Stat label="Doanh thu tháng này" value="1.450.000 đ" note="Tháng trước: 2.100.000 đ" delta={{ label: "−31%", direction: "down" }} />
        <Stat label="License đang hoạt động trên mọi gói" value="9" icon={<IconKey />} tone="ok" />
        <Stat label="Việc cần xử lý" value="4" icon={<IconWarning />} tone="warn" delta={{ label: "+2", direction: "up", upIsGood: false }} />
      </StatGrid>
      <StatGrid>
        <Stat label="Máy đang kích hoạt" value="11" icon={<IconMonitor />} />
        <Stat label="Lỗi webhook" value="3" tone="bad" icon={<IconWarning />} delta={{ label: "không đổi", direction: "flat" }} />
        <Stat label="Đơn đã trả 7 ngày" value="1.204" icon={<IconCart />} tone="info" />
      </StatGrid>
      <StatGrid label="Đang tải">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat note={false} />
        <SkeletonStat />
      </StatGrid>
    </GalleryBlock>
  );
}

function Empties() {
  return (
    <GalleryBlock id="empty" title="EmptyState" note="Chưa có dữ liệu, không có kết quả, mọi thứ ổn, lỗi; bản gọn trong bảng">
      <div className="g-grid">
        <Card title="Chưa có dữ liệu">
          <EmptyState title="Chưa có máy nào dùng thử" hint="Máy dùng thử hiện ở đây khi app gọi API lần đầu." />
        </Card>
        <Card title="Không có kết quả">
          <EmptyState variant="no-results" title="Không có đơn nào khớp bộ lọc" hint="Thử bỏ bớt bộ lọc hay đổi khoảng ngày." action={<Button size="sm">Xóa lọc</Button>} />
        </Card>
        <Card title="Mọi thứ ổn">
          <EmptyState variant="success" title="Không có việc gì cần xử lý" hint="Hàng đợi trống. Trang tự cập nhật khi có đơn hay license cần xem." />
        </Card>
        <Card title="Lỗi">
          <EmptyState variant="error" title="Không tải được dữ liệu" hint="Máy chủ trả lỗi 503." action={<Button size="sm" icon={<IconRefresh size={16} />}>Thử lại</Button>} />
        </Card>
      </div>
    </GalleryBlock>
  );
}

function Skeletons() {
  return (
    <GalleryBlock id="skeleton" title="Skeleton, LoadingBlock" note="Đúng kích thước thứ sắp hiện; ánh sáng lướt tắt khi giảm chuyển động">
      <div className="g-grid">
        <Card title="Thanh chữ">
          <LoadingBlock>
            <div className="skel-stack">
              <SkeletonLine size="title" width="md" />
              <SkeletonLine width="xl" />
              <SkeletonLine width="lg" />
              <SkeletonLine width="sm" size="sm" />
            </div>
          </LoadingBlock>
        </Card>
        <Card title="Khối (biểu đồ)">
          <LoadingBlock>
            <SkeletonBlock height="lg" />
          </LoadingBlock>
        </Card>
      </div>
      <SkeletonTable headers={["Mã đơn", "Tạo lúc", "Email", "Gói", "Số tiền", "Trạng thái"]} rows={3} />
    </GalleryBlock>
  );
}

function Copies() {
  return (
    <GalleryBlock id="copy" title="CopyButton, MaskedKey" note="Chỉ chép chuỗi được truyền; Đã chép 1,5 giây; thông báo qua aria-live">
      <Row label="kiểu">
        <CopyButton text="abc" />
        <CopyButton text="abc" appearance="icon" what="email" />
        <CopyButton text="abc" appearance="button" label="Chép key" />
      </Row>
      <Row label="đã chép / lỗi">
        <button type="button" className="btn ghost small copy-btn link is-done">
          <IconCheck size={16} strokeWidth={2.25} />
          <span className="btn-label">Đã chép</span>
        </button>
        <button type="button" className="btn ghost small copy-btn link is-failed">
          <IconCopy size={16} />
          <span className="btn-label">Không chép được</span>
        </button>
        <button type="button" className="btn ghost small copy-btn icon-only is-done" aria-label="Đã chép">
          <IconCheck size={16} strokeWidth={2.25} />
        </button>
      </Row>
      <Row label="key che">
        <MaskedKey value={KEY} />
      </Row>
    </GalleryBlock>
  );
}

function KeyValues() {
  return (
    <GalleryBlock id="kv" title="KeyValue" note="Lưới nhãn và giá trị: chép, mono, huy hiệu, dòng phụ">
      <div className="g-grid">
        <Card title="Thông tin" icon={<IconKey size={18} />}>
          <KeyValue
            items={[
              { label: "Email", value: "khach@example.com", copy: "khach@example.com" },
              { label: "Gói", value: "Yearly", badge: <Badge tone="ok">Còn hạn</Badge> },
              { label: "Hết hạn", value: "08/10/2027", hint: "còn 365 ngày" },
              { label: "License id", value: "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69", mono: true, copy: "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69" },
              { label: "Đã ẩn danh", value: null },
            ]}
          />
        </Card>
        <Card title="Hai cột (máy tính)">
          <KeyValue
            columns={2}
            items={[
              { label: "Tạo lúc", value: "07/10/2026 14:01" },
              { label: "Trả lúc", value: "07/10/2026 14:03" },
              { label: "Số tiền", value: "500.000 đ" },
              { label: "Loại", value: "Mua mới" },
            ]}
          />
        </Card>
      </div>
    </GalleryBlock>
  );
}

function Timelines() {
  return (
    <GalleryBlock id="timeline" title="Timeline" note="Nhật ký theo trục thời gian dọc, chia nhóm theo ngày">
      <Card title="Nhật ký" description="50 dòng gần nhất">
        <Timeline
          label="Nhật ký của license"
          items={[
            { key: "1", day: "08/10/2026", time: "14:01", actor: "admin:ops@aitranslator.io.vn", action: "license_extended", detail: "days: 30 · note: bù cho khách", tone: "info" },
            { key: "2", day: "08/10/2026", time: "13:01", actor: "api", action: "license_activated", detail: "allow_conflict: true", tone: "warn" },
            {
              key: "3",
              day: "07/10/2026",
              time: "14:03",
              actor: "webhook",
              action: "license_issued",
              tone: "ok",
              links: (
                <>
                  <a href="/orders/1000012">Đơn #1000012</a>
                  <a href="/licenses/0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69">License 0b9e7c1e</a>
                </>
              ),
            },
            { key: "4", day: "07/10/2026", time: "14:01", actor: "reconcile", action: "order_expired" },
            { key: "5", day: "07/10/2026", time: "09:12", actor: "admin:ops@aitranslator.io.vn", action: "license_revoked", detail: "note: hoàn tiền", tone: "bad" },
          ]}
        />
      </Card>
    </GalleryBlock>
  );
}

function Filters() {
  const [status, setStatus] = useState("paid");
  const [plan, setPlan] = useState("yearly");
  const [q, setQ] = useState("khach@");
  const [view, setView] = useState<"table" | "timeline">("table");
  const [range, setRange] = useState("30");
  const chips = [
    status && { key: "status", name: "Trạng thái", value: ORDER_LABELS[status as OrderRow["status"]] ?? status, onRemove: () => setStatus("") },
    plan && { key: "plan", name: "Gói", value: plan === "yearly" ? "Yearly" : "Monthly", onRemove: () => setPlan("") },
  ].filter((c): c is NonNullable<typeof c> & object => Boolean(c));
  return (
    <GalleryBlock id="filter" title="FilterBar, Field, SegmentedControl" note="Ô lọc thống nhất, chip bộ lọc đang bật, Xóa lọc, dòng đếm">
      <FilterBar
        chips={chips}
        onClear={() => {
          setStatus("");
          setPlan("");
        }}
        count={countText(50, "đơn", true)}
        actions={
          <Button variant="primary" icon={<IconPlus />}>
            Cấp license mới…
          </Button>
        }
      >
        <SearchInput label="Tìm" value={q} onChange={setQ} placeholder="Email, mã đơn" />
        <Select label="Trạng thái" value={status} onChange={setStatus} options={[["", "Tất cả"], ...Object.entries(ORDER_LABELS)]} />
        <Select label="Gói" value={plan} onChange={setPlan} options={[["", "Tất cả"], ["monthly", "Monthly"], ["yearly", "Yearly"]]} />
        <DateInput label="Tạo từ ngày" value="2026-10-01" onChange={() => {}} />
        <DateInput label="Đến ngày" value="2026-09-01" onChange={() => {}} invalid />
      </FilterBar>
      <Row label="ô nhập">
        <Field label="Mặc định">
          <input defaultValue="khach@example.com" />
        </Field>
        <Field label="Rê chuột">
          <input defaultValue="khach@example.com" className="is-hover" />
        </Field>
        <Field label="Focus">
          <input defaultValue="khach@example.com" className="is-focus" />
        </Field>
        <Field label="Sai" error="Email không hợp lệ">
          <input defaultValue="khach@" aria-invalid="true" />
        </Field>
        <Field label="Khóa" hint="Chỉ đọc">
          <input defaultValue="ops@aitranslator.io.vn" disabled />
        </Field>
      </Row>
      <Row label="SegmentedControl">
        <SegmentedControl
          label="Cách xem"
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Bảng", icon: <IconTable size={16} /> },
            { value: "timeline", label: "Dòng thời gian", icon: <IconTimeline size={16} /> },
          ]}
        />
        <SegmentedControl
          label="Khoảng"
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: "7", label: "7 ngày" },
            { value: "30", label: "30 ngày" },
            { value: "365", label: "12 tháng" },
          ]}
        />
      </Row>
    </GalleryBlock>
  );
}

function Tables() {
  const deviceColumns: Column<{ name: string; hash: string; at: string; minutes: number }>[] = [
    { header: "Tên máy", cell: (d) => <a href="#d">{d.name}</a> },
    { header: "Mã máy", cell: (d) => <code>{d.hash}</code>, hideOnMobile: true },
    { header: "Lần kiểm cuối", cell: (d) => d.at, nowrap: true },
    { header: "Phút đã dùng", cell: (d) => d.minutes.toLocaleString("vi-VN"), align: "right" },
    {
      header: "",
      cell: () => (
        <span className="row-actions">
          <Button size="sm">Reset hạn mức…</Button>
          <Button size="sm" variant="danger">
            Gỡ…
          </Button>
        </span>
      ),
    },
  ];
  const devices = [
    { name: "MacBook-Phong", hash: "3fa1…c09e", at: "08/10/2026 13:56", minutes: 1240 },
    { name: "DESKTOP-ABC", hash: "91be…77d2", at: "08/10/2026 13:56", minutes: 37 },
  ];
  return (
    <GalleryBlock id="table" title="DataTable" note="Số căn phải, tiêu đề dính, hover và focus-within, đếm dòng, Tải thêm, rỗng, đang tải">
      <DataTable
        columns={orderColumns(NOW)}
        rows={ORDERS}
        rowKey={(o) => String(o.order_code)}
        empty="Không có đơn nào"
        hasMore
        onMore={() => {}}
        summary={countText(ORDERS.length, "đơn", true)}
        caption="Đơn hàng"
      />
      <DataTable columns={deviceColumns} rows={devices} rowKey={(d) => d.hash} empty="Chưa kích hoạt trên máy nào" />
      <div className="g-grid">
        <DataTable columns={orderColumns(NOW).slice(0, 3)} rows={[]} rowKey={() => ""} empty="Không có đơn nào" loading skeletonRows={3} />
        <DataTable
          columns={orderColumns(NOW).slice(0, 3)}
          rows={[]}
          rowKey={() => ""}
          empty="Không có đơn nào khớp bộ lọc"
          emptyVariant="no-results"
          emptyHint="Thử bỏ bớt bộ lọc."
          emptyAction={<Button size="sm">Xóa lọc</Button>}
        />
      </div>
      <DataTable columns={orderColumns(NOW)} rows={[...ORDERS, ...ORDERS.map((o) => ({ ...o, order_code: o.order_code - 100 }))]} rowKey={(o) => String(o.order_code)} empty="" maxHeight="sm" summary="12 đơn" hasMore loading onMore={() => {}} />
    </GalleryBlock>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <Button size="sm" onClick={() => toast.show("Đã chép email vào bộ nhớ tạm")}>
      Hiện toast
    </Button>
  );
}

function Feedbacks() {
  return (
    <GalleryBlock id="feedback" title="ErrorBox, Notice, Toast" note="Notice đứng yên tới khi đóng; Toast tự đóng sau 4 giây">
      <ErrorBox error={new ApiError(500, "internal")} onRetry={() => {}} />
      <ErrorBox error={new ApiError(0, "network")} title="Không tải được danh sách đơn" onRetry={() => {}} />
      <Notice text="Đã gia hạn tới 08/11/2027." onClose={() => {}} />
      <Notice tone="info" text="Đã gửi lại email. Khách thường nhận trong vài phút." onClose={() => {}} />
      <Notice tone="warn" text="License đang khóa tạm: xác minh với khách trước khi mở khóa." onClose={() => {}} />
      <Row label="toast">
        <ToastDemo />
        <div className="g-toast-static">
          <div className="toast tone-ok">
            <IconCheck size={18} />
            <span className="toast-text">Đã chép email vào bộ nhớ tạm</span>
          </div>
          <div className="toast tone-warn">
            <IconWarning size={18} />
            <span className="toast-text">Đã lưu nháp, chưa gửi</span>
          </div>
        </div>
      </Row>
    </GalleryBlock>
  );
}

const DAYS = Array.from({ length: 30 }, (_, i) => `${String(((i + 8) % 30) + 1).padStart(2, "0")}/${i < 22 ? "09" : "10"}`);
const MONTHS = ["11/2025", "12/2025", "01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026"];
const vnd = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;

function Charts() {
  return (
    <GalleryBlock id="chart" title="ChartCard" note="Bảng màu dataviz (4 chuỗi), chú giải chữ trung tính, tooltip cùng kiểu, lưới và trục nhẹ">
      <div className="chart-grid">
        <ChartCard
          title="Doanh thu 30 ngày gần nhất"
          description="Theo ngày, giờ Việt Nam"
          labelHeader="Ngày"
          unit="Đơn vị: đồng"
          format={vnd}
          series={[{ key: "revenue", label: "Doanh thu" }]}
          data={DAYS.map((label, i) => ({ label, revenue: ((i * 7) % 5) * 50000 }))}
        />
        <ChartCard
          title="Doanh thu 12 tháng, theo gói"
          description="Cột chồng: Monthly và Yearly"
          labelHeader="Tháng"
          unit="Đơn vị: đồng"
          stacked
          format={vnd}
          series={[
            { key: "monthly", label: "Monthly" },
            { key: "yearly", label: "Yearly" },
          ]}
          data={MONTHS.map((label, i) => ({ label, monthly: (i % 4) * 150000 + 50000, yearly: (i % 3) * 500000 }))}
        />
        <ChartCard
          title="Mua mới, gia hạn, đổi gói theo tháng"
          description="Số đơn đã trả"
          labelHeader="Tháng"
          unit="Số đơn"
          integer
          stacked
          series={[
            { key: "new", label: "Mua mới" },
            { key: "extend", label: "Gia hạn" },
            { key: "change", label: "Đổi gói" },
            { key: "other", label: "Khác" },
          ]}
          data={MONTHS.map((label, i) => ({ label, new: (i % 4) + 1, extend: i % 3, change: i % 2, other: i % 5 === 0 ? 1 : 0 }))}
        />
        <ChartCard title="Máy dùng thử mới mỗi ngày" integer series={[{ key: "count", label: "Máy" }]} data={DAYS.map((label) => ({ label, count: 0 }))} />
      </div>
      <Row label="tooltip">
        <ChartTooltip
          active
          label="10/2026"
          stacked
          format={vnd}
          series={[
            { key: "monthly", label: "Monthly" },
            { key: "yearly", label: "Yearly" },
          ]}
          payload={[
            { dataKey: "monthly", name: "Monthly", value: 450000 },
            { dataKey: "yearly", name: "Yearly", value: 1000000 },
          ]}
        />
        <ChartTooltip active label="08/10" stacked={false} format={vnd} series={[{ key: "revenue", label: "Doanh thu" }]} payload={[{ dataKey: "revenue", name: "Doanh thu", value: 150000 }]} />
      </Row>
    </GalleryBlock>
  );
}

function Dialogs({ kind }: { kind: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // Trạng thái lỗi không rõ kết quả: tự gửi form một lần sau khi mở để chụp ảnh.
    if (kind !== "uncertain" && kind !== "error") return;
    const t = setTimeout(() => document.querySelector<HTMLFormElement>("form.dialog")?.requestSubmit(), 50);
    return () => clearTimeout(t);
  }, [kind]);
  if (!open) return null;
  const close = () => setOpen(false);
  if (kind === "reveal") return <KeyReveal licenseKey={KEY} onClose={close} />;
  if (kind === "danger" || kind === "uncertain")
    return (
      <ConfirmDialog
        title="Thu hồi license?"
        description="Mọi máy đang dùng key này về Free ở lần kiểm tra kế tiếp. Không hoàn tác được."
        confirmLabel="Thu hồi"
        needsNote={kind === "danger"}
        typeToConfirm={kind === "danger" ? "THU HOI" : undefined}
        tone="danger"
        onConfirm={async () => {
          throw new ApiError(503, "http_503");
        }}
        onClose={close}
      />
    );
  if (kind === "extra" || kind === "error")
    return (
      <ConfirmDialog
        title="Gia hạn license?"
        description="Cộng thêm số ngày, giữ gói. License đã hết hạn thì tính từ bây giờ."
        confirmLabel="Gia hạn"
        needsNote={kind === "extra"}
        onConfirm={async () => {
          throw new ApiError(400, "invalid_request", { field: "days" });
        }}
        onClose={close}
      >
        <label>
          Số ngày (1–3650)
          <input type="number" min={1} max={3650} defaultValue={30} />
        </label>
      </ConfirmDialog>
    );
  return (
    <ConfirmDialog
      title="Gửi lại email chứa key?"
      description="Gửi key tới khach@example.com."
      confirmLabel="Gửi"
      needsNote={false}
      onConfirm={async () => {}}
      onClose={close}
    />
  );
}

const SECTIONS: [string, string][] = [
  ["button", "Button"],
  ["badge", "Badge"],
  ["card", "Card"],
  ["stat", "Stat"],
  ["empty", "EmptyState"],
  ["skeleton", "Skeleton"],
  ["copy", "Copy"],
  ["kv", "KeyValue"],
  ["timeline", "Timeline"],
  ["filter", "FilterBar"],
  ["table", "DataTable"],
  ["feedback", "Thông báo"],
  ["chart", "Chart"],
];

export function Gallery() {
  const params = new URLSearchParams(window.location.search);
  const dialog = params.get("dialog");
  const only = params.get("only");
  useEffect(() => {
    document.title = "Thành phần · AI Translator Admin";
  }, []);
  const show = (id: string) => !only || only === id;
  return (
    <ToastProvider>
      <div className="gallery">
        <header className="g-head">
          <p className="g-kicker">{GALLERY_MARKER}</p>
          <h1>Thành phần dùng chung</h1>
          <nav aria-label="Mục" className="g-nav">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`?only=${id}`}>
                {label}
              </a>
            ))}
            <a href="/__gallery">Tất cả</a>
            <span className="g-sep" />
            {["confirm", "extra", "danger", "uncertain", "error", "reveal"].map((d) => (
              <a key={d} href={`?dialog=${d}`}>
                hộp {d}
              </a>
            ))}
          </nav>
        </header>
        {show("button") && <Buttons />}
        {show("badge") && <Badges />}
        {show("card") && <Cards />}
        {show("stat") && <Stats />}
        {show("empty") && <Empties />}
        {show("skeleton") && <Skeletons />}
        {show("copy") && <Copies />}
        {show("kv") && <KeyValues />}
        {show("timeline") && <Timelines />}
        {show("filter") && <Filters />}
        {show("table") && <Tables />}
        {show("feedback") && <Feedbacks />}
        {show("chart") && <Charts />}
        {dialog && <Dialogs kind={dialog} />}
        <p className="g-foot">
          <IconTool size={14} /> Chỉ có ở dev server (pnpm dev), không có trong bản build.
        </p>
      </div>
    </ToastProvider>
  );
}
