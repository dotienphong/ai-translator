// Tab Gửi tay của trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): báo cáo người dùng gửi bằng nút "Gửi log
// cho hỗ trợ" ở màn hình Giới thiệu, xếp theo thời gian. Người dùng đọc cho hỗ trợ một mã báo cáo (R-XXXX-XXXX): ô "Mã báo
// cáo" tìm đúng báo cáo đó. Báo cáo của bản debug ẩn mặc định.
import { type FormEvent, type ReactNode, useState } from "react";
import { api } from "../api/endpoints";
import type { ErrorReport } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Field } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconSearch } from "../components/icons";
import { usePaged } from "../hooks";
import { parseReportId, reportColumns, reportPath } from "./error-kit";
import { emptyProps, ListHeader, ResultCount, useListView } from "./list-kit";

interface Applied {
  report: string;
  debug: boolean;
}

const NONE: Applied = { report: "", debug: false };

export const CODE_ERROR = "Mã báo cáo có dạng R-XXXX-XXXX (chữ hoa và số, không có chữ I, L, O, U)";

/** `tabs`: công tắc chuyển tab của ErrorsPage, đặt cạnh nút Làm mới ở đầu trang. */
export function ManualReportsPanel({ tabs }: { tabs: ReactNode }) {
  const [f, setF] = useState<Applied>(NONE);
  const [draft, setDraft] = useState("");
  const [codeError, setCodeError] = useState(false);
  const list = usePaged<ErrorReport>(
    (cursor) =>
      api.errorReports({
        kind: "manual",
        report: f.report || undefined,
        include_debug: f.debug ? "1" : undefined,
        cursor,
      }),
    [f],
  );
  const view = useListView(list, JSON.stringify(f));

  function search(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() === "") {
      setCodeError(false);
      setF({ ...f, report: "" });
      return;
    }
    const id = parseReportId(draft);
    setCodeError(id === null);
    if (id !== null) setF({ ...f, report: id });
  }

  function dropReport() {
    setDraft("");
    setCodeError(false);
    setF({ ...f, report: "" });
  }

  function clear() {
    setDraft("");
    setCodeError(false);
    setF(NONE);
  }

  const chips: FilterChip[] = [];
  if (f.report) chips.push({ key: "report", name: "Mã báo cáo", value: f.report, onRemove: dropReport });
  if (f.debug) chips.push({ key: "debug", name: "Báo cáo debug", value: "có hiện", onRemove: () => setF({ ...f, debug: false }) });
  const filtered = chips.length > 0;

  return (
    <>
      <ListHeader
        title="Báo cáo lỗi"
        description="Báo cáo người dùng gửi tay ở màn hình Giới thiệu, mới nhất ở trên. Tìm theo mã báo cáo mà người dùng đọc cho hỗ trợ."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{ before: tabs }}
      />
      <FilterBar
        onSubmit={search}
        collapsible
        chips={chips}
        onClear={clear}
        count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="báo cáo" hasMore={list.hasMore} view={view} />}
      >
        <Field label="Mã báo cáo" className="err-report-code" error={codeError ? CODE_ERROR : undefined}>
          <input
            value={draft}
            placeholder="R-7F3K-92QD"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={codeError || undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setCodeError(false);
            }}
          />
        </Field>
        <Button type="submit" variant="primary" icon={<IconSearch size={16} />}>
          Tìm
        </Button>
        <label className="switch">
          <input type="checkbox" role="switch" checked={f.debug} onChange={(e) => setF({ ...f, debug: e.target.checked })} />
          <span>Hiện cả báo cáo debug</span>
        </label>
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách báo cáo gửi tay" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách báo cáo gửi tay" className="list-card">
          <DataTable
            flush
            caption="Danh sách báo cáo gửi tay"
            columns={reportColumns(view.now)}
            rows={list.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => reportPath(r.id)}
            empty={filtered ? "Không có báo cáo nào" : "Chưa có báo cáo gửi tay nào"}
            {...emptyProps(filtered, clear, {
              empty: "Báo cáo hiện ở đây khi người dùng bấm Gửi log cho hỗ trợ ở màn hình Giới thiệu của app.",
              filtered: "Không có báo cáo nào khớp bộ lọc đang áp dụng.",
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} báo cáo mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
    </>
  );
}
