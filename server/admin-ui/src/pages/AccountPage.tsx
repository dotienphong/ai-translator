// Chi tiết tài khoản Google (spec 2026-11-05-dang-nhap-google-design.md §7): email, ngày tạo và đăng nhập gần nhất, license đã gắn
// (kèm email mua license khi khác email tài khoản), máy đang kích hoạt, các dòng dùng thử. Hai thao tác ghi: Gỡ gắn license
// (giải 409 license_linked_other_account của app; lý do không bắt buộc) và Ẩn danh tài khoản (lý do bắt buộc, không hoàn tác).
// Tài khoản đã xóa không còn email và không còn nút Ẩn danh; server vẫn giữ dòng dùng thử để xóa rồi đăng nhập lại không có thêm lần dùng thử.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { AccountActivation, AccountDetail, AccountLicense, AccountTrial } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Cell2, WhenCell } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { type Column, DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, NoticeRegion, useNotice } from "../components/Feedback";
import { Field } from "../components/Field";
import { IconClock, IconInfo, IconKey, IconMonitor, IconUser } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { PageHeader } from "../components/PageHeader";
import { LicenseBadges, PLAN_LABELS } from "../components/StatusBadge";
import { daysLeft, fmtDate, fmtDateTime, maskKey, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";
import { DangerZone, DetailLayout, DetailNotFound, DetailSkeleton, ago } from "./detail-kit";
import { AccountStatusBadge, DELETED_EMAIL } from "./AccountsPage";

const LIST_CRUMB = { label: "Tài khoản", to: "/accounts" };
/** Chữ phải gõ để ẩn danh (như hộp Ẩn danh của trang Công cụ). */
const CONFIRM_TEXT = "AN DANH";

/** Kích hoạt trên license của tài khoản + key che của license đó. */
interface DeviceRow {
  a: AccountActivation;
  key: string;
}

function deviceColumns(now: number): Column<DeviceRow>[] {
  return [
    {
      header: "Máy",
      cell: ({ a }) => (
        <Cell2
          main={
            <Link to={`/devices/${a.device_id_hash}`} className="row-id">
              {a.device_label ?? shortHash(a.device_id_hash)}
            </Link>
          }
          sub={<code>{shortHash(a.device_id_hash)}</code>}
        />
      ),
    },
    { header: "License", cell: ({ key }) => <code>{key}</code> },
    { header: "Lần kiểm cuối", nowrap: true, cell: ({ a }) => <WhenCell sec={a.last_validated_at} now={now} /> },
    {
      header: "Trạng thái",
      aside: true,
      cell: ({ a }) => (a.deactivated_at !== null ? <Badge tone="muted">Đã gỡ</Badge> : <Badge tone="ok">Đang kích hoạt</Badge>),
    },
  ];
}

function trialColumns(now: number): Column<AccountTrial>[] {
  return [
    {
      header: "Máy",
      cell: (t) => (
        <Link to={`/devices/${t.device_id_hash}`} className="row-id mono" title={t.device_id_hash}>
          {shortHash(t.device_id_hash)}
        </Link>
      ),
    },
    { header: "Bắt đầu", nowrap: true, cell: (t) => fmtDateTime(t.started_at) },
    {
      header: "Kết thúc",
      nowrap: true,
      cell: (t) => <Cell2 main={fmtDateTime(t.ends_at)} sub={t.ends_at <= now ? "đã hết" : daysLeft(t.ends_at, now)} />,
    },
    { header: "Lần thấy cuối", nowrap: true, cell: (t) => <WhenCell sec={t.last_seen_at} now={now} /> },
  ];
}

export function AccountPage({ id }: { id: string }) {
  const data = useLoad(() => api.account(id), [id]);
  const [dialog, setDialog] = useState<{ kind: "unlink"; license: AccountLicense } | { kind: "anonymize" } | null>(null);
  const [unlinkNote, setUnlinkNote] = useState("");
  const notice = useNotice();
  const close = () => {
    setDialog(null);
    setUnlinkNote("");
  };

  if (data.error) {
    if (data.error.code === "account_not_found") {
      return (
        <DetailNotFound
          breadcrumb={[LIST_CRUMB, { label: "Không có" }]}
          title="Tài khoản"
          heading="Không có tài khoản này"
          hint="Địa chỉ có thể gõ nhầm. Tìm lại trong danh sách theo email."
          back={{ to: "/accounts", label: "Về Tài khoản" }}
        />
      );
    }
    return (
      <>
        <PageHeader breadcrumb={[LIST_CRUMB, { label: "Lỗi" }]} title="Tài khoản" />
        <ErrorBox error={data.error} onRetry={data.reload} title="Không tải được tài khoản" />
      </>
    );
  }
  if (!data.data) return <DetailSkeleton breadcrumb={[LIST_CRUMB, { label: "…" }]} label="Đang tải tài khoản…" />;

  const d: AccountDetail = data.data;
  const acc = d.account;
  const now = nowSec();
  const deleted = acc.deleted_at !== null;
  const name = acc.email ?? DELETED_EMAIL;
  const keyOf = new Map(d.licenses.map((l) => [l.id, maskKey(l.license_key)]));
  const devices: DeviceRow[] = d.activations
    .map((a) => ({ a, key: keyOf.get(a.license_id) ?? "—" }))
    .sort((x, y) => Number(x.a.deactivated_at !== null) - Number(y.a.deactivated_at !== null) || y.a.created_at - x.a.created_at);

  return (
    <>
      <PageHeader
        breadcrumb={[LIST_CRUMB, { label: name }]}
        title={name}
        badges={<AccountStatusBadge status={acc.status} />}
        description={
          <p className="page-meta detail-meta">
            {deleted && acc.deleted_at !== null ? (
              <span>{`Đã xóa lúc ${fmtDateTime(acc.deleted_at)}`}</span>
            ) : (
              <span>{`Đăng nhập gần nhất ${fmtDateTime(acc.last_login_at)}`}</span>
            )}
            <span>{`Tạo ${fmtDate(acc.created_at)}`}</span>
          </p>
        }
      />
      <NoticeRegion handle={notice} />
      <DetailLayout
        side={
          <Card title="Thông tin" icon={<IconInfo size={18} />}>
            <KeyValue
              items={[
                { label: "Email", value: acc.email ?? DELETED_EMAIL, copy: acc.email ?? undefined },
                { label: "Nhóm", value: <AccountStatusBadge status={acc.status} /> },
                { label: "Tạo lúc", value: fmtDateTime(acc.created_at), hint: ago(acc.created_at, now) },
                { label: "Đăng nhập gần nhất", value: fmtDateTime(acc.last_login_at), hint: ago(acc.last_login_at, now) },
                { label: "Đã xóa lúc", value: acc.deleted_at === null ? null : fmtDateTime(acc.deleted_at), hidden: !deleted },
                { label: "Đồng ý điều khoản", value: fmtDateTime(acc.consent_at) },
                { label: "Ngôn ngữ", value: acc.lang },
                {
                  label: "Dùng thử",
                  value: acc.trial_started_at === null || acc.trial_ends_at === null ? "Chưa dùng thử" : `${fmtDate(acc.trial_started_at)} đến ${fmtDate(acc.trial_ends_at)}`,
                },
                { label: "Mã tài khoản", value: acc.id, mono: true, copy: acc.id, copyWhat: "mã tài khoản" },
              ]}
            />
          </Card>
        }
        main={
          <>
            <Card title="License đã gắn" icon={<IconKey size={18} />} flush={d.licenses.length > 0}>
              {d.licenses.length > 0 ? (
                <ul className="lic-list">
                  {d.licenses.map((l) => {
                    const masked = maskKey(l.license_key);
                    return (
                      <li key={l.id} className="lic-item">
                        <div className="lic-head">
                          <Link to={`/licenses/${l.id}`} className="lic-key mono">
                            {masked}
                          </Link>
                          <span className="cell-badges">
                            <LicenseBadges license={{ ...l, conflict: false }} now={now} />
                          </span>
                        </div>
                        <p className="lic-meta">
                          <span>{PLAN_LABELS[l.plan] ?? l.plan}</span>
                          <span>{l.revoked_at !== null ? `hết hạn ${fmtDate(l.expires_at)}` : `${daysLeft(l.expires_at, now)} (${fmtDate(l.expires_at)})`}</span>
                          <span>{`${l.active_devices} máy đang kích hoạt`}</span>
                        </p>
                        {l.email && l.email !== acc.email && <p className="lic-email">{`Email mua license: ${l.email}`}</p>}
                        <span className="lic-act">
                          <Button size="sm" variant="danger" aria-label={`Gỡ gắn license ${masked}`} onClick={() => setDialog({ kind: "unlink", license: l })}>
                            Gỡ gắn…
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState compact title="Chưa gắn license nào" hint={deleted ? "Tài khoản đã xóa: license đã được gỡ gắn." : "License gắn vào tài khoản khi khách đăng nhập rồi nhập key trong app."} />
              )}
            </Card>
            <Card title="Máy đang dùng license" icon={<IconMonitor size={18} />} flush={devices.length > 0}>
              {devices.length > 0 ? (
                <DataTable flush caption="Máy kích hoạt license của tài khoản" columns={deviceColumns(now)} rows={devices} rowKey={({ a }) => a.id} empty="" />
              ) : (
                <EmptyState compact title="Chưa có máy nào kích hoạt license của tài khoản" />
              )}
            </Card>
            <Card title="Dùng thử" icon={<IconClock size={18} />} description="Máy đã dùng thử bằng tài khoản này." flush={d.trials.length > 0}>
              {d.trials.length > 0 ? (
                <DataTable flush caption="Dòng dùng thử của tài khoản" columns={trialColumns(now)} rows={d.trials} rowKey={(t) => t.device_id_hash} empty="" />
              ) : (
                <EmptyState compact title="Chưa có dòng dùng thử nào" />
              )}
            </Card>
          </>
        }
        danger={
          !deleted && (
            <DangerZone
              description="Ẩn danh không hoàn tác được. Gỡ gắn license trả lại được bằng cách khách nhập lại key trong app."
              items={[
                {
                  name: "Ẩn danh tài khoản",
                  effect:
                    "Xóa email khỏi tài khoản, gỡ mọi license và máy dùng thử khỏi tài khoản. Tài khoản vẫn nhớ mốc dùng thử cũ: khách đăng nhập lại không có thêm lần dùng thử.",
                  button: (
                    <Button variant="danger" icon={<IconUser size={16} />} onClick={() => setDialog({ kind: "anonymize" })}>
                      Ẩn danh…
                    </Button>
                  ),
                },
              ]}
            />
          )
        }
      />

      {dialog?.kind === "unlink" && (
        <ConfirmDialog
          title={`Gỡ gắn license ${maskKey(dialog.license.license_key)}?`}
          description="License thôi thuộc tài khoản này; khách có thể gắn lại vào tài khoản này hay tài khoản khác bằng cách nhập key trong app. Không đổi hạn hay máy đã kích hoạt."
          confirmLabel="Gỡ gắn"
          needsNote={false}
          onConfirm={async () => {
            const note = unlinkNote.trim();
            await api.unlinkAccountLicense(id, dialog.license.id, note === "" ? undefined : note);
            notice.show("Đã gỡ gắn license khỏi tài khoản.");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        >
          <Field label="Lý do (không bắt buộc)" hint="Ghi vào nhật ký cùng thao tác. Không ghi email của khách.">
            <textarea value={unlinkNote} maxLength={500} rows={3} onChange={(e) => setUnlinkNote(e.target.value)} />
          </Field>
        </ConfirmDialog>
      )}
      {dialog?.kind === "anonymize" && (
        <ConfirmDialog
          title={`Ẩn danh tài khoản ${name}?`}
          description="Xóa email khỏi tài khoản, gỡ mọi license và máy dùng thử khỏi tài khoản. Không hoàn tác được. Lý do được ghi vào nhật ký: không ghi email hay thông tin cá nhân của khách vào đây."
          confirmLabel="Ẩn danh"
          needsNote
          typeToConfirm={CONFIRM_TEXT}
          onConfirm={async (note) => {
            const r = await api.anonymizeAccount(id, note);
            notice.show(r.changed ? "Đã ẩn danh tài khoản." : "Tài khoản đã được ẩn danh từ trước, không đổi gì.", r.changed ? "ok" : "info");
            data.reload();
          }}
          onConflict={data.reload}
          onClose={close}
        />
      )}
    </>
  );
}
