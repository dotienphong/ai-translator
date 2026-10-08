// Phần chung của ba trang chi tiết (Đơn, License, Máy; spec giao diện mới mục 2 và kế hoạch pha 5):
// - DetailLayout: hai cột khi vùng nội dung đủ rộng (container query, không theo màn hình: thanh bên mở hay thu gọn đều
//   đúng); trái là nội dung chính, phải là thẻ Thông tin rồi Khu vực nguy hiểm. Một cột: Thông tin, nội dung, rồi khu vực
//   nguy hiểm ở cuối (thao tác không hoàn tác nằm xa các nút thường). Thứ tự DOM trùng thứ tự đọc của một cột.
// - Callout: việc cần làm theo trạng thái (đơn chuyển thiếu, cần xử lý, license khóa tạm, đã thu hồi), ngay dưới đầu trang.
// - DangerZone: thẻ viền đỏ, mỗi thao tác một dòng có tên, hậu quả và nút.
// - DetailSkeleton, DetailNotFound: trạng thái tải và không tìm thấy, cùng khung với trang thật.
import type { ReactNode } from "react";
import type { LicenseDetail } from "../api/types";
import { Button } from "../components/Button";
import { Card, type CardTone } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { activeDevices } from "../components/columns";
import { IconArrowLeft, IconArrowRight, IconSearch, IconWarning } from "../components/icons";
import { type Crumb, PageHeader } from "../components/PageHeader";
import { focusSearch } from "../components/SearchBox";
import { LoadingBlock, SkeletonLine } from "../components/Skeleton";
import { LicenseBadges, PLAN_LABELS } from "../components/StatusBadge";
import { daysLeft, fmtDate, maskKey } from "../format";
import { Link } from "../router";
import { RelTime } from "../components/RelTime";

/** Dòng phụ "2 giờ trước" dưới một ngày giờ đầy đủ; quá 30 ngày thì RelTime cũng chỉ ra ngày, trùng giá trị: bỏ. */
export function ago(sec: number, now: number): ReactNode {
  return now - sec < 30 * 86400 ? <RelTime sec={sec} now={now} /> : undefined;
}

/** Email cho ô hẹp: được xuống dòng ngay trước @ (đỡ hơn cắt giữa chữ). */
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  if (at <= 0) return <>{email}</>;
  return (
    <span className="email-text">
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </span>
  );
}

export function DetailLayout({ side, main, danger }: { side: ReactNode; main: ReactNode; danger?: ReactNode }) {
  return (
    <div className="detail-wrap">
      <div className="detail">
        <div className="detail-side">{side}</div>
        <div className="detail-main">{main}</div>
        {danger && <div className="detail-danger">{danger}</div>}
      </div>
    </div>
  );
}

/** Dải việc cần làm ngay dưới đầu trang: thẻ có tông, biểu tượng, câu hướng dẫn và nút. */
export function Callout({ tone, icon, title, children, actions }: { tone: CardTone; icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card tone={tone} icon={icon} title={title} description={children} actions={actions} className="callout" />
  );
}

export interface DangerAction {
  name: string;
  /** Hậu quả, một hai câu. */
  effect: ReactNode;
  button: ReactNode;
}

export function DangerZone({ items }: { items: readonly DangerAction[] }) {
  return (
    <Card tone="danger" icon={<IconWarning size={18} />} title="Khu vực nguy hiểm" description="Không hoàn tác được." className="danger-zone">
      {items.map((it) => (
        <div className="danger-item" key={it.name}>
          <div className="danger-text">
            <p className="danger-name">{it.name}</p>
            <p className="danger-effect">{it.effect}</p>
          </div>
          {it.button}
        </div>
      ))}
    </Card>
  );
}

/** Đầu trang chi tiết khi chưa có dữ liệu: đường dẫn thật, tiêu đề là thanh chờ (tên đọc "Đang tải…"). */
function LoadingHeader({ breadcrumb }: { breadcrumb: readonly Crumb[] }) {
  return (
    <PageHeader
      breadcrumb={breadcrumb}
      title={
        <>
          <span className="sr-only">Đang tải…</span>
          <SkeletonLine width="lg" size="title" />
        </>
      }
      description={<SkeletonLine width="xl" size="sm" />}
    />
  );
}

function SkeletonCard({ lines, title = "md" }: { lines: number; title?: "sm" | "md" }) {
  return (
    <div className="ui-card skel-card" aria-hidden="true">
      <div className="ui-card-head">
        <SkeletonLine width={title} size="lg" />
      </div>
      <div className="ui-card-body skel-stack">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} width={(["xl", "lg", "full", "md"] as const)[i % 4]} />
        ))}
      </div>
    </div>
  );
}

/** Khung chờ của trang chi tiết: cùng bố cục hai cột với trang thật (không nhảy bố cục khi dữ liệu về). */
export function DetailSkeleton({ breadcrumb, label }: { breadcrumb: readonly Crumb[]; label: string }) {
  return (
    <>
      <LoadingHeader breadcrumb={breadcrumb} />
      <LoadingBlock label={label}>
        <DetailLayout side={<SkeletonCard lines={6} title="sm" />} main={<>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </>} />
      </LoadingBlock>
    </>
  );
}

/** Trang chi tiết mà server không có (mã gõ nhầm, đã xóa…): đầu trang giữ đường dẫn, thân là trạng thái không có kết quả. */
export function DetailNotFound({
  breadcrumb,
  title,
  description,
  heading,
  hint,
  back,
}: {
  breadcrumb: readonly Crumb[];
  title: ReactNode;
  description?: ReactNode;
  heading: string;
  hint: ReactNode;
  back: { to: string; label: string };
}) {
  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={title} description={description} />
      <Card aria-label={heading}>
        <EmptyState
          variant="no-results"
          title={heading}
          hint={hint}
          action={
            <>
              <Button to={back.to} icon={<IconArrowLeft size={16} />}>
                {back.label}
              </Button>
              <Button variant="ghost" icon={<IconSearch size={16} />} onClick={focusSearch}>
                Tra cứu khác
              </Button>
            </>
          }
        />
      </Card>
    </>
  );
}

/**
 * Danh sách license gọn (trang đơn, trang máy): key che là liên kết, vùng bấm phủ cả thẻ; huy hiệu trạng thái, gói, hạn,
 * số máy. `extra`: dòng thêm của trang (trạng thái trên máy này…).
 */
export function LicenseList({
  licenses,
  now,
  extra,
  showEmail = false,
}: {
  licenses: readonly LicenseDetail[];
  now: number;
  extra?(l: LicenseDetail): ReactNode;
  /** Email của license (trang máy: các license có thể của nhiều khách). */
  showEmail?: boolean;
}) {
  return (
    <ul className="lic-list">
      {licenses.map((l) => {
        const n = activeDevices(l);
        return (
          <li key={l.id} className="lic-item">
            <div className="lic-head">
              <Link to={`/licenses/${l.id}`} className="lic-key mono">
                {maskKey(l.license_key)}
              </Link>
              <span className="cell-badges">
                <LicenseBadges license={l} now={now} />
              </span>
            </div>
            <p className="lic-meta">
              <span>{PLAN_LABELS[l.plan] ?? l.plan}</span>
              <span>{l.revoked_at !== null ? `hết hạn ${fmtDate(l.expires_at)}` : `${daysLeft(l.expires_at, now)} (${fmtDate(l.expires_at)})`}</span>
              <span>{`${n} máy đang kích hoạt`}</span>
            </p>
            {showEmail && l.email && <p className="lic-email">{l.email}</p>}
            {extra?.(l)}
            <span className="lic-go" aria-hidden="true">
              Mở
              <IconArrowRight size={16} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
