import { useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { updateModal, updateReprompts } from "../../store/app";
import { useApp, useT } from "./appStore";

// Hộp thoại modal báo có bản mới (chủ dự án yêu cầu 2026-10-31): hiện giữa cửa sổ chính ngay khi bản cập nhật đã tải xong và app
// rảnh (cùng điều kiện với lời mời ở `Notice`: không hiện lúc đang dịch, mở lại khi dừng dịch). "Cập nhật ngay" khởi động lại để cài;
// "Hủy" (hay Esc) chỉ đóng hộp thoại cho đúng bản đó, thanh báo ở `Notice` và mục menu khay vẫn còn để cập nhật sau.
// Focus nằm sẵn ở "Cập nhật ngay" và Tab quay vòng trong hộp thoại. Bấm ra ngoài không đóng, vì đây là modal.
export function UpdateModal() {
  const t = useT();
  const version = useApp(updateModal);
  const reprompts = useApp(updateReprompts);
  const restartToUpdate = useApp((s) => s.restartToUpdate);
  const cancel = useApp((s) => s.dismissUpdateModal);
  const box = useRef<HTMLDivElement>(null);
  const open = version !== null;
  useEffect(() => {
    if (!open) return;
    const buttons = () => Array.from(box.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    buttons().at(-1)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Tab") {
        const list = buttons();
        const first = list[0];
        const last = list.at(-1);
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cancel]);
  if (version === null) return null;
  const updateNow = () => {
    // Đóng hộp thoại trước: lỗi (đang tải model...) hiện ở thanh báo lỗi, không bị hộp thoại che.
    cancel();
    void restartToUpdate();
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        aria-describedby="update-modal-body"
        ref={box}
      >
        <div className="modal-head">
          <Icon name="download" />
          <h2 id="update-modal-title">{t("updateModal.title")}</h2>
        </div>
        <p id="update-modal-body">
          {t("updateModal.body", { version })}
          {reprompts && ` ${t("notice.updateReprompt")}`}
        </p>
        <div className="modal-actions">
          <button onClick={cancel}>{t("updateModal.cancel")}</button>
          <button className="primary" onClick={updateNow}>
            {t("updateModal.updateNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
