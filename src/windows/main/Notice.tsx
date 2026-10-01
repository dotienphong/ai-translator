import { errorKey } from "../../i18n";
import { canOpenScreens } from "../../store/app";
import { useApp, useT } from "./appStore";

// Thông báo trong app (Q13 của kế hoạch 00: MVP không dùng thông báo hệ thống): lời nhắc từ phía Rust
// (vừa bỏ qua ⌘Q; mục Login Items đang bị tắt), lỗi của lệnh gần nhất, và phím tắt không đăng ký được.
// Đặt ở cả khung cửa sổ chính (`Shell`) lẫn các bước lần đầu mở (`Onboarding`). Trong các bước lần đầu
// mở thì không có nút "Mở cài đặt" (`canOpenScreens`), vì chưa mở được màn hình Cài đặt.
export function Notice() {
  const t = useT();
  const error = useApp((s) => s.error);
  const failures = useApp((s) => s.status?.hotkeyFailures.length ?? 0);
  const dismiss = useApp((s) => s.dismissError);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const navigate = useApp((s) => s.navigate);
  const openLoginItems = useApp((s) => s.openLoginItemsSettings);
  const canNavigate = useApp(canOpenScreens);
  return (
    <>
      {notice?.kind === "quitFromTray" && (
        <div className="notice" role="status">
          <span>{t("notice.quitFromTray")}</span>
          <button onClick={dismissNotice}>{t("common.dismiss")}</button>
        </div>
      )}
      {notice?.kind === "loginItemsApproval" && (
        <div className="notice" role="status">
          <span>{t("notice.loginItemsApproval")}</span>
          <button onClick={() => void openLoginItems()}>{t("notice.openLoginItems")}</button>
          <button onClick={dismissNotice}>{t("common.dismiss")}</button>
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          <span>{t(errorKey(error.code))}</span>
          <button onClick={dismiss}>{t("common.dismiss")}</button>
        </div>
      )}
      {failures > 0 && (
        <div className="notice" role="status">
          <span>{t(canNavigate ? "notice.hotkeysFailed" : "notice.hotkeysFailedLater")}</span>
          {canNavigate && <button onClick={() => navigate("settings", "hotkeys")}>{t("notice.openSettings")}</button>}
        </div>
      )}
    </>
  );
}
