import { useState } from "react";
import { api } from "../api/endpoints";
import type { TrialRow } from "../api/types";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Select } from "../components/Field";
import { Badge } from "../components/StatusBadge";
import { fmtDateTime, shortHash } from "../format";
import { usePaged } from "../hooks";
import { Link } from "../router";

const STATE_OPTIONS = [
  ["", "Tất cả"],
  ["active", "Đang dùng thử"],
  ["ended", "Đã hết"],
] as const;

const columns: Column<TrialRow>[] = [
  {
    header: "Máy",
    cell: (t) => (
      <Link to={`/devices/${t.device_id_hash}`}>
        <code>{shortHash(t.device_id_hash)}</code>
      </Link>
    ),
  },
  { header: "Bắt đầu", cell: (t) => fmtDateTime(t.started_at) },
  { header: "Kết thúc", cell: (t) => fmtDateTime(t.ends_at) },
  { header: "Lần gọi cuối", cell: (t) => fmtDateTime(t.last_seen_at) },
  { header: "Đã mua", cell: (t) => (t.purchased ? <Badge tone="ok">Đã mua</Badge> : <Badge tone="muted">Chưa</Badge>) },
];

export function TrialsPage() {
  const [state, setState] = useState("");
  const list = usePaged((cursor) => api.trials({ state, cursor }), [state]);
  return (
    <>
      <h1>Máy &amp; dùng thử</h1>
      <div className="filters">
        <Select label="Trạng thái" value={state} options={STATE_OPTIONS} onChange={setState} />
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={(t) => t.device_id_hash}
        empty="Chưa có máy nào dùng thử"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
    </>
  );
}
