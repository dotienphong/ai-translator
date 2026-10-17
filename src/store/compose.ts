import { createStore } from "zustand/vanilla";
import type {
  ComposeDelta,
  ComposeDone,
  ComposeMainScreen,
  ComposeOutcome,
  ComposeView,
  Ipc,
} from "../lib/ipc";

// Store của ô soạn Gõ dịch (spec 2026-10-17-go-dich §1). Cửa sổ `compose` chỉ gọi được các lệnh `compose_*` và nghe sự kiện
// `compose://*` (spec §3.6). Bản nháp và bản dịch chỉ nằm trong bộ nhớ của cửa sổ này (spec §6).

// Ngừng gõ chừng này thì dịch lại toàn bộ chữ đang có (spec §1.1 bước 3).
export const DEBOUNCE_MS = 400;

// Hẹn giờ, để test chạy không cần chờ thật.
export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ComposeStoreState {
  view: ComposeView | null;
  // Bản nháp: giữ tới khi dán hay chép thành công; Esc hay bấm ra ngoài không làm mất (spec §1.2).
  text: string;
  // Yêu cầu dịch gần nhất: số do phía Rust trả, và đúng chữ đã gửi đi dịch.
  request: { id: number; text: string } | null;
  // Chữ dịch đang về của `request`, theo dòng của chữ đã gửi.
  lines: string[];
  // Kết quả của `request`; `null` khi chưa xong.
  outcome: ComposeOutcome | null;
  // Bản dịch đủ gần nhất: hiện mờ trong lúc chờ bản mới.
  previous: string;
  // Đang chờ dịch: gõ chưa ngừng đủ lâu, hay yêu cầu chưa xong.
  waiting: boolean;
  // Yêu cầu đang chờ nạp model ("Đang nạp model…").
  loading: boolean;
  // Đã bấm Enter khi bản dịch chưa xong: xong thì dán; dịch lỗi thì thôi (spec §1.3).
  pendingSubmit: boolean;
  // macOS, chưa có quyền Trợ năng: bản dịch đã chép, hiện hộp quyền (spec §4.2).
  permission: boolean;
  // Tăng mỗi lần ô soạn mở: giao diện đưa con trỏ vào ô gõ và chọn sẵn bản nháp.
  opened: number;
  init(): Promise<() => void>;
  setText(text: string): void;
  enter(): void;
  escape(): void;
  allowAutoPaste(): void;
  copyOnly(): void;
  openMain(screen: ComposeMainScreen): void;
}

// Mã lỗi trong lỗi của một lệnh (`CommandError`); lỗi lạ thì `unknown`.
function errorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e && typeof e.code === "string" ? e.code : "unknown";
}

export function createComposeStore(ipc: Ipc, timers: Timers = realTimers) {
  let timer: unknown = null;
  // Số lệnh dịch đang chờ số yêu cầu. Sự kiện của yêu cầu có thể tới trước khi lệnh trả số: giữ lại, có số thì áp.
  let awaiting = 0;
  const early = new Map<number, { deltas: ComposeDelta[]; done: ComposeDone | null }>();
  const cancelTimer = () => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
  };
  const stash = (id: number) => {
    const entry = early.get(id) ?? { deltas: [], done: null };
    early.set(id, entry);
    return entry;
  };

  return createStore<ComposeStoreState>()((set, get) => {
    const applyDelta = (d: ComposeDelta) => {
      const lines = [...get().lines];
      lines[d.line] = d.reset ? "" : (lines[d.line] ?? "") + d.text;
      set({ lines });
    };

    // Dán kết quả của yêu cầu gần nhất. Dán hay chép xong thì bản nháp hết; chưa có quyền Trợ năng thì bản dịch đã chép, ô soạn
    // còn mở và hiện hộp quyền (spec §4.2). Lệnh lỗi (yêu cầu đã cũ) thì giữ nguyên: Enter lần nữa.
    const submit = async () => {
      const { request, outcome } = get();
      if (!request || !outcome || outcome.kind === "failed") return;
      set({ pendingSubmit: false });
      try {
        const submitted = await ipc.invoke("compose_submit", { id: request.id });
        set({
          text: "",
          request: null,
          lines: [],
          outcome: null,
          previous: "",
          waiting: false,
          permission: submitted === "needsPermission",
        });
      } catch {
        // Bản dịch không còn (đã có yêu cầu mới): giữ nguyên.
      }
    };

    const applyDone = (d: ComposeDone) => {
      const outcome = d.outcome;
      set({
        outcome,
        previous: outcome.kind === "translated" ? outcome.text : get().previous,
        waiting: false,
        loading: false,
      });
      if (!get().pendingSubmit) return;
      if (outcome.kind === "failed") set({ pendingSubmit: false });
      else void submit();
    };

    // Gửi chữ đang có đi dịch ngay (bỏ lần hẹn giờ đang chờ).
    const translate = async () => {
      cancelTimer();
      const text = get().text;
      if (text.trim() === "") return;
      set({ waiting: true, loading: false });
      awaiting += 1;
      try {
        const id = await ipc.invoke("compose_translate", { text });
        // Chữ đã đổi trong lúc chờ: lần hẹn giờ mới sẽ gửi chữ mới, bỏ yêu cầu này.
        if (get().text !== text) return;
        set({ request: { id, text }, lines: [], outcome: null });
        const held = early.get(id);
        early.clear();
        held?.deltas.forEach(applyDelta);
        if (held?.done) applyDone(held.done);
      } catch (e) {
        // Lệnh bị từ chối (ví dụ quá 4000 ký tự): báo như một kết quả lỗi của đúng chữ này.
        set({
          request: { id: -1, text },
          outcome: { kind: "failed", code: errorCode(e) },
          waiting: false,
          pendingSubmit: false,
        });
      } finally {
        awaiting -= 1;
      }
    };

    const close = () => {
      cancelTimer();
      set({ pendingSubmit: false, permission: false, waiting: false, loading: false });
      void ipc.invoke("compose_close").catch(() => {});
    };

    const opened = (view: ComposeView) => {
      const s = get();
      set({ view, permission: false, opened: s.opened + 1 });
      // Mở lại với bản nháp chưa có kết quả (đóng lúc đang dịch hủy yêu cầu đó) hay kết quả lỗi: dịch lại.
      const done = s.request?.text === s.text && s.outcome !== null && s.outcome.kind !== "failed";
      if (s.text.trim() !== "" && !done) void translate();
    };

    return {
      view: null,
      text: "",
      request: null,
      lines: [],
      outcome: null,
      previous: "",
      waiting: false,
      loading: false,
      pendingSubmit: false,
      permission: false,
      opened: 0,
      async init() {
        const offs = await Promise.all([
          ipc.listen("compose://open", opened),
          ipc.listen("compose://loading", (l) => {
            if (get().request?.id === l.id || awaiting > 0) set({ loading: true });
          }),
          ipc.listen("compose://delta", (d) => {
            if (get().request?.id === d.id) applyDelta(d);
            else if (awaiting > 0) stash(d.id).deltas.push(d);
          }),
          ipc.listen("compose://done", (d) => {
            if (get().request?.id === d.id) applyDone(d);
            else if (awaiting > 0) stash(d.id).done = d;
          }),
        ]);
        // Phần cài đặt mới hơn đã tới qua `compose://open` trong lúc chờ thì giữ bản đó.
        const view = await ipc.invoke("get_compose_view");
        if (!get().view) set({ view });
        return () => offs.forEach((off) => off());
      },
      setText(text) {
        cancelTimer();
        set({ text, pendingSubmit: false, permission: false });
        if (text.trim() === "") {
          set({ request: null, lines: [], outcome: null, previous: "", waiting: false, loading: false });
          return;
        }
        set({ waiting: true });
        timer = timers.set(() => {
          timer = null;
          void translate();
        }, DEBOUNCE_MS);
      },
      enter() {
        const s = get();
        if (s.permission || s.text.trim() === "") {
          close();
          return;
        }
        if (s.view?.blocked) return;
        const current = s.request?.text === s.text;
        if (current && s.outcome?.kind === "failed") {
          void translate();
          return;
        }
        if (current && s.outcome) {
          void submit();
          return;
        }
        set({ pendingSubmit: true });
        if (!current && awaiting === 0) void translate();
      },
      escape: close,
      allowAutoPaste() {
        void ipc.invoke("compose_open_accessibility").catch(() => {});
      },
      copyOnly() {
        void ipc.invoke("compose_copy_only").catch(() => {});
        close();
      },
      openMain(screen) {
        void ipc.invoke("compose_open_main", { screen }).catch(() => {});
      },
    };
  });
}
