import { createStore } from "zustand/vanilla";
import type { Ipc, SupportView } from "../lib/ipc";
import { type UiError, toUiError } from "./app";

// Store của màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4). Phía Rust giữ cuộc chat, token và nhịp hỏi tin mới; store chỉ
// nhận `SupportView` (kết quả lệnh và sự kiện `support://view`), cộng các tin khách vừa bấm gửi mà server chưa nhận.

// Tin khách vừa bấm gửi, chưa có trên server: đang gửi, hay lỗi (bấm để gửi lại đúng nội dung đó).
export interface PendingMessage {
  localId: number;
  text: string;
  status: "sending" | "failed";
  error: UiError | null;
}

// Thẻ "Để lại email": ẩn (chưa có tin đầu, hay đã đóng thẻ), đang hỏi, đang lưu, đã lưu.
export type EmailCard = "hidden" | "asking" | "saving" | "saved";

// Nút "Đính kèm log": chạy đúng lệnh của nút "Gửi log cho hỗ trợ" (`send_log_report`) rồi gửi mã báo cáo vào cuộc chat.
export type LogAttach = { status: "idle" } | { status: "sending" } | { status: "failed"; code: string };

// Số ký tự tối đa của một tin (hợp đồng, server kiểm lại).
export const MAX_CHARS = 1000;

// Số ký tự theo code point, như server đếm (`Array.from`).
export function charCount(text: string): number {
  return Array.from(text).length;
}

export interface SupportStoreState {
  view: SupportView | null;
  pending: PendingMessage[];
  // Ô "Gửi kèm thông tin máy": tích sẵn, chỉ hiện và chỉ có tác dụng trước tin đầu tiên.
  withMachineInfo: boolean;
  // Dòng thông tin máy hiện nguyên văn cạnh ô tích; `null` là chưa đọc.
  machineInfo: string | null;
  emailCard: EmailCard;
  emailError: UiError | null;
  // Lỗi lúc mở màn hình hay lúc xóa cuộc chat.
  error: UiError | null;
  deleting: boolean;
  log: LogAttach;
  // Nghe `support://view` và đọc trạng thái ban đầu (chấm đỏ) lúc mở cửa sổ. Trả hàm gỡ listener.
  init(): Promise<() => void>;
  // Màn hình Hỗ trợ vừa mở: báo phía Rust (bỏ chấm đỏ, nhịp 3 giây), đọc dòng thông tin máy, rồi lấy cả cuộc chat nếu đã có.
  // Chưa từng nhắn thì không gọi mạng (chat tắt thì biết qua lỗi `supportDisabled` của tin đầu).
  open(): Promise<void>;
  close(): Promise<void>;
  send(text: string): Promise<boolean>;
  retry(localId: number): Promise<void>;
  setWithMachineInfo(on: boolean): void;
  saveEmail(email: string): Promise<void>;
  dismissEmail(): void;
  remove(): Promise<boolean>;
  // `message`: chữ của tin chứa mã báo cáo (theo ngôn ngữ giao diện).
  attachLog(message: (id: string) => string): Promise<void>;
}

export function createSupportStore(ipc: Ipc) {
  return createStore<SupportStoreState>()((set, get) => {
    let nextLocalId = 0;

    // Nhận trạng thái mới từ lệnh hay sự kiện: bản có `rev` nhỏ hơn bản đang có là cũ, bỏ.
    function apply(view: SupportView) {
      const current = get().view;
      if (current && view.rev < current.rev) return;
      set({ view });
    }

    // Gửi một tin đang chờ; thành công thì bỏ khỏi danh sách chờ (tin đã nằm trong `view`).
    async function deliver(localId: number, text: string): Promise<boolean> {
      const first = !(get().view?.hasConversation ?? false);
      try {
        const view = await ipc.invoke("support_send", { text, withMachineInfo: first && get().withMachineInfo });
        apply(view);
        set((s) => ({
          pending: s.pending.filter((p) => p.localId !== localId),
          emailCard: first && s.emailCard === "hidden" ? "asking" : s.emailCard,
        }));
        return true;
      } catch (e) {
        const error = toUiError(e);
        set((s) => ({
          pending: s.pending.map((p) => (p.localId === localId ? { ...p, status: "failed", error } : p)),
        }));
        return false;
      }
    }

    return {
      view: null,
      pending: [],
      withMachineInfo: true,
      machineInfo: null,
      emailCard: "hidden",
      emailError: null,
      error: null,
      deleting: false,
      log: { status: "idle" },

      async init() {
        const off = await ipc.listen("support://view", apply);
        try {
          apply(await ipc.invoke("support_screen", { open: false }));
        } catch (e) {
          off();
          throw e;
        }
        return off;
      },

      async open() {
        let view: SupportView;
        try {
          view = await ipc.invoke("support_screen", { open: true });
        } catch (e) {
          set({ error: toUiError(e) });
          return;
        }
        apply(view);
        if (get().machineInfo === null) {
          // Không đọc được thì ô tích vẫn hiện, chỉ thiếu dòng xem trước.
          void ipc.invoke("support_machine_info").then(
            (machineInfo) => set({ machineInfo }),
            () => {},
          );
        }
        if (!view.hasConversation) {
          set({ error: null });
          return;
        }
        try {
          apply(await ipc.invoke("support_fetch"));
          set({ error: null });
        } catch (e) {
          set({ error: toUiError(e) });
        }
      },

      async close() {
        try {
          apply(await ipc.invoke("support_screen", { open: false }));
        } catch {
          // Màn hình đã đóng: không còn chỗ để báo lỗi.
        }
      },

      send(text) {
        const clean = text.trim();
        const length = charCount(clean);
        if (length === 0 || length > MAX_CHARS) return Promise.resolve(false);
        const localId = ++nextLocalId;
        set((s) => ({ pending: [...s.pending, { localId, text: clean, status: "sending", error: null }] }));
        return deliver(localId, clean);
      },

      async retry(localId) {
        const message = get().pending.find((p) => p.localId === localId);
        if (!message || message.status !== "failed") return;
        set((s) => ({
          pending: s.pending.map((p) => (p.localId === localId ? { ...p, status: "sending", error: null } : p)),
        }));
        await deliver(localId, message.text);
      },

      setWithMachineInfo(on) {
        set({ withMachineInfo: on });
      },

      async saveEmail(email) {
        set({ emailCard: "saving", emailError: null });
        try {
          await ipc.invoke("support_set_email", { email: email.trim() });
          set({ emailCard: "saved" });
        } catch (e) {
          set({ emailCard: "asking", emailError: toUiError(e) });
        }
      },

      dismissEmail() {
        set({ emailCard: "hidden", emailError: null });
      },

      async remove() {
        if (get().deleting) return false;
        set({ deleting: true });
        try {
          apply(await ipc.invoke("support_delete"));
          set({ pending: [], emailCard: "hidden", emailError: null, withMachineInfo: true, error: null });
          return true;
        } catch (e) {
          set({ error: toUiError(e) });
          return false;
        } finally {
          set({ deleting: false });
        }
      },

      async attachLog(message) {
        if (get().log.status === "sending") return;
        set({ log: { status: "sending" } });
        let id: string;
        try {
          ({ id } = await ipc.invoke("send_log_report"));
        } catch (e) {
          set({ log: { status: "failed", code: toUiError(e).code } });
          return;
        }
        set({ log: { status: "idle" } });
        await get().send(message(id));
      },
    };
  });
}
