import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortHash } from "../format";
import { TrialsPage } from "./TrialsPage";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
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

  // Lọc dùng thử là công tắc nhiều lựa chọn (radiogroup "Dùng thử") thay cho ô chọn cũ; tham số `state` và số lần gọi không đổi.
  it("đổi lọc dùng thử: gọi lại với state=active, state=ended; về Tất cả thì bỏ tham số", async () => {
    render(<TrialsPage />);
    await screen.findByText("Chưa có máy nào dùng thử");
    expect(screen.getByRole("radiogroup", { name: "Dùng thử" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Đang dùng thử" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/trials?state=active"));
    fireEvent.click(screen.getByRole("radio", { name: "Đã kết thúc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/trials?state=ended"));
    // Đang lọc mà rỗng: tiêu đề khác, có nút xóa bộ lọc.
    expect(await screen.findByText("Không có máy nào")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/trials"));
    expect(urls).toHaveLength(4);
  });

  it("mỗi dòng link tới trang máy theo mã băm đầy đủ; cột Trạng thái: Đã mua, Chưa mua (còn dùng thử), Hết hạn", async () => {
    // Nhãn "Chưa" cũ tách thành "Chưa mua" (còn dùng thử) và "Hết hạn" (hết dùng thử mà chưa mua).
    page = () =>
      json({
        items: [
          { device_id_hash: HASH_A, started_at: NOW - 86400 * 3, ends_at: NOW + 86400 * 7, last_seen_at: NOW - 60, purchased: true },
          { device_id_hash: HASH_B, started_at: NOW - 86400 * 30, ends_at: NOW - 86400 * 20, last_seen_at: NOW - 86400 * 21, purchased: false },
          { device_id_hash: HASH_C, started_at: NOW - 86400, ends_at: NOW + 86400 * 9, last_seen_at: NOW - 600, purchased: false },
        ],
        next_cursor: null,
      });
    render(<TrialsPage />);
    const linkA = await screen.findByRole("link", { name: shortHash(HASH_A) });
    expect(linkA.getAttribute("href")).toBe(`/devices/${HASH_A}`);
    expect(screen.getByRole("link", { name: shortHash(HASH_B) }).getAttribute("href")).toBe(`/devices/${HASH_B}`);
    const cell = (hash: string) => screen.getByRole("link", { name: shortHash(hash) }).closest("tr")?.lastElementChild?.textContent;
    expect(cell(HASH_A)).toBe("Đã mua");
    expect(cell(HASH_B)).toBe("Hết hạn");
    expect(cell(HASH_C)).toBe("Chưa mua");
    await waitFor(() => expect(document.querySelector(".filterbar-count")?.textContent).toBe("3 máy"));
  });

  it("bấm vào hàng (ngoài liên kết) mở trang máy; đang bôi chọn chữ thì không", async () => {
    page = () =>
      json({
        items: [{ device_id_hash: HASH_A, started_at: NOW - 86400 * 3, ends_at: NOW + 86400 * 7, last_seen_at: NOW - 60, purchased: true }],
        next_cursor: null,
      });
    render(<TrialsPage />);
    const row = (await screen.findByRole("link", { name: shortHash(HASH_A) })).closest("tr") as HTMLElement;
    const badge = within(row).getByText("Đã mua");
    const sel = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "3fa1" } as Selection);
    fireEvent.click(badge);
    expect(window.location.pathname).toBe("/");
    sel.mockRestore();
    fireEvent.click(badge);
    expect(window.location.pathname).toBe(`/devices/${HASH_A}`);
    window.history.replaceState(null, "", "/");
  });
});
