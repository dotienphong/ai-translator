import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { Icon } from "../../../components/Icon";
import { ProLocked } from "../../../components/ProLocked";
import { errorKey } from "../../../i18n";
import { dateTime, localOffsetMinutes } from "../../../lib/subtitleView";
import { useApp, useT } from "../appStore";
import { useHistory } from "../dataStores";
import { TranscriptView } from "../TranscriptView";

// Lịch sử (F4, Pro): danh sách phiên đã lưu, mới nhất trước; mở xem lại (cùng giao diện với Bản chép lời); xóa từng phiên;
// xóa tất cả có bước xác nhận. Gói Free thì khóa, kèm nút Nâng cấp.
export function HistoryScreen() {
  const t = useT();
  const pro = useApp((s) => s.status?.pro ?? false);
  const saveHistory = useApp((s) => s.settings?.saveHistory ?? false);
  const navigate = useApp((s) => s.navigate);
  const sessions = useHistory((s) => s.sessions);
  const open = useHistory((s) => s.open);
  const error = useHistory((s) => s.error);
  const load = useHistory((s) => s.load);
  const openSession = useHistory((s) => s.openSession);
  const close = useHistory((s) => s.close);
  const remove = useHistory((s) => s.remove);
  const clearAll = useHistory((s) => s.clearAll);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (pro) void load();
  }, [pro, load]);
  if (!pro) return <ProLocked text={t("history.pro")} upgradeLabel={t("pro.upgrade")} onUpgrade={() => navigate("upgrade")} />;
  if (open) {
    return (
      <>
        <div className="row">
          <button onClick={close}>
            <Icon name="chevronLeft" size={16} />
            {t("history.back")}
          </button>
          <strong>{dateTime(open.transcript.startedAt, localOffsetMinutes(open.transcript.startedAt))}</strong>
        </div>
        <TranscriptView transcript={open.transcript} source={{ kind: "history", id: open.id }} />
      </>
    );
  }
  return (
    <>
      <div role="alert">
        {error && (
          <div className="notice error">
            <Icon name="alert" />
            <span>{t(errorKey(error.code))}</span>
          </div>
        )}
      </div>
      {!saveHistory && (
        <div className="notice warning">
          <Icon name="info" />
          <span>{t("history.off")}</span>
          <button onClick={() => navigate("settings", "privacy")}>{t("notice.openSettings")}</button>
        </div>
      )}
      {sessions && sessions.length === 0 && <EmptyState icon="history" text={t("history.empty")} />}
      {sessions && sessions.length > 0 && (
        <>
          <ul className="history">
            {sessions.map((s) => (
              <li key={s.id} className="card">
                <div className="history-head">
                  <strong className="num">{dateTime(s.startedAt, localOffsetMinutes(s.startedAt))}</strong>
                  <span className="hint">
                    {t("history.meta", { minutes: Math.max(1, Math.round((s.endedAt - s.startedAt) / 60_000)), lines: s.lines })}
                  </span>
                </div>
                <p className="history-preview">{s.preview}</p>
                <div className="actions">
                  <button onClick={() => void openSession(s.id)}>
                    <Icon name="transcript" size={16} />
                    {t("history.open")}
                  </button>
                  <button className="ghost danger-text" onClick={() => void remove(s.id)}>
                    <Icon name="trash" size={16} />
                    {t("history.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div role="status">
            {!confirming && (
              <div className="actions">
                <button onClick={() => setConfirming(true)}>
                  <Icon name="trash" size={16} />
                  {t("history.clear")}
                </button>
              </div>
            )}
            {confirming && (
              <div className="confirm">
                <span>{t("history.clear.confirm")}</span>
                <button
                  className="danger"
                  onClick={() => {
                    setConfirming(false);
                    void clearAll();
                  }}
                >
                  {t("settings.privacy.clear.yes")}
                </button>
                <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
