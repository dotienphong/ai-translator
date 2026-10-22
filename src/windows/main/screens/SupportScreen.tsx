import { useEffect } from "react";
import { fallbackLanguage, useApp, useT } from "../appStore";
import { useSupport } from "../supportStore";
import { SupportChat } from "./SupportChat";

// Màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): chat với chủ dự án, dùng được với mọi người dùng kể cả Free và chưa có
// license. Mở màn hình thì báo phía Rust (bỏ chấm đỏ, hỏi tin mỗi 3 giây), đóng thì báo lại (chỉ còn hỏi mỗi 60 giây khi đang chờ
// trả lời và không đang dịch). Phần hiển thị ở `SupportChat`; đây chỉ nối store.
export function SupportScreen() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const view = useSupport((s) => s.view);
  const pending = useSupport((s) => s.pending);
  const withMachineInfo = useSupport((s) => s.withMachineInfo);
  const machineInfo = useSupport((s) => s.machineInfo);
  const emailCard = useSupport((s) => s.emailCard);
  const emailError = useSupport((s) => s.emailError);
  const error = useSupport((s) => s.error);
  const deleting = useSupport((s) => s.deleting);
  const log = useSupport((s) => s.log);
  const open = useSupport((s) => s.open);
  const close = useSupport((s) => s.close);
  const send = useSupport((s) => s.send);
  const retry = useSupport((s) => s.retry);
  const setWithMachineInfo = useSupport((s) => s.setWithMachineInfo);
  const saveEmail = useSupport((s) => s.saveEmail);
  const dismissEmail = useSupport((s) => s.dismissEmail);
  const remove = useSupport((s) => s.remove);
  const attachLog = useSupport((s) => s.attachLog);
  useEffect(() => {
    void open();
    return () => {
      void close();
    };
  }, [open, close]);
  return (
    <SupportChat
      lang={lang}
      view={view}
      pending={pending}
      withMachineInfo={withMachineInfo}
      machineInfo={machineInfo}
      emailCard={emailCard}
      emailError={emailError}
      error={error}
      deleting={deleting}
      log={log}
      onSend={(text) => void send(text)}
      onRetry={(localId) => void retry(localId)}
      onToggleMachineInfo={setWithMachineInfo}
      onSaveEmail={(email) => void saveEmail(email)}
      onDismissEmail={dismissEmail}
      onDelete={() => void remove()}
      onAttachLog={() => void attachLog((id) => t("support.logMessage", { id }))}
    />
  );
}
