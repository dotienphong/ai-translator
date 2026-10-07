import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevicePage } from "./DevicePage";

const HASH = "a1".repeat(32);
const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const NOW = Math.floor(Date.now() / 1000);

const license = {
  id: ID,
  license_key: "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB",
  email: "khach@example.com",
  plan: "yearly",
  expires_at: NOW + 300 * 86400,
  created_at: NOW - 86400,
  revoked_at: null,
  locked_at: null,
  conflict: false,
  activations: [],
  audit: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];

function serve(result: unknown) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return json(result);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DevicePage", () => {
  it("tra theo device_id_hash; hiện mã băm đầy đủ", async () => {
    serve({ licenses: [], orders: [], trial: null });
    render(<DevicePage hash={HASH} />);
    expect(await screen.findByText(HASH)).toBeTruthy();
    expect(calls).toEqual([{ url: "/admin/lookup", method: "POST", body: { device_id_hash: HASH } }]);
  });

  it("đang dùng thử: có ngày bắt đầu/kết thúc và nhãn Đang dùng", async () => {
    serve({ licenses: [], orders: [], trial: { started_at: NOW - 3 * 86400, ends_at: NOW + 7 * 86400, last_seen_at: NOW - 60 } });
    render(<DevicePage hash={HASH} />);
    expect(await screen.findByText("Đang dùng")).toBeTruthy();
    expect(screen.queryByText("Đã hết")).toBeNull();
    expect(screen.queryByText("Máy chưa đăng ký dùng thử.")).toBeNull();
    expect(screen.getByText("Bắt đầu")).toBeTruthy();
    expect(screen.getByText("Lần gọi cuối")).toBeTruthy();
  });

  it("dùng thử đã hết: nhãn Đã hết", async () => {
    serve({ licenses: [], orders: [], trial: { started_at: NOW - 30 * 86400, ends_at: NOW - 20 * 86400, last_seen_at: NOW - 21 * 86400 } });
    render(<DevicePage hash={HASH} />);
    expect(await screen.findByText("Đã hết")).toBeTruthy();
    expect(screen.queryByText("Đang dùng")).toBeNull();
    expect(screen.queryByText("Máy chưa đăng ký dùng thử.")).toBeNull();
  });

  it("máy chưa đăng ký dùng thử (trial null)", async () => {
    serve({ licenses: [], orders: [], trial: null });
    render(<DevicePage hash={HASH} />);
    expect(await screen.findByText("Máy chưa đăng ký dùng thử.")).toBeTruthy();
    expect(screen.queryByText("Bắt đầu")).toBeNull();
    expect(screen.queryByText("Đang dùng")).toBeNull();
    expect(screen.queryByText("Đã hết")).toBeNull();
  });

  it("bảng license từng kích hoạt trên máy: link tới license; trống thì báo", async () => {
    serve({ licenses: [license], orders: [], trial: null });
    const first = render(<DevicePage hash={HASH} />);
    expect((await screen.findByRole("link", { name: "K7Q2-…-9XMB" })).getAttribute("href")).toBe(`/licenses/${ID}`);
    expect(screen.queryByText("Chưa có license nào")).toBeNull();
    first.unmount();
    serve({ licenses: [], orders: [], trial: null });
    render(<DevicePage hash={HASH} />);
    expect(await screen.findByText("Chưa có license nào")).toBeTruthy();
  });

  it("lỗi tải: hiện câu lỗi", async () => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "internal" }, 500)));
    render(<DevicePage hash={HASH} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Lỗi máy chủ");
  });
});
