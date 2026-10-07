import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortHash } from "../format";
import { TrialsPage } from "./TrialsPage";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const NOW = Math.floor(Date.now() / 1000);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let urls: string[];
let page: () => Response;

beforeEach(() => {
  urls = [];
  page = () => json({ items: [], next_cursor: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return page();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TrialsPage", () => {
  it("mở đầu gọi /admin/trials; chưa có máy nào thì báo trống", async () => {
    render(<TrialsPage />);
    expect(await screen.findByText("Chưa có máy nào dùng thử")).toBeTruthy();
    expect(urls).toEqual(["/admin/trials"]);
  });

  it("đổi Trạng thái: gọi lại với state=active, state=ended; về Tất cả thì bỏ tham số", async () => {
    render(<TrialsPage />);
    await screen.findByText("Chưa có máy nào dùng thử");
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "active" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/trials?state=active"));
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "ended" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/trials?state=ended"));
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/trials"));
    expect(urls).toHaveLength(4);
  });

  it("mỗi dòng link tới trang máy theo mã băm đầy đủ; cột Đã mua đúng theo purchased", async () => {
    page = () =>
      json({
        items: [
          { device_id_hash: HASH_A, started_at: NOW - 86400 * 3, ends_at: NOW + 86400 * 7, last_seen_at: NOW - 60, purchased: true },
          { device_id_hash: HASH_B, started_at: NOW - 86400 * 30, ends_at: NOW - 86400 * 20, last_seen_at: NOW - 86400 * 21, purchased: false },
        ],
        next_cursor: null,
      });
    render(<TrialsPage />);
    const linkA = await screen.findByRole("link", { name: shortHash(HASH_A) });
    expect(linkA.getAttribute("href")).toBe(`/devices/${HASH_A}`);
    expect(screen.getByRole("link", { name: shortHash(HASH_B) }).getAttribute("href")).toBe(`/devices/${HASH_B}`);
    const cell = (hash: string) => screen.getByRole("link", { name: shortHash(hash) }).closest("tr")?.lastElementChild?.textContent;
    expect(cell(HASH_A)).toBe("Đã mua");
    expect(cell(HASH_B)).toBe("Chưa");
  });
});
