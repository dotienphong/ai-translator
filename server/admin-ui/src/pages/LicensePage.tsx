// Chi tiết license (mockup đã duyệt, spec Web Admin §4.2): key che, nhãn trạng thái, thao tác, bảng máy, đơn, nhật ký.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { Activation } from "../api/types";
import { auditColumns, orderColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox, Notice } from "../components/Feedback";
import { MaskedKey } from "../components/MaskedKey";
import { Badge, LicenseBadges, PLAN_LABELS } from "../components/StatusBadge";
import { daysLeft, fmtDate, fmtDateTime, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";

type Dialog =
  | { kind: "extend" | "resend" | "unlock" | "revoke" }
  | { kind: "deactivate" | "reset"; activation: Activation }
  | null;

export function LicensePage({ id }: { id: string }) {
  const data = useLoad(() => api.lookup({ license_id: id }), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [days, setDays] = useState("30");

  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <p className="muted">Đang tải…</p>;
  const lic = data.data.licenses.find((l) => l.id === id);
  if (!lic) return <p>Không có license này.</p>;
  const now = nowSec();
  const revoked = lic.revoked_at !== null;
  const active = lic.activations.filter((a) => a.deactivated_at === null);
  const daysNum = Number(days);
  const close = () => setDialog(null);

  const deviceColumns: Column<Activation>[] = [
    {
      header: "Tên máy",
      cell: (a) => <Link to={`/devices/${a.device_id_hash}`}>{a.device_label ?? shortHash(a.device_id_hash)}</Link>,
    },
    { header: "Mã máy", cell: (a) => <code>{shortHash(a.device_id_hash)}</code> },
    { header: "Kích hoạt", cell: (a) => fmtDateTime(a.created_at) },
    { header: "Lần kiểm cuối", cell: (a) => fmtDateTime(a.last_validated_at) },
    {
      header: "Trạng thái",
      cell: (a) =>
        a.deactivated_at === null ? (
          <Badge tone="ok">Đang dùng</Badge>
        ) : (
          <Badge tone="muted">
            Đã gỡ ({a.deactivated_by === "admin" ? "admin" : "người dùng"}) {fmtDate(a.deactivated_at)}
          </Badge>
        ),
    },
    {
      header: "",
      cell: (a) =>
        a.deactivated_at === null && !revoked ? (
          <span className="row-actions">
            <button type="button" onClick={() => setDialog({ kind: "reset", activation: a })}>
              Reset hạn mức…
            </button>
            <button type="button" className="danger" onClick={() => setDialog({ kind: "deactivate", activation: a })}>
              Gỡ…
            </button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <h1>License</h1>
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}
      <div className="key-line">
        <MaskedKey value={lic.license_key} />
        <Badge tone="muted">{PLAN_LABELS[lic.plan]}</Badge>
        <LicenseBadges license={lic} now={now} />
      </div>
      <p className="muted">
        {lic.email ?? "— (đã ẩn danh)"} · hết hạn {fmtDate(lic.expires_at)} ({daysLeft(lic.expires_at, now)}) · tạo {fmtDate(lic.created_at)}
      </p>
      {!revoked && (
        <div className="actions">
          <button type="button" onClick={() => setDialog({ kind: "extend" })}>
            Gia hạn…
          </button>
          <button type="button" disabled={!lic.email} onClick={() => setDialog({ kind: "resend" })}>
            Gửi lại email
          </button>
          {lic.locked_at !== null && (
            <button type="button" onClick={() => setDialog({ kind: "unlock" })}>
              Mở khóa
            </button>
          )}
          <button type="button" className="danger" onClick={() => setDialog({ kind: "revoke" })}>
            Thu hồi…
          </button>
        </div>
      )}
      <h2>
        Máy ({active.length} đang kích hoạt{lic.conflict ? ", đang xung đột" : ""})
      </h2>
      <DataTable columns={deviceColumns} rows={lic.activations} rowKey={(a) => a.id} empty="Chưa kích hoạt trên máy nào" />
      <h2>Đơn hàng</h2>
      <DataTable columns={orderColumns} rows={data.data.orders} rowKey={(o) => String(o.order_code)} empty="Không có đơn (license cấp tay)" />
      <h2>Nhật ký (50 dòng gần nhất)</h2>
      <DataTable columns={auditColumns} rows={lic.audit} rowKey={(a, i) => `${a.at}-${i}`} empty="Chưa có dòng nào" />

      {dialog?.kind === "extend" && (
        <ConfirmDialog
          title="Gia hạn license?"
          description="Cộng thêm số ngày, giữ gói. License đã hết hạn thì tính từ bây giờ."
          confirmLabel="Gia hạn"
          needsNote
          extraValid={Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 3650}
          onConfirm={async (note) => {
            const r = await api.extend(id, daysNum, note);
            setNotice(`Đã gia hạn tới ${fmtDate(r.expires_at)}.`);
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        >
          <label>
            Số ngày (1–3650)
            <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
      {dialog?.kind === "resend" && (
        <ConfirmDialog
          title="Gửi lại email chứa key?"
          description={`Gửi key tới ${lic.email ?? ""}.`}
          confirmLabel="Gửi"
          needsNote={false}
          onConfirm={async () => {
            await api.resend(id);
            setNotice("Đã gửi lại email.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
      {dialog?.kind === "unlock" && (
        <ConfirmDialog
          title="Mở khóa license?"
          description="Các lần gỡ máy trước lúc mở khóa không còn tính vào ngưỡng khóa tạm."
          confirmLabel="Mở khóa"
          needsNote
          onConfirm={async (note) => {
            await api.unlock(id, note);
            setNotice("Đã mở khóa.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
      {dialog?.kind === "revoke" && (
        <ConfirmDialog
          title="Thu hồi license?"
          description="Mọi máy đang dùng key này về Free ở lần kiểm tra kế tiếp. Không hoàn tác được."
          confirmLabel="Thu hồi"
          needsNote
          typeToConfirm="THU HOI"
          onConfirm={async (note) => {
            await api.revoke(id, note);
            setNotice("Đã thu hồi license.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
      {dialog?.kind === "deactivate" && (
        <ConfirmDialog
          title={`Gỡ máy ${dialog.activation.device_label ?? shortHash(dialog.activation.device_id_hash)}?`}
          description="Máy này thôi dùng key ở lần kiểm tra kế tiếp. Admin gỡ không tính vào ngưỡng khóa tạm."
          confirmLabel="Gỡ"
          needsNote
          onConfirm={async (note) => {
            await api.deactivate(dialog.activation.id, note);
            setNotice("Đã gỡ máy.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
      {dialog?.kind === "reset" && (
        <ConfirmDialog
          title={`Reset hạn mức của máy ${dialog.activation.device_label ?? shortHash(dialog.activation.device_id_hash)}?`}
          description="Máy bắt đầu bộ đếm hạn mức mới ở lần kiểm tra kế tiếp. Chỉ làm khi khách mất bản ghi bộ đếm."
          confirmLabel="Reset"
          needsNote
          onConfirm={async (note) => {
            await api.resetQuota(dialog.activation.id, note);
            setNotice("Đã reset hạn mức của máy.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
    </>
  );
}
