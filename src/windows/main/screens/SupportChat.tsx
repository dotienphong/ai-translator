import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/Icon";
import { errorKey, type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import { type ComposeKey, keyAction } from "../../../lib/compose";
import type { SupportView } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { charCount, type EmailCard, type LogAttach, MAX_CHARS, type PendingMessage } from "../../../store/support";
import { LegalDocument } from "../LegalDocument";

// Đếm ký tự hiện khi tin dài từ chừng này ký tự (gần giới hạn 1000).
export const COUNTER_FROM = 900;

// Enter trơn (không Shift, Alt, Ctrl, Cmd) gửi tin. Bộ gõ đang soạn chữ (tiếng Nhật, Trung, Hàn, Telex) thì Enter là của bộ gõ:
// WKWebView trên macOS báo `keyCode` 229 thay cho `isComposing`, nên dùng chung luật với ô Gõ dịch (`keyAction`).
export function enterSends(e: ComposeKey): boolean {
  return keyAction(e) === "enter";
}

// Chữ bộ đếm: cả số ký tự lẫn giới hạn (nằm sẵn trong câu) cùng cách định dạng theo ngôn ngữ giao diện.
export function counterLabel(lang: UiLanguage, length: number): string {
  return translate(lang, "support.counter", { count: length.toLocaleString(lang) });
}

export interface SupportChatProps {
  lang: UiLanguage;
  view: SupportView | null;
  pending: PendingMessage[];
  withMachineInfo: boolean;
  machineInfo: string | null;
  emailCard: EmailCard;
  emailError: UiError | null;
  error: UiError | null;
  deleting: boolean;
  loading: boolean;
  log: LogAttach;
  onSend(text: string): void;
  onRetry(localId: number): void;
  onToggleMachineInfo(on: boolean): void;
  onSaveEmail(email: string): void;
  onDismissEmail(): void;
  onDelete(): void;
  onAttachLog(): void;
}

// Khung chat của màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4, hợp đồng phía khách): dòng phụ, lời chào (chỉ hiện, không
// gửi lên server), các tin kèm trạng thái, ô "Gửi kèm thông tin máy" trước tin đầu tiên, ô nhập (Enter gửi, Shift+Enter xuống
// dòng, đếm ký tự khi gần 1000), "Đính kèm log", thẻ email, menu ⋯ "Xóa cuộc trò chuyện" (hỏi lại), chân "lưu 90 ngày · Quyền
// riêng tư" mở chính sách ngay trong app. Chat tắt hay cuộc chat bị chặn thì ô nhập thành dòng email support@, lịch sử vẫn hiện.
// Chỉ vẽ theo props (store ở `SupportScreen`), để test vẽ được trong Node.
export function SupportChat(p: SupportChatProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [email, setEmail] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const messages = p.view?.messages ?? [];
  const count = messages.length + p.pending.length;
  // Có tin mới (của ai cũng vậy) thì cuộn xuống cuối.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [count]);
  // Hỏi lại trước khi xóa hiện ra thì tiêu điểm vào nút Hủy (nút ⋯ và mục menu đã biến mất, tiêu điểm không được rơi về body).
  useEffect(() => {
    if (confirming) cancelButton.current?.focus();
  }, [confirming]);
  const hasConversation = p.view?.hasConversation ?? false;
  // Chat tắt (`enabled = false`) hay cuộc chat bị chặn: thay ô nhập bằng câu email support@.
  const blocked = p.view?.closed ? "supportClosed" : p.view && !p.view.enabled ? "supportDisabled" : null;
  const length = charCount(draft.trim());
  const canSend = length > 0 && length <= MAX_CHARS;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    p.onSend(draft);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter gửi, Shift+Enter xuống dòng; đang gõ bằng bộ gõ thì Enter là của bộ gõ.
    if (
      enterSends({
        key: e.key,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        isComposing: e.nativeEvent.isComposing,
        keyCode: e.nativeEvent.keyCode,
      })
    ) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      <div className="card support-chat">
        <div className="support-head">
          <p className="hint">{t("support.subtitle")}</p>
          {hasConversation && (
            <div className="support-menu">
              <button
                ref={menuButton}
                className="ghost"
                aria-label={t("support.menu")}
                title={t("support.menu")}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="more" />
              </button>
              {menu && (
                <div className="support-menu-list">
                  <button
                    className="ghost danger-text"
                    onClick={() => {
                      setMenu(false);
                      setConfirming(true);
                    }}
                  >
                    <Icon name="trash" size={16} />
                    {t("support.delete")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div role="status">
          {confirming && (
            <div className="confirm">
              <span>{t("support.delete.confirm")}</span>
              <button
                className="danger"
                disabled={p.deleting}
                onClick={() => {
                  setConfirming(false);
                  p.onDelete();
                  // Xóa xong thì nút ⋯ biến mất (không còn cuộc chat): đưa tiêu điểm vào ô nhập nếu còn, không thì về nút ⋯.
                  (textarea.current ?? menuButton.current)?.focus();
                }}
              >
                {t("support.delete.yes")}
              </button>
              <button
                ref={cancelButton}
                onClick={() => {
                  setConfirming(false);
                  menuButton.current?.focus();
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
        {p.error && (
          <p className="note error" role="alert">
            <Icon name="alert" size={16} />
            <span>{t(errorKey(p.error.code))}</span>
          </p>
        )}
        <div className="support-log" ref={log} role="log" aria-busy={p.loading ? true : undefined}>
          <div className="msg owner">
            <span className="sr-only">{t("support.from.owner")}: </span>
            <p className="msg-text">{t("support.greeting")}</p>
          </div>
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.sender}`}>
              <span className="sr-only">{t(m.sender === "owner" ? "support.from.owner" : "support.from.you")}: </span>
              <p className="msg-text">{m.text}</p>
              {m.sender === "customer" && <span className="msg-status">{t("support.sent")}</span>}
            </div>
          ))}
          {p.pending.map((m) => (
            <div key={`pending-${m.localId}`} className={`msg customer ${m.status}`}>
              <span className="sr-only">{t("support.from.you")}: </span>
              <p className="msg-text">{m.text}</p>
              {m.status === "sending" ? (
                <span className="msg-status">{t("support.sending")}</span>
              ) : (
                <>
                  {m.error && <span className="msg-status error">{t(errorKey(m.error.code))}</span>}
                  <button className="link msg-retry" onClick={() => p.onRetry(m.localId)}>
                    <Icon name="refresh" size={14} />
                    {t("support.failed")}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {blocked ? (
          <p className="note support-blocked">
            <Icon name="info" size={16} />
            <span>{t(errorKey(blocked))}</span>
          </p>
        ) : (
          <form className="support-compose" onSubmit={submit}>
            {!hasConversation && (
              <div className="support-machine">
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={p.withMachineInfo}
                    aria-describedby="support-machine-hint"
                    onChange={(e) => p.onToggleMachineInfo(e.target.checked)}
                  />
                  <span>{t("support.machineInfo")}</span>
                </label>
                <p className="hint consent-hint" id="support-machine-hint">
                  {t("support.machineInfo.hint")}
                </p>
                {p.withMachineInfo && p.machineInfo && <code className="support-machine-line">{p.machineInfo}</code>}
              </div>
            )}
            <textarea
              ref={textarea}
              aria-describedby={length >= COUNTER_FROM ? "support-counter" : undefined}
              aria-label={t("support.inputLabel")}
              placeholder={t("support.placeholder")}
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="support-actions">
              <button
                type="button"
                className="ghost"
                disabled={p.log.status === "sending"}
                onClick={p.onAttachLog}
              >
                <Icon name="paperclip" size={16} />
                {t(p.log.status === "sending" ? "support.attachLog.sending" : "support.attachLog")}
              </button>
              {length >= COUNTER_FROM && (
                <span id="support-counter" className={length > MAX_CHARS ? "support-counter error-text" : "support-counter hint"}>
                  {counterLabel(p.lang, length)}
                </span>
              )}
              <button type="submit" className="primary" disabled={!canSend}>
                <Icon name="send" size={16} />
                {t("support.send")}
              </button>
            </div>
            {p.log.status === "failed" && (
              <p className="note error" role="alert">
                <Icon name="alert" size={16} />
                <span>{t(errorKey(p.log.code))}</span>
              </p>
            )}
          </form>
        )}
        {p.emailCard !== "hidden" && !blocked && (
          <form
            className="support-email"
            onSubmit={(e) => {
              e.preventDefault();
              p.onSaveEmail(email);
            }}
          >
            {p.emailCard === "saved" ? (
              <p className="note">
                <Icon name="check" size={16} />
                <span>{t("support.email.saved")}</span>
              </p>
            ) : (
              <div>
                <label htmlFor="support-email">{t("support.email.prompt")}</label>
                <div className="row">
                  <input
                    id="support-email"
                    type="email"
                    autoComplete="email"
                    placeholder="email@example.com"
                    value={email}
                    aria-invalid={p.emailError?.field === "email" ? true : undefined}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button type="submit" disabled={p.emailCard === "saving" || email.trim() === ""}>
                    {t("support.email.save")}
                  </button>
                </div>
                {p.emailError && (
                  <p className="note error" role="alert">
                    <Icon name="alert" size={16} />
                    <span>
                      {t(p.emailError.field === "email" ? "support.email.invalid" : errorKey(p.emailError.code))}
                    </span>
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              className="ghost support-email-close"
              aria-label={t("common.dismiss")}
              title={t("common.dismiss")}
              onClick={p.onDismissEmail}
            >
              <Icon name="x" size={16} />
            </button>
          </form>
        )}
        <p className="hint support-foot">
          {t("support.footer")} ·{" "}
          <button className="link" aria-expanded={privacy} onClick={() => setPrivacy(!privacy)}>
            {t("support.privacy")}
          </button>
        </p>
      </div>
      {privacy && (
        <div className="card support-privacy">
          <div className="row split">
            <h2>{t("legal.privacy")}</h2>
            <button onClick={() => setPrivacy(false)}>{t("common.dismiss")}</button>
          </div>
          <LegalDocument kind="privacy" />
        </div>
      )}
    </>
  );
}
