// Máy và dùng thử (spec Web Admin §4.2; giao diện mới mục 2): mỗi máy đã đăng ký dùng thử, còn bao lâu, lần app gọi cuối,
// đã mua hay chưa. Lọc dùng thử đang chạy hay đã kết thúc (tham số `state`); bấm hàng để mở trang máy.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { TrialRow } from "../api/types";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { Cell2, WhenCell } from "../components/columns";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { FilterBar } from "../components/FilterBar";
import { daysLeft, fmtDateTime, shortHash } from "../format";
import { usePaged } from "../hooks";
import { Link } from "../router";
import { emptyProps, ListHeader, ResultCount, SegmentField, useListView } from "./list-kit";

type StateFilter = "" | "active" | "ended";

const STATE_OPTIONS: readonly { value: StateFilter; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "active", label: "Đang dùng thử" },
  { value: "ended", label: "Đã kết thúc" },
];

function columns(now: number): Column<TrialRow>[] {
  return [
    {
      header: "Máy",
      cell: (t) => (
        <Link to={`/devices/${t.device_id_hash}`} className="row-id mono" title={t.device_id_hash}>
          {shortHash(t.device_id_hash)}
        </Link>
      ),
    },
    { header: "Bắt đầu", nowrap: true, cell: (t) => <WhenCell sec={t.started_at} now={now} /> },
    {
      header: "Dùng thử",
      nowrap: true,
      cell: (t) => {
        const ended = t.ends_at <= now;
        return <Cell2 main={<span className={ended ? "cell-none" : undefined}>{daysLeft(t.ends_at, now)}</span>} sub={`${ended ? "kết thúc" : "đến"} ${fmtDateTime(t.ends_at)}`} />;
      },
    },
    { header: "Lần thấy cuối", nowrap: true, cell: (t) => <WhenCell sec={t.last_seen_at} now={now} /> },
    {
      header: "Trạng thái",
      aside: true,
      cell: (t) =>
        t.purchased ? (
          <Badge tone="ok">Đã mua</Badge>
        ) : t.ends_at <= now ? (
          <Badge tone="neutral" dot={false}>
            Hết hạn
          </Badge>
        ) : (
          <Badge tone="neutral">Chưa mua</Badge>
        ),
    },
  ];
}

export function TrialsPage() {
  const [state, setState] = useState<StateFilter>("");
  const list = usePaged((cursor) => api.trials({ state, cursor }), [state]);
  const view = useListView(list, state);
  const label = STATE_OPTIONS.find((o) => o.value === state)?.label ?? "";
  const clear = () => setState("");
  return (
    <>
      <ListHeader
        title="Máy & dùng thử"
        description="Máy đã dùng thử Free, mới nhất ở trên: còn bao lâu, lần app gọi cuối, đã mua chưa."
        view={view}
        loading={list.loading}
        onReload={list.reload}
      />
      <FilterBar
        chips={state ? [{ key: "state", name: "Dùng thử", value: label, onRemove: clear }] : []}
        count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="máy" hasMore={list.hasMore} view={view} />}
      >
        <SegmentField label="Dùng thử" value={state} options={STATE_OPTIONS} onChange={setState} />
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách máy" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách máy dùng thử" className="list-card">
          <DataTable
            flush
            caption="Danh sách máy dùng thử"
            columns={columns(view.now)}
            rows={list.rows}
            rowKey={(t) => t.device_id_hash}
            rowHref={(t) => `/devices/${t.device_id_hash}`}
            empty={state ? "Không có máy nào" : "Chưa có máy nào dùng thử"}
            {...emptyProps(state !== "", clear, {
              empty: "Máy hiện ở đây khi app trên máy đó bắt đầu dùng thử Free lần đầu.",
              filtered: `Không có máy nào ở mục ${label}.`,
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} máy mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
    </>
  );
}
