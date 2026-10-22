import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { CommandError, SupportMessage, SupportView } from "../lib/ipc";
import { createSupportStore } from "./support";

// Store của màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4) với phía Rust giả: một cuộc chat trong bộ nhớ, `rev` tăng mỗi lần
// đổi như `support::chat::SupportView`.

const message = (id: number, sender: SupportMessage["sender"], text: string): SupportMessage => ({
  id,
  sender,
  text,
  createdAt: 1_800_000_000 + id,
});

function setup(initial: Partial<SupportView> = {}) {
  let view: SupportView = {
    enabled: true,
    closed: false,
    hasConversation: false,
    messages: [],
    unread: false,
    rev: 1,
    ...initial,
  };
  const change = (patch: Partial<SupportView>) => (view = { ...view, ...patch, rev: view.rev + 1 });
  // Lỗi mà lần `support_send` kế tiếp trả (lần lượt).
  const sendErrors: CommandError[] = [];
  let emailError: CommandError | null = null;
  let logError: CommandError | null = null;
  const fake = fakeIpc({
    support_screen: ({ open }) => change(open ? { unread: false } : {}),
    support_fetch: () => change({}),
    support_machine_info: () => "AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi",
    support_send: ({ text }) => {
      const error = sendErrors.shift();
      if (error) throw error;
      return change({ hasConversation: true, messages: [...view.messages, message(view.messages.length + 1, "customer", text)] });
    },
    support_set_email: () => {
      if (emailError) throw emailError;
      return null;
    },
    support_delete: () => change({ hasConversation: false, messages: [], unread: false }),
    send_log_report: () => {
      if (logError) throw logError;
      return { id: "R-7F3K-92QD" };
    },
  });
  const store = createSupportStore(fake.ipc);
  return {
    fake,
    store,
    view: () => view,
    change,
    failNextSend: (code: string, field: string | null = null) => sendErrors.push({ code, field, message: "…" }),
    failEmail: (code: string, field: string | null) => (emailError = { code, field, message: "…" }),
    failLog: (code: string) => (logError = { code, field: null, message: "…" }),
    sends: () => fake.calls.filter((c) => c.cmd === "support_send").map((c) => c.args),
  };
}

describe("support store", () => {
  it("lúc mở cửa sổ: nghe sự kiện và đọc trạng thái ban đầu (chấm đỏ) mà không mở màn hình; bản cũ hơn bị bỏ", async () => {
    const { fake, store, change } = setup({ hasConversation: true, unread: true });
    const off = await store.getState().init();
    expect(fake.calls).toEqual([{ cmd: "support_screen", args: { open: false } }]);
    expect(store.getState().view?.unread).toBe(true);
    const newer = change({ messages: [message(1, "owner", "Chào bạn")] });
    fake.emit("support://view", newer);
    expect(store.getState().view?.messages).toHaveLength(1);
    fake.emit("support://view", { ...newer, rev: newer.rev - 1, messages: [] });
    expect(store.getState().view?.messages).toHaveLength(1);
    off();
    expect(fake.listenerCount("support://view")).toBe(0);
  });

  it("mở màn hình khi chưa có cuộc chat: chỉ báo mở và đọc dòng thông tin máy, không lệnh nào gọi mạng", async () => {
    const { fake, store } = setup();
    await store.getState().open();
    await Promise.resolve();
    expect(fake.calls.map((c) => c.cmd)).toEqual(["support_screen", "support_machine_info"]);
    expect(fake.calls[0]?.args).toEqual({ open: true });
    expect(store.getState().machineInfo).toContain("AI Translator 0.2.4");
    expect(store.getState().error).toBeNull();
  });

  it("mở màn hình khi đã có cuộc chat: lấy cả cuộc chat; mất mạng thì báo lỗi, lịch sử đã có vẫn còn", async () => {
    const { fake, store } = setup({ hasConversation: true, messages: [message(1, "customer", "Chào")] });
    await store.getState().open();
    expect(fake.calls.map((c) => c.cmd)).toContain("support_fetch");
    const offline = createSupportStore(
      fakeIpc({
        support_screen: () => ({ enabled: true, closed: false, hasConversation: true, messages: [message(1, "customer", "Chào")], unread: false, rev: 2 }),
        support_machine_info: () => "",
        support_fetch: () => {
          throw { code: "supportOffline", field: null, message: "…" };
        },
      }).ipc,
    );
    await offline.getState().open();
    expect(offline.getState().error).toEqual({ code: "supportOffline", field: null });
    expect(offline.getState().view?.messages).toHaveLength(1);
  });

  it("tin đầu tiên kèm thông tin máy khi để tích, tin sau thì không; gửi xong thì hiện thẻ email", async () => {
    const { store, sends } = setup();
    const sending = store.getState().send("  Phụ đề không hiện  ");
    expect(store.getState().pending).toEqual([{ localId: 1, text: "Phụ đề không hiện", status: "sending", error: null }]);
    expect(await sending).toBe(true);
    expect(store.getState().pending).toEqual([]);
    expect(store.getState().view?.messages.map((m) => m.text)).toEqual(["Phụ đề không hiện"]);
    expect(store.getState().emailCard).toBe("asking");
    store.getState().dismissEmail();
    await store.getState().send("Thêm một câu");
    expect(sends()).toEqual([
      { text: "Phụ đề không hiện", withMachineInfo: true },
      { text: "Thêm một câu", withMachineInfo: false },
    ]);
    expect(store.getState().emailCard, "đã đóng thẻ thì tin sau không mở lại").toBe("hidden");
  });

  it("tin đầu nhận supportDisabled: tin ở lại với lỗi, màn hình theo trạng thái tắt mà phía Rust báo, không có thẻ email", async () => {
    const { fake, store, failNextSend, change } = setup();
    await store.getState().init();
    failNextSend("supportDisabled");
    expect(await store.getState().send("Chào")).toBe(false);
    fake.emit("support://view", change({ enabled: false }));
    expect(store.getState().pending[0]?.error).toEqual({ code: "supportDisabled", field: null });
    expect(store.getState().view?.enabled).toBe(false);
    expect(store.getState().view?.hasConversation).toBe(false);
    expect(store.getState().emailCard).toBe("hidden");
  });

  it("bỏ tích thì tin đầu không kèm thông tin máy", async () => {
    const { store, sends } = setup();
    store.getState().setWithMachineInfo(false);
    await store.getState().send("Chào");
    expect(sends()).toEqual([{ text: "Chào", withMachineInfo: false }]);
  });

  it("tin rỗng hay quá 1000 ký tự không được gửi", async () => {
    const { store, sends } = setup();
    expect(await store.getState().send(" \n ")).toBe(false);
    expect(await store.getState().send("ế".repeat(1001))).toBe(false);
    expect(await store.getState().send("ế".repeat(1000))).toBe(true);
    expect(sends()).toHaveLength(1);
  });

  it("gửi lỗi thì tin ở lại với lỗi; bấm thử lại gửi đúng nội dung đó", async () => {
    const { store, sends, failNextSend } = setup({ hasConversation: true });
    await store.getState().init();
    failNextSend("supportRateLimited");
    expect(await store.getState().send("Còn đó không?")).toBe(false);
    expect(store.getState().pending).toEqual([
      { localId: 1, text: "Còn đó không?", status: "failed", error: { code: "supportRateLimited", field: null } },
    ]);
    await store.getState().retry(1);
    expect(store.getState().pending).toEqual([]);
    expect(sends()).toEqual([
      { text: "Còn đó không?", withMachineInfo: false },
      { text: "Còn đó không?", withMachineInfo: false },
    ]);
  });

  it("cuộc chat cũ không còn (supportExpired): gửi lại là tin đầu của cuộc mới, kèm thông tin máy nếu để tích", async () => {
    const { fake, store, sends, failNextSend, change } = setup({ hasConversation: true });
    await store.getState().init();
    failNextSend("supportExpired");
    await store.getState().send("Còn đó không?");
    // Phía Rust đã bỏ cuộc chat và báo qua sự kiện.
    fake.emit("support://view", change({ hasConversation: false, messages: [] }));
    await store.getState().retry(1);
    expect(sends().at(-1)).toEqual({ text: "Còn đó không?", withMachineInfo: true });
    expect(store.getState().emailCard).toBe("asking");
  });

  it("lưu email: đang lưu rồi đã lưu; lỗi thì hỏi lại kèm lỗi; đóng thẻ thì ẩn", async () => {
    const { fake, store, failEmail } = setup({ hasConversation: true });
    await store.getState().saveEmail(" khach@example.com ");
    expect(fake.calls.at(-1)).toEqual({ cmd: "support_set_email", args: { email: "khach@example.com" } });
    expect(store.getState().emailCard).toBe("saved");
    failEmail("supportInvalid", "email");
    await store.getState().saveEmail("sai");
    expect(store.getState().emailCard).toBe("asking");
    expect(store.getState().emailError).toEqual({ code: "supportInvalid", field: "email" });
    store.getState().dismissEmail();
    expect(store.getState().emailCard).toBe("hidden");
    expect(store.getState().emailError).toBeNull();
  });

  it("xóa cuộc trò chuyện: về trạng thái mới (tin chờ, thẻ email, ô tích); bấm đúp không gửi lệnh thứ hai", async () => {
    const { fake, store, failNextSend } = setup({ hasConversation: true, messages: [message(1, "customer", "Chào")] });
    failNextSend("supportOffline");
    await store.getState().send("Còn đó không?");
    store.getState().setWithMachineInfo(false);
    const first = store.getState().remove();
    expect(await store.getState().remove()).toBe(false);
    expect(await first).toBe(true);
    expect(fake.calls.filter((c) => c.cmd === "support_delete")).toHaveLength(1);
    expect(store.getState().view?.hasConversation).toBe(false);
    expect(store.getState().pending).toEqual([]);
    expect(store.getState().withMachineInfo).toBe(true);
    expect(store.getState().emailCard).toBe("hidden");
  });

  it("đính kèm log: chạy lệnh Gửi log cho hỗ trợ rồi gửi tin chứa mã báo cáo; lỗi của lệnh đó hiện ở nút, không gửi tin", async () => {
    const { store, sends, failLog } = setup({ hasConversation: true });
    await store.getState().init();
    await store.getState().attachLog((id) => `📎 Mã báo cáo log: ${id}`);
    expect(sends()).toEqual([{ text: "📎 Mã báo cáo log: R-7F3K-92QD", withMachineInfo: false }]);
    expect(store.getState().log).toEqual({ status: "idle" });
    failLog("reportRateLimited");
    await store.getState().attachLog((id) => `📎 Mã báo cáo log: ${id}`);
    expect(store.getState().log).toEqual({ status: "failed", code: "reportRateLimited" });
    expect(sends()).toHaveLength(1);
  });

  it("đóng màn hình thì báo phía Rust", async () => {
    const { fake, store } = setup();
    await store.getState().close();
    expect(fake.calls).toEqual([{ cmd: "support_screen", args: { open: false } }]);
  });
});
