import { api } from "../api/endpoints";
import { licenseColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Badge } from "../components/StatusBadge";
import { fmtDateTime, nowSec } from "../format";
import { useLoad } from "../hooks";

export function DevicePage({ hash }: { hash: string }) {
  const data = useLoad(() => api.lookup({ device_id_hash: hash }), [hash]);
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <p className="muted">Đang tải…</p>;
  const now = nowSec();
  const trial = data.data.trial ?? null;
  return (
    <>
      <h1>Máy</h1>
      <p>
        <code className="hash">{hash}</code>
      </p>
      <h2>Dùng thử Free</h2>
      {trial ? (
        <dl className="facts">
          <dt>Bắt đầu</dt>
          <dd>{fmtDateTime(trial.started_at)}</dd>
          <dt>Kết thúc</dt>
          <dd>
            {fmtDateTime(trial.ends_at)} {trial.ends_at > now ? <Badge tone="ok">Đang dùng</Badge> : <Badge tone="muted">Đã hết</Badge>}
          </dd>
          <dt>Lần gọi cuối</dt>
          <dd>{fmtDateTime(trial.last_seen_at)}</dd>
        </dl>
      ) : (
        <p className="muted">Máy chưa đăng ký dùng thử.</p>
      )}
      <h2>License từng kích hoạt trên máy</h2>
      <DataTable columns={licenseColumns(now)} rows={data.data.licenses} rowKey={(l) => l.id} empty="Chưa có license nào" />
    </>
  );
}
