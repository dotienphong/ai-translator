import { useEffect, useState } from "react";
import { errorKey } from "../../../i18n";
import { acceleratorFromEvent, formatAccelerator } from "../../../lib/hotkeys";
import { HOTKEY_ACTIONS, type HotkeyAction } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Phím tắt" (F10). Bấm "Đổi" rồi bấm tổ hợp mới; phía Rust kiểm và đăng ký với hệ
// điều hành, lỗi (trùng, không đăng ký được) hiện ngay dưới dòng đang sửa.
export function HotkeySettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const info = useApp((s) => s.info);
  const setHotkey = useApp((s) => s.setHotkey);
  const [editing, setEditing] = useState<HotkeyAction | null>(null);
  const [errors, setErrors] = useState<Partial<Record<HotkeyAction, UiError>>>({});

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") {
        setEditing(null);
        return;
      }
      const accelerator = acceleratorFromEvent(e);
      if (!accelerator) return;
      const action = editing;
      void setHotkey(action, accelerator).then((error) => {
        setErrors((prev) => ({ ...prev, [action]: error ?? undefined }));
        if (!error) setEditing(null);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, setHotkey]);

  if (!settings || !status || !info) return null;
  return (
    <div className="card">
      <p className="hint">{t("hotkeys.hint", { super: info.platform === "macos" ? "Cmd" : "Win" })}</p>
      {HOTKEY_ACTIONS.map((action) => {
        const error = errors[action];
        const failed = status.hotkeyFailures.includes(action);
        return (
          <div key={action}>
            <div className="row">
              <span>{t(`hotkeys.${action}`)}</span>
              {editing === action ? (
                <>
                  <span className="hint">{t("hotkeys.press")}</span>
                  <button onClick={() => setEditing(null)}>{t("hotkeys.cancel")}</button>
                </>
              ) : (
                <>
                  <kbd>{formatAccelerator(settings.hotkeys[action], info.platform)}</kbd>
                  <button onClick={() => setEditing(action)}>{t("hotkeys.change")}</button>
                </>
              )}
            </div>
            {error && <p className="error-text">{t(errorKey(error.code))}</p>}
            {!error && failed && <p className="error-text">{t("hotkeys.failed")}</p>}
          </div>
        );
      })}
    </div>
  );
}
