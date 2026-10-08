import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fmtDateTime } from "../format";
import { getQueueCount } from "../queue-store";
import { QueuePage, ROWS_SHOWN } from "./QueuePage";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const empty = { count: 0, items: [] };
const summary = { revenue_today: 550000, currency: "VND", paid_orders_7d: 12, active_licenses: 87 };
const NONE = { needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function serve(queue: unknown) {
  const fetchMock = vi.fn(async (url: string) => json(url === "/admin/summary" ? summary : queue));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Dòng (li) chứa liên kết có tên cho trước. */
const rowOf = async (name: string) => (await screen.findByRole("link", { name })).closest("li") as HTMLElement;
/** Thẻ nhóm theo tiêu đề. */
const groupOf = (title: string) => screen.getByText(title).closest("section") as HTMLElement;

describe("QueuePage", () => {
  it("ba ô số và báo không có việc khi mọi nhóm rỗng, kèm lối sang Tổng quan", async () => {
    serve(NONE);
    render(<QueuePage />);
    expect(await screen.findByText("550.000 đ")).toBeTruthy();
    expect(screen.getByText("87")).toBeTruthy();
    // Đổi chủ ý: tiêu đề của trạng thái trống (EmptyState) không có dấu chấm cuối.
    expect(await screen.findByText("Không có việc gì cần xử lý")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Xem Tổng quan" }).getAttribute("href")).toBe("/overview");
    expect(screen.getByText("Đã xử lý hết")).toBeTruthy();
  });

  it("nhóm có việc thì hiện tiêu đề, số lượng, link tới đơn; nhóm rỗng thì ẩn", async () => {
    const order = { order_code: 1000012, email: "khach@example.com", amount: 500000, amount_paid: 500000, created_at: 1_790_812_800 };
    serve({ ...NONE, needs_review: { count: 21, items: [order] } });
    render(<QueuePage />);
    expect(await screen.findByText("Đã nhận tiền nhưng license đã thu hồi")).toBeTruthy();
    // Tiêu đề nhóm đọc kèm số việc; số trên chấm chỉ để nhìn.
    expect(screen.getByRole("heading", { name: "Đã nhận tiền nhưng license đã thu hồi, 21 việc" })).toBeTruthy();
    // Đổi chủ ý: mã đơn là chữ, liên kết là nút "Mở đơn" (tên đầy đủ kèm mã) phủ cả dòng.
    expect(screen.getByRole("link", { name: "Mở đơn #1000012" }).getAttribute("href")).toBe("/orders/1000012");
    expect(screen.getByText("Đơn #1000012")).toBeTruthy();
    expect(screen.getByText("và 20 mục khác")).toBeTruthy();
    expect(screen.queryByText("Chuyển thiếu trong 30 ngày")).toBeNull();
    expect(screen.getByText("21 việc đang chờ")).toBeTruthy();
  });

  it("'và N mục khác' là liên kết sang danh sách tương ứng; nhóm email (không có bộ lọc) và cảnh báo (nút ở đầu thẻ) thì là chữ", async () => {
    const order = (code: number) => ({ order_code: code, email: "khach@example.com", amount: 50000, amount_paid: 20000, created_at: 1_790_812_800 });
    const lic = (id: string) => ({ id, license_key: "AAAA-…-BBBB", email: null, plan: "monthly", expires_at: 1_800_000_000, created_at: 1, revoked_at: null, locked_at: 1_790_000_000, active_devices: 1 });
    serve({
      needs_review: { count: 3, items: [order(1)] },
      underpaid: { count: 4, items: [order(2)] },
      email_failed: { count: 5, items: [{ ...order(3), license_id: null, email_gave_up_at: null }] },
      locked: { count: 6, items: [lic("11111111-1111-4111-8111-111111111111")] },
      conflict: { count: 7, items: [lic("22222222-2222-4222-8222-222222222222")] },
      alerts: { count: 8, items: [{ kind: "cron_stalled", window_start: 1_790_812_800, count: 3, notified_count: 1 }] },
    });
    render(<QueuePage />);
    const more = async (text: string) => (await screen.findByText(text)).closest("a")?.getAttribute("href") ?? null;
    expect(await more("và 2 mục khác")).toBe("/orders?status=paid_needs_review");
    expect(await more("và 3 mục khác")).toBe("/orders?status=underpaid");
    expect(await more("và 4 mục khác")).toBeNull();
    expect(await more("và 5 mục khác")).toBe("/licenses?state=locked");
    expect(await more("và 6 mục khác")).toBe("/licenses?state=conflict");
    expect(await more("và 7 mục khác")).toBeNull();
    // Cảnh báo: lối sang Hệ thống là nút ở đầu thẻ.
    expect(screen.getByRole("link", { name: "Mở Hệ thống" }).getAttribute("href")).toBe("/system");
    expect(screen.getByRole("link", { name: "và 2 mục khác, mở danh sách đơn cần xử lý" })).toBeTruthy();
  });

  it("nhóm email: chưa có thời điểm thôi gửi thì nói chưa gửi được sau 24 giờ; có thì ghi giờ thôi gửi", async () => {
    const base = { email: "khach@example.com", amount: 50000, amount_paid: 50000, created_at: 1_790_812_800 };
    const gaveUp = 1_790_900_000;
    serve({
      ...NONE,
      email_failed: {
        count: 2,
        items: [
          { ...base, order_code: 1000020, license_id: "11111111-1111-4111-8111-111111111111", email_gave_up_at: null },
          { ...base, order_code: 1000021, license_id: "22222222-2222-4222-8222-222222222222", email_gave_up_at: gaveUp },
        ],
      },
    });
    render(<QueuePage />);
    const pending = (await rowOf("Mở license của đơn #1000020")).textContent ?? "";
    expect(pending).toContain("chưa gửi được sau 24 giờ");
    expect(pending).not.toContain("thôi gửi lúc");
    const gave = (await rowOf("Mở license của đơn #1000021")).textContent ?? "";
    expect(gave).toContain(`thôi gửi lúc ${fmtDateTime(gaveUp)}`);
    expect(gave).not.toContain("chưa gửi được sau 24 giờ");
  });

  it("nhóm email: có license_id thì link tới /licenses/:id, không có thì link tới /orders/:code", async () => {
    const LIC = "11111111-1111-4111-8111-111111111111";
    const base = { email: "khach@example.com", amount: 50000, amount_paid: 50000, created_at: 1_790_812_800, email_gave_up_at: null };
    serve({
      ...NONE,
      email_failed: {
        count: 2,
        items: [
          { ...base, order_code: 1000030, license_id: LIC },
          { ...base, order_code: 1000031, license_id: null },
        ],
      },
    });
    render(<QueuePage />);
    expect((await screen.findByRole("link", { name: "Mở license của đơn #1000030" })).getAttribute("href")).toBe(`/licenses/${LIC}`);
    expect(screen.getByRole("link", { name: "Mở đơn #1000031" }).getAttribute("href")).toBe("/orders/1000031");
    expect(screen.queryByRole("link", { name: "Mở đơn #1000030" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Mở license của đơn #1000031" })).toBeNull();
    // Nhóm email nằm trên nhóm chuyển thiếu, đều là tông nguy hiểm.
    expect(groupOf("Đã trả nhưng khách chưa nhận email key").className).toContain("tone-danger");
  });

  it("nhóm chuyển thiếu: link tới /orders/:code; số tiền đã trả trên số phải trả và số còn thiếu", async () => {
    const order = { order_code: 1000040, email: "khach@example.com", amount: 50000, amount_paid: 20000, created_at: 1_790_812_800 };
    serve({ ...NONE, underpaid: { count: 1, items: [order] } });
    render(<QueuePage />);
    const row = await rowOf("Mở đơn #1000040");
    expect(within(row).getByRole("link").getAttribute("href")).toBe("/orders/1000040");
    expect(row.textContent).toContain("20.000 đ / 50.000 đ");
    expect(row.textContent).toContain("thiếu 30.000 đ");
    expect(groupOf("Chuyển thiếu trong 30 ngày").className).toContain("tone-warn");
  });

  it("nhóm khóa tạm và xung đột máy: link tới /licenses/:id theo từng license", async () => {
    const L1 = "11111111-1111-4111-8111-111111111111";
    const L2 = "22222222-2222-4222-8222-222222222222";
    const lic = (id: string, key: string, locked_at: number | null) => ({
      id,
      license_key: key,
      email: "khach@example.com",
      plan: "monthly",
      expires_at: 1_800_000_000,
      created_at: 1_790_000_000,
      revoked_at: null,
      locked_at,
      active_devices: 2,
    });
    serve({
      ...NONE,
      locked: { count: 1, items: [lic(L1, "K7Q2-…-9XMB", 1_790_000_000)] },
      conflict: { count: 1, items: [lic(L2, "AAAA-…-GGGG", null)] },
    });
    render(<QueuePage />);
    // Đổi chủ ý: key che là chữ (code), liên kết là nút "Mở license" kèm key cho trình đọc màn hình.
    expect((await screen.findByRole("link", { name: "Mở license K7Q2-…-9XMB" })).getAttribute("href")).toBe(`/licenses/${L1}`);
    expect(screen.getByRole("link", { name: "Mở license AAAA-…-GGGG" }).getAttribute("href")).toBe(`/licenses/${L2}`);
    expect(screen.getByText("License đang khóa tạm")).toBeTruthy();
    expect(screen.getByText("License đang xung đột máy")).toBeTruthy();
    expect((await rowOf("Mở license K7Q2-…-9XMB")).textContent).toContain(`khóa lúc ${fmtDateTime(1_790_000_000)}`);
    expect((await rowOf("Mở license AAAA-…-GGGG")).textContent).toContain("2 máy đang kích hoạt");
  });

  it("dòng 'và N mục khác' chỉ có khi số lượng lớn hơn số dòng đã hiện, và N là hiệu của hai số đó", async () => {
    const order = (code: number) => ({ order_code: code, email: "khach@example.com", amount: 50000, amount_paid: 20000, created_at: 1_790_812_800 });
    serve({
      ...NONE,
      underpaid: { count: 2, items: [order(1000050), order(1000051)] }, // đủ dòng: không có "và … mục khác"
      alerts: { count: 7, items: [{ kind: "cron_stalled", window_start: 1_790_812_800, count: 3, notified_count: 1 }] },
    });
    render(<QueuePage />);
    expect(await screen.findByText("và 6 mục khác")).toBeTruthy();
    expect(screen.getAllByText(/mục khác/)).toHaveLength(1);
    expect(screen.getByText("Đơn #1000051")).toBeTruthy();
    expect(screen.getByText("cron_stalled")).toBeTruthy();
  });

  it("nhóm nhiều dòng: chỉ hiện vài dòng đầu, nút Hiện thêm mở hết và Thu gọn gấp lại", async () => {
    const order = (code: number) => ({ order_code: code, email: "khach@example.com", amount: 50000, amount_paid: 20000, created_at: 1_790_812_800 });
    const items = Array.from({ length: 20 }, (_, i) => order(1000100 + i));
    serve({ ...NONE, underpaid: { count: 23, items } });
    render(<QueuePage />);
    await screen.findByText("Đơn #1000100");
    const group = groupOf("Chuyển thiếu trong 30 ngày");
    expect(within(group).getAllByRole("listitem")).toHaveLength(ROWS_SHOWN);
    const toggle = within(group).getByRole("button", { name: `Hiện thêm ${20 - ROWS_SHOWN} dòng` });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(within(group).getAllByRole("listitem")).toHaveLength(20);
    expect(within(group).getByText("Đơn #1000119")).toBeTruthy();
    const collapse = within(group).getByRole("button", { name: "Thu gọn" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(collapse);
    expect(within(group).getAllByRole("listitem")).toHaveLength(ROWS_SHOWN);
    // "và 3 mục khác" vẫn là phần server chưa trả (23 − 20), không tính dòng đang gấp.
    expect(within(group).getByText("và 3 mục khác")).toBeTruthy();
  });

  it("chỉ hơn số dòng hiện sẵn một dòng thì không gấp", async () => {
    const order = (code: number) => ({ order_code: code, email: null, amount: 50000, amount_paid: 50000, created_at: 1_790_812_800 });
    serve({ ...NONE, needs_review: { count: ROWS_SHOWN + 1, items: Array.from({ length: ROWS_SHOWN + 1 }, (_, i) => order(1000200 + i)) } });
    render(<QueuePage />);
    await screen.findByText("Đơn #1000200");
    expect(within(groupOf("Đã nhận tiền nhưng license đã thu hồi")).getAllByRole("listitem")).toHaveLength(ROWS_SHOWN + 1);
    expect(screen.queryByRole("button", { name: /Hiện thêm/ })).toBeNull();
  });

  it("thời gian tương đối theo mốc tải, ngày giờ đầy đủ ở title và dateTime", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date((1_790_812_800 + 2 * 3600 + 30) * 1000));
    const order = { order_code: 1000060, email: "khach@example.com", amount: 50000, amount_paid: 50000, created_at: 1_790_812_800 };
    serve({ ...NONE, needs_review: { count: 1, items: [order] } });
    render(<QueuePage />);
    const row = await rowOf("Mở đơn #1000060");
    const time = row.querySelector("time") as HTMLTimeElement;
    expect(time.textContent).toBe("2 giờ trước");
    expect(time.getAttribute("title")).toBe(fmtDateTime(1_790_812_800));
    expect(time.getAttribute("dateTime")).toBe("2026-10-01T00:00:00.000Z");
    expect(screen.getByText("Cập nhật lúc 09:00")).toBeTruthy();
  });

  it("tải lần đầu: khung chờ có aria-busy (không còn chữ trần); tải xong thì hết", async () => {
    serve(NONE);
    const { container } = render(<QueuePage />);
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".q-skel")).toBeTruthy();
    await screen.findByText("Không có việc gì cần xử lý");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("Làm mới tải lại cả hàng đợi và số nhanh, mỗi thứ đúng một lần", async () => {
    const fetchMock = serve(NONE);
    render(<QueuePage />);
    await screen.findByText("Không có việc gì cần xử lý");
    const count = (url: string) => fetchMock.mock.calls.filter((c) => c[0] === url).length;
    expect(count("/admin/queue")).toBe(1);
    expect(count("/admin/summary")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(count("/admin/queue")).toBe(2));
    expect(count("/admin/summary")).toBe(2);
  });

  // Nút Làm mới bỏ qua lần bấm khi hàng đợi HAY số nhanh còn đang tải (loading của cả hai): phải đợi nút hết bận rồi mới
  // bấm, không thì lần bấm bị bỏ và test chập chờn theo tốc độ máy. Ca summaryDelay 30ms tái hiện chắc chắn điều đó.
  it.each([0, 30])("đẩy tổng số việc vào kho dùng chung sau mỗi lần tải (huy hiệu ở thanh bên); số nhanh về sau %ims", async (summaryDelay) => {
    let n = 0;
    const order = { order_code: 1, email: null, amount: 1, amount_paid: 1, created_at: 1 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/admin/summary") {
          if (summaryDelay) await new Promise((r) => setTimeout(r, summaryDelay));
          return json(summary);
        }
        n++;
        return json(n === 1 ? { ...NONE, underpaid: { count: 4, items: [order] }, alerts: { count: 2, items: [] } } : NONE);
      }),
    );
    render(<QueuePage />);
    await screen.findByText("6 việc đang chờ");
    // Số vào kho qua effect (chạy sau lần vẽ): phải đợi, không đọc ngay (CI chậm hơn máy dev).
    await waitFor(() => expect(getQueueCount()).toBe(6));
    const reload = screen.getByRole("button", { name: "Làm mới" });
    await waitFor(() => expect(reload.getAttribute("aria-busy")).toBeNull());
    fireEvent.click(reload);
    await screen.findByText("Không có việc gì cần xử lý");
    await waitFor(() => expect(getQueueCount()).toBe(0));
  });

  it("lỗi hàng đợi: hộp lỗi có Thử lại; số nhanh vẫn hiện", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/admin/summary") return json(summary);
        return n++ === 0 ? json({ error: "internal" }, 500) : json(NONE);
      }),
    );
    render(<QueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Không tải được hàng đợi");
    expect(screen.getByText("550.000 đ")).toBeTruthy();
    expect(getQueueCount()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có việc gì cần xử lý")).toBeTruthy();
  });
});

describe("QueuePage: số có dấu ngăn nghìn", () => {
  it("số lần của cảnh báo: 1234 thành 1.234 lần", async () => {
    serve({ ...NONE, alerts: { count: 1, items: [{ kind: "cron_stalled", window_start: 1_790_812_800, count: 1234, notified_count: 1 }] } });
    render(<QueuePage />);
    expect(await screen.findByText("1.234 lần")).toBeTruthy();
    expect(screen.queryByText("1234 lần")).toBeNull();
  });
});
