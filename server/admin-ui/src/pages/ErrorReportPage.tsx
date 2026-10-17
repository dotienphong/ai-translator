// Chi tiết một báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): thông tin máy và app, thông báo lỗi, ba log dạng
// VĂN BẢN THUẦN (LogView; log do app gửi, không bao giờ dựng HTML từ nó), liên kết sang trang máy và trang nhóm, xóa báo cáo.
// Mở trang này ghi một dòng nhật ký error_report_viewed (server).
import { useState } from "react";
import { api } from "../api/endpoints";
import type { ErrorReportDetail } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, NoticeRegion, useNotice } from "../components/Feedback";
import { IconAlert, IconArrowLeft, IconInfo, IconLog } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { LogView } from "../components/LogView";
import { type Crumb, PageHeader } from "../components/PageHeader";
import { RelTime } from "../components/RelTime";
import { fmtDateTime, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";
import { ago, DangerZone, DetailLayout, DetailSkeleton } from "./detail-kit";
import { BuildBadge, GPU_LABELS, groupPath, KindBadge, osText, ramText, REPORT_PLAN_LABELS } from "./error-kit";

const LOGS = [
  { key: "app", title: "Log ứng dụng", file: "app.log", note: "300 dòng cuối, đã che dữ liệu cá nhân." },
  { key: "asr", title: "Log nhận dạng giọng nói", file: "asr-worker.log", note: "Dòng cảnh báo hay lỗi và 60 dòng cuối." },
  { key: "llama", title: "Log bộ dịch", file: "llama-server.log", note: "Dòng cảnh báo hay lỗi và 60 dòng cuối." },
] as const;

const listPath = (r: ErrorReportDetail | null) => (r?.kind === "manual" ? "/errors?tab=manual" : "/errors");

function crumbsOf(r: ErrorReportDetail | null, id: string): Crumb[] {
  const root = { label: "Báo cáo lỗi", to: listPath(r) };
  if (r && r.kind !== "manual") return [root, { label: r.code ?? r.fingerprint, to: groupPath(r.fingerprint) }, { label: id }];
  return [root, { label: id }];
}

export function ErrorReportPage({ id }: { id: string }) {
  const data = useLoad(() => api.errorReport(id), [id]);
  const notice = useNotice();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const r = data.data;
  const crumbs = crumbsOf(r, id);
  const title = <span className="mono">{id}</span>;
  const back = (
    <Button to={listPath(r)} icon={<IconArrowLeft size={16} />}>
      Về Báo cáo lỗi
    </Button>
  );

  if (deleted) {
    return (
      <>
        <PageHeader breadcrumb={crumbs} title={title} />
        <NoticeRegion handle={notice} />
        <Card aria-label="Báo cáo đã xóa">
          <EmptyState variant="success" title="Đã xóa báo cáo này" hint="Báo cáo và log của nó không còn trên máy chủ." action={back} />
        </Card>
      </>
    );
  }
  if (data.error) {
    if (data.error.status === 404) {
      return (
        <>
          <PageHeader breadcrumb={crumbs} title={title} />
          <Card aria-label="Không có báo cáo này">
            <EmptyState
              variant="no-results"
              title="Không có báo cáo này"
              hint="Máy chủ không có báo cáo mang mã này: mã gõ nhầm, hay báo cáo đã bị xóa (báo cáo tự xóa sau 30 ngày)."
              action={back}
            />
          </Card>
        </>
      );
    }
    return (
      <>
        <PageHeader breadcrumb={crumbs} title={title} />
        <ErrorBox error={data.error} onRetry={data.reload} title="Không tải được báo cáo" />
      </>
    );
  }
  if (!r) return <DetailSkeleton breadcrumb={crumbs} label="Đang tải báo cáo…" />;

  const now = nowSec();
  return (
    <>
      <PageHeader
        breadcrumb={crumbs}
        title={title}
        titleAside={<CopyButton text={r.id} appearance="icon" what="mã báo cáo" />}
        badges={<KindBadge kind={r.kind} />}
        description={
          <p className="page-meta detail-meta">
            <span>{r.kind === "manual" ? "Người dùng gửi tay" : "App tự gửi"}</span>
            <span>
              nhận <RelTime sec={r.received_at} now={now} />
            </span>
          </p>
        }
      />
      <NoticeRegion handle={notice} />
      <DetailLayout
        side={
          <Card title="Thông tin" icon={<IconInfo size={18} />}>
            <KeyValue
              items={[
                { label: "Mã báo cáo", value: r.id, mono: true },
                { label: "Mã lỗi", value: r.code, mono: true },
                { label: "Nhận lúc", value: fmtDateTime(r.received_at), hint: ago(r.received_at, now) },
                { label: "Xảy ra lúc", value: fmtDateTime(r.occurred_at), hint: "giờ trên máy người dùng" },
                { label: "Phiên bản app", value: r.app_version, badge: <BuildBadge build={r.build} /> },
                { label: "Hệ điều hành", value: osText(r) },
                { label: "Chip", value: r.chip },
                { label: "RAM", value: ramText(r.ram_mb) },
                { label: "GPU", value: r.gpu_backend === null ? null : (GPU_LABELS[r.gpu_backend] ?? r.gpu_backend) },
                { label: "Gói model", value: r.model_pack },
                { label: "Gói bản quyền", value: r.plan === null ? null : (REPORT_PLAN_LABELS[r.plan] ?? r.plan) },
                { label: "Ngôn ngữ giao diện", value: r.ui_lang },
                {
                  label: "Máy",
                  value: (
                    <Link to={`/devices/${r.device_id_hash}`} title={r.device_id_hash}>
                      {shortHash(r.device_id_hash)}
                    </Link>
                  ),
                  mono: true,
                  copy: r.device_id_hash,
                  copyWhat: "mã máy",
                },
                {
                  label: "Dấu vân tay",
                  value: <Link to={groupPath(r.fingerprint)}>{r.fingerprint}</Link>,
                  mono: true,
                  copy: r.fingerprint,
                  copyWhat: "dấu vân tay",
                  hidden: r.kind === "manual",
                },
              ]}
            />
          </Card>
        }
        main={
          <>
            <Card title="Thông báo lỗi" icon={<IconAlert size={18} />}>
              {r.message === "" ? <EmptyState compact title="Không có thông báo" /> : <p className="err-message">{r.message}</p>}
            </Card>
            {LOGS.map((l) => (
              <Card
                key={l.key}
                title={l.title}
                icon={<IconLog size={18} />}
                description={`${l.file}: ${l.note}`}
                actions={r.logs[l.key] === "" ? undefined : <CopyButton text={r.logs[l.key]} appearance="icon" what={l.title.toLowerCase()} />}
              >
                <LogView label={`${l.title} (${l.file})`} text={r.logs[l.key]} emptyHint="Báo cáo không kèm log này." />
              </Card>
            ))}
          </>
        }
        danger={
          <DangerZone
            items={[
              {
                name: "Xóa báo cáo này",
                effect: "Xóa báo cáo và log khỏi máy chủ. Báo cáo cũng tự bị xóa sau 30 ngày.",
                button: (
                  <Button variant="danger" onClick={() => setConfirming(true)}>
                    Xóa báo cáo…
                  </Button>
                ),
              },
            ]}
          />
        }
      />
      {confirming && (
        <ConfirmDialog
          title="Xóa báo cáo này?"
          description={`Xóa báo cáo ${r.id} và log của nó khỏi máy chủ. Không hoàn tác được.`}
          confirmLabel="Xóa báo cáo"
          needsNote={false}
          tone="danger"
          onConfirm={async () => {
            await api.deleteErrorReport(r.id);
            notice.show("Đã xóa báo cáo.");
            setDeleted(true);
          }}
          onConflict={data.reload}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
