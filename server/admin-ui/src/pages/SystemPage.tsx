// Trang Hệ thống (spec Web Admin phần 3a): cảnh báo vận hành, bản phát hành app, model. Chỉ đọc.
// Hai nguồn tải riêng (một nguồn lỗi không che nguồn kia). Mọi chuỗi từ API render làm văn bản (React tự thoát).
import { api } from "../api/endpoints";
import type { AlertsResponse, ChannelInfo, ModelsInfo, Source } from "../api/types";
import { ErrorBox } from "../components/Feedback";
import { Badge } from "../components/StatusBadge";
import { fmtBytes, fmtDateTime } from "../format";
import { useLoad } from "../hooks";

/** Chuỗi ngày giờ ISO của bucket thành GMT+7; không parse được thì hiện nguyên chuỗi gốc. */
function fmtIso(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : fmtDateTime(Math.floor(ms / 1000));
}

export function SystemPage() {
  const alerts = useLoad(() => api.alerts(), []);
  const releases = useLoad(() => api.releases(), []);
  const reload = () => {
    alerts.reload();
    releases.reload();
  };
  return (
    <>
      <h1>Hệ thống</h1>
      <div className="overview-bar">
        <button type="button" onClick={reload} disabled={alerts.loading || releases.loading}>
          Làm mới
        </button>
      </div>

      <section>
        <h2 className="group-title">Cảnh báo vận hành</h2>
        {alerts.error && <ErrorBox error={alerts.error} onRetry={alerts.reload} />}
        {alerts.loading && !alerts.data && <p className="muted">Đang tải…</p>}
        {alerts.data && <Alerts a={alerts.data} />}
      </section>

      <section>
        <h2 className="group-title">Bản phát hành app</h2>
        {releases.error && <ErrorBox error={releases.error} onRetry={releases.reload} />}
        {releases.loading && !releases.data && <p className="muted">Đang tải…</p>}
        {releases.data && (
          <div className="chart-grid">
            <ChannelCard name="Stable" source={releases.data.channels.stable} />
            <ChannelCard name="Beta" source={releases.data.channels.beta} />
          </div>
        )}
      </section>

      <section>
        <h2 className="group-title">Model</h2>
        {releases.loading && !releases.data && <p className="muted">Đang tải…</p>}
        {releases.error && <p className="muted">Không tải được dữ liệu, xem lỗi ở mục Bản phát hành app.</p>}
        {releases.data && <Models source={releases.data.models} />}
      </section>

      <p className="muted">Chỉ đọc từ URL công khai, không kiểm chữ ký; chữ ký do app kiểm.</p>
    </>
  );
}

function Alerts({ a }: { a: AlertsResponse }) {
  const more = a.total > a.items.length ? ` (hiện ${a.items.length} dòng mới nhất)` : "";
  return (
    <>
      <p>{`${a.total} dòng, ${a.pending} chưa báo${more}`}</p>
      {a.items.length === 0 ? (
        <p className="muted">Chưa có cảnh báo nào</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loại</th>
                <th>Từ giờ</th>
                <th>Số lần</th>
                <th>Đã báo</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {a.items.map((r) => (
                <tr key={`${r.kind}|${r.window_start}`}>
                  <td data-label="Loại">
                    <code>{r.kind}</code>
                  </td>
                  <td data-label="Từ giờ">{fmtDateTime(r.window_start)}</td>
                  <td data-label="Số lần">{r.count}</td>
                  <td data-label="Đã báo">{r.notified_count}</td>
                  <td data-label="Trạng thái">
                    {r.count > r.notified_count ? <Badge tone="warn">Chưa báo</Badge> : <Badge tone="ok">Đã báo</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Cron gửi email cảnh báo mỗi giờ</p>
    </>
  );
}

/** "Chưa có bản nào" hay "Không đọc được (lý do)"; null khi nguồn đọc được. */
function Unavailable({ source }: { source: Source<unknown> }) {
  if (source.status === "missing") return <p className="muted">Chưa có bản nào</p>;
  if (source.status === "error") return <p className="muted">{`Không đọc được (${source.reason})`}</p>;
  return null;
}

function ChannelCard({ name, source }: { name: string; source: Source<ChannelInfo> }) {
  return (
    <section className="panel">
      <h3>{name}</h3>
      {source.status === "ok" ? (
        <ul className="plain">
          <li>
            <span className="muted">Phiên bản: </span>
            <strong>{source.version}</strong>
          </li>
          <li>
            <span className="muted">Ngày phát hành: </span>
            <span>{source.pub_date === null ? "—" : fmtIso(source.pub_date)}</span>
          </li>
          <li>
            <span className="muted">Nền tảng: </span>
            <span>{source.platforms.length > 0 ? source.platforms.join(", ") : "—"}</span>
          </li>
          <li>
            <span className="muted">Ghi chú: </span>
            {source.notes === "" ? <span className="muted">Không có ghi chú</span> : <span className="release-notes">{source.notes}</span>}
          </li>
        </ul>
      ) : (
        <Unavailable source={source} />
      )}
    </section>
  );
}

function Models({ source }: { source: Source<ModelsInfo> }) {
  if (source.status !== "ok") return <Unavailable source={source} />;
  const total = source.files.reduce((sum, f) => sum + f.bytes, 0);
  return (
    <>
      <p>
        {`Bản manifest số ${source.sequence}, đăng lúc ${fmtIso(source.published_at)}, khóa ký `}
        <code>{source.kid}</code>
        {`, ${source.files.length} file, tổng ${fmtBytes(total)}`}
      </p>
      {source.files.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Loại</th>
                <th>Phiên bản</th>
                <th>Dung lượng</th>
                <th>Gói</th>
                <th>Cần app từ bản</th>
              </tr>
            </thead>
            <tbody>
              {source.files.map((f, i) => (
                <tr key={`${f.id}|${f.version}|${i}`}>
                  <td data-label="Id">{f.id}</td>
                  <td data-label="Loại">{f.kind}</td>
                  <td data-label="Phiên bản">{f.version}</td>
                  <td data-label="Dung lượng">{fmtBytes(f.bytes)}</td>
                  <td data-label="Gói">{f.tier}</td>
                  <td data-label="Cần app từ bản">{f.min_app_version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
