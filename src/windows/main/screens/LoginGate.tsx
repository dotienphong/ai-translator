import { useState } from "react";
import { GoogleSignInButton } from "../../../components/GoogleSignInButton";
import { translate, type UiLanguage } from "../../../i18n";
import { accountErrorKey } from "../../../lib/account";
import type { AccountView, AppStatus, Screen } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { useAccount } from "../accountStore";
import { fallbackLanguage, useApp } from "../appStore";

// Màn đăng nhập Google (spec 2026-11-05-dang-nhap-google §6.3): thay thân của Màn hình chính, Gõ dịch và Giọng đọc khi phía Rust
// báo cổng đang đóng (`AccountView.gate`). Giải thích ngắn, ô đồng ý lưu email (bắt buộc tick), nút đăng nhập, trạng thái chờ
// trình duyệt kèm Hủy, lỗi theo mã; hai liên kết Nâng cấp và Hỗ trợ (mua gói không cần đăng nhập). Phần hiển thị ở
// `LoginGateView` (test trong Node); `LoginGate` chỉ nối store. Shell đặt màn này trong `SafeBoundary`.

// Ba màn có tính năng dịch mà cổng chặn; mọi màn khác (Lịch sử, Bản chép lời, Từ điển, Cài đặt, Nâng cấp, Hỗ trợ, Giới thiệu)
// không bao giờ bị thay.
const GATED: ReadonlySet<Screen> = new Set<Screen>(["home", "compose", "voice"]);

/**
 * Thân của màn `screen` có bị thay bằng màn đăng nhập không. Chưa có câu trả lời đầu tiên của `get_account` (`view` null) thì
 * không chặn gì: không nháy màn đăng nhập lúc mở app, và phía Rust vẫn tự từ chối bắt đầu dịch (`loginRequired`) nếu cần.
 * Phiên đang dịch thì không chặn: phiên đang chạy được chạy hết, nút Dừng ở Màn hình chính phải còn đó.
 */
export function gateBlocks(screen: Screen, view: AccountView | null, sessionActive: boolean): boolean {
  return view !== null && view.gate === true && !sessionActive && GATED.has(screen);
}

/** Phiên dịch đang chạy hay đang bắt đầu. */
export function isSessionActive(status: AppStatus | null): boolean {
  return status?.session === "running" || status?.session === "starting";
}

export interface LoginGateViewProps {
  lang: UiLanguage;
  view: AccountView | null;
  error: UiError | null;
  busy: boolean;
  consented: boolean;
  // Đang dịch: không gọi server tài khoản (spec §6.2, A7), nút đăng nhập bị khóa.
  sessionActive: boolean;
  // Bước Onboarding đã có tiêu đề riêng: không lặp tiêu đề của màn.
  showTitle?: boolean;
  onConsent: (checked: boolean) => void;
  onSignIn: (lang: UiLanguage) => void;
  onCancel: () => void;
  // Không có (bước Onboarding, chưa có thanh điều hướng) thì không hiện liên kết đó.
  onUpgrade?: () => void;
  onSupport?: () => void;
}

export function LoginGateView(props: LoginGateViewProps) {
  const { lang, view, error, busy, consented, sessionActive, showTitle = true } = props;
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  const waiting = busy || view?.state === "signingIn";
  // Người dùng tự hủy không phải lỗi (store đã không ghi; đây là lớp phòng thêm).
  const message = error && error.code !== "accountCancelled" ? t(accountErrorKey(error.code)) : null;
  const links = props.onUpgrade !== undefined || props.onSupport !== undefined;
  return (
    <section className="card login-gate" aria-labelledby={showTitle ? "login-gate-title" : undefined}>
      {showTitle && <h2 id="login-gate-title">{t("account.gate.title")}</h2>}
      <p>{t("account.gate.body")}</p>
      <label className="consent">
        <input
          type="checkbox"
          checked={consented}
          disabled={waiting}
          onChange={(e) => props.onConsent(e.target.checked)}
        />
        <span>{t("account.gate.consent")}</span>
      </label>
      {waiting ? (
        <div className="login-gate-waiting" role="status">
          <p>{t("account.gate.waiting")}</p>
          <div className="actions">
            {/* Nút đăng nhập vừa biến mất: đưa focus sang Hủy, không để rơi về body. */}
            <button type="button" autoFocus onClick={props.onCancel}>
              {t("account.gate.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <GoogleSignInButton
            label={t("account.gate.signIn")}
            disabled={!consented || sessionActive}
            onClick={() => props.onSignIn(lang)}
          />
        </div>
      )}
      {message && (
        <p className="note error" role="alert">
          {message}
        </p>
      )}
      {links && (
        <p className="login-gate-links">
          {props.onUpgrade && (
            <button type="button" className="link" onClick={props.onUpgrade}>
              {t("account.gate.upgrade")}
            </button>
          )}
          {props.onSupport && (
            <button type="button" className="link" onClick={props.onSupport}>
              {t("account.gate.support")}
            </button>
          )}
        </p>
      )}
    </section>
  );
}

// `links`: hiện Nâng cấp và Hỗ trợ (Shell); bước Onboarding thì không (chưa có các màn đó).
export function LoginGate({ links = true, showTitle = true }: { links?: boolean; showTitle?: boolean }) {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const navigate = useApp((s) => s.navigate);
  const sessionActive = useApp((s) => isSessionActive(s.status));
  const view = useAccount((s) => s.view);
  const error = useAccount((s) => s.error);
  const busy = useAccount((s) => s.busy);
  const signIn = useAccount((s) => s.signIn);
  const cancel = useAccount((s) => s.cancel);
  const [consented, setConsented] = useState(false);
  return (
    <LoginGateView
      lang={lang}
      view={view}
      error={error}
      busy={busy}
      consented={consented}
      sessionActive={sessionActive}
      showTitle={showTitle}
      onConsent={setConsented}
      onSignIn={(l) => void signIn(l)}
      onCancel={() => void cancel()}
      onUpgrade={links ? () => navigate("upgrade") : undefined}
      onSupport={links ? () => navigate("support") : undefined}
    />
  );
}
