// Trang Hệ thống (spec Web Admin phần 3a; giao diện mới mục 2): cảnh báo vận hành, bản phát hành app, model. Chỉ đọc.
// Hai nguồn tải riêng (một nguồn lỗi không che nguồn kia), Làm mới tải cả hai. Mọi chuỗi từ API render làm văn bản
// (React tự thoát).
import { useMemo, useState } from "react";
import { api } from "../api/endpoints";
import type { AlertRowFull, AlertsResponse, ChannelInfo, ModelFile, ModelsInfo, Source } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { type Column, DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox } from "../components/Feedback";
import { IconAlert, IconBox, IconChevronDown, IconChevronUp, IconClock, IconInfo, IconRefresh, IconServer, IconWarning } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { LoadingBlock, SkeletonLine } from "../components/Skeleton";
import { fmtAgo, fmtBytes, fmtDateTime, fmtHm, fmtInt, nowSec, parseIsoUtc } from "../format";
import { type Loaded, useLoad } from "../hooks";

/** Chuỗi ngày giờ ISO của bucket thành GMT+7; không parse được thì hiện nguyên chuỗi gốc. */
function fmtIso(iso: string): string {
  const ms = parseIsoUtc(iso);
  return Number.isNaN(ms) ? iso : fmtDateTime(Math.floor(ms / 1000));
}

/** Ghi chú dài hơn chừng này (hay nhiều dòng hơn) thì gấp gọn, có nút Xem đầy đủ. */
const NOTES_FOLD_CHARS = 220;
const NOTES_FOLD_LINES = 4;

export function SystemPage() {
  const alerts = useLoad(() => api.alerts(), []);
  const releases = useLoad(() => api.releases(), []);
  const loadedAt = useMemo(() => (alerts.data || releases.data ? nowSec() : null), [alerts.data, releases.data]);
  const reload = () => {
    alerts.reload();
    releases.reload();
  };
  return (
    <>
      <PageHeader
        title="Hệ thống"
        description={
          <div className="page-meta">
            <span className="page-meta-note">
              <IconInfo size={16} />
              <span>Chỉ đọc từ URL công khai, không kiểm chữ ký; chữ ký do app kiểm.</span>
            </span>
            {loadedAt !== null && (
              <span className="page-meta-time">
                <IconClock size={14} />
                <span>Cập nhật lúc {fmtHm(loadedAt)}</span>
              </span>
            )}
          </div>
        }
        actions={
          <Button icon={<IconRefresh size={16} />} loading={alerts.loading || releases.loading} onClick={reload}>
            Làm mới
          </Button>
        }
      />

      <div className="sys-stack">
        <AlertsCard alerts={alerts} />

        <Card
          title="Bản phát hành app"
          description="Bản mới nhất của từng kênh (latest.json trên máy chủ phát hành)"
          icon={<IconServer size={18} />}
          className="sys-releases"
        >
          {releases.error ? (
            <ErrorBox error={releases.error} onRetry={releases.reload} />
          ) : releases.data ? (
            <div className="sys-channels">
              <ChannelPanel name="Stable" source={releases.data.channels.stable} />
              <ChannelPanel name="Beta" source={releases.data.channels.beta} />
            </div>
          ) : (
            <LoadingBlock label="Đang tải bản phát hành…">
              <div className="sys-channels" aria-hidden="true">
                {[0, 1].map((i) => (
                  <div key={i} className="sys-channel">
                    <SkeletonLine width="sm" />
                    <SkeletonLine width="md" size="title" />
                    <SkeletonLine width="lg" size="sm" />
                    <SkeletonLine width="xl" size="sm" />
                  </div>
                ))}
              </div>
            </LoadingBlock>
          )}
        </Card>

        <ModelsCard source={releases.data?.models ?? null} loading={releases.loading && !releases.data} failed={releases.error !== null} />
      </div>
    </>
  );
}

/* ---------- Cảnh báo vận hành ---------- */

const ALERT_COLUMNS: Column<AlertRowFull>[] = [
  { header: "Loại", primary: true, cell: (r) => <code>{r.kind}</code> },
  { header: "Từ giờ", nowrap: true, cell: (r) => fmtDateTime(r.window_start) },
  { header: "Số lần", align: "right", cell: (r) => fmtInt(r.count) },
  { header: "Đã báo", align: "right", cell: (r) => fmtInt(r.notified_count) },
  {
    header: "Trạng thái",
    // Điện thoại: huy hiệu cùng dòng với tên cảnh báo, như các danh sách khác
    aside: true,
    cell: (r) => (r.count > r.notified_count ? <Badge tone="warn">Chưa báo</Badge> : <Badge tone="ok">Đã báo</Badge>),
  },
];

function AlertsCard({ alerts }: { alerts: Loaded<AlertsResponse> }) {
  const a = alerts.data;
  const pending = a?.pending ?? 0;
  const more = a && a.total > a.items.length ? ` (hiện ${a.items.length} dòng mới nhất)` : "";
  return (
    <Card
      title="Cảnh báo vận hành"
      description={a ? <span>{`${a.total} dòng, ${a.pending} chưa báo${more}`}</span> : "Lỗi lặp lại theo từng giờ, gom thành một dòng"}
      icon={<IconWarning size={18} />}
      tone={pending > 0 ? "warn" : "default"}
      actions={
        a ? (
          pending > 0 ? (
            <Badge tone="warn" outline>{`${fmtInt(pending)} chưa báo`}</Badge>
          ) : (
            <Badge tone="ok" outline>
              Đã báo hết
            </Badge>
          )
        ) : undefined
      }
      flush={!alerts.error}
      footer={
        <span className="sys-foot-note">
          <IconClock size={14} />
          <span>Cron gửi email cảnh báo mỗi giờ</span>
        </span>
      }
    >
      {alerts.error ? (
        <ErrorBox error={alerts.error} onRetry={alerts.reload} />
      ) : a ? (
        a.items.length === 0 ? (
          <EmptyState compact variant="success" title="Chưa có cảnh báo nào" hint="Khi webhook, email hay đối soát lỗi lặp lại, cảnh báo hiện ở đây." />
        ) : (
          <DataTable
            flush
            caption="Cảnh báo vận hành"
            columns={ALERT_COLUMNS}
            rows={a.items}
            rowKey={(r) => `${r.kind}|${r.window_start}`}
            empty=""
            maxHeight="md"
          />
        )
      ) : (
        <DataTable flush loading caption="Cảnh báo vận hành" columns={ALERT_COLUMNS} rows={[]} rowKey={(r) => r.kind} empty="" skeletonRows={3} />
      )}
    </Card>
  );
}

/* ---------- Bản phát hành ---------- */

/** "Chưa có bản nào" hay "Không đọc được (lý do)" ở dạng trạng thái trống gọn; null khi nguồn đọc được. */
function Unavailable({ source, missingHint }: { source: Source<unknown>; missingHint: string }) {
  if (source.status === "missing") return <EmptyState compact title="Chưa có bản nào" hint={missingHint} />;
  if (source.status === "error")
    return (
      <EmptyState
        compact
        variant="error"
        title={`Không đọc được (${source.reason})`}
        hint="Máy chủ phát hành trả lỗi hay dữ liệu sai dạng. Bấm Làm mới để thử lại."
      />
    );
  return null;
}

function SourceBadge({ source }: { source: Source<unknown> }) {
  if (source.status === "ok") return <Badge tone="ok">Đang phát hành</Badge>;
  if (source.status === "missing") return <Badge tone="muted">Chưa có</Badge>;
  return <Badge tone="bad">Lỗi đọc</Badge>;
}

function ChannelPanel({ name, source }: { name: string; source: Source<ChannelInfo> }) {
  return (
    <section className={`sys-channel is-${source.status}`} aria-labelledby={`kenh-${name}`}>
      <header className="sys-channel-head">
        <h3 id={`kenh-${name}`} className="sys-channel-name">
          {name}
        </h3>
        <SourceBadge source={source} />
      </header>
      {source.status === "ok" ? <ChannelBody c={source} /> : <Unavailable source={source} missingHint="Kênh này chưa có latest.json trên máy chủ phát hành." />}
    </section>
  );
}

function ChannelBody({ c }: { c: ChannelInfo }) {
  const ms = c.pub_date === null ? Number.NaN : parseIsoUtc(c.pub_date);
  return (
    <>
      <p className="sys-version">
        <span className="sr-only">Phiên bản </span>
        <strong>{c.version}</strong>
      </p>
      <dl className="sys-facts">
        <div>
          <dt>Ngày phát hành</dt>
          <dd>
            <span>{c.pub_date === null ? "—" : fmtIso(c.pub_date)}</span>
            {!Number.isNaN(ms) && <span className="sys-ago">{fmtAgo(Math.floor(ms / 1000), nowSec())}</span>}
          </dd>
        </div>
        <div>
          <dt>Nền tảng</dt>
          <dd>
            {c.platforms.length > 0 ? (
              <ul className="sys-chips" aria-label="Nền tảng">
                {c.platforms.map((p) => (
                  <li key={p} className="sys-chip">
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <span>—</span>
            )}
          </dd>
        </div>
      </dl>
      <Notes notes={c.notes} />
    </>
  );
}

function Notes({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  if (notes === "") return <p className="sys-notes-empty">Không có ghi chú</p>;
  const long = notes.length > NOTES_FOLD_CHARS || notes.split("\n").length > NOTES_FOLD_LINES;
  return (
    <div className="sys-notes">
      <p className="sys-notes-label">Ghi chú</p>
      <div className={long && !open ? "sys-notes-body is-folded" : "sys-notes-body"}>{notes}</div>
      {long && (
        <Button variant="ghost" size="sm" className="sys-notes-toggle" aria-expanded={open} icon={open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />} onClick={() => setOpen((x) => !x)}>
          {open ? "Thu gọn" : "Xem đầy đủ"}
        </Button>
      )}
    </div>
  );
}

/* ---------- Model ---------- */

const FILE_COLUMNS: Column<ModelFile>[] = [
  { header: "Id", primary: true, cell: (f) => <code>{f.id}</code> },
  { header: "Loại", cell: (f) => f.kind },
  { header: "Phiên bản", cell: (f) => f.version },
  { header: "Dung lượng", align: "right", nowrap: true, cell: (f) => fmtBytes(f.bytes) },
  {
    header: "Gói",
    cell: (f) => (
      <Badge tone={f.tier.includes("pro") ? "info" : "muted"} dot={false}>
        {f.tier}
      </Badge>
    ),
  },
  { header: "Cần app từ bản", mobileLabel: "App từ bản", cell: (f) => f.min_app_version },
];

function ModelsCard({ source, loading, failed }: { source: Source<ModelsInfo> | null; loading: boolean; failed: boolean }) {
  const ok = source?.status === "ok" ? source : null;
  return (
    <Card
      title="Model"
      description={ok ? `Bản manifest số ${ok.sequence}, đăng lúc ${fmtIso(ok.published_at)}` : "Manifest model đang phát hành"}
      icon={<IconBox size={18} />}
      actions={source ? <SourceBadge source={source} /> : undefined}
      flush={ok !== null}
      className="sys-models"
    >
      {failed ? (
        // Cùng nguồn với Bản phát hành app: lỗi đã báo (có Thử lại) ở thẻ trên, ở đây chỉ nhắc nhẹ, không báo lỗi lần hai.
        <EmptyState compact icon={<IconAlert size={22} />} title="Không tải được dữ liệu" hint="Xem lỗi ở mục Bản phát hành app." />
      ) : loading || !source ? (
        <LoadingBlock label="Đang tải model…">
          <div className="sys-metrics" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sys-metric">
                <SkeletonLine width="sm" size="xs" />
                <SkeletonLine width="md" size="lg" />
              </div>
            ))}
          </div>
        </LoadingBlock>
      ) : ok ? (
        <ModelsBody m={ok} />
      ) : (
        <Unavailable source={source} missingHint="Chưa có manifest model trên máy chủ phát hành." />
      )}
    </Card>
  );
}

function ModelsBody({ m }: { m: ModelsInfo }) {
  const total = m.files.reduce((sum, f) => sum + f.bytes, 0);
  return (
    <>
      <dl className="sys-metrics">
        <div className="sys-metric">
          <dt>Số file</dt>
          <dd>{fmtInt(m.files.length)}</dd>
        </div>
        <div className="sys-metric">
          <dt>Tổng dung lượng</dt>
          <dd>{fmtBytes(total)}</dd>
        </div>
        <div className="sys-metric sys-metric-kid">
          <dt>Khóa ký</dt>
          <dd>
            <code>{m.kid}</code>
            <CopyButton text={m.kid} appearance="icon" what="khóa ký" />
          </dd>
        </div>
      </dl>
      {m.files.length > 0 ? (
        <DataTable flush caption="File model" columns={FILE_COLUMNS} rows={m.files} rowKey={(f, i) => `${f.id}|${f.version}|${i}`} empty="" />
      ) : (
        <EmptyState compact title="Manifest chưa có file nào" />
      )}
    </>
  );
}
