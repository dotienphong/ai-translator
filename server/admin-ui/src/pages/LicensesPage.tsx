import { useState } from "react";
import { api } from "../api/endpoints";
import type { PlanCode } from "../api/types";
import { licenseColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Select } from "../components/Field";
import { KeyReveal } from "../components/MaskedKey";
import { PLAN_LABELS } from "../components/StatusBadge";
import { nowSec } from "../format";
import { usePaged } from "../hooks";
import { PLAN_OPTIONS } from "./OrdersPage";

const STATE_OPTIONS = [
  ["", "Tất cả"],
  ["active", "Còn hạn"],
  ["expired", "Hết hạn"],
  ["revoked", "Đã thu hồi"],
  ["locked", "Khóa tạm"],
  ["conflict", "Xung đột máy"],
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LicensesPage() {
  const [f, setF] = useState({ state: "", plan: "" });
  const list = usePaged((cursor) => api.licenses({ ...f, cursor }), [f.state, f.plan]);
  const [issuing, setIssuing] = useState(false);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanCode>("monthly");
  const [revealed, setRevealed] = useState<string | null>(null);
  return (
    <>
      <h1>License</h1>
      <div className="filters">
        <Select label="Trạng thái" value={f.state} options={STATE_OPTIONS} onChange={(state) => setF({ ...f, state })} />
        <Select label="Gói" value={f.plan} options={PLAN_OPTIONS} onChange={(p) => setF({ ...f, plan: p })} />
        <button type="button" onClick={() => setIssuing(true)}>
          Cấp license mới…
        </button>
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={licenseColumns(nowSec())}
        rows={list.rows}
        rowKey={(l) => l.id}
        empty="Không có license nào"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
      {issuing && (
        <ConfirmDialog
          title="Cấp license mới?"
          description="Tạo license mới không qua đơn (ví dụ bù cho khách), tính từ bây giờ theo số ngày của gói, rồi gửi key qua email."
          confirmLabel="Cấp"
          needsNote
          extraValid={EMAIL.test(email.trim())}
          onConfirm={async (note) => {
            const r = await api.issueLicense(email.trim(), plan, note);
            setRevealed(r.license_key);
            setEmail("");
            list.reload();
          }}
          onConflict={list.reload}
          onClose={() => setIssuing(false)}
        >
          <label>
            Email của khách
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Gói
            <select value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)}>
              {Object.entries(PLAN_LABELS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </ConfirmDialog>
      )}
      {revealed && <KeyReveal licenseKey={revealed} onClose={() => setRevealed(null)} />}
    </>
  );
}
