import { type FormEvent, useState } from "react";
import { type AuditFilters, api } from "../api/endpoints";
import { auditColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { DateInput } from "../components/Field";
import { usePaged } from "../hooks";

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
const ACTOR_OPTIONS: readonly (readonly ["" | ActorFilter, string])[] = [
  ["", "Tất cả"],
  ["admin", "Người vận hành (admin)"],
  ["api", "App (api)"],
  ["webhook", "Webhook PayOS"],
  ["reconcile", "Đối soát (cron)"],
];

const toActor = (v: string): AuditDraft["actor"] => ACTOR_OPTIONS.find(([k]) => k === v)?.[0] ?? "";

/** Cùng mẫu với server: email không khớp nên không bao giờ lọt vào URL. */
const ACTION_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ACTION_ERROR = "Việc (action) chỉ gồm chữ thường, số và dấu gạch dưới";

export function AuditPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [f, setF] = useState(EMPTY);
  const [actionError, setActionError] = useState(false);
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
  function apply(e: FormEvent) {
    e.preventDefault();
    const action = draft.action.trim();
    if (action !== "" && !ACTION_PATTERN.test(action)) {
      setActionError(true);
      return;
    }
    setActionError(false);
    setF({ ...draft, action });
  }
  return (
    <>
      <h1>Nhật ký</h1>
      <form className="filters" onSubmit={apply}>
        <label className="field">
          Ai (actor)
          <select value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: toActor(e.target.value) })}>
            {ACTOR_OPTIONS.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Việc (action)
          <input
            value={draft.action}
            placeholder="license_revoked… (chữ thường, gạch dưới)"
            aria-invalid={actionError}
            onChange={(e) => {
              setDraft({ ...draft, action: e.target.value });
              setActionError(false);
            }}
          />
          {actionError && (
            <span className="error" role="alert">
              {ACTION_ERROR}
            </span>
          )}
        </label>
        <DateInput label="Từ ngày" value={draft.from} onChange={(from) => setDraft({ ...draft, from })} />
        <DateInput label="Đến ngày" value={draft.to} onChange={(to) => setDraft({ ...draft, to })} />
        <label className="check">
          <input type="checkbox" checked={draft.includeViews} onChange={(e) => setDraft({ ...draft, includeViews: e.target.checked })} />
          Hiện cả lượt xem và tra cứu
        </label>
        <button type="submit">Lọc</button>
      </form>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={auditColumns}
        rows={list.rows}
        rowKey={(a, i) => ("id" in a ? String(a.id) : String(i))}
        empty="Không có dòng nào"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
    </>
  );
}
