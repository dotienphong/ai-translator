import type { UiLanguage } from "../../../i18n";
import type { Theme, UpdateChannel } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Chung" (§4.3). Kênh cập nhật được kế hoạch 07 dùng.
export function GeneralSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  if (!settings) return null;
  return (
    <>
      <AppUpdate />
      <div className="card">
        <div className="row">
          <label htmlFor="ui-language">{t("settings.general.uiLanguage")}</label>
          <select
            id="ui-language"
            value={settings.uiLanguage}
            onChange={(e) => void update({ uiLanguage: e.target.value as UiLanguage })}
          >
            <option value="en">{t("lang.en")}</option>
            <option value="vi">{t("lang.vi")}</option>
          </select>
        </div>
        <div className="row">
          <label htmlFor="launch-at-login">{t("settings.general.launchAtLogin")}</label>
          <input
            id="launch-at-login"
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(e) => void update({ launchAtLogin: e.target.checked })}
          />
          <span className="hint">{t("settings.general.launchAtLogin.hint")}</span>
        </div>
        <div className="row">
          <label htmlFor="theme">{t("settings.general.theme")}</label>
          <select id="theme" value={settings.theme} onChange={(e) => void update({ theme: e.target.value as Theme })}>
            <option value="system">{t("theme.system")}</option>
            <option value="light">{t("theme.light")}</option>
            <option value="dark">{t("theme.dark")}</option>
          </select>
        </div>
        <div className="row">
          <label htmlFor="channel">{t("settings.general.updateChannel")}</label>
          <select
            id="channel"
            value={settings.updateChannel}
            onChange={(e) => void update({ updateChannel: e.target.value as UpdateChannel })}
          >
            <option value="stable">{t("channel.stable")}</option>
            <option value="beta">{t("channel.beta")}</option>
          </select>
        </div>
      </div>
    </>
  );
}

// Phiên bản đang chạy và nút "Kiểm tra cập nhật": kiểm ngay, có bản mới thì tải rồi mời khởi động lại (kế hoạch 07b).
// Menu khay có cùng mục, mở tới đây. Đang dịch thì không khởi động lại được (`updateBusy`), nên chỉ nhắc dừng dịch.
// Khối riêng ở đầu nhóm Chung, nền màu nhấn, để người dùng thấy ngay bản đang dùng và chỗ cập nhật.
function AppUpdate() {
  const t = useT();
  const version = useApp((s) => s.info?.version);
  const check = useApp((s) => s.status?.updateCheck ?? "idle");
  const ready = useApp((s) => s.status?.updateReady ?? null);
  const running = useApp((s) => s.status?.session === "running" || s.status?.session === "starting");
  const checkForUpdates = useApp((s) => s.checkForUpdates);
  const restartToUpdate = useApp((s) => s.restartToUpdate);
  const busy = check === "checking" || check === "downloading";
  const message =
    check === "idle"
      ? ready && t(running ? "settings.general.update.readyRunning" : "settings.general.update.ready", { version: ready })
      : t(`settings.general.update.${check}`);
  const tone =
    check === "upToDate" ? "ok"
    : check === "failed" ? "error"
    : check === "idle" && ready ? "ready"
    : "";
  return (
    <section className="card update-card" aria-labelledby="update-title">
      <div className="update-head">
        <div>
          <h2 id="update-title">{t("app.name")}</h2>
          <p className="update-version">{version && t("settings.general.version", { version })}</p>
        </div>
        {ready && !running && !busy ? (
          <button className="primary" onClick={() => void restartToUpdate()}>
            {t("settings.general.restartToUpdate")}
          </button>
        ) : (
          <button className="primary" disabled={busy} aria-busy={busy} onClick={() => void checkForUpdates()}>
            {t("settings.general.checkUpdates")}
          </button>
        )}
      </div>
      {/* Luôn có trong DOM để trình đọc màn hình đọc thông báo mới (live region). */}
      <p className={`update-status ${tone}`.trim()} role="status">
        {message || ""}
      </p>
    </section>
  );
}
