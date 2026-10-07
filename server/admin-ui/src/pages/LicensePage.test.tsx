import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicensePage } from "./LicensePage";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const NOW = Math.floor(Date.now() / 1000);
const license = {
  id: ID,
  license_key: KEY,
  email: "khach@example.com",
  plan: "yearly",
  expires_at: NOW + 365 * 86400,
  created_at: NOW - 86400,
  revoked_at: null,
  locked_at: null,
  conflict: false,
  activations: [
    {
      id: "act-1",
      license_id: ID,
      device_id_hash: "a".repeat(64),
      device_label: "MacBook",
      quota_epoch: 0,
      created_at: NOW - 3600,
      last_validated_at: NOW - 60,
      deactivated_at: null,
      deactivated_by: null,
    },
  ],
  audit: [{ at: NOW - 3600, actor: "webhook", action: "license_issued", order_code: 1000001, detail: null }],
};

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
      if (url === "/admin/lookup") return json({ licenses: [license], orders: [] });
      if (url === `/admin/licenses/${ID}/revoke`) return json({ ok: true });
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LicensePage", () => {
  it("tra theo license_id, che key mặc định, có bảng máy", async () => {
    render(<LicensePage id={ID} />);
    expect(await screen.findByText("K7Q2-…-9XMB")).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    expect(calls[0]).toEqual({ url: "/admin/lookup", method: "POST", body: { license_id: ID } });
    expect(screen.getByText("MacBook")).toBeTruthy();
  });

  it("thu hồi: cần lý do và gõ THU HOI; gửi note; tải lại trang", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Thu hồi…" }));
    const confirm = () => screen.getByRole("button", { name: "Thu hồi" }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "khách yêu cầu hoàn tiền");
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "THU HOI");
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());
    await waitFor(() => expect(calls.filter((c) => c.url === "/admin/lookup")).toHaveLength(2));
    expect(calls.find((c) => c.url.endsWith("/revoke"))).toEqual({
      url: `/admin/licenses/${ID}/revoke`,
      method: "POST",
      body: { note: "khách yêu cầu hoàn tiền" },
    });
  });
});
