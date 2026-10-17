// Tab Nhóm lỗi của trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): báo cáo tự động gom theo dấu vân tay (cùng
// loại, cùng mã lỗi, cùng vị trí), mới nhất ở trên. Lọc theo loại và phiên bản app (áp ngay khi đổi loại hay bật công tắc; phiên
// bản áp khi bấm Lọc). Báo cáo của bản debug (máy dev) ẩn mặc định. Bấm hàng để mở trang nhóm.
import { type FormEvent, type ReactNode, useState } from "react";
import { api } from "../api/endpoints";
import type { ErrorGroup, GroupKind } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Field } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconFilter } from "../components/icons";
import { usePaged } from "../hooks";
import { groupColumns, groupPath, KIND_LABELS, VERSION_PATTERN } from "./error-kit";
import { emptyProps, ListHeader, ResultCount, SegmentField, useListView } from "./list-kit";

interface Applied {
  kind: "" | GroupKind;
  version: string;
  debug: boolean;
}

const NONE: Applied = { kind: "", version: "", debug: false };

const KIND_OPTIONS: readonly { value: "" | GroupKind; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "crash", label: KIND_LABELS.crash },
  { value: "session_error", label: KIND_LABELS.session_error },
  { value: "sidecar_died", label: KIND_LABELS.sidecar_died },
];

export const VERSION_ERROR = "Phiên bản chỉ gồm chữ, số, dấu chấm, gạch ngang và dấu cộng (tối đa 40 ký tự)";

/** `tabs`: công tắc chuyển tab của ErrorsPage, đặt cạnh nút Làm mới ở đầu trang. */
export function ErrorGroupsPanel({ tabs }: { tabs: ReactNode }) {
  const [f, setF] = useState<Applied>(NONE);
  const [versionDraft, setVersionDraft] = useState("");
  const [versionError, setVersionError] = useState(false);
  const list = usePaged<ErrorGroup>(
    (cursor) =>
      api.errorGroups({
        kind: f.kind || undefined,
        app_version: f.version || undefined,
        include_debug: f.debug ? "1" : undefined,
        cursor,
      }),
    [f],
  );
  const view = useListView(list, JSON.stringify(f));

  function submitVersion(e: FormEvent) {
    e.preventDefault();
    const version = versionDraft.trim();
    if (version !== "" && !VERSION_PATTERN.test(version)) {
      setVersionError(true);
      return;
    }
    setVersionError(false);
    setF({ ...f, version });
  }

  /** Bỏ một bộ lọc đang áp dụng (chip). */
  function drop(patch: Partial<Applied>) {
    setF({ ...f, ...patch });
    if ("version" in patch) {
      setVersionDraft("");
      setVersionError(false);
    }
  }

  function clear() {
    setF(NONE);
    setVersionDraft("");
    setVersionError(false);
  }

  const chips: FilterChip[] = [];
  if (f.kind) chips.push({ key: "kind", name: "Loại", value: KIND_LABELS[f.kind], onRemove: () => drop({ kind: "" }) });
  if (f.version) chips.push({ key: "version", name: "Phiên bản", value: f.version, onRemove: () => drop({ version: "" }) });
  if (f.debug) chips.push({ key: "debug", name: "Báo cáo debug", value: "có hiện", onRemove: () => drop({ debug: false }) });
  const filtered = chips.length > 0;

  return (
    <>
      <ListHeader
        title="Báo cáo lỗi"
        description="Lỗi app gửi về, gom theo dấu vân tay (cùng loại, mã lỗi và vị trí), mới nhất ở trên. Báo cáo tự xóa sau 30 ngày."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{ before: tabs }}
      />
      <FilterBar
        onSubmit={submitVersion}
        collapsible
        chips={chips}
        onClear={clear}
        count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="nhóm" hasMore={list.hasMore} view={view} />}
        error={versionError ? VERSION_ERROR : undefined}
      >
        <SegmentField label="Loại" value={f.kind} options={KIND_OPTIONS} onChange={(kind) => setF({ ...f, kind })} />
        <label className="switch">
          <input type="checkbox" role="switch" checked={f.debug} onChange={(e) => setF({ ...f, debug: e.target.checked })} />
          <span>Hiện cả báo cáo debug</span>
        </label>
        <Field label="Phiên bản app" className="err-version">
          <input
            value={versionDraft}
            placeholder="vd. 0.1.10"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={versionError || undefined}
            onChange={(e) => {
              setVersionDraft(e.target.value);
              setVersionError(false);
            }}
          />
        </Field>
        <Button type="submit" icon={<IconFilter size={16} />}>
          Lọc
        </Button>
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách nhóm lỗi" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách nhóm lỗi" className="list-card">
          <DataTable
            flush
            caption="Danh sách nhóm lỗi"
            columns={groupColumns(view.now)}
            rows={list.rows}
            rowKey={(g) => g.fingerprint}
            rowHref={(g) => groupPath(g.fingerprint)}
            empty={filtered ? "Không có nhóm lỗi nào" : "Chưa có báo cáo lỗi nào"}
            {...emptyProps(filtered, clear, {
              empty: "Báo cáo hiện ở đây khi app trên máy người dùng gặp lỗi và gửi về. Người dùng cũng gửi tay được ở màn hình Giới thiệu.",
              filtered: "Không có nhóm nào khớp bộ lọc đang áp dụng.",
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} nhóm mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
    </>
  );
}
