import { errorKey } from "../../i18n";
import { canOpenScreens } from "../../store/app";
import { useApp, useT } from "./appStore";

// Thông báo trong app (Q13 của kế hoạch 00: MVP không dùng thông báo hệ thống): lời nhắc từ phía Rust
// (vừa bỏ qua ⌘Q; mục Login Items đang bị tắt), lỗi của lệnh gần nhất, và phím tắt không đăng ký được.
// Đặt ở cả khung cửa sổ chính (`Shell`) lẫn các bước lần đầu mở (`Onboarding`). Trong các bước lần đầu
// mở thì không có nút "Mở cài đặt" (`canOpenScreens`), vì chưa mở được màn hình Cài đặt.
// Hai vùng live (`status` cho lời nhắc, `alert` cho lỗi) luôn có trong DOM, nội dung mới chèn vào sau, để trình đọc
// màn hình đọc được; vùng live gắn vào cùng lúc với nội dung thì thường bị bỏ qua. Lời nhắc dùng màu trung tính,
// chỉ lỗi dùng màu nguy hiểm.
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
      <div role="status">
        {notice?.kind === "quitFromTray" && (
          <div className="notice">
            <span>{t("notice.quitFromTray")}</span>
            <button onClick={dismissNotice}>{t("common.dismiss")}</button>
          </div>
        )}
        {notice?.kind === "loginItemsApproval" && (
          <div className="notice">
            <span>{t("notice.loginItemsApproval")}</span>
            <button onClick={() => void openLoginItems()}>{t("notice.openLoginItems")}</button>
            <button onClick={dismissNotice}>{t("common.dismiss")}</button>
          </div>
        )}
        {failures > 0 && (
          <div className="notice">
            <span>{t(canNavigate ? "notice.hotkeysFailed" : "notice.hotkeysFailedLater")}</span>
            {canNavigate && <button onClick={() => navigate("settings", "hotkeys")}>{t("notice.openSettings")}</button>}
          </div>
        )}
      </div>
      <div role="alert">
        {error && (
          <div className="notice error">
            <span>{t(errorKey(error.code))}</span>
            <button onClick={dismiss}>{t("common.dismiss")}</button>
          </div>
        )}
      </div>
    </>
  );
}
