import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { ComposeSubmitted, ComposeView } from "../lib/ipc";
import { DEBOUNCE_MS, type Timers, createComposeStore } from "./compose";

const VIEW: ComposeView = {
  uiLanguage: "vi",
  theme: "system",
  target: "en",
  autoPaste: true,
  blocked: null,
  platform: "macos",
};

// Hẹn giờ giả: ghi lại các lần hẹn, test tự cho chạy (`fire`).
function fakeTimers() {
  const pending = new Map<number, { run: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    set(run, ms) {
      const id = next++;
      pending.set(id, { run, ms });
      return id;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
  };
  return {
    timers,
    pending: () => [...pending.values()].map((p) => p.ms),
    fire() {
      const runs = [...pending.values()];
      pending.clear();
      runs.forEach((p) => p.run());
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(submitted: ComposeSubmitted = "pasted", translate?: (text: string) => number | Promise<number>) {
  let id = 0;
  const f = fakeIpc({
    get_compose_view: () => VIEW,
    compose_translate: (args) => (translate ? translate(args.text) : ++id),
    compose_submit: () => submitted,
    compose_close: () => null,
    compose_open_accessibility: () => null,
    compose_copy_only: () => null,
    compose_open_main: () => null,
  });
  const t = fakeTimers();
  const store = createComposeStore(f.ipc, t.timers);
  const sent = (cmd: string) => f.calls.filter((c) => c.cmd === cmd).map((c) => c.args);
  return { ...f, t, store, sent };
}

describe("ô soạn Gõ dịch (spec 2026-10-17-go-dich §1)", () => {
  it("chờ ngừng gõ 400 ms rồi mới dịch toàn bộ chữ đang có", async () => {
    const { store, t, sent } = setup();
    await store.getState().init();
    store.getState().setText("Mai");
    store.getState().setText("Mai mình");
    expect(t.pending()).toEqual([DEBOUNCE_MS]);
    expect(sent("compose_translate")).toEqual([]);
    t.fire();
    await flush();
    expect(sent("compose_translate")).toEqual([{ text: "Mai mình" }]);
    expect(store.getState().request).toEqual({ id: 1, text: "Mai mình" });
    expect(store.getState().waiting).toBe(true);
  });

  it("chữ dịch về dần, rồi kết quả; Enter thì dán và hết bản nháp", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Mai mình gửi");
    t.fire();
    await flush();
    emit("compose://delta", { id: 1, line: 0, text: "I'll", reset: false });
    emit("compose://delta", { id: 1, line: 0, text: " send", reset: false });
    expect(store.getState().lines).toEqual(["I'll send"]);
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "I'll send it." } });
    expect(store.getState().waiting).toBe(false);
    expect(store.getState().previous).toBe("I'll send it.");
    store.getState().enter();
    await flush();
    expect(sent("compose_submit")).toEqual([{ id: 1 }]);
    expect(store.getState().text).toBe("");
    expect(store.getState().request).toBeNull();
  });

  it("Enter khi chưa dịch xong thì dịch ngay, xong mới dán", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Cảm ơn");
    store.getState().enter();
    expect(t.pending()).toEqual([]);
    expect(store.getState().pendingSubmit).toBe(true);
    await flush();
    expect(sent("compose_translate")).toEqual([{ text: "Cảm ơn" }]);
    expect(sent("compose_submit")).toEqual([]);
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "Thanks" } });
    await flush();
    expect(sent("compose_submit")).toEqual([{ id: 1 }]);
  });

  it("dịch lỗi thì Enter dịch lại, không bao giờ dán câu gốc", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Cảm ơn");
    store.getState().enter();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "failed", code: "composeFailed" } });
    expect(store.getState().pendingSubmit).toBe(false);
    store.getState().enter();
    await flush();
    expect(sent("compose_translate")).toHaveLength(2);
    expect(sent("compose_submit")).toEqual([]);
    expect(t.pending()).toEqual([]);
  });

  it("Enter ở ô trống thì đóng; Esc đóng mà giữ bản nháp; mở lại thì dịch lại cái chưa xong", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().enter();
    expect(sent("compose_close")).toHaveLength(1);
    store.getState().setText("Mai mình gửi");
    t.fire();
    await flush();
    store.getState().escape();
    expect(sent("compose_close")).toHaveLength(2);
    expect(store.getState().text).toBe("Mai mình gửi");
    emit("compose://open", VIEW);
    expect(store.getState().opened).toBe(1);
    await flush();
    expect(sent("compose_translate")).toHaveLength(2);
  });

  it("mở lại khi bản dịch đã xong thì không dịch lại", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Mai");
    t.fire();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "Tomorrow" } });
    emit("compose://open", VIEW);
    await flush();
    expect(sent("compose_translate")).toHaveLength(1);
  });

  it("macOS chưa có quyền Trợ năng: đã chép, hộp quyền hiện, Enter đóng", async () => {
    const { store, t, emit, sent } = setup("needsPermission");
    await store.getState().init();
    store.getState().setText("Mai");
    t.fire();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "Tomorrow" } });
    store.getState().enter();
    await flush();
    expect(store.getState().permission).toBe(true);
    expect(store.getState().text).toBe("");
    store.getState().enter();
    expect(sent("compose_close")).toHaveLength(1);
    expect(store.getState().permission).toBe(false);
  });

  it("Luôn chỉ chép: tắt tự dán rồi đóng; Bật tự dán: mở trang Trợ năng", async () => {
    const { store, sent } = setup();
    store.getState().copyOnly();
    store.getState().allowAutoPaste();
    expect(sent("compose_copy_only")).toHaveLength(1);
    expect(sent("compose_close")).toHaveLength(1);
    expect(sent("compose_open_accessibility")).toHaveLength(1);
  });

  it("bản quyền đang chặn thì Enter không làm gì", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    emit("compose://open", { ...VIEW, blocked: "trialEnded" });
    store.getState().setText("Mai");
    t.fire();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "failed", code: "trialEnded" } });
    store.getState().enter();
    await flush();
    expect(sent("compose_translate")).toHaveLength(1);
    expect(sent("compose_submit")).toEqual([]);
  });

  it("sự kiện tới trước khi lệnh dịch trả số thì vẫn được áp", async () => {
    let resolve: (id: number) => void = () => {};
    const { store, t, emit } = setup("pasted", () => new Promise<number>((r) => (resolve = r)));
    await store.getState().init();
    store.getState().setText("Chào");
    t.fire();
    emit("compose://loading", { id: 7 });
    emit("compose://delta", { id: 7, line: 0, text: "Hi", reset: false });
    emit("compose://done", { id: 7, outcome: { kind: "translated", text: "Hi" } });
    resolve(7);
    await flush();
    expect(store.getState().lines).toEqual(["Hi"]);
    expect(store.getState().outcome).toEqual({ kind: "translated", text: "Hi" });
    expect(store.getState().loading).toBe(false);
  });

  it("lệnh dịch bị từ chối (quá 4000 ký tự) thì báo lỗi cho đúng chữ đó", async () => {
    const { store, t } = setup("pasted", () => {
      throw { code: "composeTooLong", field: null, message: "quá 4000 ký tự" };
    });
    await store.getState().init();
    store.getState().setText("x".repeat(4001));
    t.fire();
    await flush();
    expect(store.getState().outcome).toEqual({ kind: "failed", code: "composeTooLong" });
  });

  it("dòng dịch hỏng lần đầu thì bỏ phần đã hiện của dòng đó", async () => {
    const { store, t, emit } = setup();
    await store.getState().init();
    store.getState().setText("một\nhai");
    t.fire();
    await flush();
    emit("compose://delta", { id: 1, line: 1, text: "TWO??", reset: false });
    emit("compose://delta", { id: 1, line: 1, text: "", reset: true });
    emit("compose://delta", { id: 1, line: 1, text: "Two", reset: false });
    expect(store.getState().lines[1]).toBe("Two");
  });
});
