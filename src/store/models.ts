import { createStore } from "zustand/vanilla";
import type { Ipc } from "../lib/ipc";
import type { ModelsView } from "../lib/models";
import { type UiError, toUiError } from "./app";

// Store quản lý model của cửa sổ chính (kế hoạch 04): bản sao `ModelsView` do phía Rust gửi (sự kiện `models://state`
// và kết quả lệnh), cùng gói người dùng đang chọn ở bước 2 của lần đầu mở và ở Cài đặt › Model. Như store chính, mọi
// thay đổi đi qua lệnh `invoke`; store chỉ nhận kết quả.

export interface ModelsStoreState {
  view: ModelsView | null;
  // Gói đang chọn trên giao diện (chưa tải); `null` là theo gói chọn sẵn (`defaultChoice`).
  choice: string | null;
  error: UiError | null;
  init(): Promise<() => void>;
  load(): Promise<void>;
  choose(pack: string): void;
  download(pack: string): Promise<boolean>;
  pause(): Promise<void>;
  select(pack: string): Promise<boolean>;
  remove(pack: string): Promise<boolean>;
  removeAll(): Promise<boolean>;
  // "Tải lại": băm lại gói rồi tải phần thiếu hay hỏng; gói đang dùng không bị xóa trước (N7 của review 04).
  repair(pack: string): Promise<boolean>;
  dismissUpdate(): Promise<void>;
  dismissError(): void;
}

// `onDataCleared`: gọi khi "Xóa model và dữ liệu" xong. Phía Rust đã xóa cả lịch sử, bản chép lời và từ điển (như "Xóa toàn
// bộ dữ liệu" của kế hoạch 03), nên cửa sổ chính bỏ phần dữ liệu đang hiện.
export function createModelsStore(ipc: Ipc, onDataCleared: () => void = () => {}) {
  return createStore<ModelsStoreState>()((set, get) => {
    // Kết quả của lệnh có thể tới sau một sự kiện mới hơn: bỏ bản có `rev` nhỏ hơn bản đang có.
    function setView(view: ModelsView) {
      const current = get().view;
      if (current && view.rev < current.rev) return;
      set({ view });
    }

    async function run<T>(call: () => Promise<T>, apply: (result: T) => void): Promise<boolean> {
      try {
        apply(await call());
        set({ error: null });
        return true;
      } catch (e) {
        set({ error: toUiError(e) });
        return false;
      }
    }

    return {
      view: null,
      choice: null,
      error: null,

      // Nghe sự kiện trước, đọc trạng thái, rồi tải manifest ở nền (có thể chờ mạng; lỗi nằm trong `manifestError`).
      async init() {
        const off = await ipc.listen("models://state", setView);
        try {
          setView(await ipc.invoke("get_models_state"));
        } catch (e) {
          off();
          throw e;
        }
        void get().load();
        return off;
      },

      async load() {
        await run(() => ipc.invoke("load_models"), setView);
      },

      choose(pack) {
        set({ choice: pack });
      },

      download(pack) {
        return run(() => ipc.invoke("download_models", { pack }), setView);
      },

      async pause() {
        await run(() => ipc.invoke("pause_models_download"), setView);
      },

      // Cài đặt mới tới cửa sổ chính qua sự kiện `settings://changed`.
      select(pack) {
        return run(
          () => ipc.invoke("select_model_pack", { pack }),
          () => {},
        );
      },

      remove(pack) {
        return run(() => ipc.invoke("delete_models", { pack }), setView);
      },

      removeAll() {
        return run(() => ipc.invoke("delete_models_and_data"), (view) => {
          setView(view);
          set({ choice: null });
          onDataCleared();
        });
      },

      async repair(pack) {
        if (!(await run(() => ipc.invoke("verify_models", { pack }), setView))) return false;
        const after = get().view?.packs.find((p) => p.id === pack);
        return after?.complete ? true : get().download(pack);
      },

      async dismissUpdate() {
        await run(() => ipc.invoke("dismiss_models_update"), setView);
      },

      dismissError() {
        set({ error: null });
      },
    };
  });
}

export type ModelsStore = ReturnType<typeof createModelsStore>;
