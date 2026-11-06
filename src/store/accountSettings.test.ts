import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AccountView } from "../lib/ipc";
import { createAccountStore } from "./account";
import { createAccountSettingsStore } from "./accountSettings";

// Luồng của Cài đặt › Tài khoản (spec 2026-11-05-dang-nhap-google §6.3, §5.5): đăng xuất, xóa có xác nhận, liên kết. Dùng store tài
// khoản thật với IPC giả; chỉ phần "phiên có đang dịch không" là hàm giả.

const anonymous = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: false, ...patch });
const signedIn = (): AccountView => ({ state: "signedIn", email: "an@example.com", gate: false });
const commandError = (code: string) => ({ code, field: null, message: "x" });

async function setup(handlers: Parameters<typeof fakeIpc>[0] = {}, active = false) {
  const fake = fakeIpc({ get_account: () => signedIn(), ...handlers });
  const account = createAccountStore(fake.ipc);
  await account.getState().init();
  let sessionActive = active;
  const settings = createAccountSettingsStore(account, () => sessionActive);
  return {
    fake,
    account,
    settings,
    setActive: (v: boolean) => (sessionActive = v),
    count: (cmd: string) => fake.calls.filter((c) => c.cmd === cmd).length,
  };
}

describe("đăng xuất", () => {
  it("gọi account_sign_out, view về chưa đăng nhập, không gọi account_delete", async () => {
    const s = await setup({ account_sign_out: () => anonymous({ gate: true }) });
    expect(await s.settings.getState().signOut()).toBe(true);
    expect(s.count("account_sign_out")).toBe(1);
    expect(s.count("account_delete")).toBe(0);
    expect(s.account.getState().view).toEqual(anonymous({ gate: true }));
    expect(s.settings.getState().action).toBe("signOut");
  });

  it("đăng xuất được cả khi đang dịch (không gọi mạng, lõi Rust cho phép)", async () => {
    const s = await setup({ account_sign_out: () => anonymous({ gate: true }) }, true);
    expect(await s.settings.getState().signOut()).toBe(true);
    expect(s.count("account_sign_out")).toBe(1);
  });

  it("đăng xuất lỗi (kho khóa): vẫn đăng nhập, có lỗi accountStorage", async () => {
    const s = await setup({
      account_sign_out: () => {
        throw commandError("accountStorage");
      },
    });
    expect(await s.settings.getState().signOut()).toBe(false);
    expect(s.account.getState().view).toEqual(signedIn());
    expect(s.account.getState().error?.code).toBe("accountStorage");
  });
});

describe("xóa tài khoản", () => {
  it("phải xác nhận: hỏi chưa gọi lệnh; xác nhận mới gọi account_delete một lần", async () => {
    const s = await setup({ account_delete: () => anonymous({ gate: true }) });
    expect(s.settings.getState().confirming).toBe(false);
    s.settings.getState().askDelete();
    expect(s.settings.getState().confirming).toBe(true);
    expect(s.count("account_delete")).toBe(0);
    expect(await s.settings.getState().confirmDelete()).toBe(true);
    expect(s.count("account_delete")).toBe(1);
    expect(s.settings.getState().confirming).toBe(false);
    expect(s.account.getState().view).toEqual(anonymous({ gate: true }));
    expect(s.settings.getState().action).toBe("delete");
  });

  it("chưa hỏi mà gọi xác nhận: không làm gì, không gọi lệnh", async () => {
    const s = await setup({ account_delete: () => anonymous() });
    expect(await s.settings.getState().confirmDelete()).toBe(false);
    expect(s.count("account_delete")).toBe(0);
    expect(s.account.getState().view).toEqual(signedIn());
  });

  it("bấm Hủy ở bước xác nhận: không xóa", async () => {
    const s = await setup({ account_delete: () => anonymous() });
    s.settings.getState().askDelete();
    s.settings.getState().cancelDelete();
    expect(s.settings.getState().confirming).toBe(false);
    expect(await s.settings.getState().confirmDelete()).toBe(false);
    expect(s.count("account_delete")).toBe(0);
  });

  it("bấm xác nhận hai lần liền: chỉ một lần gọi", async () => {
    let release: (v: AccountView) => void = () => {};
    const s = await setup({ account_delete: () => new Promise<AccountView>((r) => (release = r)) });
    s.settings.getState().askDelete();
    const first = s.settings.getState().confirmDelete();
    const second = await s.settings.getState().confirmDelete();
    expect(second).toBe(false);
    release(anonymous());
    expect(await first).toBe(true);
    expect(s.count("account_delete")).toBe(1);
  });

  it("server lỗi: vẫn đăng nhập, view không đổi, lỗi hiện đúng mã, hộp xác nhận đóng", async () => {
    const s = await setup({
      account_delete: () => {
        throw commandError("accountNetwork");
      },
    });
    s.settings.getState().askDelete();
    expect(await s.settings.getState().confirmDelete()).toBe(false);
    expect(s.account.getState().view).toEqual(signedIn());
    expect(s.account.getState().error?.code).toBe("accountNetwork");
    expect(s.settings.getState().confirming).toBe(false);
    expect(s.settings.getState().action).toBe("delete");
    // Thử lại được.
    s.settings.getState().askDelete();
    expect(s.settings.getState().confirming).toBe(true);
  });

  it("đang dịch: không mở được hộp xác nhận và không gọi account_delete (app không gọi mạng tài khoản lúc dịch)", async () => {
    const s = await setup({ account_delete: () => anonymous() }, true);
    s.settings.getState().askDelete();
    expect(s.settings.getState().confirming).toBe(false);
    expect(await s.settings.getState().confirmDelete()).toBe(false);
    expect(s.count("account_delete")).toBe(0);
  });

  it("đã mở hộp xác nhận rồi mới bắt đầu dịch: xác nhận cũng không gọi lệnh, hộp đóng", async () => {
    const s = await setup({ account_delete: () => anonymous() });
    s.settings.getState().askDelete();
    s.setActive(true);
    expect(await s.settings.getState().confirmDelete()).toBe(false);
    expect(s.count("account_delete")).toBe(0);
    expect(s.settings.getState().confirming).toBe(false);
  });

  it("lỗi cũ của thao tác khác không bị tính cho lần này: thao tác mới xóa lỗi cũ trước khi chạy", async () => {
    const s = await setup({ account_sign_out: () => anonymous() });
    s.account.setState({ error: { code: "accountDenied", field: null } });
    await s.settings.getState().signOut();
    expect(s.account.getState().error).toBeNull();
  });
});

describe("liên kết từ Cài đặt (máy gói trả phí chưa đăng nhập)", () => {
  it("gọi account_sign_in với ngôn ngữ giao diện", async () => {
    const s = await setup({ get_account: () => anonymous(), account_sign_in: () => signedIn() });
    expect(await s.settings.getState().link("ja")).toBe(true);
    expect(s.fake.calls.find((c) => c.cmd === "account_sign_in")?.args).toEqual({ lang: "ja" });
    expect(s.settings.getState().action).toBe("link");
  });

  it("đang dịch: không gọi account_sign_in", async () => {
    const s = await setup({ get_account: () => anonymous(), account_sign_in: () => signedIn() }, true);
    expect(await s.settings.getState().link("vi")).toBe(false);
    expect(s.count("account_sign_in")).toBe(0);
  });
});
