import { describe, expect, it, vi } from "vitest";
import type { AccountView } from "../lib/ipc";
import { fakeIpc } from "../lib/fakeIpc";
import type { Ipc } from "../lib/ipc";
import { createAccountStore } from "./account";

const anonymous = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: false, ...patch });
const signedIn = (email = "a@b.c"): AccountView => ({ state: "signedIn", email, gate: false });
const commandError = (code: string) => ({ code, field: null, message: "x" });

describe("account store", () => {
  it("init đọc get_account và nghe account://changed", async () => {
    const fake = fakeIpc({ get_account: () => anonymous({ gate: true }) });
    const store = createAccountStore(fake.ipc);
    await store.getState().init();
    expect(fake.calls.map((c) => c.cmd)).toContain("get_account");
    expect(store.getState().view).toEqual(anonymous({ gate: true }));
    fake.emit("account://changed", signedIn());
    expect(store.getState().view).toEqual(signedIn());
  });

  it("signIn đặt busy rồi nhận view mới; gửi kèm ngôn ngữ giao diện", async () => {
    let release: (v: AccountView) => void = () => {};
    const fake = fakeIpc({ account_sign_in: () => new Promise<AccountView>((r) => (release = r)) });
    const store = createAccountStore(fake.ipc);
    const pending = store.getState().signIn("ja");
    expect(store.getState().busy).toBe(true);
    release(signedIn());
    expect(await pending).toBe(true);
    expect(store.getState().busy).toBe(false);
    expect(store.getState().view).toEqual(signedIn());
    expect(store.getState().error).toBeNull();
    expect(fake.calls.find((c) => c.cmd === "account_sign_in")?.args).toEqual({ lang: "ja" });
  });

  it("lỗi map sang UiError có mã đúng, và lỗi cũ mất khi lệnh sau thành công", async () => {
    let fail = true;
    const fake = fakeIpc({
      account_sign_in: () => {
        if (fail) throw { code: "accountDenied", field: null, message: "denied" };
        return signedIn();
      },
    });
    const store = createAccountStore(fake.ipc);
    expect(await store.getState().signIn("vi")).toBe(false);
    expect(store.getState().error).toEqual({ code: "accountDenied", field: null });
    fail = false;
    expect(await store.getState().signIn("vi")).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  it("cancel gọi account_cancel_sign_in, và gọi được khi signIn đang chờ", async () => {
    let release: (e: unknown) => void = () => {};
    const fake = fakeIpc({
      account_sign_in: () => new Promise<AccountView>((_, rej) => (release = rej)),
      account_cancel_sign_in: () => {
        release(commandError("accountCancelled"));
        return null;
      },
    });
    const store = createAccountStore(fake.ipc);
    const pending = store.getState().signIn("en");
    await store.getState().cancel();
    await pending;
    expect(fake.calls.map((c) => c.cmd)).toEqual(["account_sign_in", "account_cancel_sign_in"]);
    expect(store.getState().busy).toBe(false);
    // Người dùng tự hủy: không phải lỗi, không hiện thanh báo.
    expect(store.getState().error).toBeNull();
  });

  it("signOut và deleteAccount nhận view mới", async () => {
    const fake = fakeIpc({ account_sign_out: () => anonymous(), account_delete: () => anonymous({ gate: true }) });
    const store = createAccountStore(fake.ipc);
    store.setState({ view: signedIn() });
    expect(await store.getState().signOut()).toBe(true);
    expect(store.getState().view).toEqual(anonymous());
    store.setState({ view: signedIn() });
    expect(await store.getState().deleteAccount()).toBe(true);
    expect(store.getState().view).toEqual(anonymous({ gate: true }));
    expect(fake.calls.map((c) => c.cmd)).toEqual(["account_sign_out", "account_delete"]);
  });

  it("kết quả lệnh sai hình dạng thì bỏ, giữ view cũ", async () => {
    const fake = fakeIpc({ account_sign_out: () => ({ nope: 1 }) as unknown as AccountView });
    const store = createAccountStore(fake.ipc);
    store.setState({ view: signedIn() });
    await store.getState().signOut();
    expect(store.getState().view).toEqual(signedIn());
  });
});

describe("account store: không bao giờ ném ra ngoài", () => {
  const rejections: [string, unknown][] = [
    ["CommandError", commandError("accountNetwork")],
    ["chuỗi (ACL chặn)", "Command account_sign_in not allowed by ACL"],
    ["Error", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
  ];

  it.each(rejections)("mọi lệnh bị từ chối bằng %s thành error, không ném, busy về false", async (_name, reason) => {
    const reject = () => Promise.reject(reason);
    const fake = fakeIpc({
      get_account: reject,
      account_sign_in: reject,
      account_cancel_sign_in: reject,
      account_sign_out: reject,
      account_delete: reject,
    });
    const store = createAccountStore(fake.ipc);
    const results = await Promise.all([
      store.getState().init().then((off) => off()),
      store.getState().signIn("vi"),
      store.getState().signOut(),
      store.getState().deleteAccount(),
    ]);
    expect(results.slice(1)).toEqual([false, false, false]);
    await expect(store.getState().cancel()).resolves.toBeUndefined();
    expect(store.getState().error).not.toBeNull();
    expect(store.getState().busy).toBe(false);
  });

  it("lệnh thiếu handler (ACL chặn) cũng chỉ thành error.unknown", async () => {
    const store = createAccountStore(fakeIpc({}).ipc);
    expect(await store.getState().signIn("vi")).toBe(false);
    expect(store.getState().error).toEqual({ code: "unknown", field: null });
    expect(store.getState().busy).toBe(false);
  });

  it("invoke ném đồng bộ (không trả Promise) cũng được nuốt", async () => {
    const throwing: Ipc = {
      invoke: () => {
        throw new Error("sync");
      },
      listen: async () => () => {},
    };
    const store = createAccountStore(throwing);
    await expect(store.getState().signIn("vi")).resolves.toBe(false);
    await expect(store.getState().cancel()).resolves.toBeUndefined();
    await expect(store.getState().init()).resolves.toBeTypeOf("function");
    expect(store.getState().busy).toBe(false);
  });

  it("busy luôn về false: kể cả khi kết quả sai hình dạng", async () => {
    const fake = fakeIpc({ account_sign_in: () => undefined as unknown as AccountView });
    const store = createAccountStore(fake.ipc);
    await store.getState().signIn("vi");
    expect(store.getState().busy).toBe(false);
  });

  it("đang busy thì signIn/signOut/deleteAccount thứ hai bị bỏ, không gọi lệnh", async () => {
    let release: (v: AccountView) => void = () => {};
    const fake = fakeIpc({
      account_sign_in: () => new Promise<AccountView>((r) => (release = r)),
      account_sign_out: () => anonymous(),
      account_delete: () => anonymous(),
    });
    const store = createAccountStore(fake.ipc);
    const first = store.getState().signIn("vi");
    expect(await store.getState().signIn("vi")).toBe(false);
    expect(await store.getState().signOut()).toBe(false);
    expect(await store.getState().deleteAccount()).toBe(false);
    release(signedIn());
    await first;
    expect(fake.calls.map((c) => c.cmd)).toEqual(["account_sign_in"]);
  });
});

describe("account store: sự kiện và init", () => {
  it("sự kiện sai hình dạng bị bỏ, không làm hỏng view", async () => {
    const fake = fakeIpc({ get_account: () => signedIn() });
    const store = createAccountStore(fake.ipc);
    await store.getState().init();
    for (const bad of [null, undefined, 3, "x", {}, { state: "bogus", email: null, gate: false }, { state: "signedIn", gate: false }]) {
      expect(() => fake.emit("account://changed", bad as unknown as AccountView)).not.toThrow();
    }
    expect(store.getState().view).toEqual(signedIn());
  });

  it("get_account trả hình dạng sai thì bỏ, view giữ null", async () => {
    const fake = fakeIpc({ get_account: () => "lạ" as unknown as AccountView });
    const store = createAccountStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view).toBeNull();
  });

  it("init idempotent: gọi hai lần chỉ một người nghe", async () => {
    const fake = fakeIpc({ get_account: () => anonymous() });
    const store = createAccountStore(fake.ipc);
    const [a, b] = await Promise.all([store.getState().init(), store.getState().init()]);
    await store.getState().init();
    expect(fake.listenerCount("account://changed")).toBe(1);
    expect(fake.calls.filter((c) => c.cmd === "get_account")).toHaveLength(1);
    a();
    b();
    expect(fake.listenerCount("account://changed")).toBe(0);
  });

  it("hủy đăng ký sạch, và init lại được sau khi hủy", async () => {
    const fake = fakeIpc({ get_account: () => anonymous() });
    const store = createAccountStore(fake.ipc);
    const off = await store.getState().init();
    expect(fake.listenerCount("account://changed")).toBe(1);
    off();
    off();
    expect(fake.listenerCount("account://changed")).toBe(0);
    fake.emit("account://changed", signedIn());
    expect(store.getState().view).toEqual(anonymous());
    const off2 = await store.getState().init();
    expect(fake.listenerCount("account://changed")).toBe(1);
    off2();
  });

  it("get_account lỗi vẫn đăng ký nghe, và lỗi hiện ở error", async () => {
    const fake = fakeIpc({ get_account: () => Promise.reject(commandError("accountStorage")) });
    const store = createAccountStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().error?.code).toBe("accountStorage");
    expect(fake.listenerCount("account://changed")).toBe(1);
    fake.emit("account://changed", signedIn());
    expect(store.getState().view).toEqual(signedIn());
  });

  it("listen lỗi: init không ném, trả hàm hủy dùng được, và thử lại được", async () => {
    const listen = vi.fn().mockRejectedValueOnce(new Error("no events")).mockResolvedValue(() => {});
    const ipc: Ipc = { invoke: async () => anonymous() as never, listen };
    const store = createAccountStore(ipc);
    const off = await store.getState().init();
    expect(typeof off).toBe("function");
    expect(() => off()).not.toThrow();
    await store.getState().init();
    expect(listen).toHaveBeenCalledTimes(2);
  });

  it("dismiss xóa error", async () => {
    const store = createAccountStore(fakeIpc({}).ipc);
    await store.getState().signIn("vi");
    expect(store.getState().error).not.toBeNull();
    store.getState().dismiss();
    expect(store.getState().error).toBeNull();
  });
});

describe("account store: thứ tự giữa sự kiện và kết quả lệnh", () => {
  it("(a) sự kiện tới khi get_account đang bay: kết quả cũ không đè view của sự kiện", async () => {
    let reply: (v: AccountView) => void = () => {};
    const fake = fakeIpc({ get_account: () => new Promise<AccountView>((r) => (reply = r)) });
    const store = createAccountStore(fake.ipc);
    const init = store.getState().init();
    await vi.waitFor(() => expect(fake.calls.map((c) => c.cmd)).toContain("get_account"));
    fake.emit("account://changed", signedIn("moi@b.c"));
    reply(anonymous({ gate: true }));
    await init;
    expect(store.getState().view).toEqual(signedIn("moi@b.c"));
  });

  it("(b) sự kiện tới khi signIn đang bay: kết quả cũ hơn không đè view của sự kiện", async () => {
    let reply: (v: AccountView) => void = () => {};
    const fake = fakeIpc({ account_sign_in: () => new Promise<AccountView>((r) => (reply = r)) });
    const store = createAccountStore(fake.ipc);
    await store.getState().init().catch(() => {});
    const pending = store.getState().signIn("vi");
    fake.emit("account://changed", signedIn("moi@b.c"));
    reply({ state: "signingIn", email: null, gate: true });
    expect(await pending).toBe(true);
    expect(store.getState().view).toEqual(signedIn("moi@b.c"));
    expect(store.getState().busy).toBe(false);
  });

  it("(c) không có sự kiện nào: cả hai kết quả được áp dụng bình thường", async () => {
    let reply: (v: AccountView) => void = () => {};
    const fake = fakeIpc({
      get_account: () => new Promise<AccountView>((r) => (reply = r)),
      account_sign_in: () => signedIn("x@y.z"),
    });
    const store = createAccountStore(fake.ipc);
    const init = store.getState().init();
    await vi.waitFor(() => expect(fake.calls.map((c) => c.cmd)).toContain("get_account"));
    reply(anonymous({ gate: true }));
    await init;
    expect(store.getState().view).toEqual(anonymous({ gate: true }));
    await store.getState().signIn("vi");
    expect(store.getState().view).toEqual(signedIn("x@y.z"));
  });

  it("sự kiện sai hình dạng không tính là sự kiện mới: kết quả lệnh vẫn được áp dụng", async () => {
    let reply: (v: AccountView) => void = () => {};
    const fake = fakeIpc({ account_sign_in: () => new Promise<AccountView>((r) => (reply = r)) });
    const store = createAccountStore(fake.ipc);
    await store.getState().init().catch(() => {});
    const pending = store.getState().signIn("vi");
    fake.emit("account://changed", { bogus: 1 } as unknown as AccountView);
    reply(signedIn());
    await pending;
    expect(store.getState().view).toEqual(signedIn());
  });
});

describe("account store: lỗi hủy và kết quả sai hình dạng", () => {
  it("lỗi thường (accountDenied) vẫn được ghi vào error", async () => {
    const fake = fakeIpc({ account_sign_in: () => Promise.reject(commandError("accountDenied")) });
    const store = createAccountStore(fake.ipc);
    expect(await store.getState().signIn("vi")).toBe(false);
    expect(store.getState().error).toEqual({ code: "accountDenied", field: null });
  });

  it("accountCancelled: xóa error cũ, trả false, không ghi lỗi", async () => {
    const fake = fakeIpc({ account_sign_in: () => Promise.reject(commandError("accountCancelled")) });
    const store = createAccountStore(fake.ipc);
    store.setState({ error: { code: "accountNetwork", field: null } });
    expect(await store.getState().signIn("vi")).toBe(false);
    expect(store.getState().error).toBeNull();
    expect(store.getState().busy).toBe(false);
  });

  it("kết quả sai hình dạng: trả false, không xóa error, giữ nguyên view", async () => {
    const fake = fakeIpc({ account_sign_out: () => ({ nope: 1 }) as unknown as AccountView });
    const store = createAccountStore(fake.ipc);
    store.setState({ view: signedIn(), error: { code: "accountNetwork", field: null } });
    expect(await store.getState().signOut()).toBe(false);
    expect(store.getState().view).toEqual(signedIn());
    expect(store.getState().error).toEqual({ code: "accountNetwork", field: null });
    expect(store.getState().busy).toBe(false);
  });
});
