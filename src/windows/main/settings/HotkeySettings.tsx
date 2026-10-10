import { Fragment, useEffect, useRef, useState } from "react";
import { Field } from "../../../components/Field";
import { errorKey } from "../../../i18n";
import { formatAccelerator, recorderStep } from "../../../lib/hotkeys";
import { HOTKEY_ACTIONS, type HotkeyAction } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Phím tắt" (F10). Bấm "Đổi" rồi bấm tổ hợp mới; phía Rust kiểm và đăng ký với hệ
// điều hành, lỗi (trùng, không đăng ký được) hiện ngay dưới dòng đang sửa và được gắn vào nút của dòng đó
// (`aria-describedby`). Giữ phím thì không gửi lặp; đang chờ kết quả thì không gửi phím thứ hai.
export function HotkeySettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const info = useApp((s) => s.info);
  const setHotkey = useApp((s) => s.setHotkey);
  const [editing, setEditing] = useState<HotkeyAction | null>(null);
  // Đang chờ phía Rust kiểm phím vừa bấm: phím khác bị bỏ qua cho tới khi có kết quả.
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<HotkeyAction, UiError>>>({});
  // Tăng mỗi lần bắt đầu ghi, gửi hay hủy. Kết quả về mà số đã đổi (đã hủy, hoặc đã chuyển sang dòng khác) thì bỏ.
  const attempt = useRef(0);
  // Dòng cần nhận lại focus ở nút "Đổi" khi thôi ghi (nút đó vừa được vẽ lại).
  const refocus = useRef<HotkeyAction | null>(null);

  const startEditing = (action: HotkeyAction) => {
    attempt.current += 1;
    setSending(false);
    setEditing(action);
  };

  // Hủy thì xóa luôn lỗi cũ của dòng đó.
  const stopEditing = (action: HotkeyAction) => {
    attempt.current += 1;
    refocus.current = action;
    setSending(false);
    setEditing(null);
    setErrors((prev) => ({ ...prev, [action]: undefined }));
  };

  useEffect(() => {
    if (!editing) return;
    const action = editing;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      const step = recorderStep(e, sending);
      if (step.kind === "ignore") return;
      if (step.kind === "cancel") {
        stopEditing(action);
        return;
      }
      const id = ++attempt.current;
      setSending(true);
      void setHotkey(action, step.accelerator).then((error) => {
        if (id !== attempt.current) return;
        setSending(false);
        setErrors((prev) => ({ ...prev, [action]: error ?? undefined }));
        if (!error) {
          refocus.current = action;
          setEditing(null);
        }
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, sending, setHotkey]);

  if (!settings || !status || !info) return null;
  return (
    <div className="card list">
      <p className="hint">{t("hotkeys.hint", { super: info.platform === "macos" ? "Cmd" : "Win" })}</p>
      {HOTKEY_ACTIONS.map((action) => {
        const error = errors[action];
        const failed = status.hotkeyFailures.includes(action);
        const errorId = `hotkey-error-${action}`;
        const hasError = Boolean(error) || failed;
        return (
          <Fragment key={action}>
            <Field label={t(`hotkeys.${action}`)}>
              {editing === action ? (
                <>
                  <span className="badge accent" id={`hotkey-press-${action}`}>
                    {t("hotkeys.press")}
                  </span>
                  <button
                    autoFocus
                    aria-describedby={[`hotkey-press-${action}`, hasError ? errorId : ""].join(" ").trim()}
                    onClick={() => stopEditing(action)}
                  >
                    {t("hotkeys.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <kbd>{formatAccelerator(settings.hotkeys[action], info.platform)}</kbd>
                  <button
                    ref={(el) => {
                      if (el && refocus.current === action) {
                        refocus.current = null;
                        el.focus();
                      }
                    }}
                    aria-describedby={hasError ? errorId : undefined}
                    onClick={() => startEditing(action)}
                  >
                    {t("hotkeys.change")}
                  </button>
                </>
              )}
            </Field>
            {error && (
              <p className="error-text field-error" id={errorId}>
                {t(errorKey(error.code))}
              </p>
            )}
            {!error && failed && (
              <p className="error-text field-error" id={errorId}>
                {t("hotkeys.failed")}
              </p>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
