// Chi tiết đơn (spec Web Admin §4.2; giao diện mới mục 2): việc cần làm theo trạng thái (Cấp tay đơn chưa cấp, Xử lý đơn
// paid_needs_review), số tiền, license của đơn, nhật ký của đơn; bên phải là thẻ Thông tin và kết quả xem trạng thái trên
// cổng thanh toán của đơn (PayOS hay Creem). Số tiền theo loại tiền của đơn (VND đồng, USD cent). Quy tắc nút: Cấp tay…
// khi đơn chưa khép (khác paid, refunded, paid_needs_review); Cấp key mới… và Ghi đã hoàn tiền… chỉ khi
// paid_needs_review; Xem trạng thái trên <cổng> (chỉ đọc) luôn có. Đơn đã hoàn tiền: server không tự thu hồi hay rút ngắn license
// (spec Creem D5); thẻ việc cần làm theo loại đơn (Q2, C1-T7; refund-kit.ts): đơn gia hạn hay đổi gói không bị mời thu hồi (license
// còn thời gian khách đã trả ở đơn khác), mà rút ngắn đúng số ngày đơn đã cộng (hộp Rút ngắn hạn…, ShortenDialog.tsx). Số ngày lấy
// từ nhật ký của đơn (api.audit theo order_code), không từ nhật ký 50 dòng của license. Đơn còn paid mà cổng báo hoàn một phần,
// tranh chấp hay lần hoàn chưa thành công: thẻ cảnh báo dẫn tới nhật ký.
import { type ReactNode, useEffect, useState } from "react";
import type { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { AuditRow, LicenseDetail, OrderRow, OrderStatus, Page, PaymentStatus } from "../api/types";
import { actionLabel } from "../audit-labels";
import { AuditTimeline, TimelineSkeleton } from "../components/AuditTimeline";
import { Badge } from "../components/Badge";
import { Button, IconButton } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, type NoticeHandle, NoticeRegion, useNotice } from "../components/Feedback";
import { IconAlert, IconBan, IconCheck, IconClock, IconClose, IconCoins, IconInfo, IconKey, IconLog, IconMail, IconWarning } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { KeyReveal } from "../components/MaskedKey";
import { PageHeader } from "../components/PageHeader";
import { RatioBar } from "../components/RatioBar";
import { RelTime } from "../components/RelTime";
import { OrderStatusBadge, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDate, fmtDateTime, fmtHm, fmtMoney, nowSec } from "../format";
import { type Loaded, useLoad } from "../hooks";
import { refreshQueueCount } from "../queue-store";
import { ago, Callout, DetailLayout, EmailText, DetailNotFound, DetailSkeleton, LicenseList } from "./detail-kit";
import { type AppliedEffect, type GrantEffect, hasOtherTimeSource, orderGrantEffect, type RefundCase, refundCase, unlinkedShortenedDays } from "./refund-kit";
import { acceptText, failedLead, heldMoneyNote, heldStep, type Review, reviewOf } from "./review-kit";
import { ShortenDialog } from "./ShortenDialog";

type Dialog = "grant" | "grant_new" | "refunded" | null;

/** Hộp Rút ngắn hạn… đang mở: license đích, số ngày điền sẵn (phần của đơn), đơn đổi gói. */
type Shorten = { licenseId: string; days?: number; planChange?: boolean };

const GRANT_KINDS: Record<string, string> = { new: "Mua mới", extend: "Mua thêm cùng gói", change: "Đổi gói" };

/** Tên cổng thanh toán (orders.provider) cho người vận hành; cổng lạ thì hiện nguyên mã. */
const PROVIDER_NAMES: Record<string, string> = { payos: "PayOS", creem: "Creem" };
const providerName = (provider: string) => (Object.hasOwn(PROVIDER_NAMES, provider) ? (PROVIDER_NAMES[provider] ?? provider) : provider);

/**
 * Key vừa cấp và tiêu đề hộp hiện nó: gia hạn hay đổi gói thì server trả lại key CŨ của license, không phải key mới.
 * `done`: câu kết quả hiện ở trang (Notice) khi người vận hành bấm Xong.
 */
interface Revealed {
  key: string;
  title: string;
  done: string;
}
const RENEWED_KEY_TITLE = "Key của license (đơn gia hạn hay đổi gói)";

/**
 * Đơn VietQR (PayOS): khách chuyển khoản, nên chuyển thiếu thì chuyển bù được và mọi chữ về "chuyển" đúng. Đơn của cổng khác
 * (Creem: thẻ) không có chuyển bù: đã thu tiền mà thấp hơn giá là mã giảm giá hay dữ liệu tiền hỏng; chữ riêng, nêu tên cổng.
 */
const isBank = (order: OrderRow) => order.provider === "payos";

/**
 * Đơn bị giữ vì số tiền ở cổng không phải PayOS: cổng báo đã thu mà thấp hơn giá, có mã giảm giá hay dữ liệu tiền hỏng
 * (underpaid), hay giá cổng báo khác giá đơn (failed). Cấp tay ở đây là chấp nhận số đã thu: nút phụ, hộp đòi gõ CAP TAY (I-2 của
 * rà B6). Đơn PayOS giữ nguyên (chuyển thiếu thì chuyển bù được).
 */
const isHeld = (order: OrderRow) => !isBank(order) && (order.status === "underpaid" || order.status === "failed");

/**
 * Mô tả hộp Cấp tay theo dữ liệu của đơn: đơn gia hạn hay đổi gói áp vào license cũ; đơn chưa nhận đủ tiền thì có cảnh báo.
 * Cấp tay ghi doanh thu bằng `orders.amount_paid` của đơn (API không nhập được số tiền): đơn Creem kẹt vì dữ liệu hỏng có thể là 0.
 */
function grantDescription(order: OrderRow, review: Review | null): ReactNode {
  const bank = isBank(order);
  const gateway = providerName(order.provider);
  const when = order.renew_license_id
    ? "áp vào license của đơn (gia hạn hay đổi gói) theo luật của đơn, tính từ bây giờ"
    : "tính từ bây giờ";
  if (isHeld(order)) {
    return (
      <>
        Cấp license theo gói của đơn, {when}, rồi gửi key qua email. <strong>{acceptText(order, gateway, review)}</strong>
      </>
    );
  }
  return (
    <>
      Cấp license theo gói của đơn, {when}, rồi gửi key qua email.{" "}
      {bank
        ? "Dùng khi khách chuyển thiếu rồi chuyển bù, hay đơn đã trả mà chưa được cấp."
        : `Dùng khi khách đã trả mà đơn chưa được cấp (xem trạng thái trên ${gateway} trước).`}
      {order.amount_paid < order.amount && (
        <>
          {" "}
          <strong>
            Đơn mới nhận {fmtMoney(order.amount_paid, order.currency)} / {fmtMoney(order.amount, order.currency)}:{" "}
            {bank ? "chỉ cấp khi khách đã chuyển bù hay bạn đã xác minh." : `chỉ cấp khi bạn đã xác minh khách trả đủ trên ${gateway}.`}
          </strong>
        </>
      )}{" "}
      Cấp tay ghi doanh thu bằng số đã nhận của đơn{order.provider === "creem" ? " (đơn Creem kẹt có thể là 0)" : ""}.
    </>
  );
}

/** Đơn đã khép: không còn cấp tay (paid, refunded, paid_needs_review). */
const isClosed = (order: OrderRow) => order.status === "paid" || order.status === "refunded" || order.status === "paid_needs_review";

const crumbs = (code: number) => [{ label: "Đơn hàng", to: "/orders" }, { label: `#${code}` }];

/**
 * Hộp key mới nằm ngoài OrderDetail: tải lại đơn bị lỗi thì trang đơn thành ErrorBox, nhưng key (chỉ hiện một lần) vẫn còn đó.
 * Thông báo kết quả cũng ở đây: hiện khi đóng hộp key (hiện sớm hơn thì nó giành focus của hộp).
 */
export function OrderPage({ code }: { code: number }) {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const notice = useNotice();
  return (
    <>
      <OrderDetail code={code} notice={notice} onKeyIssued={setRevealed} />
      {revealed && (
        <KeyReveal
          licenseKey={revealed.key}
          title={revealed.title}
          onClose={() => {
            setRevealed(null);
            notice.show(revealed.done);
          }}
        />
      )}
    </>
  );
}

/** Kết quả lần xem trạng thái trên cổng thanh toán gần nhất (chỉ trong bộ nhớ của trang). */
type Remote = { at: number; data: PaymentStatus; error?: undefined } | { at: number; error: ApiError; data?: undefined };

function OrderDetail({ code, notice, onKeyIssued }: { code: number; notice: NoticeHandle; onKeyIssued(revealed: Revealed): void }) {
  const data = useLoad(() => api.lookup({ order_code: code }), [code]);
  const log = useLoad(() => api.audit({ order_code: String(code) }), [code]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [shorten, setShorten] = useState<Shorten | null>(null);
  const [remote, setRemote] = useState<Remote | null>(null);
  const reload = () => {
    data.reload();
    log.reload();
  };
  // Tải lại bị lỗi thì trang thành hộp lỗi: bỏ luôn hộp đang mở, để Thử lại xong hộp không tự hiện lại trên dữ liệu mới (hộp Rút
  // ngắn chốt hạn lúc mở, mở lại ngầm là chốt hạn mới mà người vận hành chưa xem) (m1).
  useEffect(() => {
    if (data.error) {
      setDialog(null);
      setShorten(null);
    }
  }, [data.error]);

  if (data.error) {
    return (
      <>
        <PageHeader breadcrumb={crumbs(code)} title={`Đơn #${code}`} />
        {/* Cùng vị trí với nhánh chính: tải lại sau thao tác mà lỗi thì thông báo kết quả vẫn còn. */}
        <NoticeRegion handle={notice} />
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
  const closed = isClosed(order);
  const open = (d: Dialog) => () => setDialog(d);
  const gateway = providerName(order.provider);
  // License của hộp Rút ngắn hạn…: hộp chốt hạn của lần tải lúc mở (expected_expires_at), không theo các lần tải sau.
  const shortenTarget = shorten ? data.data.licenses.find((l) => l.id === shorten.licenseId) : undefined;
  // Dữ kiện của cổng khi giữ đơn (mã giảm giá, số khách trả, trường hỏng) nằm ở nhật ký của đơn; chưa tải được thì lời dẫn chung.
  const review = log.data ? reviewOf(order.order_code, log.data.items) : null;

  async function showRemote() {
    try {
      setRemote({ at: nowSec(), data: await api.paymentStatus(code) });
    } catch (e) {
      setRemote({ at: nowSec(), error: e as ApiError });
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={crumbs(code)}
        title={`Đơn #${order.order_code}`}
        badges={<OrderStatusBadge status={order.status} provider={order.provider} />}
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
          <Button icon={<IconCoins size={16} />} onClick={showRemote}>
            Xem trạng thái trên {gateway}
          </Button>
        }
      />
      <NoticeRegion handle={notice} />
      <NextStep
        order={order}
        closed={closed}
        open={open}
        licenses={data.data.licenses}
        log={log}
        review={review}
        now={now}
        busy={data.loading || log.loading}
        onShorten={setShorten}
      />
      <DetailLayout
        side={
          <>
            {remote && <GatewayCard remote={remote} order={order} onClose={() => setRemote(null)} />}
            <Card title="Thông tin" icon={<IconInfo size={18} />}>
              <OrderFacts order={order} now={now} />
            </Card>
          </>
        }
        main={
          <>
            <MoneyCard order={order} review={review} />
            <Card
              title="License của đơn"
              icon={<IconKey size={18} />}
              description={order.renew_license_id ? "Đơn gia hạn hay đổi gói: áp vào license đã có." : undefined}
              flush={data.data.licenses.length > 0}
            >
              {data.data.licenses.length > 0 ? (
                <LicenseList licenses={data.data.licenses} now={now} />
              ) : (
                <EmptyState compact title="Đơn chưa áp vào license nào" hint={`License có khi đơn được cấp: webhook ${gateway} tự cấp, hay bạn bấm Cấp tay.`} />
              )}
            </Card>
            <Card title="Nhật ký của đơn" icon={<IconLog size={18} />} description="Mới nhất ở trên.">
              {log.error ? (
                <ErrorBox error={log.error} onRetry={log.reload} />
              ) : log.data ? (
                log.data.items.length > 0 ? (
                  <AuditTimeline rows={log.data.items} now={now} label="Nhật ký của đơn" omit="order" currency={order.currency} />
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
          description={grantDescription(order, review)}
          confirmLabel="Cấp"
          needsNote
          // Đơn thẻ bị giữ vì số tiền: cấp là chấp nhận số đã thu, không hoàn tác được bằng Web Admin (I-2 của rà B6).
          typeToConfirm={isHeld(order) ? "CAP TAY" : undefined}
          tone="default"
          onConfirm={async (note) => {
            const r = await api.grantOrder(code, note);
            onKeyIssued({
              key: r.license_key,
              title: r.grant_kind === "extend" || r.grant_kind === "change" ? RENEWED_KEY_TITLE : "Key mới",
              done: `Đã cấp tay đơn #${code}.`,
            });
            reload();
            refreshQueueCount();
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
            const done = `Đã cấp key mới cho đơn #${code}.`;
            if (r.license_key) onKeyIssued({ key: r.license_key, title: "Key mới", done });
            else notice.show(done);
            reload();
            refreshQueueCount();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {shorten && shortenTarget && (
        <ShortenDialog
          licenseId={shortenTarget.id}
          expiresAt={shortenTarget.expires_at}
          now={now}
          initialDays={shorten.days}
          orderCode={code}
          planChange={shorten.planChange}
          onDone={(r) => {
            notice.show(`Đã rút ngắn hạn tới ${fmtDate(r.expires_at)}.`);
            reload();
            refreshQueueCount();
          }}
          onStale={(message) => {
            setShorten(null);
            notice.show(message, "warn");
            reload();
          }}
          onConflict={reload}
          onClose={() => setShorten(null)}
        />
      )}
      {dialog === "refunded" && (
        <ConfirmDialog
          title={`Ghi đơn #${code} là đã hoàn tiền?`}
          description={
            isBank(order)
              ? "Chỉ ghi nhận bạn đã chuyển trả tiền cho khách ngoài hệ thống. Đơn thành refunded, không cấp gì. Không hoàn tác được."
              : `Chỉ ghi nhận bạn đã hoàn tiền cho khách ở dashboard ${gateway}; Web Admin không hoàn tiền thay bạn. Đơn thành refunded, không cấp gì. Không hoàn tác được.`
          }
          confirmLabel="Ghi đã hoàn tiền"
          needsNote
          typeToConfirm="DA HOAN TIEN"
          onConfirm={async (note) => {
            await api.resolveOrder(code, "refunded", note);
            notice.show("Đã ghi đơn là đã hoàn tiền.");
            reload();
            refreshQueueCount();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/* ---------- Việc cần làm theo trạng thái ---------- */

/**
 * Lời dẫn cho đơn chưa khép: vì sao đơn chưa có license, khi nào thì Cấp tay. `gateway` là tên cổng thanh toán của đơn. Đơn VietQR
 * (PayOS) nói chuyển khoản; cổng khác (Creem) thì khách có thể đã trả mà server chưa ghi nhận: xem trạng thái trên cổng trước.
 */
const openSteps = (order: OrderRow, gateway: string): Partial<Record<OrderStatus, { title: string; text: string; tone: "info" | "default" | "danger" }>> => {
  const verify = `Khách có thể đã trả mà server chưa ghi nhận: xem trạng thái trên ${gateway} trước. Chỉ cấp tay khi ${gateway} báo đã thu tiền cho đơn này và bạn đã xác minh khoản tiền.`;
  const bank = isBank(order);
  return {
    pending: {
      tone: "info",
      title: "Đơn đang chờ khách trả",
      text: `Thường không cần làm gì: khi khách trả, webhook ${gateway} tự cấp license. Chỉ cấp tay khi tiền đã về mà đơn chưa được cấp (xem trạng thái trên ${gateway} trước).`,
    },
    processing: {
      tone: "info",
      title: "Đơn đang được xử lý",
      text: `Server đang cấp license cho đơn. Nếu đơn đứng ở đây lâu, xem trạng thái trên ${gateway} và nhật ký trước khi cấp tay.`,
    },
    expired: {
      tone: "default",
      title: "Link thanh toán đã hết hạn",
      text: bank ? "Chỉ cấp tay khi khách đã chuyển tiền cho đơn này và bạn đã xác minh khoản tiền." : verify,
    },
    cancelled: {
      tone: "default",
      title: "Đơn đã hủy",
      text: bank ? "Chỉ cấp tay khi khách đã chuyển tiền cho đơn này và bạn đã xác minh khoản tiền." : verify,
    },
    failed: {
      tone: "danger",
      title: "Đơn gặp lỗi khi xử lý",
      // Đơn thẻ failed thường là giá cổng báo khác giá đơn: không mời cấp gói của đơn với số tiền khác (p4 của rà B6).
      text: bank
        ? `Xem nhật ký của đơn và trạng thái trên ${gateway}. Khách đã trả thì cấp tay.`
        : `Xem nhật ký của đơn và trạng thái trên ${gateway}; khách trả đủ giá gói thì mới cấp tay, ngược lại hoàn tiền ở ${gateway}.`,
    },
  };
};

type LicenseState = Pick<LicenseDetail, "id" | "revoked_at" | "expires_at" | "audit">;

function NextStep({
  order,
  closed,
  open,
  licenses,
  log,
  review,
  now,
  busy,
  onShorten,
}: {
  order: OrderRow;
  closed: boolean;
  open(d: Dialog): () => void;
  licenses: readonly LicenseState[];
  log: Loaded<Page<AuditRow>>;
  review: Review | null;
  now: number;
  /** Đơn hay nhật ký đang tải lại: khóa nút mở hộp Rút ngắn hạn… (hộp chốt hạn lúc mở). */
  busy: boolean;
  onShorten(s: Shorten): void;
}) {
  // Cổng báo hoàn một phần, tranh chấp hay lần hoàn chưa thành công: thẻ cảnh báo, ở mọi trạng thái (M2). Đơn đã hoàn thì chỉ nhắc
  // tranh chấp (m4).
  const events = log.data ? gatewayEvents(order.order_code, log.data.items) : [];
  if (order.status === "refunded") {
    return (
      <>
        {events.includes("order_disputed") && <DisputeStep gateway={providerName(order.provider)} />}
        <RefundStep order={order} licenses={licenses} log={log} now={now} busy={busy} onShorten={onShorten} />
      </>
    );
  }
  const step = mainStep(order, closed, open, review, events.length > 0);
  if (!step && events.length === 0) return null;
  // Đơn đã trả mà license còn hoạt động: thẻ có nút Rút ngắn hạn… gắn mã đơn (m3), không bảo sang trang license (ở đó không gắn đơn).
  const live = order.status === "paid" ? licenses.find((l) => l.id === order.license_id && l.revoked_at === null && l.expires_at > now) : undefined;
  return (
    <>
      {step}
      {events.length > 0 && (
        <GatewayEventsStep
          events={events}
          gateway={providerName(order.provider)}
          status={order.status}
          onShorten={live && !busy ? () => onShorten({ licenseId: live.id }) : live ? null : undefined}
        />
      )}
    </>
  );
}

/** Đơn đã hoàn mà nhật ký có tranh chấp: việc còn lại nằm ở cổng (nộp chứng cứ), Web Admin không làm thay (m4). */
function DisputeStep({ gateway }: { gateway: string }) {
  return (
    <Callout tone="danger" icon={<IconAlert size={18} />} title="Khách mở tranh chấp cho đơn này">
      {`Nhật ký của đơn có Khách mở tranh chấp. Trả lời tranh chấp trên dashboard của ${gateway} (nộp chứng cứ đúng hạn); Web Admin không làm thay. Xem số tiền và lý do trong nhật ký của đơn.`}
    </Callout>
  );
}

/** Việc chính theo trạng thái của đơn chưa hoàn tiền. */
function mainStep(order: OrderRow, closed: boolean, open: (d: Dialog) => () => void, review: Review | null, hasEvents: boolean): ReactNode {
  const gateway = providerName(order.provider);
  const bank = isBank(order);
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
        {bank
          ? "Chọn một cách: cấp cho khách một license mới, hay ghi nhận bạn đã hoàn tiền cho khách ngoài hệ thống."
          : `Chọn một cách: cấp cho khách một license mới, hay hoàn tiền cho khách. Hoàn tiền làm ở dashboard ${gateway}, rồi bấm Ghi đã hoàn tiền nếu đơn chưa tự thành Đã hoàn tiền (webhook hoàn đủ của ${gateway} thường tự chuyển; Web Admin không hoàn tiền thay bạn).`}
      </Callout>
    );
  }
  if (!closed) {
    const short = order.amount - order.amount_paid;
    const base = openSteps(order, gateway)[order.status];
    const step =
      order.status === "underpaid"
        ? bank
          ? {
              tone: "warn" as const,
              title: `Khách chuyển thiếu ${fmtMoney(Math.max(short, 0), order.currency)}`,
              text: "Khi khách chuyển bù, hay bạn đã xác minh khoản bù, bấm Cấp tay để cấp license và gửi key qua email.",
            }
          : { tone: "warn" as const, ...heldStep(order, gateway, review) }
        : order.status === "failed" && base && !bank
          ? { ...base, text: failedLead(order, gateway, review) + base.text }
          : (base ?? {
              tone: "default" as const,
              title: "Đơn chưa được cấp license",
              text: "Chỉ cấp tay khi đã xác minh khách đã trả.",
            });
    return (
      <Callout
        tone={step.tone}
        icon={step.tone === "warn" ? <IconWarning size={18} /> : step.tone === "danger" ? <IconAlert size={18} /> : <IconClock size={18} />}
        title={step.title}
        actions={
          // Nút chính chỉ khi chuyển bù được (VietQR) và nhật ký không có hoàn tiền hay tranh chấp; đơn thẻ bị giữ thì Cấp tay là chấp
          // nhận số đã thu: nút phụ (I-2 của rà B6).
          <Button variant={order.status === "underpaid" && bank && !hasEvents ? "primary" : "secondary"} icon={<IconKey size={16} />} onClick={open("grant")}>
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
  return null;
}

/* ---------- Đơn chưa refunded mà cổng báo hoàn một phần, tranh chấp hay lần hoàn chưa thành công (P2-T7, M2) ---------- */

const GATEWAY_EVENTS = ["order_partially_refunded", "order_disputed", "order_refund_unconfirmed"] as const;

/** Các hành động hoàn tiền/tranh chấp của cổng có trong nhật ký của đơn (không trùng, theo thứ tự nhật ký: mới nhất trước). */
function gatewayEvents(code: number, rows: readonly AuditRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows) {
    if (r.order_code === code && (GATEWAY_EVENTS as readonly string[]).includes(r.action) && !seen.includes(r.action)) seen.push(r.action);
  }
  return seen;
}

/**
 * Thẻ cảnh báo hoàn một phần, tranh chấp hay lần hoàn chưa thành công của đơn chưa refunded. Chữ theo trạng thái: đơn đã trả
 * (license giữ nguyên), đơn cần xử lý (license đã thu hồi: chỉ còn Cấp key mới), đơn chưa cấp (vẫn có thể được cấp sau đó).
 * `onShorten`: đơn đã trả mà license còn hoạt động thì có nút Rút ngắn hạn… gắn mã đơn (null: có nút nhưng đang tải lại, khóa).
 */
function GatewayEventsStep({
  events,
  gateway,
  status,
  onShorten,
}: {
  events: readonly string[];
  gateway: string;
  status: OrderStatus;
  onShorten?: (() => void) | null;
}) {
  const onlyUnconfirmed = events.every((a) => a === "order_refund_unconfirmed");
  const seen = `Nhật ký của đơn có: ${events.map((a) => actionLabel(a) ?? a).join(", ")}.`;
  const details = "Xem số đã hoàn, lý do và trạng thái lần hoàn trong nhật ký của đơn bên dưới";
  const text =
    status === "paid"
      ? `${seen} Đơn vẫn ở trạng thái đã trả và license giữ nguyên (server không tự thu hồi hay rút ngắn). ${details} và ở dashboard của ${gateway}. Nếu khách không còn quyền dùng phần đã hoàn: rút ngắn bằng nút Rút ngắn hạn… ở thẻ này (gắn mã đơn), hay thu hồi ở trang license (xem bảng Đơn hàng của license trước: thu hồi lấy luôn thời gian khách đã trả ở các đơn khác).`
      : status === "paid_needs_review"
        ? `${seen} License của đơn đã thu hồi; đơn chỉ được cấp nếu bạn bấm Cấp key mới (thẻ trên): kiểm lần hoàn ở dashboard của ${gateway} trước. ${details}.`
        : `${seen} Trạng thái đơn không đổi, nên đơn vẫn có thể được cấp sau đó (tự động khi cổng báo đã trả, hay bằng thao tác cấp ở trang này): kiểm lần hoàn ở dashboard của ${gateway} trước khi cấp. ${details}.`;
  return (
    <Callout
      tone="warn"
      icon={<IconWarning size={18} />}
      title={onlyUnconfirmed ? "Cổng báo một lần hoàn tiền chưa thành công" : "Cổng báo hoàn tiền một phần hay tranh chấp"}
      actions={
        onShorten !== undefined && (
          <Button disabled={onShorten === null} onClick={() => onShorten?.()}>
            Rút ngắn hạn…
          </Button>
        )
      }
    >
      {text}
    </Callout>
  );
}

/* ---------- Đơn đã hoàn tiền: thẻ theo loại đơn (Q2, C1-T7; refund-kit.ts) ---------- */

/**
 * Thẻ của đơn `refunded`. License đích là license của dòng cấp (nhật ký của đơn), hay license_id/renew_license_id của đơn. Đơn
 * mua mới cần biết license còn nguồn thời gian khác không: NewOrderRefund tra thêm các đơn của license. Lần rút ngắn không kèm mã
 * đơn (trang license) sau lúc đơn áp vào được đọc từ nhật ký license (I-2): thẻ cảnh báo và không điền sẵn số ngày.
 */
function RefundStep({
  order,
  licenses,
  log,
  now,
  busy,
  onShorten,
}: {
  order: OrderRow;
  licenses: readonly LicenseState[];
  log: Loaded<Page<AuditRow>>;
  now: number;
  busy: boolean;
  onShorten(s: Shorten): void;
}) {
  const effect = log.data ? orderGrantEffect(order, log.data.items) : null;
  const target = (effect?.applied ? effect.licenseId : null) ?? order.license_id ?? order.renew_license_id;
  const license = licenses.find((l) => l.id === target);
  const unlinked = effect?.applied && license ? unlinkedShortenedDays(license.audit, effect.grantAt) : 0;
  const c = refundCase(order, effect, license, now, undefined, unlinked);
  if (c.kind === "waiting" && log.error) {
    return (
      <Callout tone="warn" icon={<IconWarning size={18} />} title="Đơn đã hoàn tiền: không tải được nhật ký của đơn">
        Chưa biết đơn đã cộng bao nhiêu ngày vào license. Thử tải lại nhật ký (thẻ Nhật ký của đơn) trước khi rút ngắn hạn hay thu hồi.
      </Callout>
    );
  }
  const shared = { order, effect, license, unlinked, busy, onShorten };
  if (c.kind === "checking" && effect?.applied && license) return <NewOrderRefund {...shared} effect={effect} license={license} now={now} />;
  return <RefundCallout c={c} {...shared} />;
}

/** Đơn mua mới bị hoàn: tra các đơn của license (POST /admin/lookup theo license_id) để biết license còn nguồn thời gian khác không. */
function NewOrderRefund({
  order,
  effect,
  license,
  now,
  ...rest
}: {
  order: OrderRow;
  effect: AppliedEffect;
  license: LicenseState;
  now: number;
  unlinked: number;
  busy: boolean;
  onShorten(s: Shorten): void;
}) {
  const others = useLoad(() => api.lookup({ license_id: license.id }), [license.id]);
  // Không tải được thì coi như license còn nguồn khác: lời khuyên an toàn hơn (đừng thu hồi, rút đúng phần của đơn).
  const otherPaid = others.data
    ? hasOtherTimeSource(order.order_code, license.id, license.audit, others.data.orders)
    : others.error
      ? true
      : undefined;
  return <RefundCallout c={refundCase(order, effect, license, now, otherPaid, rest.unlinked)} order={order} effect={effect} license={license} {...rest} />;
}

const planName = (plan: string | null) => (plan === null ? "?" : (PLAN_LABELS[plan as keyof typeof PLAN_LABELS] ?? plan));

function RefundCallout({
  c,
  order,
  effect,
  license,
  unlinked,
  busy,
  onShorten,
}: {
  c: RefundCase;
  order: OrderRow;
  effect: GrantEffect | null;
  license: LicenseState | undefined;
  /** Số ngày đã rút ngắn không kèm mã đơn sau lúc đơn áp vào (I-2). */
  unlinked: number;
  busy: boolean;
  onShorten(s: Shorten): void;
}) {
  const e = effect?.applied ? effect : null;
  const code = order.order_code;
  const openLicense = (id: string) => <Button to={`/licenses/${id}`}>Mở license</Button>;
  const shortenFree = (id: string, planChange?: boolean) => (
    <Button disabled={busy} onClick={() => onShorten({ licenseId: id, planChange })}>
      Rút ngắn hạn…
    </Button>
  );
  // Lần rút không kèm mã đơn (trang license) sau lúc đơn áp vào: thẻ không còn khẳng định số ngày của đơn; cảnh báo đứng đầu thẻ (I-1
  // của rà B2-fix). Chỉ thấy được trong 50 dòng nhật ký mới nhất của license mà lookup trả.
  const unlinkedNote =
    unlinked > 0
      ? `License đã bị rút ngắn ${unlinked} ngày không kèm mã đơn (ở trang license) sau khi đơn này áp vào, theo 50 dòng nhật ký mới nhất của license: có thể đã lấy lại phần của đơn này. Kiểm tra hạn hiện tại (${fmtDate(license?.expires_at)}) và nhật ký của license trước khi rút thêm.`
      : "";
  switch (c.kind) {
    case "not_applied":
      return (
        <Callout tone="default" icon={<IconBan size={18} />} title="Đơn đã hoàn tiền trước khi được cấp">
          Đơn chưa từng cộng thời gian vào license nào; không cần làm gì thêm.
        </Callout>
      );
    case "waiting":
      return (
        <Callout tone="default" icon={<IconClock size={18} />} title="Đơn đã hoàn tiền">
          Đang tải nhật ký của đơn để biết đơn đã cộng bao nhiêu ngày…
        </Callout>
      );
    case "shortened": {
      const when = c.at !== null ? ` (lần cuối lúc ${fmtDateTime(c.at)})` : "";
      const outside =
        c.unlinkedDays > 0 ? ` (gồm ${c.unlinkedDays} ngày rút ở trang license không kèm mã đơn, theo 50 dòng nhật ký mới nhất của license)` : "";
      return (
        <Callout tone={c.grew ? "warn" : "default"} icon={c.grew ? <IconWarning size={18} /> : <IconCheck size={18} />} title={`Đã rút ngắn ${c.days} ngày`}>
          {c.grew
            ? `Đã rút ngắn ${c.days} ngày cho đơn này${when}, đủ số ngày đơn đã cộng. Hạn hiện tại ${fmtDate(c.expiresAt)} dài hơn hạn ngay sau lần rút: license đã được cộng thêm sau đó (gia hạn tay, đơn khác…); kiểm tra nhật ký của license để chắc phần đã hoàn không bị trả lại.`
            : `Đã rút ngắn ${c.days} ngày cho đơn này${outside}${when}, đủ số ngày đơn đã cộng; hạn hiện tại ${fmtDate(c.expiresAt)}. Không cần làm gì thêm.`}
        </Callout>
      );
    }
    case "inactive":
      return (
        <Callout tone="default" icon={<IconBan size={18} />} title="Đơn đã ghi là hoàn tiền">
          Tiền đã được hoàn cho khách (qua cổng thanh toán hay chuyển trả ngoài hệ thống); đơn không cấp gì thêm. Xem lý do trong nhật ký của đơn.
        </Callout>
      );
    case "checking":
      return (
        <Callout tone="warn" icon={<IconWarning size={18} />} title="Đã hoàn tiền một đơn mua mới">
          Đang tải các đơn của license…
        </Callout>
      );
    case "keep_others":
    case "only_order": {
      if (!e) return null;
      const added =
        e.kind === "extend"
          ? `Đơn #${code} cộng ${e.daysAdded} ngày (hạn trước đơn: ${fmtDate(e.fromExpiresAt)}; sau đơn: ${fmtDate(e.toExpiresAt)})`
          : `Đơn #${code} cộng ${e.daysAdded} ngày (license mới, hạn sau đơn: ${fmtDate(e.toExpiresAt)})`;
      const cut = e.shortenedDays > 0 ? `; đã rút ngắn ${e.shortenedDays} ngày, còn ${c.remaining} ngày` : "";
      const capped = c.capped && c.shortenDays >= 1 ? ` Hạn mới phải sau bây giờ nên chỉ rút được ${c.shortenDays} ngày: phần khách đã dùng không lấy lại được.` : "";
      // Đã có lần rút không kèm mã đơn sau lúc đơn áp vào (I-2): không điền sẵn, không làm nút chính.
      const shortenBtn =
        c.shortenDays < 1 ? null : unlinked > 0 ? (
          shortenFree(c.licenseId)
        ) : (
          <Button variant={c.kind === "keep_others" ? "primary" : "secondary"} disabled={busy} onClick={() => onShorten({ licenseId: c.licenseId, days: c.shortenDays })}>
            {`Rút ngắn ${c.shortenDays} ngày…`}
          </Button>
        );
      if (c.kind === "keep_others") {
        // M3: không còn thời gian của nguồn khác (gia hạn áp vào license đã hết hạn) thì không nói thu hồi lấy thời gian của đơn khác.
        const revoke = c.otherTime
          ? " đừng thu hồi: thu hồi lấy luôn thời gian khách đã trả ở đơn khác. Xem bảng Đơn hàng của license trước."
          : " license đã hết hạn lúc đơn này áp vào nên không còn thời gian của đơn trước; xem bảng Đơn hàng của license trước khi thu hồi.";
        // Đã thấy lần rút không kèm mã đơn: không khẳng định "rút ngắn đúng N ngày" (có thể đã rút rồi).
        const advice =
          unlinked > 0
            ? `${revoke.charAt(1).toUpperCase()}${revoke.slice(2)}`
            : c.shortenDays < 1
              ? ` License còn chưa tới một ngày nên không rút ngắn được nữa;${revoke}`
              : ` Rút ngắn đúng ${c.remaining} ngày để lấy lại phần đã hoàn;${revoke}${capped}`;
        return (
          <Callout
            tone="warn"
            icon={<IconWarning size={18} />}
            title={unlinked > 0 ? `Đã hoàn tiền: license đã bị rút ngắn ${unlinked} ngày không kèm mã đơn` : `Đã hoàn tiền: license vẫn giữ ${c.remaining} ngày đơn này cộng`}
            actions={
              <>
                {shortenBtn}
                {openLicense(c.licenseId)}
              </>
            }
          >
            {unlinked > 0 ? `${unlinkedNote} ${added}${cut}. ${advice}` : `${added}${cut}.${advice}`}
          </Callout>
        );
      }
      const onlyText =
        unlinked > 0
          ? `${unlinkedNote} ${added}${cut}. License chỉ gồm đơn này (theo các đơn và 50 dòng nhật ký mới nhất của license): thu hồi (ở trang license) hay rút ngắn đều lấy lại phần còn lại; bạn quyết định.`
          : c.shortenDays >= 1
            ? `${added}${cut}. License chỉ gồm đơn này (theo các đơn và 50 dòng nhật ký mới nhất của license): thu hồi (ở trang license) hay rút ngắn ${c.shortenDays} ngày đều lấy lại phần đã hoàn; bạn quyết định.${capped}`
            : `${added}${cut}. License chỉ gồm đơn này và còn chưa tới một ngày: muốn lấy lại thì thu hồi (ở trang license).`;
      return (
        <Callout
          tone="warn"
          icon={<IconWarning size={18} />}
          title={unlinked > 0 ? `Đã hoàn tiền một đơn mua mới: license đã bị rút ngắn ${unlinked} ngày không kèm mã đơn` : "Đã hoàn tiền một đơn mua mới"}
          actions={
            <>
              {openLicense(c.licenseId)}
              {shortenBtn}
            </>
          }
        >
          {onlyText}
        </Callout>
      );
    }
    case "change":
      return (
        <Callout
          tone="warn"
          icon={<IconWarning size={18} />}
          title="Đã hoàn tiền một đơn đổi gói"
          actions={
            <>
              {shortenFree(c.licenseId, true)}
              {openLicense(c.licenseId)}
            </>
          }
        >
          {`Web Admin không đổi lại gói. Đơn đổi gói từ ${planName(e?.fromPlan ?? null)} sang ${planName(e?.plan ?? null)} (hạn trước: ${fmtDate(e?.fromExpiresAt)}; sau: ${fmtDate(e?.toExpiresAt)}).`}
          {e && e.shortenedDays > 0 && ` Đã rút ngắn ${e.shortenedDays} ngày cho đơn này.`}
          {" Có thể rút ngắn hạn (tự chọn số ngày) hay để nguyên; ghi lý do. Xem bảng Đơn hàng của license trước."}
          {unlinkedNote && ` ${unlinkedNote}`}
        </Callout>
      );
    case "unknown_days":
      return (
        <Callout
          tone="warn"
          icon={<IconWarning size={18} />}
          title="Đã hoàn tiền: chưa tính được số ngày đơn này cộng"
          actions={
            <>
              {shortenFree(c.licenseId)}
              {openLicense(c.licenseId)}
            </>
          }
        >
          Nhật ký của đơn không có dòng cấp đọc được nên không biết đơn đã cộng bao nhiêu ngày vào license. Xem bảng Đơn hàng của license và
          nhật ký trước; có thể rút ngắn hạn (tự chọn số ngày) hay để nguyên; đừng thu hồi nếu license còn thời gian khách đã trả ở đơn khác.
        </Callout>
      );
  }
}

/* ---------- Số tiền ---------- */

function MoneyCard({ order, review }: { order: OrderRow; review: Review | null }) {
  const { amount, amount_paid: paid } = order;
  // Đơn thẻ có dữ kiện của cổng (p2, p3 của rà B6): không đọc được số đã thu, hay có mã giảm giá (kể cả khi số đã thu bằng giá):
  // câu riêng, không xanh "Đã nhận đủ", không "Chưa nhận khoản nào".
  const held = !isBank(order) && order.status !== "refunded" ? heldMoneyNote(order, providerName(order.provider), review) : null;
  const short = amount - paid;
  const refunded = order.status === "refunded";
  // Còn thiếu thì không bao giờ ghi 100% (499.000 / 500.000 làm tròn thành 100% là sai nghĩa); đã nhận ít nhất 1 đồng thì
  // không ghi 0%.
  const exact = amount > 0 ? Math.round((paid / amount) * 100) : 0;
  const pct = short > 0 && paid > 0 ? Math.min(99, Math.max(1, exact)) : exact;
  // Đơn đã hoàn tiền sau khi nhận tiền: số liệu là của lúc nhận (server giữ amount_paid khi hoàn), tông nhạt như huy hiệu "Đã
  // hoàn tiền", không xanh như đơn đã trả (m5-T7).
  const refundedPaid = refunded && paid > 0;
  const tone = held ? "warn" : paid <= 0 || refundedPaid ? "muted" : short > 0 ? "warn" : "ok";
  const money = (n: number) => fmtMoney(n, order.currency);
  // Đơn hoàn tiền khi server chưa ghi nhận khoản trả nào (cổng báo hoàn trước khi cấp): không có gì "còn thiếu" để thu.
  const refundedUnpaid = refunded && paid <= 0;
  const received = short > 0 ? `Đã nhận ${pct}% số cần trả` : short < 0 ? `Nhận dư ${money(-short)}` : "Đã nhận đủ";
  const note = held
    ? held
    : refundedUnpaid
    ? "Cổng báo hoàn tiền khi đơn chưa ghi nhận thanh toán (số đã nhận ở đây là 0); không còn khoản nào cần thu."
    : paid <= 0
      ? "Chưa nhận khoản nào."
      : refundedPaid
        ? `${received}, sau đó hoàn tiền.`
        : `${received}.`;
  return (
    <Card
      title="Số tiền"
      icon={<IconCoins size={18} />}
      // Số tiền của đơn USD không gồm thuế do cổng thu thêm (amount_paid lấy sub_total của Creem), chưa trừ phí cổng (M-T4-2). Không
      // gọi là "giá niêm yết": đơn có giảm giá được cấp tay thì số đã nhận thấp hơn giá (p5 của rà B6).
      description={order.currency === "USD" ? "Số tiền (chưa gồm thuế), chưa trừ phí cổng thanh toán." : undefined}
    >
      <dl className="figs">
        <div>
          <dt>Cần trả</dt>
          <dd>{money(amount)}</dd>
        </div>
        <div>
          <dt>Đã nhận</dt>
          <dd>{money(paid)}</dd>
        </div>
        {/* Đã hoàn tiền thì không còn khoản nào để thu: không hiện số thiếu (nó mâu thuẫn với câu ghi chú bên dưới). */}
        <div className={short > 0 && !refunded ? "is-warn" : "is-zero"}>
          <dt>Còn thiếu</dt>
          <dd>{refunded && short > 0 ? "—" : money(Math.max(short, 0))}</dd>
        </div>
      </dl>
      <div className="money-bar">
        <RatioBar value={pct} className={`tone-${tone}`} />
        <p className={short > 0 && paid > 0 && !refunded ? "money-note text-warn" : "money-note"}>{note}</p>
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
        { label: "Cổng", value: providerName(order.provider) },
      ]}
    />
  );
}

/* ---------- Trạng thái trên cổng thanh toán ---------- */

/** Cổng báo cùng trạng thái với đơn? Đơn cần xử lý hay đã hoàn tiền thì cổng vẫn báo đã trả: vẫn là khớp. */
function gatewayMatches(p: PaymentStatus, o: OrderRow): boolean {
  const same = p.status === o.status || (p.status === "paid" && (o.status === "paid_needs_review" || o.status === "refunded"));
  return same && p.amountPaid === o.amount_paid;
}

function GatewayCard({ remote, order, onClose }: { remote: Remote; order: OrderRow; onClose(): void }) {
  const p = remote.data;
  const gateway = providerName(order.provider);
  // Câu "Khớp/Khác với đơn…" chỉ để quyết có Cấp tay không: đơn đã khép (paid, refunded, paid_needs_review) không có nút đó, và
  // Creem còn báo paid cả sau khi hoàn tiền nên "Khớp" ở đó là sai nghĩa (m2-T7). Đơn đã khép thì thẻ chỉ có số liệu của cổng.
  const verdict = p !== undefined && !isClosed(order);
  return (
    <Card
      title={`Trạng thái trên ${gateway}`}
      icon={<IconCoins size={18} />}
      description={`Xem lúc ${fmtHm(remote.at)}`}
      tone={verdict && !gatewayMatches(p, order) ? "warn" : undefined}
      actions={<IconButton label={`Đóng kết quả ${gateway}`} icon={<IconClose size={16} />} size="sm" onClick={onClose} />}
      className="gateway-card"
    >
      {remote.error ? (
        <ErrorBox error={remote.error} />
      ) : p ? (
        <>
          <KeyValue
            items={[
              // Nhãn theo cổng của đơn: Creem báo underpaid là "Trả thấp hơn giá", không "Chuyển thiếu" (p1 của rà B6).
              { label: "Trạng thái", value: <OrderStatusBadge status={p.status as OrderStatus} provider={order.provider} /> },
              { label: "Số tiền", value: fmtMoney(p.amount, order.currency) },
              { label: "Đã nhận", value: fmtMoney(p.amountPaid, order.currency) },
              { label: "Giao dịch", value: p.paidAt ? fmtDateTime(p.paidAt) : null },
            ]}
          />
          {verdict && (
            <p className={gatewayMatches(p, order) ? "gateway-verdict is-ok" : "gateway-verdict is-warn"}>
              {gatewayMatches(p, order) ? "Khớp với đơn." : "Khác với đơn: so số tiền và trạng thái trước khi cấp tay."}
            </p>
          )}
          {order.status === "refunded" && p.status === "paid" && (
            // Creem giữ phiên ở trạng thái đã trả sau khi hoàn (P3-T7): trang trạng thái của cổng không cho biết đơn đã hoàn.
            <p className="gateway-note">
              Cổng vẫn có thể báo đã trả sau khi hoàn tiền: đơn được ghi là hoàn tiền nhờ webhook hoàn tiền hay tranh chấp của cổng, hay thao tác
              Ghi đã hoàn tiền; xem nhật ký của đơn.
            </p>
          )}
        </>
      ) : null}
    </Card>
  );
}
