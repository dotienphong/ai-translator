import { useState } from "react";
import { translate, type UiLanguage } from "../../i18n";
import { accountErrorKey } from "../../lib/account";
import type { AccountView, LicensePlan } from "../../lib/ipc";
import type { UiError } from "../../store/app";
import { useAccount } from "./accountStore";
import { fallbackLanguage, useApp } from "./appStore";
import { useLicense } from "./licenseStore";
import { useLinkBanner, linkBannerStore } from "./linkBannerStore";
import { isSessionActive } from "./screens/LoginGate";

// Banner "Liên kết tài khoản Google" cho máy có gói trả phí mà chưa đăng nhập (spec 2026-11-05-dang-nhap-google §6.3, L5). Máy ở gói
// trả phí không bao giờ bị chặn vì chưa đăng nhập, nên đây chỉ là lời mời: tắt được ("Để sau", chỉ trong phiên làm việc, không lưu
// cài đặt), nằm cuối Màn hình chính trong luồng bình thường (không phủ, không cố định vị trí, không đẩy nút Bắt đầu/Dừng), và mọi
// thao tác khác của app dùng được khi nó đang hiện. Đăng nhập cần cùng sự đồng ý xử lý email như màn đăng nhập (spec §8). Phần hiển thị
// ở `LinkAccountBannerView` (test trong Node); `LinkAccountBanner` chỉ nối store. Khối này cũng dùng ở Cài đặt › Tài khoản (không có
// "Để sau") để máy trả phí đã bấm "Để sau" vẫn liên kết được.

/** Máy này có thể mời liên kết: gói trả phí (không phải Free, không phải chưa biết) và chưa đăng nhập (đang chờ đăng nhập cũng tính). */
export function canLink(plan: LicensePlan | null, view: AccountView | null): boolean {
  return plan !== null && plan !== "free" && view !== null && (view.state === "anonymous" || view.state === "signingIn");
}

/** Banner có hiện không: `canLink` và người dùng chưa bấm "Để sau" trong phiên này. */
export function bannerVisible(plan: LicensePlan | null, view: AccountView | null, dismissed: boolean): boolean {
  return !dismissed && canLink(plan, view);
}

export interface LinkAccountBannerViewProps {
  lang: UiLanguage;
  view: AccountView | null;
  // Lỗi của lần liên kết do chính khối này bắt đầu (nơi dùng lọc); null nếu không có.
  error: UiError | null;
  busy: boolean;
  consented: boolean;
  // Đang dịch: không gọi server tài khoản (spec §6.2, A7), cả hai nút bị khóa.
  sessionActive: boolean;
  onConsent: (checked: boolean) => void;
  onLink: (lang: UiLanguage) => void;
  onCancel: () => void;
  // Không có (khối trong Cài đặt) thì không hiện nút "Để sau".
  onLater?: () => void;
}

export function LinkAccountBannerView(props: LinkAccountBannerViewProps) {
  const { lang, view, error, busy, consented, sessionActive } = props;
  if (view === null) return null;
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  const waiting = busy || view.state === "signingIn";
  // Người dùng tự hủy không phải lỗi (store đã không ghi; đây là lớp phòng thêm).
  const message = error && error.code !== "accountCancelled" ? t(accountErrorKey(error.code)) : null;
  return (
    <section className="card link-account" aria-label={t("account.link.button")}>
      <p>{t("account.link.body")}</p>
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
        <div className="link-account-waiting" role="status">
          <p>{t("account.gate.waiting")}</p>
          <div className="actions">
            <button type="button" onClick={props.onCancel}>
              {t("account.gate.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!consented || sessionActive}
            onClick={() => props.onLink(lang)}
          >
            {t("account.link.button")}
          </button>
          {props.onLater && (
            <button type="button" disabled={sessionActive} onClick={props.onLater}>
              {t("account.link.later")}
            </button>
          )}
        </div>
      )}
      {message && (
        <p className="note error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

// Chưa có câu trả lời của `get_account` (view null) hay chưa biết gói thì không vẽ gì. Lỗi chỉ hiện sau khi chính banner này bấm
// liên kết (lỗi cũ của màn khác nằm trong store không lọt vào đây).
export function LinkAccountBanner() {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const sessionActive = useApp((s) => isSessionActive(s.status));
  const plan = useLicense((s) => s.view?.plan ?? null);
  const view = useAccount((s) => s.view);
  const error = useAccount((s) => s.error);
  const busy = useAccount((s) => s.busy);
  const signIn = useAccount((s) => s.signIn);
  const cancel = useAccount((s) => s.cancel);
  const dismissed = useLinkBanner((s) => s.dismissed);
  const [consented, setConsented] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const dismissError = useAccount((s) => s.dismiss);
  if (!bannerVisible(plan, view, dismissed)) return null;
  return (
    <LinkAccountBannerView
      lang={lang}
      view={view}
      error={attempted ? error : null}
      busy={busy}
      consented={consented}
      sessionActive={sessionActive}
      onConsent={setConsented}
      onLink={(l) => {
        setAttempted(true);
        // Bỏ lỗi cũ (của màn khác hay lần trước) để lỗi đang thấy là của lần bấm này.
        dismissError();
        void signIn(l);
      }}
      onCancel={() => void cancel()}
      onLater={() => linkBannerStore.getState().dismiss()}
    />
  );
}
