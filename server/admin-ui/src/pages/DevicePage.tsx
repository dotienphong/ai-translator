// Chi tiết máy (spec 2026-10-07 §3.1; giao diện mới mục 2): mã máy đầy đủ chép được, dùng thử Free (bắt đầu, kết thúc, lần
// gọi cuối, tiến độ), license từng kích hoạt trên máy (trạng thái trên chính máy này) và nhật ký của máy (lọc từ nhật ký của
// các license theo activation_id). Chỉ đọc. Máy server không biết gì (không dùng thử, không license): trạng thái không tìm thấy.
import { api } from "../api/endpoints";
import type { Activation, LicenseDetail } from "../api/types";
import { AuditTimeline } from "../components/AuditTimeline";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox } from "../components/Feedback";
import { IconClock, IconInfo, IconKey, IconLog } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { PageHeader } from "../components/PageHeader";
import { RatioBar } from "../components/RatioBar";
import { RelTime } from "../components/RelTime";
import { fmtDate, fmtDateTime, fmtHm, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { ago, DetailLayout, DetailNotFound, DetailSkeleton, LicenseList } from "./detail-kit";

const DAY = 86400;
const LIST_CRUMB = { label: "Máy & dùng thử", to: "/trials" };

/** activation_id trong chi tiết của dòng nhật ký (server ghi khi kích hoạt, gỡ, xung đột); không có hay không đọc được: null. */
function activationOf(detail: string | null): string | null {
  if (!detail) return null;
  try {
    const v: unknown = JSON.parse(detail);
    return v && typeof v === "object" && typeof (v as { activation_id?: unknown }).activation_id === "string" ? (v as { activation_id: string }).activation_id : null;
  } catch {
    return null;
  }
}

function HashLine({ hash }: { hash: string }) {
  return (
    <span className="hash-line">
      <code>{hash}</code>
      <CopyButton text={hash} appearance="icon" what="mã máy" />
    </span>
  );
}

export function DevicePage({ hash }: { hash: string }) {
  const data = useLoad(() => api.lookup({ device_id_hash: hash }), [hash]);
  const crumbs = [LIST_CRUMB, { label: shortHash(hash) }];
  if (data.error) {
    return (
      <>
        <PageHeader breadcrumb={crumbs} title={`Máy ${shortHash(hash)}`} description={<HashLine hash={hash} />} />
        <ErrorBox error={data.error} onRetry={data.reload} title="Không tải được máy" />
      </>
    );
  }
  if (!data.data) return <DetailSkeleton breadcrumb={crumbs} label="Đang tải máy…" />;
  const now = nowSec();
  const trial = data.data.trial ?? null;
  const licenses = data.data.licenses;
  if (!trial && licenses.length === 0) {
    return (
      <DetailNotFound
        breadcrumb={crumbs}
        title={`Máy ${shortHash(hash)}`}
        description={<HashLine hash={hash} />}
        heading="Không có dữ liệu về máy này"
        hint="Máy chưa đăng ký dùng thử và chưa kích hoạt license nào. Kiểm lại mã máy (64 ký tự hex)."
        back={{ to: "/trials", label: "Về Máy & dùng thử" }}
      />
    );
  }

  // Các lần kích hoạt của chính máy này, mới nhất trước: tên máy, trạng thái trên từng license, lần thấy cuối.
  const acts: Activation[] = licenses
    .flatMap((l) => l.activations)
    .filter((a) => a.device_id_hash === hash)
    .sort((a, b) => b.created_at - a.created_at);
  const label = acts.find((a) => a.device_label)?.device_label ?? null;
  const lastSeen = Math.max(trial?.last_seen_at ?? 0, ...acts.map((a) => a.last_validated_at));
  const actIds = new Set(acts.map((a) => a.id));
  const log = licenses
    .flatMap((l) => l.audit)
    .filter((a) => {
      const id = activationOf(a.detail);
      return id !== null && actIds.has(id);
    })
    .sort((a, b) => b.at - a.at);
  const purchased = licenses.length > 0;

  const onThisDevice = (l: LicenseDetail) => {
    const a = acts.find((x) => x.license_id === l.id);
    if (!a) return null;
    return (
      <p className="lic-here">
        {a.deactivated_at === null && l.revoked_at !== null ? (
          // Máy chưa gỡ nhưng license đã thu hồi: không phải "đang kích hoạt" (máy về Free ở lần kiểm kế tiếp).
          <>
            <span className="lic-here-dot is-revoked" aria-hidden="true" />
            Trên máy này: kích hoạt từ {fmtDate(a.created_at)}, license đã thu hồi
          </>
        ) : a.deactivated_at === null ? (
          <>
            <span className="lic-here-dot is-on" aria-hidden="true" />
            Trên máy này: đang kích hoạt từ {fmtDate(a.created_at)}
          </>
        ) : (
          <>
            <span className="lic-here-dot" aria-hidden="true" />
            Trên máy này: đã gỡ {fmtDate(a.deactivated_at)} ({a.deactivated_by === "admin" ? "admin gỡ" : "người dùng gỡ"})
          </>
        )}
      </p>
    );
  };

  return (
    <>
      <PageHeader
        breadcrumb={crumbs}
        title={label ?? `Máy ${shortHash(hash)}`}
        badges={purchased ? <Badge tone="ok">Đã mua</Badge> : <Badge>Chưa mua</Badge>}
        description={<HashLine hash={hash} />}
      />
      <DetailLayout
        side={
          <Card title="Thông tin" icon={<IconInfo size={18} />}>
            <KeyValue
              items={[
                { label: "Tên máy", value: label },
                { label: "License", value: purchased ? `${licenses.length} license từng kích hoạt` : "Chưa kích hoạt license nào" },
                { label: "Thấy lần cuối", value: lastSeen > 0 ? fmtDateTime(lastSeen) : null, hint: lastSeen > 0 ? ago(lastSeen, now) : undefined },
              ]}
            />
          </Card>
        }
        main={
          <>
            <Card
              title="Dùng thử Free"
              icon={<IconClock size={18} />}
              actions={trial ? trial.ends_at > now ? <Badge tone="ok">Đang dùng</Badge> : <Badge tone="muted">Đã hết</Badge> : undefined}
            >
              {trial ? (
                <>
                  <dl className="figs">
                    <div>
                      <dt>Bắt đầu</dt>
                      <dd>
                        {fmtDate(trial.started_at)}
                        <span className="figs-sub">{fmtHm(trial.started_at)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Kết thúc</dt>
                      <dd>
                        {fmtDate(trial.ends_at)}
                        <span className="figs-sub">{fmtHm(trial.ends_at)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Lần gọi cuối</dt>
                      <dd>
                        {fmtDate(trial.last_seen_at)}
                        <span className="figs-sub">{fmtHm(trial.last_seen_at)}</span>
                      </dd>
                    </div>
                  </dl>
                  <TrialProgress started={trial.started_at} ends={trial.ends_at} now={now} />
                </>
              ) : (
                <EmptyState compact title="Máy chưa đăng ký dùng thử." hint="Máy chủ không có bản ghi dùng thử của máy này." />
              )}
            </Card>
            <Card title="License từng kích hoạt trên máy" icon={<IconKey size={18} />} flush={purchased}>
              {purchased ? <LicenseList licenses={licenses} now={now} extra={onThisDevice} showEmail /> : <EmptyState compact title="Chưa có license nào" />}
            </Card>
            {purchased && (
              <Card title="Nhật ký của máy" icon={<IconLog size={18} />} description="Kích hoạt, gỡ và xung đột của máy này, lấy từ 50 dòng gần nhất của mỗi license.">
                {log.length > 0 ? <AuditTimeline rows={log} now={now} label="Nhật ký của máy" /> : <EmptyState compact title="Chưa có dòng nào về máy này" />}
              </Card>
            )}
          </>
        }
      />
    </>
  );
}

/** Thanh tiến độ của kỳ dùng thử: ngày thứ mấy trên tổng số ngày, còn bao lâu hay đã hết từ khi nào. */
function TrialProgress({ started, ends, now }: { started: number; ends: number; now: number }) {
  const total = Math.max(1, Math.round((ends - started) / DAY));
  const ended = ends <= now;
  const day = Math.min(total, Math.max(1, Math.ceil((now - started) / DAY)));
  const pct = ended ? 100 : Math.round(((now - started) / (ends - started)) * 100);
  return (
    <div className="money-bar">
      <RatioBar value={pct} className={ended ? "tone-muted" : "tone-ok"} />
      <p className="money-note">
        {ended ? (
          <>
            Kỳ {total} ngày đã kết thúc <RelTime sec={ends} now={now} />.
          </>
        ) : (
          `Ngày ${day} trên ${total}, còn ${Math.ceil((ends - now) / DAY)} ngày.`
        )}
      </p>
    </div>
  );
}
