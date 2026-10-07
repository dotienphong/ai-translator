// Chi tiết đơn (spec Web Admin §4.2): Cấp tay, Xử lý đơn paid_needs_review, xem trạng thái trên PayOS, nhật ký của đơn.
import { useState } from "react";
import { api } from "../api/endpoints";
import { auditColumns, licenseColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { ErrorBox, Notice } from "../components/Feedback";
import { KeyReveal } from "../components/MaskedKey";
import { OrderStatusBadge, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDateTime, fmtVnd, nowSec } from "../format";
import { useLoad } from "../hooks";

type Dialog = "grant" | "grant_new" | "refunded" | null;

const GRANT_KINDS: Record<string, string> = { new: "Mua mới", extend: "Mua thêm cùng gói", change: "Đổi gói" };

/** Hộp key mới nằm ngoài OrderDetail: tải lại đơn bị lỗi thì trang đơn thành ErrorBox, nhưng key (chỉ hiện một lần) vẫn còn đó. */
export function OrderPage({ code }: { code: number }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  return (
    <>
      <OrderDetail code={code} onKeyIssued={setRevealed} />
      {revealed && <KeyReveal licenseKey={revealed} onClose={() => setRevealed(null)} />}
    </>
  );
}

function OrderDetail({ code, onKeyIssued }: { code: number; onKeyIssued(key: string): void }) {
  const data = useLoad(() => api.lookup({ order_code: code }), [code]);
  const log = useLoad(() => api.audit({ order_code: String(code) }), [code]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payos, setPayos] = useState<string | null>(null);
  const reload = () => {
    data.reload();
    log.reload();
  };

  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <p className="muted">Đang tải…</p>;
  const order = data.data.orders.find((o) => o.order_code === code);
  if (!order) return <p>Không có đơn #{code}.</p>;
  const closed = order.status === "paid" || order.status === "refunded" || order.status === "paid_needs_review";

  async function showPayos() {
    try {
      setPayos(JSON.stringify(await api.paymentStatus(code), null, 2));
    } catch (e) {
      setPayos(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <h1>
        Đơn #{order.order_code} <OrderStatusBadge status={order.status} />
      </h1>
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}
      <dl className="facts">
        <dt>Email</dt>
        <dd>{order.email ?? "— (đã ẩn danh)"}</dd>
        <dt>Gói</dt>
        <dd>{PLAN_LABELS[order.plan]}</dd>
        <dt>Số tiền</dt>
        <dd>
          đã trả {fmtVnd(order.amount_paid)} / {fmtVnd(order.amount)}
        </dd>
        <dt>Tạo lúc</dt>
        <dd>{fmtDateTime(order.created_at)}</dd>
        <dt>Trả lúc</dt>
        <dd>{fmtDateTime(order.paid_at)}</dd>
        <dt>Loại</dt>
        <dd>{order.grant_kind ? (GRANT_KINDS[order.grant_kind] ?? order.grant_kind) : order.renew_license_id ? "Gia hạn hay đổi gói" : "Mua mới"}</dd>
        <dt>Email key</dt>
        <dd>
          {order.email_sent_at
            ? `đã gửi ${fmtDateTime(order.email_sent_at)}`
            : order.email_gave_up_at
              ? "gửi thất bại, đã thôi gửi"
              : "chưa gửi"}
        </dd>
      </dl>
      <div className="actions">
        {!closed && (
          <button type="button" onClick={() => setDialog("grant")}>
            Cấp tay…
          </button>
        )}
        {order.status === "paid_needs_review" && (
          <>
            <button type="button" onClick={() => setDialog("grant_new")}>
              Cấp key mới…
            </button>
            <button type="button" className="danger" onClick={() => setDialog("refunded")}>
              Ghi đã hoàn tiền…
            </button>
          </>
        )}
        <button type="button" onClick={showPayos}>
          Xem trạng thái trên PayOS
        </button>
      </div>
      {payos && <pre className="json">{payos}</pre>}
      <h2>License</h2>
      <DataTable columns={licenseColumns(nowSec())} rows={data.data.licenses} rowKey={(l) => l.id} empty="Đơn chưa áp vào license nào" />
      <h2>Nhật ký của đơn</h2>
      {log.error && <ErrorBox error={log.error} onRetry={log.reload} />}
      <DataTable columns={auditColumns} rows={log.data?.items ?? []} rowKey={(a, i) => `${a.at}-${i}`} empty="Chưa có dòng nào" loading={log.loading} />

      {dialog === "grant" && (
        <ConfirmDialog
          title={`Cấp tay đơn #${code}?`}
          description="Cấp license theo gói của đơn, tính từ bây giờ, rồi gửi key qua email. Dùng khi khách chuyển thiếu rồi chuyển bù, hay đơn đã trả mà chưa được cấp."
          confirmLabel="Cấp"
          needsNote
          onConfirm={async (note) => {
            const r = await api.grantOrder(code, note);
            onKeyIssued(r.license_key);
            reload();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "grant_new" && (
        <ConfirmDialog
          title={`Cấp key mới cho đơn #${code}?`}
          description="License của đơn đã bị thu hồi. Cấp một license mới (key mới, gói của đơn, tính từ bây giờ) và gửi key qua email. License đã thu hồi giữ nguyên."
          confirmLabel="Cấp key mới"
          needsNote
          onConfirm={async (note) => {
            const r = await api.resolveOrder(code, "grant_new_license", note);
            if (r.license_key) onKeyIssued(r.license_key);
            reload();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "refunded" && (
        <ConfirmDialog
          title={`Ghi đơn #${code} là đã hoàn tiền?`}
          description="Chỉ ghi nhận bạn đã chuyển trả tiền cho khách ngoài hệ thống. Đơn thành refunded, không cấp gì. Không hoàn tác được."
          confirmLabel="Ghi đã hoàn tiền"
          needsNote
          typeToConfirm="DA HOAN TIEN"
          onConfirm={async (note) => {
            await api.resolveOrder(code, "refunded", note);
            setNotice("Đã ghi đơn là đã hoàn tiền.");
            reload();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
