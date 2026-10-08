// Chi tiết license (spec Web Admin §4.2; giao diện mới mục 2): key che làm tiêu đề (Hiện, Chép), huy hiệu trạng thái, hành
// động chính (Gia hạn, Gửi lại email), việc cần làm (khóa tạm: Mở khóa), máy (xung đột thì thẻ tông cảnh báo), đơn, nhật
// ký; bên phải là Thông tin và Khu vực nguy hiểm (Thu hồi). License đã thu hồi: không còn nút ghi nào, kể cả trên từng máy.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { Activation } from "../api/types";
import { AuditTimeline } from "../components/AuditTimeline";
import { Badge } from "../components/Badge";
import { Button, ButtonGroup } from "../components/Button";
import { Card } from "../components/Card";
import { orderColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, NoticeRegion, useNotice } from "../components/Feedback";
import { Field } from "../components/Field";
import { IconBan, IconCalendar, IconCart, IconInfo, IconLock, IconLog, IconMail, IconMonitor, IconUnlock } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { RevealToggle } from "../components/MaskedKey";
import { PageHeader } from "../components/PageHeader";
import { RelTime } from "../components/RelTime";
import { LicenseBadges, PLAN_LABELS } from "../components/StatusBadge";
import { daysLeft, fmtDate, fmtDateTime, maskKey, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";
import { Callout, DangerZone, EmailText, DetailLayout, DetailNotFound, DetailSkeleton } from "./detail-kit";

type Dialog =
  | { kind: "extend" | "resend" | "unlock" | "revoke" }
  | { kind: "deactivate" | "reset"; activation: Activation }
  | null;

const LIST_CRUMB = { label: "License", to: "/licenses" };

const deviceName = (a: Activation) => a.device_label ?? shortHash(a.device_id_hash);

/** Trong trang license, đơn nào cũng của license này: bỏ cột Email và Gói cho bảng gọn. */
const ORDER_COLUMNS_HIDDEN = new Set(["Email", "Gói"]);

export function LicensePage({ id }: { id: string }) {
  const data = useLoad(() => api.lookup({ license_id: id }), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const notice = useNotice();
  const [days, setDays] = useState("30");
  const [shown, setShown] = useState(false);

  if (data.error) {
    return (
      <>
        <PageHeader breadcrumb={[LIST_CRUMB, { label: "Chi tiết" }]} title="License" />
        {/* Cùng vị trí với nhánh chính: tải lại sau thao tác mà lỗi thì thông báo kết quả vẫn còn. */}
        <NoticeRegion handle={notice} />
        <ErrorBox error={data.error} onRetry={data.reload} title="Không tải được license" />
      </>
    );
  }
  if (!data.data) return <DetailSkeleton breadcrumb={[LIST_CRUMB, { label: "Chi tiết" }]} label="Đang tải license…" />;
  const lic = data.data.licenses.find((l) => l.id === id);
  if (!lic) {
    return (
      <DetailNotFound
        breadcrumb={[LIST_CRUMB, { label: "Không tìm thấy" }]}
        title="License"
        heading="Không có license này"
        hint="Máy chủ không có license mang id này. Kiểm lại id, hay tra cứu theo key hay email của khách."
        back={{ to: "/licenses", label: "Về danh sách license" }}
      />
    );
  }
  const now = nowSec();
  const revoked = lic.revoked_at !== null;
  const locked = !revoked && lic.locked_at !== null;
  const active = lic.activations.filter((a) => a.deactivated_at === null);
  const conflict = !revoked && lic.conflict;
  const daysNum = Number(days);
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 3650;
  const close = () => setDialog(null);
  const masked = maskKey(lic.license_key);

  // Máy đang dùng trước, rồi mới nhất trước.
  const devices = [...lic.activations].sort((x, y) => Number(x.deactivated_at !== null) - Number(y.deactivated_at !== null) || y.created_at - x.created_at);

  return (
    <>
      <PageHeader
        breadcrumb={[LIST_CRUMB, { label: masked }]}
        title={<span className="key-title">{shown ? lic.license_key : masked}</span>}
        titleAside={
          <>
            <RevealToggle shown={shown} onToggle={() => setShown((s) => !s)} />
            <CopyButton text={lic.license_key} />
          </>
        }
        badges={
          <>
            <Badge dot={false}>{PLAN_LABELS[lic.plan] ?? lic.plan}</Badge>
            <LicenseBadges license={lic} now={now} />
          </>
        }
        description={
          <p className="page-meta detail-meta">
            <span title={lic.email ?? undefined}>{lic.email ?? "Không có email (đã ẩn danh)"}</span>
            <span>{revoked ? `hết hạn ${fmtDate(lic.expires_at)}` : `${daysLeft(lic.expires_at, now)}, hết hạn ${fmtDate(lic.expires_at)}`}</span>
            <span>
              tạo <RelTime sec={lic.created_at} now={now} />
            </span>
          </p>
        }
        actions={
          !revoked && (
            <ButtonGroup label="Thao tác với license">
              <Button variant="primary" icon={<IconCalendar size={16} />} onClick={() => setDialog({ kind: "extend" })}>
                Gia hạn…
              </Button>
              <Button
                icon={<IconMail size={16} />}
                disabled={!lic.email}
                title={lic.email ? undefined : "License không còn email (đã ẩn danh): không gửi lại được"}
                onClick={() => setDialog({ kind: "resend" })}
              >
                Gửi lại email…
              </Button>
            </ButtonGroup>
          )
        }
      />
      <NoticeRegion handle={notice} />
      {revoked && lic.revoked_at !== null && (
        <Callout tone="danger" icon={<IconBan size={18} />} title="License đã bị thu hồi">
          Thu hồi lúc {fmtDateTime(lic.revoked_at)}. Mọi máy dùng key này về Free ở lần kiểm tra kế tiếp; trang không còn thao tác nào.
        </Callout>
      )}
      {locked && lic.locked_at !== null && (
        <Callout
          tone="warn"
          icon={<IconLock size={18} />}
          title="License đang khóa tạm"
          actions={
            <Button variant="primary" icon={<IconUnlock size={16} />} onClick={() => setDialog({ kind: "unlock" })}>
              Mở khóa…
            </Button>
          }
        >
          Khóa <RelTime sec={lic.locked_at} now={now} /> do gỡ máy quá ngưỡng. Xác minh với khách rồi mở khóa.
        </Callout>
      )}
      <DetailLayout
        side={
          <Card title="Thông tin" icon={<IconInfo size={18} />}>
            <KeyValue
              items={[
                { label: "License id", value: <span title={lic.id}>{`${lic.id.slice(0, 8)}…${lic.id.slice(-4)}`}</span>, mono: true, copy: lic.id, copyWhat: "license id" },
                {
                  label: "Email",
                  value: lic.email ? <EmailText email={lic.email} /> : <span className="cell-none">Không có email (đã ẩn danh)</span>,
                  copy: lic.email ?? undefined,
                },
                { label: "Gói", value: PLAN_LABELS[lic.plan] ?? lic.plan },
                { label: "Hạn dùng", value: fmtDate(lic.expires_at), hint: revoked ? undefined : daysLeft(lic.expires_at, now) },
                { label: "Tạo lúc", value: fmtDateTime(lic.created_at) },
                { label: "Khóa tạm lúc", value: lic.locked_at ? fmtDateTime(lic.locked_at) : null, hidden: lic.locked_at === null },
                { label: "Thu hồi lúc", value: lic.revoked_at ? fmtDateTime(lic.revoked_at) : null, hidden: !revoked },
                { label: "Số máy", value: `${active.length} đang kích hoạt` },
              ]}
            />
          </Card>
        }
        main={
          <>
            <Card
              title="Máy"
              icon={<IconMonitor size={18} />}
              tone={conflict ? "warn" : undefined}
              description={
                conflict
                  ? `Key đang kích hoạt trên ${active.length} máy cùng lúc. Hỏi khách máy nào đang dùng, gỡ các máy còn lại.`
                  : "Mỗi key dùng trên một máy."
              }
              actions={
                <Badge tone={conflict ? "warn" : "neutral"} outline>
                  {`${active.length} đang kích hoạt`}
                </Badge>
              }
              flush={devices.length > 0}
            >
              {devices.length > 0 ? (
                <ul className="dev-list" aria-label="Máy của license">
                  {devices.map((a) => (
                    <li key={a.id} className={a.deactivated_at === null ? "dev-item" : "dev-item is-off"}>
                      <span className="dev-icon" aria-hidden="true">
                        <IconMonitor size={18} />
                      </span>
                      <div className="dev-main">
                        <div className="dev-head">
                          <Link to={`/devices/${a.device_id_hash}`} className="dev-name">
                            {a.device_label ?? "Máy không tên"}
                          </Link>
                          {a.deactivated_at === null ? (
                            <Badge tone={revoked ? "muted" : conflict ? "warn" : "ok"}>Đang dùng</Badge>
                          ) : (
                            <Badge tone="muted">
                              Đã gỡ ({a.deactivated_by === "admin" ? "admin" : "người dùng"}) {fmtDate(a.deactivated_at)}
                            </Badge>
                          )}
                        </div>
                        <p className="dev-meta">
                          <code>{shortHash(a.device_id_hash)}</code>
                          <span>
                            kiểm <RelTime sec={a.last_validated_at} now={now} />
                          </span>
                          <span>kích hoạt {fmtDate(a.created_at)}</span>
                        </p>
                      </div>
                      {a.deactivated_at === null && !revoked && (
                        <span className="row-actions">
                          <Button size="sm" onClick={() => setDialog({ kind: "reset", activation: a })}>
                            Reset hạn mức…
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setDialog({ kind: "deactivate", activation: a })}>
                            Gỡ…
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="Chưa kích hoạt trên máy nào" hint="Máy hiện ở đây khi khách nhập key trong app." />
              )}
            </Card>
            <Card title="Đơn hàng" icon={<IconCart size={18} />} flush>
              <DataTable
                flush
                caption="Đơn của license"
                columns={orderColumns(now).filter((c) => !ORDER_COLUMNS_HIDDEN.has(c.header))}
                rows={data.data.orders}
                rowKey={(o) => String(o.order_code)}
                rowHref={(o) => `/orders/${o.order_code}`}
                empty="Không có đơn (license cấp tay)"
              />
            </Card>
            <Card title="Nhật ký" icon={<IconLog size={18} />} description="50 dòng gần nhất của license, mới nhất ở trên.">
              {lic.audit.length > 0 ? <AuditTimeline rows={lic.audit} now={now} label="Nhật ký của license" /> : <EmptyState compact title="Chưa có dòng nào" />}
            </Card>
          </>
        }
        danger={
          !revoked && (
            <DangerZone
              items={[
                {
                  name: "Thu hồi license",
                  effect: "Mọi máy đang dùng key này về Free ở lần kiểm tra kế tiếp.",
                  button: (
                    <Button variant="danger" icon={<IconBan size={16} />} onClick={() => setDialog({ kind: "revoke" })}>
                      Thu hồi…
                    </Button>
                  ),
                },
              ]}
            />
          )
        }
      />

      {dialog?.kind === "extend" && (
        <ConfirmDialog
          title="Gia hạn license?"
          description="Cộng thêm số ngày, giữ gói. License đã hết hạn thì tính từ bây giờ."
          confirmLabel="Gia hạn"
          needsNote
          extraValid={daysOk}
          onConfirm={async (note) => {
            const r = await api.extend(id, daysNum, note);
            notice.show(`Đã gia hạn tới ${fmtDate(r.expires_at)}.`);
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        >
          <Field label="Số ngày" hint="Số nguyên từ 1 đến 3650." error={days !== "" && !daysOk ? "Nhập số nguyên từ 1 đến 3650." : undefined}>
            <input type="number" min={1} max={3650} value={days} aria-invalid={days !== "" && !daysOk} onChange={(e) => setDays(e.target.value)} />
          </Field>
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
            notice.show("Đã gửi lại email.");
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
            notice.show("Đã mở khóa.");
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
            notice.show("Đã thu hồi license.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
      {dialog?.kind === "deactivate" && (
        <ConfirmDialog
          title={`Gỡ máy ${deviceName(dialog.activation)}?`}
          description="Máy này thôi dùng key ở lần kiểm tra kế tiếp. Admin gỡ không tính vào ngưỡng khóa tạm."
          confirmLabel="Gỡ"
          needsNote
          onConfirm={async (note) => {
            await api.deactivate(dialog.activation.id, note);
            notice.show("Đã gỡ máy.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
      {dialog?.kind === "reset" && (
        <ConfirmDialog
          title={`Reset hạn mức của máy ${deviceName(dialog.activation)}?`}
          description="Máy bắt đầu bộ đếm hạn mức mới ở lần kiểm tra kế tiếp. Chỉ làm khi khách mất bản ghi bộ đếm."
          confirmLabel="Reset"
          needsNote
          onConfirm={async (note) => {
            await api.resetQuota(dialog.activation.id, note);
            notice.show("Đã reset hạn mức của máy.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
    </>
  );
}
