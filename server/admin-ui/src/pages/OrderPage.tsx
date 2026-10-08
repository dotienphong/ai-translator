// Chi tiết đơn (spec Web Admin §4.2; giao diện mới mục 2): việc cần làm theo trạng thái (Cấp tay đơn chưa cấp, Xử lý đơn
// paid_needs_review), số tiền, license của đơn, nhật ký của đơn; bên phải là thẻ Thông tin và kết quả xem trạng thái trên
// PayOS. Quy tắc nút: Cấp tay… khi đơn chưa khép (khác paid, refunded, paid_needs_review); Cấp key mới… và Ghi đã hoàn
// tiền… chỉ khi paid_needs_review; Xem trạng thái trên PayOS (chỉ đọc) luôn có.
import { type ReactNode, useState } from "react";
import type { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { OrderRow, OrderStatus, PaymentStatus } from "../api/types";
import { AuditTimeline, TimelineSkeleton } from "../components/AuditTimeline";
import { Badge } from "../components/Badge";
import { Button, IconButton } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, Notice } from "../components/Feedback";
import { IconAlert, IconBan, IconClock, IconClose, IconCoins, IconInfo, IconKey, IconLog, IconMail, IconWarning } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { KeyReveal } from "../components/MaskedKey";
import { PageHeader } from "../components/PageHeader";
import { RatioBar } from "../components/RatioBar";
import { RelTime } from "../components/RelTime";
import { OrderStatusBadge, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDateTime, fmtHm, fmtVnd, nowSec } from "../format";
import { useLoad } from "../hooks";
import { ago, Callout, DetailLayout, EmailText, DetailNotFound, DetailSkeleton, LicenseList } from "./detail-kit";

type Dialog = "grant" | "grant_new" | "refunded" | null;

const GRANT_KINDS: Record<string, string> = { new: "Mua mới", extend: "Mua thêm cùng gói", change: "Đổi gói" };

/** Key vừa cấp và tiêu đề hộp hiện nó: gia hạn hay đổi gói thì server trả lại key CŨ của license, không phải key mới. */
interface Revealed {
  key: string;
  title: string;
}
const RENEWED_KEY_TITLE = "Key của license (đơn gia hạn hay đổi gói)";

/** Mô tả hộp Cấp tay theo dữ liệu của đơn: đơn gia hạn hay đổi gói áp vào license cũ; đơn chưa nhận đủ tiền thì có cảnh báo. */
function grantDescription(order: OrderRow): ReactNode {
  const when = order.renew_license_id
    ? "áp vào license của đơn (gia hạn hay đổi gói) theo luật của đơn, tính từ bây giờ"
    : "tính từ bây giờ";
  return (
    <>
      Cấp license theo gói của đơn, {when}, rồi gửi key qua email. Dùng khi khách chuyển thiếu rồi chuyển bù, hay đơn đã trả mà chưa được cấp.
      {order.amount_paid < order.amount && (
        <>
          {" "}
          <strong>
            Đơn mới nhận {fmtVnd(order.amount_paid)} / {fmtVnd(order.amount)}: chỉ cấp khi khách đã chuyển bù hay bạn đã xác minh.
          </strong>
        </>
      )}
    </>
  );
}

const crumbs = (code: number) => [{ label: "Đơn hàng", to: "/orders" }, { label: `#${code}` }];

/** Hộp key mới nằm ngoài OrderDetail: tải lại đơn bị lỗi thì trang đơn thành ErrorBox, nhưng key (chỉ hiện một lần) vẫn còn đó. */
export function OrderPage({ code }: { code: number }) {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  return (
    <>
      <OrderDetail code={code} onKeyIssued={setRevealed} />
      {revealed && <KeyReveal licenseKey={revealed.key} title={revealed.title} onClose={() => setRevealed(null)} />}
    </>
  );
}

/** Kết quả lần xem trạng thái trên PayOS gần nhất (chỉ trong bộ nhớ của trang). */
type Payos = { at: number; data: PaymentStatus; error?: undefined } | { at: number; error: ApiError; data?: undefined };

function OrderDetail({ code, onKeyIssued }: { code: number; onKeyIssued(revealed: Revealed): void }) {
  const data = useLoad(() => api.lookup({ order_code: code }), [code]);
  const log = useLoad(() => api.audit({ order_code: String(code) }), [code]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payos, setPayos] = useState<Payos | null>(null);
  const reload = () => {
    data.reload();
    log.reload();
  };

  if (data.error) {
    return (
      <>
        <PageHeader breadcrumb={crumbs(code)} title={`Đơn #${code}`} />
        <ErrorBox error={data.error} onRetry={data.reload} title="Không tải được đơn" />
      </>
    );
  }
  if (!data.data) return <DetailSkeleton breadcrumb={crumbs(code)} label="Đang tải đơn…" />;
  const order = data.data.orders.find((o) => o.order_code === code);
  if (!order) {
    return (
      <DetailNotFound
        breadcrumb={crumbs(code)}
        title={`Đơn #${code}`}
        heading="Không có đơn này"
        hint="Máy chủ không có đơn mang mã này. Kiểm lại mã (có thể gõ nhầm một chữ số), hay tra cứu theo email của khách."
        back={{ to: "/orders", label: "Về danh sách đơn" }}
      />
    );
  }
  const now = nowSec();
  const closed = order.status === "paid" || order.status === "refunded" || order.status === "paid_needs_review";
  const open = (d: Dialog) => () => setDialog(d);

  async function showPayos() {
    try {
      setPayos({ at: nowSec(), data: await api.paymentStatus(code) });
    } catch (e) {
      setPayos({ at: nowSec(), error: e as ApiError });
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={crumbs(code)}
        title={`Đơn #${order.order_code}`}
        badges={<OrderStatusBadge status={order.status} />}
        description={
          <p className="page-meta detail-meta">
            <span title={order.email ?? undefined}>{order.email ?? "Không có email (đã ẩn danh)"}</span>
            <span>Gói {PLAN_LABELS[order.plan] ?? order.plan}</span>
            <span>
              Tạo <RelTime sec={order.created_at} now={now} />
            </span>
          </p>
        }
        actions={
          <Button icon={<IconCoins size={16} />} onClick={showPayos}>
            Xem trạng thái trên PayOS
          </Button>
        }
      />
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}
      <NextStep order={order} closed={closed} open={open} />
      <DetailLayout
        side={
          <>
            {payos && <PayosCard payos={payos} order={order} onClose={() => setPayos(null)} />}
            <Card title="Thông tin" icon={<IconInfo size={18} />}>
              <OrderFacts order={order} now={now} />
            </Card>
          </>
        }
        main={
          <>
            <MoneyCard order={order} />
            <Card
              title="License của đơn"
              icon={<IconKey size={18} />}
              description={order.renew_license_id ? "Đơn gia hạn hay đổi gói: áp vào license đã có." : undefined}
              flush={data.data.licenses.length > 0}
            >
              {data.data.licenses.length > 0 ? (
                <LicenseList licenses={data.data.licenses} now={now} />
              ) : (
                <EmptyState compact title="Đơn chưa áp vào license nào" hint="License có khi đơn được cấp: webhook PayOS tự cấp, hay bạn bấm Cấp tay." />
              )}
            </Card>
            <Card title="Nhật ký của đơn" icon={<IconLog size={18} />} description="Mới nhất ở trên.">
              {log.error ? (
                <ErrorBox error={log.error} onRetry={log.reload} />
              ) : log.data ? (
                log.data.items.length > 0 ? (
                  <AuditTimeline rows={log.data.items} now={now} label="Nhật ký của đơn" omit="order" />
                ) : (
                  <EmptyState compact title="Chưa có dòng nào" />
                )
              ) : (
                <TimelineSkeleton label="Đang tải nhật ký…" rows={3} />
              )}
            </Card>
          </>
        }
      />

      {dialog === "grant" && (
        <ConfirmDialog
          title={`Cấp tay đơn #${code}?`}
          description={grantDescription(order)}
          confirmLabel="Cấp"
          needsNote
          onConfirm={async (note) => {
            const r = await api.grantOrder(code, note);
            onKeyIssued({ key: r.license_key, title: r.grant_kind === "extend" || r.grant_kind === "change" ? RENEWED_KEY_TITLE : "Key mới" });
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
            if (r.license_key) onKeyIssued({ key: r.license_key, title: "Key mới" });
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

/* ---------- Việc cần làm theo trạng thái ---------- */

/** Lời dẫn cho đơn chưa khép: vì sao đơn chưa có license, khi nào thì Cấp tay. */
const OPEN_STEPS: Partial<Record<OrderStatus, { title: string; text: string; tone: "info" | "default" | "danger" }>> = {
  pending: {
    tone: "info",
    title: "Đơn đang chờ khách trả",
    text: "Thường không cần làm gì: khi khách trả, webhook PayOS tự cấp license. Chỉ cấp tay khi tiền đã về mà đơn chưa được cấp (xem trạng thái trên PayOS trước).",
  },
  processing: {
    tone: "info",
    title: "Đơn đang được xử lý",
    text: "Server đang cấp license cho đơn. Nếu đơn đứng ở đây lâu, xem trạng thái trên PayOS và nhật ký trước khi cấp tay.",
  },
  expired: {
    tone: "default",
    title: "Link thanh toán đã hết hạn",
    text: "Chỉ cấp tay khi khách đã chuyển tiền cho đơn này và bạn đã xác minh khoản tiền.",
  },
  cancelled: {
    tone: "default",
    title: "Đơn đã hủy",
    text: "Chỉ cấp tay khi khách đã chuyển tiền cho đơn này và bạn đã xác minh khoản tiền.",
  },
  failed: {
    tone: "danger",
    title: "Đơn gặp lỗi khi xử lý",
    text: "Xem nhật ký của đơn và trạng thái trên PayOS. Khách đã trả thì cấp tay.",
  },
};

function NextStep({ order, closed, open }: { order: OrderRow; closed: boolean; open(d: Dialog): () => void }) {
  if (order.status === "paid_needs_review") {
    return (
      <Callout
        tone="danger"
        icon={<IconAlert size={18} />}
        title="Đã nhận tiền nhưng license của đơn đã bị thu hồi"
        actions={
          <>
            <Button variant="primary" icon={<IconKey size={16} />} onClick={open("grant_new")}>
              Cấp key mới…
            </Button>
            <Button variant="danger" onClick={open("refunded")}>
              Ghi đã hoàn tiền…
            </Button>
          </>
        }
      >
        Chọn một cách: cấp cho khách một license mới, hay ghi nhận bạn đã hoàn tiền cho khách ngoài hệ thống.
      </Callout>
    );
  }
  if (!closed) {
    const short = order.amount - order.amount_paid;
    const step =
      order.status === "underpaid"
        ? {
            tone: "warn" as const,
            title: `Khách chuyển thiếu ${fmtVnd(Math.max(short, 0))}`,
            text: "Khi khách chuyển bù, hay bạn đã xác minh khoản bù, bấm Cấp tay để cấp license và gửi key qua email.",
          }
        : (OPEN_STEPS[order.status] ?? { tone: "default" as const, title: "Đơn chưa được cấp license", text: "Chỉ cấp tay khi đã xác minh khách đã trả." });
    return (
      <Callout
        tone={step.tone}
        icon={step.tone === "warn" ? <IconWarning size={18} /> : step.tone === "danger" ? <IconAlert size={18} /> : <IconClock size={18} />}
        title={step.title}
        actions={
          <Button variant={order.status === "underpaid" ? "primary" : "secondary"} icon={<IconKey size={16} />} onClick={open("grant")}>
            Cấp tay…
          </Button>
        }
      >
        {step.text}
      </Callout>
    );
  }
  // Đơn đã trả mà khách chưa nhận email key: việc nằm ở trang license (Gửi lại email).
  if (order.status === "paid" && order.email_sent_at === null && order.license_id) {
    return (
      <Callout
        tone="warn"
        icon={<IconMail size={18} />}
        title={order.email_gave_up_at ? "Gửi email key thất bại, server đã thôi gửi" : "Khách chưa nhận email key"}
        actions={
          <Button to={`/licenses/${order.license_id}`} variant="primary">
            Mở license
          </Button>
        }
      >
        Mở license của đơn, bấm Gửi lại email. Gửi được thì đơn rời nhóm này ở Việc cần xử lý.
      </Callout>
    );
  }
  if (order.status === "refunded") {
    return (
      <Callout tone="default" icon={<IconBan size={18} />} title="Đơn đã ghi là hoàn tiền">
        Tiền đã được chuyển trả cho khách ngoài hệ thống; đơn không cấp gì. Xem lý do trong nhật ký của đơn.
      </Callout>
    );
  }
  return null;
}

/* ---------- Số tiền ---------- */

function MoneyCard({ order }: { order: OrderRow }) {
  const { amount, amount_paid: paid } = order;
  const short = amount - paid;
  // Còn thiếu thì không bao giờ ghi 100% (499.000 / 500.000 làm tròn thành 100% là sai nghĩa); đã nhận ít nhất 1 đồng thì
  // không ghi 0%.
  const exact = amount > 0 ? Math.round((paid / amount) * 100) : 0;
  const pct = short > 0 && paid > 0 ? Math.min(99, Math.max(1, exact)) : exact;
  const tone = paid <= 0 ? "muted" : short > 0 ? "warn" : "ok";
  const note =
    paid <= 0 ? "Chưa nhận khoản nào." : short > 0 ? `Đã nhận ${pct}% số cần trả.` : short < 0 ? `Nhận dư ${fmtVnd(-short)}.` : "Đã nhận đủ.";
  return (
    <Card title="Số tiền" icon={<IconCoins size={18} />}>
      <dl className="figs">
        <div>
          <dt>Cần trả</dt>
          <dd>{fmtVnd(amount)}</dd>
        </div>
        <div>
          <dt>Đã nhận</dt>
          <dd>{fmtVnd(paid)}</dd>
        </div>
        <div className={short > 0 ? "is-warn" : "is-zero"}>
          <dt>Còn thiếu</dt>
          <dd>{fmtVnd(Math.max(short, 0))}</dd>
        </div>
      </dl>
      <div className="money-bar">
        <RatioBar value={pct} className={`tone-${tone}`} />
        <p className={short > 0 && paid > 0 ? "money-note text-warn" : "money-note"}>{note}</p>
      </div>
    </Card>
  );
}

/* ---------- Thông tin ---------- */

function OrderFacts({ order, now }: { order: OrderRow; now: number }) {
  const kind = order.grant_kind ? (GRANT_KINDS[order.grant_kind] ?? order.grant_kind) : order.renew_license_id ? "Gia hạn hay đổi gói" : "Mua mới";
  const sent = order.email_sent_at;
  return (
    <KeyValue
      items={[
        { label: "Mã đơn", value: `#${order.order_code}`, copy: String(order.order_code), copyWhat: "mã đơn" },
        {
          label: "Email",
          value: order.email ? <EmailText email={order.email} /> : <span className="cell-none">Không có email (đã ẩn danh)</span>,
          copy: order.email ?? undefined,
        },
        { label: "Gói", value: PLAN_LABELS[order.plan] ?? order.plan },
        { label: "Loại", value: kind },
        { label: "Tạo lúc", value: fmtDateTime(order.created_at), hint: ago(order.created_at, now) },
        { label: "Trả lúc", value: order.paid_at ? fmtDateTime(order.paid_at) : null, hint: order.paid_at ? ago(order.paid_at, now) : undefined },
        {
          label: "Email key",
          value:
            sent !== null ? (
              <Badge tone="ok">Đã gửi</Badge>
            ) : order.email_gave_up_at !== null ? (
              <Badge tone="bad">Gửi thất bại, đã thôi gửi</Badge>
            ) : (
              <Badge tone={order.status === "paid" ? "warn" : "neutral"}>Chưa gửi</Badge>
            ),
          hint: sent !== null ? fmtDateTime(sent) : order.email_gave_up_at !== null ? `thôi gửi lúc ${fmtDateTime(order.email_gave_up_at)}` : undefined,
        },
        { label: "Cổng", value: order.provider === "payos" ? "PayOS" : order.provider },
      ]}
    />
  );
}

/* ---------- Trạng thái trên PayOS ---------- */

/** PayOS báo cùng trạng thái với đơn? Đơn cần xử lý hay đã hoàn tiền thì PayOS vẫn báo đã trả: vẫn là khớp. */
function payosMatches(p: PaymentStatus, o: OrderRow): boolean {
  const same = p.status === o.status || (p.status === "paid" && (o.status === "paid_needs_review" || o.status === "refunded"));
  return same && p.amountPaid === o.amount_paid;
}

function PayosCard({ payos, order, onClose }: { payos: Payos; order: OrderRow; onClose(): void }) {
  const p = payos.data;
  return (
    <Card
      title="Trạng thái trên PayOS"
      icon={<IconCoins size={18} />}
      description={`Xem lúc ${fmtHm(payos.at)}`}
      tone={p && !payosMatches(p, order) ? "warn" : undefined}
      actions={<IconButton label="Đóng kết quả PayOS" icon={<IconClose size={16} />} size="sm" onClick={onClose} />}
      className="payos-card"
    >
      {payos.error ? (
        <ErrorBox error={payos.error} />
      ) : p ? (
        <>
          <KeyValue
            items={[
              { label: "Trạng thái", value: <OrderStatusBadge status={p.status as OrderStatus} /> },
              { label: "Số tiền", value: fmtVnd(p.amount) },
              { label: "Đã nhận", value: fmtVnd(p.amountPaid) },
              { label: "Giao dịch", value: p.paidAt ? fmtDateTime(p.paidAt) : null },
            ]}
          />
          <p className={payosMatches(p, order) ? "payos-verdict is-ok" : "payos-verdict is-warn"}>
            {payosMatches(p, order) ? "Khớp với đơn." : "Khác với đơn: so số tiền và trạng thái trước khi cấp tay."}
          </p>
        </>
      ) : null}
    </Card>
  );
}
