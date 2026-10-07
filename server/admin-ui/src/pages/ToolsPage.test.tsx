import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolsPage } from "./ToolsPage";

const SIGNED = { slot: "backup", kid: "k-2026-10", token: "eyJ.payload.sig" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/admin/keys/test-sign") return json(SIGNED);
      if (url === "/admin/erase") return json({ orders: 2, licenses: 1, activations: 1 });
      if (url === "/admin/payos/confirm-webhook") return json({ ok: true, webhook_url: JSON.parse(String(init.body)).webhook_url });
      throw new Error(`fetch không mong đợi: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ToolsPage", () => {
  it("ẩn danh: nút khóa khi email không hợp lệ; hộp cần lý do và gõ AN DANH; gửi {email, note}", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    const open = () => screen.getByRole("button", { name: "Ẩn danh…" }) as HTMLButtonElement;
    expect(open().disabled).toBe(true);
    await user.type(screen.getByLabelText("Email của khách"), "khong-phai-email");
    expect(open().disabled).toBe(true);
    await user.clear(screen.getByLabelText("Email của khách"));
    await user.type(screen.getByLabelText("Email của khách"), "khach@example.com");
    expect(open().disabled).toBe(false);

    await user.click(open());
    const confirm = () => screen.getByRole("button", { name: "Ẩn danh" }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "khách yêu cầu xóa dữ liệu");
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "AN DANH");
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());

    expect(await screen.findByText("Đã ẩn danh: 2 đơn, 1 license, 1 máy.")).toBeTruthy();
    expect(calls).toEqual([
      { url: "/admin/erase", method: "POST", body: { email: "khach@example.com", note: "khách yêu cầu xóa dữ liệu" } },
    ]);
  });

  it("ẩn danh: hộp nhắc lý do được ghi vào nhật ký, không ghi email hay thông tin cá nhân của khách", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.type(screen.getByLabelText("Email của khách"), "khach@example.com");
    await user.click(screen.getByRole("button", { name: "Ẩn danh…" }));
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("Lý do được ghi vào nhật ký: không ghi email hay thông tin cá nhân của khách vào đây.");
  });

  it("ký thử: hiện token để chép", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(screen.getByRole("button", { name: "Ký thử…" }));
    await user.click(screen.getByRole("button", { name: "Ký thử" }));
    expect(await screen.findByText(JSON.stringify(SIGNED))).toBeTruthy();
    expect(calls).toEqual([{ url: "/admin/keys/test-sign", method: "POST", body: {} }]);
  });

  it("xác nhận webhook: gửi đúng URL đã nhập (bỏ khoảng trắng hai đầu), không phải URL mặc định; hộp ghi URL đó", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    const input = screen.getByLabelText("URL webhook") as HTMLInputElement;
    expect(input.value).toBe("https://api.aitranslator.io.vn/v1/webhooks/payos");
    await user.clear(input);
    await user.type(input, "  https://api.aitranslator.io.vn/v1/webhooks/payos-moi  ");
    await user.click(screen.getByRole("button", { name: "Xác nhận…" }));
    expect(screen.getByRole("dialog").textContent).toContain("https://api.aitranslator.io.vn/v1/webhooks/payos-moi");
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText("Đã đăng ký webhook: https://api.aitranslator.io.vn/v1/webhooks/payos-moi")).toBeTruthy();
    expect(calls).toEqual([
      { url: "/admin/payos/confirm-webhook", method: "POST", body: { webhook_url: "https://api.aitranslator.io.vn/v1/webhooks/payos-moi" } },
    ]);
  });

  it("xác nhận webhook không sửa ô: gửi URL mặc định", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(screen.getByRole("button", { name: "Xác nhận…" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText("Đã đăng ký webhook: https://api.aitranslator.io.vn/v1/webhooks/payos")).toBeTruthy();
    expect(calls).toEqual([
      { url: "/admin/payos/confirm-webhook", method: "POST", body: { webhook_url: "https://api.aitranslator.io.vn/v1/webhooks/payos" } },
    ]);
  });
});
