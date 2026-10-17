// Trang một nhóm lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): các báo cáo cùng dấu vân tay, mới nhất ở trên; xóa cả nhóm.
// API không có route "một nhóm", nên tên và loại của nhóm lấy từ báo cáo đầu tiên và số báo cáo từ danh sách đã tải ("50+" khi còn
// trang sau). Trang luôn kèm báo cáo debug (có huy hiệu): nhóm chỉ có báo cáo debug cũng mở được.
import { useState } from "react";
import { api } from "../api/endpoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { DataTable } from "../components/DataTable";
import { ErrorBox, NoticeRegion, useNotice } from "../components/Feedback";
import { IconArrowLeft, IconRefresh } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { fmtInt } from "../format";
import { usePaged } from "../hooks";
import { DangerZone } from "./detail-kit";
import { KindBadge, reportColumns, reportPath } from "./error-kit";
import { ResultCount, useListView } from "./list-kit";

export function ErrorGroupPage({ fingerprint }: { fingerprint: string }) {
  const list = usePaged((cursor) => api.errorReports({ fingerprint, include_debug: "1", cursor }), [fingerprint]);
  const view = useListView(list, fingerprint);
  const notice = useNotice();
  const [confirming, setConfirming] = useState(false);
  const first = list.rows[0];
  const crumbs = [{ label: "Báo cáo lỗi", to: "/errors" }, { label: first?.code ?? fingerprint }];
  const count = list.hasMore ? `${fmtInt(list.rows.length)}+ báo cáo` : `${fmtInt(list.rows.length)} báo cáo`;
  return (
    <>
      <PageHeader
        breadcrumb={crumbs}
        title={<span className="mono">{first?.code ?? "Nhóm lỗi"}</span>}
        badges={first ? <KindBadge kind={first.kind} /> : undefined}
        description={
          <p className="page-meta detail-meta">
            <span className="hash-line">
              <code>{fingerprint}</code>
              <CopyButton text={fingerprint} appearance="icon" what="dấu vân tay" />
            </span>
            <span>
              <ResultCount n={list.rows.length} unit="báo cáo" hasMore={list.hasMore} view={view} />
            </span>
          </p>
        }
        actions={
          <Button icon={<IconRefresh size={16} />} loading={list.loading} onClick={list.reload}>
            Làm mới
          </Button>
        }
      />
      <NoticeRegion handle={notice} />
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được các báo cáo của nhóm" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Báo cáo của nhóm" className="list-card">
          <DataTable
            flush
            caption="Báo cáo của nhóm"
            columns={reportColumns(view.now)}
            rows={list.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => reportPath(r.id)}
            empty="Nhóm này không còn báo cáo nào"
            emptyHint="Nhóm đã bị xóa, hay các báo cáo đã quá 30 ngày và tự bị xóa."
            emptyAction={
              <Button to="/errors" icon={<IconArrowLeft size={16} />}>
                Về Báo cáo lỗi
              </Button>
            }
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} báo cáo mới nhất` : undefined}
            skeletonRows={6}
          />
        </Card>
      )}
      {list.rows.length > 0 && (
        <DangerZone
          items={[
            {
              name: "Xóa cả nhóm",
              effect: "Xóa mọi báo cáo của nhóm này (kể cả báo cáo debug) và log của chúng khỏi máy chủ. App vẫn gửi lỗi này nếu còn gặp, nhóm sẽ hiện lại.",
              button: (
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  Xóa nhóm…
                </Button>
              ),
            },
          ]}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title="Xóa cả nhóm lỗi này?"
          description={`Xóa toàn bộ ${count} của nhóm này (kể cả báo cáo debug), cùng log của chúng. Không hoàn tác được.`}
          confirmLabel="Xóa nhóm"
          needsNote={false}
          tone="danger"
          onConfirm={async () => {
            const done = await api.deleteErrorGroup(fingerprint);
            notice.show(`Đã xóa ${fmtInt(done.deleted)} báo cáo.`);
            list.reload();
          }}
          onConflict={list.reload}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
