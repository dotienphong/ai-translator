import { useEffect } from "react";
import { dateTime, localOffsetMinutes } from "../../lib/subtitleView";
import { useApp, useT } from "./appStore";

const ms = (v: number | null) => (v === null ? "–" : `${Math.round(v)} ms`);

// Bảng debug ẩn (§7): số đo của các phiên gần nhất trong lần chạy này (thời gian cắt đoạn, nhận dạng, dịch, tổng thể;
// số câu theo loại), để hỗ trợ khi người dùng báo lỗi. Không có chữ chép lời. Mở bằng cách bấm 5 lần vào dòng phiên bản ở
// màn hình Giới thiệu.
export function DebugPanel() {
  const t = useT();
  const sessions = useApp((s) => s.debugSessions);
  const status = useApp((s) => s.status);
  const load = useApp((s) => s.loadDebugSessions);
  useEffect(() => {
    void load();
  }, [load]);
  const offset = localOffsetMinutes();
  return (
    <div className="card debug">
      <h2>{t("debug.title")}</h2>
      {status && (
        <p className="hint">
          {t("debug.status", {
            session: status.session,
            loading: status.loading ?? "–",
            cpu: String(status.cpuFallback),
            pro: String(status.pro),
          })}
        </p>
      )}
      <button onClick={() => void load()}>{t("debug.refresh")}</button>
      {sessions && sessions.length === 0 && <p className="hint">{t("debug.empty")}</p>}
      {sessions?.map((s) => (
        <div key={s.session}>
          <h3>{t("debug.session", { n: s.session, time: dateTime(s.endedAt, offset) })}</h3>
          <table>
            <thead>
              <tr>
                <th>{t("debug.stage")}</th>
                <th>n</th>
                <th>p50</th>
                <th>p90</th>
              </tr>
            </thead>
            <tbody>
              {s.stages.map((st) => (
                <tr key={st.name}>
                  <td>{t(`debug.stage.${st.name}`)}</td>
                  <td>{st.count}</td>
                  <td>{ms(st.p50)}</td>
                  <td>{ms(st.p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{s.summary}</p>
        </div>
      ))}
    </div>
  );
}
