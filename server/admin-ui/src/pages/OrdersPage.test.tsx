import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "./OrdersPage";

const RANGE_ERROR = "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc";

let urls: string[];

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const setDate = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("OrdersPage: khoảng ngày", () => {
  it("ngày bắt đầu sau ngày kết thúc: không gọi API, hiện thông báo; sửa lại thì gọi và thông báo mất", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders"]);
    setDate("Tạo từ ngày", "2026-10-05");
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders", "/admin/orders?from=2026-10-05"]);

    setDate("Đến ngày", "2026-10-01");
    expect((await screen.findByRole("alert")).textContent).toBe(RANGE_ERROR);
    expect(urls).toEqual(["/admin/orders", "/admin/orders?from=2026-10-05"]);

    setDate("Đến ngày", "2026-10-06");
    await screen.findByText("Không có đơn nào");
    expect(urls.at(-1)).toBe("/admin/orders?from=2026-10-05&to=2026-10-06");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cùng một ngày thì hợp lệ", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    setDate("Tạo từ ngày", "2026-10-05");
    setDate("Đến ngày", "2026-10-05");
    await screen.findByText("Không có đơn nào");
    expect(urls.at(-1)).toBe("/admin/orders?from=2026-10-05&to=2026-10-05");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("OrdersPage: bộ lọc vào query", () => {
  it("đổi Trạng thái, Gói, ngày: gọi lại /admin/orders đúng query; về Tất cả thì bỏ tham số đó", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders"]);

    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "paid_needs_review" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "yearly" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review&plan=yearly"));
    setDate("Tạo từ ngày", "2026-10-01");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review&plan=yearly&from=2026-10-01"));
    setDate("Đến ngày", "2026-10-31");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review&plan=yearly&from=2026-10-01&to=2026-10-31"));

    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?plan=yearly&from=2026-10-01&to=2026-10-31"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "monthly" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?plan=monthly&from=2026-10-01&to=2026-10-31"));
    expect(urls).toHaveLength(7);
  });

  it("khoảng ngày ngược: bảng ẩn đi (không hiện kết quả của khoảng khác), sửa lại thì bảng về", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    setDate("Tạo từ ngày", "2026-10-05");
    setDate("Đến ngày", "2026-10-01");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Không có đơn nào")).toBeNull();
    setDate("Đến ngày", "2026-10-09");
    expect(await screen.findByText("Không có đơn nào")).toBeTruthy();
  });
});

describe("OrdersPage: bộ lọc trạng thái từ URL", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("?status=underpaid: lần gọi đầu đã lọc và ô chọn hiện đúng trạng thái", async () => {
    window.history.replaceState(null, "", "/orders?status=underpaid");
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders?status=underpaid"]);
    expect((screen.getByLabelText("Trạng thái") as HTMLSelectElement).value).toBe("underpaid");
  });

  it("giá trị lạ hay rỗng thì bỏ qua, không lọc", async () => {
    for (const q of ["?status=khong-co", "?status=", "?plan=yearly", "?status=constructor", "?status=__proto__"]) {
      urls.length = 0;
      window.history.replaceState(null, "", `/orders${q}`);
      const { unmount } = render(<OrdersPage />);
      await screen.findByText("Không có đơn nào");
      expect(urls, q).toEqual(["/admin/orders"]);
      unmount();
    }
  });
});

const NOW = Math.floor(Date.now() / 1000);
const orderRow = (code: number, over: Record<string, unknown> = {}) => ({
  order_code: code,
  provider: "payos",
  plan: "yearly",
  amount: 500000,
  amount_paid: 500000,
  currency: "VND",
  email: "khach@example.com",
  status: "paid",
  grant_kind: "new",
  license_id: null,
  renew_license_id: null,
  created_at: NOW - 3600,
  paid_at: NOW - 3500,
  email_sent_at: null,
  email_gave_up_at: null,
  ...over,
});
const count = () => document.querySelector(".filterbar-count")?.textContent;

describe("OrdersPage: chip lọc, trạng thái rỗng, đếm, Tải thêm", () => {
  function serve(handler: (url: string) => Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return handler(url);
      }),
    );
  }
  const page = (items: unknown[], next: string | null) =>
    new Response(JSON.stringify({ items, next_cursor: next }), { status: 200, headers: { "content-type": "application/json" } });

  it("không lọc mà rỗng: gợi ý nguồn dữ liệu, không nút xóa; có lọc mà rỗng: gợi ý không khớp và nút Xóa bộ lọc bỏ mọi lọc", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(screen.getByText(/Đơn mới hiện ở đây/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc" })).toBeNull();
    expect(count()).toBe("0 đơn");

    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "underpaid" } });
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "monthly" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=underpaid&plan=monthly"));
    expect(await screen.findByText(/Không có đơn khớp bộ lọc/)).toBeTruthy();
    const chips = screen.getByRole("list", { name: "Bộ lọc đang bật" });
    expect(chips.textContent).toContain("Trạng thái: Chuyển thiếu");
    expect(chips.textContent).toContain("Gói: Monthly");

    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc Trạng thái: Chuyển thiếu" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?plan=monthly"));
    expect((screen.getByLabelText("Trạng thái") as HTMLSelectElement).value).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders"));
    expect(screen.queryByRole("list", { name: "Bộ lọc đang bật" })).toBeNull();
  });

  it("chip ngày hiện dd/mm/yyyy; khoảng ngược thì không đếm, có nút Bỏ khoảng ngày", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    setDate("Tạo từ ngày", "2026-10-05");
    setDate("Đến ngày", "2026-10-01");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Bộ lọc đang bật" }).textContent).toContain("Từ ngày: 05/10/2026");
    expect(count()).toBeUndefined();
    expect((screen.getByLabelText("Tạo từ ngày") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
    const calls = urls.length;
    fireEvent.click(screen.getByRole("button", { name: "Bỏ khoảng ngày" }));
    await screen.findByText("Không có đơn nào");
    expect(urls.slice(calls)).toEqual(["/admin/orders"]);
  });

  it("còn trang sau: đếm '50+'; Tải thêm gửi con trỏ, nối dòng, hết trang thì đếm đúng số và nút mất", async () => {
    const first = Array.from({ length: 50 }, (_, i) => orderRow(1000100 - i));
    serve((url) => (url.includes("cursor=") ? page([orderRow(1000010, { status: "underpaid", amount_paid: 200000 })], null) : page(first, "c50")));
    render(<OrdersPage />);
    await screen.findByRole("link", { name: "#1000100" });
    await waitFor(() => expect(count()).toBe("50+ đơn"));
    expect(screen.getByText("Đang hiện 50 đơn mới nhất")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm" }));
    await screen.findByRole("link", { name: "#1000010" });
    expect(urls).toEqual(["/admin/orders", "/admin/orders?cursor=c50"]);
    await waitFor(() => expect(count()).toBe("51 đơn"));
    expect(screen.queryByRole("button", { name: "Tải thêm" })).toBeNull();
    // Đơn chuyển thiếu: số đã trả trên số cần trả, phần thiếu.
    const row = screen.getByRole("link", { name: "#1000010" }).closest("tr") as HTMLElement;
    expect(row.textContent).toContain("200.000 đ / 500.000 đ");
    expect(row.textContent).toContain("thiếu 300.000 đ");
    expect(row.querySelector(".row-flag.tone-warn")).toBeTruthy();
  });

  it("lỗi tải: hộp lỗi có Thử lại, không hiện bảng rỗng hay dòng đếm; Thử lại gọi lại", async () => {
    let fail = true;
    serve(() => (fail ? new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: { "content-type": "application/json" } }) : page([orderRow(1000001)], null)));
    render(<OrdersPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Không tải được danh sách đơn");
    expect(screen.queryByText("Không có đơn nào")).toBeNull();
    expect(count()).toBeUndefined();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("link", { name: "#1000001" })).toBeTruthy();
    expect(urls).toEqual(["/admin/orders", "/admin/orders"]);
  });
});

describe("OrdersPage: giờ cập nhật", () => {
  it("tải xong thì có 'Cập nhật lúc'", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(await screen.findByText(/^Cập nhật lúc \d\d:\d\d$/)).toBeTruthy();
  });

  it("lần tải lỗi: không ghi giờ cập nhật", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: { "content-type": "application/json" } })),
    );
    render(<OrdersPage />);
    await screen.findByRole("alert");
    expect(screen.queryByText(/Cập nhật lúc/)).toBeNull();
  });
});
