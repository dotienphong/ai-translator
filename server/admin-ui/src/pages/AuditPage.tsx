// Nhật ký (spec Web Admin §4.2; giao diện mới mục 2): hai cách xem, dòng thời gian (mặc định, nhóm theo ngày) và bảng; nhớ
// lựa chọn trong localStorage. Bộ lọc là một form: chỉnh xong bấm Lọc (Enter trong ô cũng được); chip là bộ lọc đang áp
// dụng. `actor` chỉ là bốn giá trị cố định, `action` phải khớp mẫu của server: email không bao giờ vào URL.
import { type FormEvent, useId, useState } from "react";
import { type AuditFilters, api } from "../api/endpoints";
import type { AuditRow } from "../api/types";
import { ACTOR_LABELS, actionLabel, KNOWN_ACTIONS } from "../audit-labels";
import { AuditTimeline, TimelineSkeleton } from "../components/AuditTimeline";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { auditColumns } from "../components/columns";
import { DataTable, MoreFoot } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox } from "../components/Feedback";
import { DateInput, Field, RANGE_ERROR } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconFilter, IconTable, IconTimeline } from "../components/icons";
import { SegmentedControl } from "../components/SegmentedControl";
import { usePaged } from "../hooks";
import { emptyProps, isoDay, ListHeader, ResultCount, SegmentField, useListView } from "./list-kit";

type ActorFilter = NonNullable<AuditFilters["actor"]>;

interface AuditDraft {
  actor: "" | ActorFilter;
  action: string;
  from: string;
  to: string;
  includeViews: boolean;
}

const EMPTY: AuditDraft = { actor: "", action: "", from: "", to: "", includeViews: false };

/** Server chỉ nhận bốn giá trị này (email không vào URL): `admin` khớp mọi `admin:<email>`. */
const ACTOR_OPTIONS: readonly { value: "" | ActorFilter; label: string }[] = [
  { value: "", label: "Tất cả" },
  ...(Object.entries(ACTOR_LABELS) as [ActorFilter, string][]).map(([value, label]) => ({ value, label })),
];

/** Cùng mẫu với server: email không khớp nên không bao giờ lọt vào URL. */
const ACTION_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ACTION_ERROR = "Mã hành động chỉ gồm chữ thường, số và dấu gạch dưới";

type Mode = "timeline" | "table";
const MODE_KEY = "admin.audit.view";

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "table" ? "table" : "timeline";
  } catch {
    return "timeline";
  }
}

/** Ý nghĩa màu chấm của dòng nhật ký (audit-labels.ts). */
const LEGEND = [
  ["ok", "Cấp, gia hạn sau khi trả"],
  ["info", "Người vận hành làm"],
  ["warn", "Cần để mắt"],
  ["bad", "Thu hồi, lỗi, xóa dữ liệu"],
  ["default", "App và lượt xem"],
] as const;

export function AuditPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [f, setF] = useState(EMPTY);
  const [actionError, setActionError] = useState(false);
  const [rangeError, setRangeError] = useState(false);
  const [mode, setModeState] = useState<Mode>(readMode);
  const actionsId = useId();
  const list = usePaged(
    (cursor) =>
      api.audit({
        actor: f.actor || undefined,
        action: f.action,
        from: f.from,
        to: f.to,
        include_views: f.includeViews ? "1" : undefined,
        cursor,
      }),
    [f],
  );
  const view = useListView(list, JSON.stringify(f));

  function setMode(m: Mode) {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // Không lưu được (chế độ riêng tư…): vẫn đổi cách xem cho lần này.
    }
  }

  function apply(e: FormEvent) {
    e.preventDefault();
    const action = draft.action.trim();
    const badAction = action !== "" && !ACTION_PATTERN.test(action);
    const badRange = draft.from !== "" && draft.to !== "" && draft.from > draft.to;
    setActionError(badAction);
    setRangeError(badRange);
    if (badAction || badRange) return;
    setF({ ...draft, action });
  }

  /** Bỏ một bộ lọc đang áp dụng (chip): đổi cả ô nhập lẫn kết quả ngay. */
  function drop(patch: Partial<AuditDraft>) {
    setDraft({ ...draft, ...patch });
    setF({ ...f, ...patch });
    setActionError(false);
    setRangeError(false);
  }
  function clear() {
    setDraft(EMPTY);
    setF(EMPTY);
    setActionError(false);
    setRangeError(false);
  }

  const dirty = JSON.stringify({ ...draft, action: draft.action.trim() }) !== JSON.stringify(f);
  const chips: FilterChip[] = [];
  if (f.actor) chips.push({ key: "actor", name: "Tác nhân", value: ACTOR_LABELS[f.actor], onRemove: () => drop({ actor: "" }) });
  if (f.action) chips.push({ key: "action", name: "Hành động", value: f.action, onRemove: () => drop({ action: "" }) });
  if (f.from) chips.push({ key: "from", name: "Từ ngày", value: isoDay(f.from), onRemove: () => drop({ from: "" }) });
  if (f.to) chips.push({ key: "to", name: "Đến ngày", value: isoDay(f.to), onRemove: () => drop({ to: "" }) });
  if (f.includeViews) chips.push({ key: "views", name: "Lượt xem", value: "có hiện", onRemove: () => drop({ includeViews: false }) });
  const empty = emptyProps<AuditRow>(chips.length > 0, clear, {
    empty: "Nhật ký ghi mỗi lần cấp, gia hạn, kích hoạt máy và mỗi thao tác của người vận hành.",
    filtered: "Không có dòng nào khớp bộ lọc đang áp dụng.",
  });
  const rows = list.rows;
  const showList = !(list.error && rows.length === 0);

  return (
    <>
      <ListHeader
        title="Nhật ký"
        description="Thay đổi license, đơn và thao tác của người vận hành, mới nhất ở trên."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{
          before: (
            <SegmentedControl
              label="Cách xem"
              value={mode}
              onChange={setMode}
              options={[
                { value: "timeline", label: "Dòng thời gian", icon: <IconTimeline size={16} /> },
                { value: "table", label: "Bảng", icon: <IconTable size={16} /> },
              ]}
            />
          ),
        }}
      />
      <FilterBar
        onSubmit={apply}
        className="audit-filters"
        chips={chips}
        onClear={clear}
        count={list.error && rows.length === 0 ? undefined : <ResultCount n={rows.length} unit="dòng" hasMore={list.hasMore} view={view} />}
        error={
          actionError || rangeError ? (
            <>
              {actionError && <span>{ACTION_ERROR}</span>}
              {rangeError && <span>{RANGE_ERROR}</span>}
            </>
          ) : undefined
        }
      >
        <SegmentField label="Tác nhân" value={draft.actor} options={ACTOR_OPTIONS} onChange={(actor) => setDraft({ ...draft, actor })} />
        <label className="switch">
          <input type="checkbox" role="switch" checked={draft.includeViews} onChange={(e) => setDraft({ ...draft, includeViews: e.target.checked })} />
          <span>Hiện cả lượt xem và tra cứu</span>
        </label>
        <span className="filterbar-break" aria-hidden="true" />
        <Field label="Hành động (mã)" className="audit-action">
          <input
            value={draft.action}
            list={actionsId}
            placeholder="vd. license_revoked"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={actionError}
            onChange={(e) => {
              setDraft({ ...draft, action: e.target.value });
              setActionError(false);
            }}
          />
        </Field>
        {/* Gợi ý mã hành động đã biết; nằm ngoài <label> để chữ gợi ý không lẫn vào tên của ô. */}
        <datalist id={actionsId}>
          {KNOWN_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </datalist>
        <DateInput
          label="Từ ngày"
          value={draft.from}
          invalid={rangeError}
          onChange={(from) => {
            setDraft({ ...draft, from });
            setRangeError(false);
          }}
        />
        <DateInput
          label="Đến ngày"
          value={draft.to}
          invalid={rangeError}
          onChange={(to) => {
            setDraft({ ...draft, to });
            setRangeError(false);
          }}
        />
        <Button
          type="submit"
          variant={dirty ? "primary" : "secondary"}
          icon={<IconFilter size={16} />}
          title={dirty ? "Có thay đổi chưa áp dụng" : undefined}
          className="audit-submit"
        >
          Lọc
        </Button>
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được nhật ký" />}
      {showList && (
        <Card flush aria-label="Nhật ký" className="list-card">
          {rows.length > 0 && (
            <ul className="tone-legend" aria-label="Ý nghĩa màu chấm">
              {LEGEND.map(([tone, text]) => (
                <li key={tone}>
                  <span className={`act-dot tone-${tone}`} aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          )}
          {mode === "table" ? (
            <DataTable
              flush
              caption="Nhật ký"
              columns={auditColumns(view.now)}
              rows={rows}
              rowKey={(a, i) => ("id" in a ? String(a.id) : String(i))}
              empty="Không có dòng nào"
              {...empty}
              hasMore={list.hasMore}
              loading={list.loading}
              stale={view.stale}
              onMore={list.more}
              skeletonRows={8}
            />
          ) : rows.length === 0 && list.loading ? (
            <TimelineSkeleton label="Đang tải nhật ký…" className="audit-tl" />
          ) : rows.length === 0 ? (
            <EmptyState title="Không có dòng nào" variant={empty.emptyVariant} hint={empty.emptyHint} action={empty.emptyAction} />
          ) : (
            <>
              <div className={view.stale ? "audit-tl is-stale" : "audit-tl"} aria-busy={view.stale || undefined}>
                <AuditTimeline rows={rows} now={view.now} label="Nhật ký theo thời gian" />
              </div>
              {list.hasMore && <MoreFoot hasMore loading={list.loading} onMore={list.more} />}
            </>
          )}
        </Card>
      )}
    </>
  );
}
