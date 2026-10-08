// Kết quả tra cứu theo email hay license key (spec Web Admin §4.2; giao diện mới mục 2). Từ khóa lấy từ kho trong bộ nhớ
// (search.ts): không nằm trong URL hay history.state, địa chỉ luôn là /search. Kết quả theo nhóm (License, Đơn hàng, Máy),
// mỗi nhóm một thẻ có số lượng; nhóm rỗng không hiện. Một license duy nhất (mọi đơn thuộc nó) thì mở thẳng trang license.
import { type ReactNode, useEffect } from "react";
import type { LookupQuery } from "../api/endpoints";
import type { Activation, LookupResult } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Cell2, licenseColumns, orderColumns } from "../components/columns";
import { type Column, DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox } from "../components/Feedback";
import { IconCart, IconKey, IconMonitor, IconSearch } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { RelTime } from "../components/RelTime";
import { focusSearch } from "../components/SearchBox";
import { SkeletonTable } from "../components/Skeleton";
import { fmtDateTime, maskKey, nowSec, shortHash } from "../format";
import { api } from "../api/endpoints";
import { useLoad } from "../hooks";
import { Link, navigate } from "../router";
import { singleTarget, useSearch } from "../search";

/** Loại từ khóa (tóm tắt đầu trang): "email", "license key"… và giá trị hiện ra. */
function describe(q: LookupQuery): [string, string] {
  if ("email" in q) return ["email", q.email];
  if ("license_key" in q) return ["license key", q.license_key];
  if ("order_code" in q) return ["mã đơn", `#${q.order_code}`];
  if ("license_id" in q) return ["license id", q.license_id];
  return ["mã máy", q.device_id_hash];
}

/** Gợi ý định dạng ô tra cứu (trạng thái chưa có từ khóa, không có kết quả, sai định dạng). */
const FORMATS: readonly [string, string][] = [
  ["Email", "ten@example.com"],
  ["Mã đơn", "1000012"],
  ["License key", "K7Q2-M4XB-9TRD-…"],
  ["License id", "0b9e7c1e-5f3a-…"],
  ["Mã máy", "3fa1…c09e (64 ký tự hex)"],
];

function FormatHints() {
  return (
    <ul className="format-hints" aria-label="Các loại từ khóa">
      {FORMATS.map(([k, v]) => (
        <li key={k}>
          <span>{k}</span>
          <code>{v}</code>
        </li>
      ))}
    </ul>
  );
}

function OpenSearch({ label = "Mở ô tra cứu" }: { label?: string }) {
  return (
    <Button icon={<IconSearch size={16} />} onClick={focusSearch}>
      {label}
    </Button>
  );
}

interface DeviceHit {
  a: Activation;
  key: string;
  /** License của lần kích hoạt này đã bị thu hồi. */
  revoked: boolean;
}

/** Thứ hạng khi chọn lần kích hoạt đại diện của một máy: đang dùng trên license còn hiệu lực trước, rồi license đã thu hồi, rồi đã gỡ. */
const rank = (h: DeviceHit) => (h.a.deactivated_at !== null ? 0 : h.revoked ? 1 : 2);

/** Máy từng kích hoạt các license tìm được (một dòng mỗi máy): lần kích hoạt còn hiệu lực trước, cùng hạng thì mới nhất. */
function devicesOf(r: LookupResult): DeviceHit[] {
  const by = new Map<string, DeviceHit>();
  for (const l of r.licenses) {
    for (const a of l.activations) {
      const hit = { a, key: l.license_key, revoked: l.revoked_at !== null };
      const old = by.get(a.device_id_hash);
      if (!old || rank(old) < rank(hit) || (rank(old) === rank(hit) && old.a.created_at < a.created_at)) by.set(a.device_id_hash, hit);
    }
  }
  return [...by.values()].sort((x, y) => y.a.last_validated_at - x.a.last_validated_at);
}

function deviceColumns(now: number): Column<DeviceHit>[] {
  return [
    {
      header: "Máy",
      cell: ({ a }) => (
        <Cell2
          main={
            <Link to={`/devices/${a.device_id_hash}`} className="row-id">
              {a.device_label ?? shortHash(a.device_id_hash)}
            </Link>
          }
          sub={<code>{shortHash(a.device_id_hash)}</code>}
        />
      ),
    },
    { header: "License", cell: ({ key }) => <code>{maskKey(key)}</code> },
    { header: "Lần kiểm cuối", nowrap: true, cell: ({ a }) => <Cell2 main={<RelTime sec={a.last_validated_at} now={now} />} sub={fmtDateTime(a.last_validated_at)} /> },
    {
      header: "Trạng thái",
      aside: true,
      cell: ({ a, revoked }) =>
        a.deactivated_at !== null ? (
          <Badge tone="muted">Đã gỡ</Badge>
        ) : revoked ? (
          <Badge tone="bad">License đã thu hồi</Badge>
        ) : (
          <Badge tone="ok">Đang kích hoạt</Badge>
        ),
    },
  ];
}

function Group({ title, icon, count, unit, children }: { title: string; icon: ReactNode; count: number; unit: string; children: ReactNode }) {
  return (
    <Card title={title} icon={icon} flush actions={<Badge dot={false} outline>{`${count} ${unit}`}</Badge>}>
      {children}
    </Card>
  );
}

export function SearchPage() {
  const s = useSearch();
  const res = useLoad(() => (s ? api.lookup(s.query) : Promise.resolve(null)), [s?.seq]);
  useEffect(() => {
    if (!res.data) return;
    const to = singleTarget(res.data);
    if (to) navigate(to, { replace: true });
  }, [res.data]);

  if (!s) {
    return (
      <>
        <PageHeader title="Tra cứu" description="Tìm license, đơn và máy của một khách." />
        <Card aria-label="Hướng dẫn tra cứu">
          <EmptyState
            icon={<IconSearch size={22} />}
            title="Nhập email hay license key vào ô tra cứu ở trên."
            hint={
              <>
                Ô tra cứu nhận ra loại từ khóa; mã đơn, license id và mã máy mở thẳng trang chi tiết.
                <FormatHints />
              </>
            }
            action={<OpenSearch />}
          />
        </Card>
      </>
    );
  }

  const now = nowSec();
  const [kind, value] = describe(s.query);
  const r = res.data;
  const devices = r ? devicesOf(r) : [];
  const badInput = res.error?.code === "invalid_request";
  return (
    <>
      <PageHeader
        title="Kết quả tra cứu"
        description={
          <p className="page-meta search-meta">
            <span>
              Tìm theo {kind}: <strong className="search-term">{value}</strong>
            </span>
            {r && !res.loading && (
              <span>{`${r.licenses.length} license · ${r.orders.length} đơn · ${devices.length} máy`}</span>
            )}
          </p>
        }
        actions={<OpenSearch label="Tra cứu khác" />}
      />
      {res.error && !badInput && <ErrorBox error={res.error} onRetry={res.reload} title="Không tra cứu được" />}
      {badInput && (
        <Card aria-label="Từ khóa không hợp lệ">
          <EmptyState
            variant="error"
            title={`Máy chủ không nhận ${kind} này`}
            hint={
              <>
                {"license_key" in s.query
                  ? "Key có 28 ký tự (không tính gạch nối) và một ký tự kiểm tra; có thể gõ nhầm một ký tự."
                  : "Kiểm lại định dạng rồi tìm lại."}
                <FormatHints />
              </>
            }
            action={<OpenSearch label="Sửa từ khóa" />}
          />
        </Card>
      )}
      {res.loading && (
        <div className="search-groups">
          <SkeletonTable headers={["Key", "Email", "Gói", "Hạn dùng", "Số máy", "Trạng thái"]} rows={2} />
          <SkeletonTable headers={["Mã đơn", "Tạo lúc", "Email", "Gói", "Số tiền", "Trạng thái"]} rows={3} />
        </div>
      )}
      {r && !res.loading && (
        <div className="search-groups">
          {r.licenses.length === 0 && r.orders.length === 0 && (
            <Card aria-label="Không có kết quả">
              <EmptyState
                variant="no-results"
                title="Không tìm thấy gì."
                hint={
                  <>
                    Không có license hay đơn nào khớp {kind} này. Kiểm lại chính tả, hay thử loại từ khóa khác:
                    <FormatHints />
                  </>
                }
                action={<OpenSearch label="Tra cứu khác" />}
              />
            </Card>
          )}
          {r.licenses.length > 0 && (
            <Group title="License" icon={<IconKey size={18} />} count={r.licenses.length} unit="license">
              <DataTable flush caption="License tìm được" columns={licenseColumns(now)} rows={r.licenses} rowKey={(l) => l.id} rowHref={(l) => `/licenses/${l.id}`} empty="" />
            </Group>
          )}
          {r.orders.length > 0 && (
            <Group title="Đơn hàng" icon={<IconCart size={18} />} count={r.orders.length} unit="đơn">
              <DataTable flush caption="Đơn tìm được" columns={orderColumns(now)} rows={r.orders} rowKey={(o) => String(o.order_code)} rowHref={(o) => `/orders/${o.order_code}`} empty="" />
            </Group>
          )}
          {devices.length > 0 && (
            <Group title="Máy" icon={<IconMonitor size={18} />} count={devices.length} unit="máy">
              <DataTable flush caption="Máy từng kích hoạt các license trên" columns={deviceColumns(now)} rows={devices} rowKey={(d) => d.a.device_id_hash} rowHref={(d) => `/devices/${d.a.device_id_hash}`} empty="" />
            </Group>
          )}
        </div>
      )}
    </>
  );
}
