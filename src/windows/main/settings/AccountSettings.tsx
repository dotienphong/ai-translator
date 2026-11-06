import { useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { translate, type MessageKey, type UiLanguage } from "../../../i18n";
import { accountErrorKey } from "../../../lib/account";
import type { AccountView } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { type AccountAction, createAccountSettingsStore } from "../../../store/accountSettings";
import { accountStore, useAccount } from "../accountStore";
import { appStore, fallbackLanguage, useApp } from "../appStore";
import { useLicense } from "../licenseStore";
import { canLink, LinkAccountBannerView } from "../LinkAccountBanner";
import { isSessionActive } from "../screens/LoginGate";

// Nhóm Cài đặt "Tài khoản" (spec 2026-11-05-dang-nhap-google §6.3, §5.5): email đang đăng nhập, nút Đăng xuất, nút Xóa tài khoản
// (xác nhận trong app, cùng kiểu "Xóa model và dữ liệu"). Đăng xuất không gọi mạng nên dùng được cả lúc đang dịch; xóa gọi server
// nên bị khóa lúc đang dịch (A7) và nếu server lỗi thì vẫn đăng nhập. Chưa đăng nhập thì chỉ một dòng báo; riêng máy gói trả phí có
// thêm khối liên kết (cùng khối với banner ở Màn hình chính, không có "Để sau"), để người đã bấm "Để sau" vẫn liên kết được. Lõi
// Rust vẫn là nơi quyết định mọi thứ; phần này chỉ hiển thị. Phần hiển thị ở `AccountSettingsView` (test trong Node).

type SettingsAction = Exclude<AccountAction, "link">;

/**
 * Khóa câu báo lỗi của Đăng xuất hay Xóa tài khoản. Các câu lỗi của luồng đăng nhập ("Đăng nhập không thành…", "Đăng nhập đang tạm
 * ngừng") không hợp ở đây nên mọi mã trừ mạng (`accountFailed`, `accountUnavailable`, `accountDenied`, `accountExpired`, mã lạ) có câu
 * riêng theo thao tác, nói rõ vẫn đang đăng nhập; lỗi mạng dùng câu chung.
 */
export function settingsErrorKey(action: SettingsAction, code: string): MessageKey {
  switch (code) {
    case "accountNetwork":
      return accountErrorKey(code);
    case "accountBusy":
      return "account.settings.error.busy";
    case "accountStorage":
      return action === "delete" ? "account.settings.error.deleteStorage" : "account.settings.error.signOutStorage";
    default:
      return action === "delete" ? "account.settings.error.deleteFailed" : "account.settings.error.signOutFailed";
  }
}

export interface AccountSettingsViewProps {
  lang: UiLanguage;
  view: AccountView | null;
  error: UiError | null;
  // Thao tác gần nhất của màn này; lỗi chỉ hiện khi do thao tác của màn này (Đăng xuất hay Xóa) gây ra.
  action: AccountAction | null;
  busy: boolean;
  // Đang dịch: Xóa tài khoản bị khóa (gọi server), Đăng xuất vẫn dùng được.
  sessionActive: boolean;
  confirming: boolean;
  // Khối liên kết cho máy gói trả phí chưa đăng nhập, hoặc null.
  link: ReactNode;
  onSignOut: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onCancelSignIn: () => void;
}

export function AccountSettingsView(props: AccountSettingsViewProps) {
  const { lang, view, error, action, busy, sessionActive, confirming } = props;
  const t = (key: MessageKey, params?: Record<string, string>) => translate(lang, key, params);
  const errorFor = (a: SettingsAction) =>
    error && action === a && error.code !== "accountCancelled" ? t(settingsErrorKey(a, error.code)) : null;

  if (view === null) {
    // Chưa biết trạng thái tài khoản (chưa tải xong, hay dịch vụ tài khoản không dùng được): câu nhẹ nhàng, không nút nào.
    return (
      <div className="card">
        <p className="hint">{t("account.settings.unknown")}</p>
        {error?.code === "accountUnavailable" && (
          <p className="note error" role="alert">
            {t("error.accountUnavailable")}
          </p>
        )}
      </div>
    );
  }

  if (view.state !== "signedIn") {
    return (
      <>
        <div className="card">
          {view.state === "signingIn" ? (
            <div role="status">
              <p>{t("account.gate.waiting")}</p>
              <div className="actions">
                <button type="button" onClick={props.onCancelSignIn}>
                  {t("account.gate.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p>{t("account.settings.notSignedIn")}</p>
          )}
        </div>
        {props.link}
      </>
    );
  }

  const signOutError = errorFor("signOut");
  const deleteError = errorFor("delete");
  return (
    <>
      <div className="card">
        <Field label={t("account.settings.email")}>
          <span className="num">{view.email ?? ""}</span>
        </Field>
        <p className="hint">{t("account.settings.signOut.hint")}</p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={props.onSignOut}>
            {t("account.settings.signOut")}
          </button>
        </div>
        {signOutError && (
          <p className="note error" role="alert">
            {signOutError}
          </p>
        )}
      </div>
      <div className="card account-delete">
        <h2>{t("account.settings.delete")}</h2>
        <p className="hint">{t("account.settings.delete.hint")}</p>
        <p className="hint">{t("account.settings.delete.hint.license")}</p>
        {!confirming && (
          <div className="actions">
            <button type="button" disabled={busy || sessionActive} onClick={props.onAskDelete}>
              <Icon name="trash" size={16} />
              {t("account.settings.delete")}
            </button>
          </div>
        )}
        {confirming && (
          <div className="confirm" role="alert">
            <span>{t("account.settings.delete.ask")}</span>
            <button type="button" className="danger" disabled={busy || sessionActive} onClick={props.onConfirmDelete}>
              {t("account.settings.delete.confirm")}
            </button>
            <button type="button" onClick={props.onCancelDelete}>
              {t("common.cancel")}
            </button>
          </div>
        )}
        {sessionActive && <p className="hint">{t("account.settings.translating")}</p>}
        {deleteError && (
          <p className="note error" role="alert">
            {deleteError}
          </p>
        )}
      </div>
    </>
  );
}

export function AccountSettings() {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const sessionActive = useApp((s) => isSessionActive(s.status));
  const plan = useLicense((s) => s.view?.plan ?? null);
  const view = useAccount((s) => s.view);
  const error = useAccount((s) => s.error);
  const busy = useAccount((s) => s.busy);
  const cancel = useAccount((s) => s.cancel);
  // Một luồng cho mỗi lần mở nhóm này; hỏi phiên đang dịch lúc bấm, không chụp giá trị cũ.
  const [flow] = useState(() => createAccountSettingsStore(accountStore, () => isSessionActive(appStore.getState().status)));
  const confirming = useStore(flow, (s) => s.confirming);
  const action = useStore(flow, (s) => s.action);
  const [consented, setConsented] = useState(false);
  const link = canLink(plan, view) ? (
    <LinkAccountBannerView
      lang={lang}
      view={view}
      error={action === "link" ? error : null}
      busy={busy}
      consented={consented}
      sessionActive={sessionActive}
      onConsent={setConsented}
      onLink={(l) => void flow.getState().link(l)}
      onCancel={() => void cancel()}
    />
  ) : null;
  return (
    <AccountSettingsView
      lang={lang}
      view={view}
      error={error}
      action={action}
      busy={busy}
      sessionActive={sessionActive}
      confirming={confirming}
      link={link}
      onSignOut={() => void flow.getState().signOut()}
      onAskDelete={() => flow.getState().askDelete()}
      onCancelDelete={() => flow.getState().cancelDelete()}
      onConfirmDelete={() => void flow.getState().confirmDelete()}
      onCancelSignIn={() => void cancel()}
    />
  );
}
