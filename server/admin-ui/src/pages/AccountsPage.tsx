// Tài khoản Google (spec 2026-11-05-dang-nhap-google-design.md §7): mỗi tài khoản đã đăng nhập vào app, mới nhất ở trên, với
// nhóm (đã mua, đang dùng thử, hết dùng thử, đã xóa), số license và số máy. Tìm theo một phần email, lọc theo nhóm, xuất CSV;
// bấm hàng để mở trang tài khoản. Email chỉ đi trong tham số `q` của API khi bấm Tìm (Enter), không vào địa chỉ trang.
import { type FormEvent, useState } from "react";
import { type AccountFilters, ACCOUNTS_EXPORT_URL, api } from "../api/endpoints";
import type { AccountRow, AccountStatus } from "../api/types";
import { Badge, type Tone } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { WhenCell } from "../components/columns";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { SearchInput } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconSearch, IconTable } from "../components/icons";
import { usePaged } from "../hooks";
import { Link } from "../router";
import { emptyProps, ListHeader, ResultCount, SegmentField, useListView } from "./list-kit";

/** Nhãn nhóm của tài khoản (server: accountStatus). `none`: đã đăng nhập nhưng chưa dùng thử (không có trong bộ lọc). */
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  paid: "Đã mua",
  trial_active: "Đang dùng thử",
  trial_ended: "Hết dùng thử",
  deleted: "Đã xóa",
  none: "Chưa dùng thử",
};

const ACCOUNT_STATUS_TONES: Record<AccountStatus, Tone> = {
  paid: "ok",
  trial_active: "info",
  trial_ended: "neutral",
  deleted: "neutral",
  none: "neutral",
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <Badge tone={ACCOUNT_STATUS_TONES[status] ?? "neutral"}>{ACCOUNT_STATUS_LABELS[status] ?? status}</Badge>;
}

/** Email của tài khoản; tài khoản đã xóa không còn email. */
export const DELETED_EMAIL = "(đã xóa)";

type GroupFilter = "" | NonNullable<AccountFilters["filter"]>;

const GROUP_OPTIONS: readonly { value: GroupFilter; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "paid", label: ACCOUNT_STATUS_LABELS.paid },
  { value: "trial_active", label: ACCOUNT_STATUS_LABELS.trial_active },
  { value: "trial_ended", label: ACCOUNT_STATUS_LABELS.trial_ended },
  { value: "deleted", label: ACCOUNT_STATUS_LABELS.deleted },
];

function columns(now: number): Column<AccountRow>[] {
  return [
    {
      header: "Email",
      cell: (a) => (
        <Link to={`/accounts/${a.id}`} className={a.email === null ? "row-id cell-none" : "row-id"} title={a.email ?? undefined}>
          {a.email ?? DELETED_EMAIL}
        </Link>
      ),
    },
    { header: "Ngày tạo", nowrap: true, cell: (a) => <WhenCell sec={a.created_at} now={now} /> },
    { header: "Đăng nhập gần nhất", nowrap: true, cell: (a) => <WhenCell sec={a.last_login_at} now={now} /> },
    { header: "License", align: "right", cell: (a) => a.license_count },
    { header: "Máy", align: "right", cell: (a) => a.device_count },
    { header: "Nhóm", aside: true, cell: (a) => <AccountStatusBadge status={a.status} /> },
  ];
}

export function AccountsPage() {
  // `draft` là chữ đang gõ; `q` là chữ đã bấm Tìm (đang dùng để gọi API).
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<GroupFilter>("");
  const list = usePaged((cursor) => api.accounts({ q, filter: group === "" ? undefined : group, cursor }), [q, group]);
  const view = useListView(list, JSON.stringify([q, group]));
  const groupLabel = GROUP_OPTIONS.find((o) => o.value === group)?.label ?? "";

  const chips: FilterChip[] = [];
  if (q) chips.push({ key: "q", name: "Email", value: q, onRemove: () => (setQ(""), setDraft("")) });
  if (group) chips.push({ key: "group", name: "Nhóm", value: groupLabel, onRemove: () => setGroup("") });
  const clear = () => {
    setQ("");
    setDraft("");
    setGroup("");
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    setQ(draft.trim());
  };

  return (
    <>
      <ListHeader
        title="Tài khoản"
        description="Tài khoản Google đã đăng nhập vào app, mới nhất ở trên: nhóm, số license và số máy."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{
          before: (
            <Button href={ACCOUNTS_EXPORT_URL} icon={<IconTable size={16} />}>
              Xuất CSV
            </Button>
          ),
        }}
      />
      <FilterBar
        onSubmit={search}
        chips={chips}
        onClear={clear}
        actions={
          <Button type="submit" icon={<IconSearch size={16} />}>
            Tìm
          </Button>
        }
        count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="tài khoản" hasMore={list.hasMore} view={view} />}
      >
        <SearchInput label="Tìm theo email" value={draft} onChange={setDraft} placeholder="Một phần email" />
        <SegmentField label="Nhóm" value={group} options={GROUP_OPTIONS} onChange={setGroup} />
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách tài khoản" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách tài khoản" className="list-card">
          <DataTable
            flush
            caption="Danh sách tài khoản"
            columns={columns(view.now)}
            rows={list.rows}
            rowKey={(a) => a.id}
            rowHref={(a) => `/accounts/${a.id}`}
            empty={chips.length > 0 ? "Không có tài khoản nào" : "Chưa có tài khoản nào"}
            {...emptyProps(chips.length > 0, clear, {
              empty: "Tài khoản hiện ở đây khi khách đăng nhập bằng Google trong app.",
              filtered: "Không có tài khoản khớp bộ lọc đang chọn.",
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} tài khoản mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
    </>
  );
}
