// Danh sách license (spec Web Admin §4.2; giao diện mới mục 2): lọc nhanh theo trạng thái (công tắc nhiều lựa chọn, gửi
// đúng tham số `state` như ô chọn cũ) và theo gói; bấm hàng để mở license. Nút chính: cấp license mới không qua đơn.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { PlanCode } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { licenseColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Field, Select } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconPlus } from "../components/icons";
import { KeyReveal } from "../components/MaskedKey";
import { PLAN_LABELS } from "../components/StatusBadge";
import { usePaged } from "../hooks";
import { emptyProps, ListHeader, ResultCount, SegmentField, useListView } from "./list-kit";
import { PLAN_OPTIONS } from "./OrdersPage";

type StateFilter = "" | "active" | "expired" | "revoked" | "locked" | "conflict";

const STATE_OPTIONS: readonly { value: StateFilter; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "active", label: "Còn hạn" },
  { value: "expired", label: "Hết hạn" },
  { value: "revoked", label: "Thu hồi" },
  { value: "locked", label: "Khóa tạm" },
  { value: "conflict", label: "Xung đột" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trạng thái lọc ban đầu từ `?state=` (liên kết "và N mục khác" của trang Việc cần xử lý); giá trị ngoài danh sách thì bỏ. */
function initialState(): StateFilter {
  const v = new URLSearchParams(window.location.search).get("state") ?? "";
  return STATE_OPTIONS.find((o) => o.value === v)?.value ?? "";
}

export function LicensesPage() {
  const [f, setF] = useState(() => ({ state: initialState(), plan: "" }));
  const list = usePaged((cursor) => api.licenses({ ...f, cursor }), [f.state, f.plan]);
  const view = useListView(list, JSON.stringify(f));
  const [issuing, setIssuing] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [plan, setPlan] = useState<PlanCode>("monthly");
  const [revealed, setRevealed] = useState<string | null>(null);
  const emailOk = EMAIL.test(email.trim());

  const chips: FilterChip[] = [];
  const stateLabel = STATE_OPTIONS.find((o) => o.value === f.state)?.label;
  if (f.state && stateLabel) chips.push({ key: "state", name: "Trạng thái", value: stateLabel, onRemove: () => setF({ ...f, state: "" }) });
  if (f.plan) chips.push({ key: "plan", name: "Gói", value: PLAN_LABELS[f.plan as PlanCode], onRemove: () => setF({ ...f, plan: "" }) });
  const clear = () => setF({ state: "", plan: "" });

  return (
    <>
      <ListHeader
        title="License"
        description="License đã cấp, mới nhất ở trên: hạn dùng, số máy và trạng thái."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{
          after: (
            <Button variant="primary" icon={<IconPlus size={16} />} onClick={() => setIssuing(true)}>
              Cấp license mới…
            </Button>
          ),
        }}
      />
      <FilterBar chips={chips} onClear={clear} count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="license" hasMore={list.hasMore} view={view} />}>
        <SegmentField label="Trạng thái" value={f.state} options={STATE_OPTIONS} onChange={(state) => setF({ ...f, state })} />
        <Select label="Gói" value={f.plan} options={PLAN_OPTIONS} onChange={(p) => setF({ ...f, plan: p })} />
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách license" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách license" className="list-card">
          <DataTable
            flush
            caption="Danh sách license"
            columns={licenseColumns(view.now)}
            rows={list.rows}
            rowKey={(l) => l.id}
            rowHref={(l) => `/licenses/${l.id}`}
            empty="Không có license nào"
            {...emptyProps(chips.length > 0, clear, {
              empty: "License hiện ở đây khi khách trả tiền xong hay khi cấp tay bằng nút Cấp license mới.",
              filtered: "Không có license khớp bộ lọc đang chọn.",
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} license mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
      {issuing && (
        <ConfirmDialog
          title="Cấp license mới?"
          description="Tạo license mới không qua đơn (ví dụ bù cho khách), tính từ bây giờ theo số ngày của gói, rồi gửi key qua email."
          confirmLabel="Cấp"
          needsNote
          extraValid={emailOk}
          onConfirm={async (note) => {
            const r = await api.issueLicense(email.trim(), plan, note);
            setRevealed(r.license_key);
            setEmail("");
            setEmailTouched(false);
            list.reload();
          }}
          onConflict={list.reload}
          onClose={() => setIssuing(false)}
        >
          <Field
            label="Email của khách"
            error={emailTouched && email.trim() !== "" && !emailOk ? "Email chưa đúng dạng (ví dụ ten@example.com)." : undefined}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={emailTouched && email.trim() !== "" && !emailOk}
              autoComplete="off"
              placeholder="ten@example.com"
            />
          </Field>
          <Field label="Gói">
            <select value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)}>
              {Object.entries(PLAN_LABELS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </ConfirmDialog>
      )}
      {revealed && <KeyReveal licenseKey={revealed} onClose={() => setRevealed(null)} />}
    </>
  );
}
