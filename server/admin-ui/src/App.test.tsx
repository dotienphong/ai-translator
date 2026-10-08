import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, COLLAPSED_KEY } from "./App";

// Recharts thật không chạy trong jsdom; trang Tổng quan chỉ cần ChartCard giả để kiểm khung.
vi.mock("./components/ChartCard", () => ({ ChartCard: ({ title }: { title: string }) => <div>{title}</div> }));

const empty = { count: 0, items: [] };
const responses: Record<string, unknown> = {
  "/admin/whoami": { operator: "ops@example.com" },
  "/admin/queue": { needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty },
  "/admin/summary": { revenue_today: 0, currency: "VND", paid_orders_7d: 0, active_licenses: 0 },
  "/admin/orders": { items: [], next_cursor: null },
  "/admin/alerts": { items: [], total: 0, pending: 0 },
  "/admin/releases": { base_url: "https://releases.example.com", channels: { stable: { status: "missing" }, beta: { status: "missing" } }, models: { status: "missing" } },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = responses[url.split("?")[0] ?? ""];
      return new Response(JSON.stringify(body ?? { error: "not_found" }), {
        status: body ? 200 : 404,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("mở đầu ở Việc cần xử lý, hiện email người vận hành; bấm thanh bên thì đổi trang", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Việc cần xử lý" })).toBeTruthy();
    expect(await screen.findByText("ops@example.com")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Đơn hàng" }));
    expect(window.location.pathname).toBe("/orders");
    expect(await screen.findByRole("heading", { name: "Đơn hàng" })).toBeTruthy();
  });

  it("mục Tổng quan bấm được: đổi sang /overview, nạp trang tải lười và đánh dấu mục đang chọn", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const link = screen.getByRole("link", { name: "Tổng quan" });
    expect(link.getAttribute("href")).toBe("/overview");
    expect(screen.queryByText("sắp có")).toBeNull();
    await user.click(link);
    expect(window.location.pathname).toBe("/overview");
    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tổng quan" }).className).toContain("active");
  });

  it("thanh bên chia ba nhóm Vận hành, Dữ liệu, Hệ thống; mục Hệ thống nằm trong nhóm Hệ thống, bấm thì sang /system", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const nav = within(screen.getByRole("navigation", { name: "Điều hướng" }));
    expect(nav.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Việc cần xử lý",
      "Tổng quan",
      "Đơn hàng",
      "License",
      "Máy & dùng thử",
      "Nhật ký",
      "Hệ thống",
      "Công cụ",
    ]);
    for (const group of ["Vận hành", "Dữ liệu", "Hệ thống"]) expect(nav.getByRole("list", { name: group })).toBeTruthy();
    const system = within(nav.getByRole("list", { name: "Hệ thống" }));
    expect(system.getAllByRole("link").map((a) => a.textContent)).toEqual(["Nhật ký", "Hệ thống", "Công cụ"]);
    const link = nav.getByRole("link", { name: "Hệ thống" });
    expect(link.getAttribute("href")).toBe("/system");
    await user.click(link);
    expect(window.location.pathname).toBe("/system");
    expect(await screen.findByRole("heading", { name: "Hệ thống" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "Hệ thống" }).className).toContain("active");
    expect(nav.getByRole("link", { name: "Hệ thống" }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: "Việc cần xử lý" }).getAttribute("aria-current")).toBeNull();
  });

  it("phiên Access hết hạn: hiện thanh báo có nút tải lại", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }) as Response));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Tải lại trang" })).toBeTruthy();
  });
});

describe("khung trang", () => {
  const queueWithWork = {
    ...(responses["/admin/queue"] as object),
    underpaid: { count: 2, items: [] },
    locked: { count: 1, items: [] },
  };

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("drawer-open");
  });

  function stubQueue(body: unknown, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.split("?")[0] ?? "";
        const b = path === "/admin/queue" ? body : responses[path];
        const st = path === "/admin/queue" ? status : b ? 200 : 404;
        return new Response(JSON.stringify(b ?? { error: "not_found" }), { status: st, headers: { "content-type": "application/json" } });
      }),
    );
  }

  it("huy hiệu số việc cần xử lý ở thanh bên: tổng các nhóm, đọc được bằng trình đọc màn hình", async () => {
    stubQueue(queueWithWork);
    render(<App />);
    const nav = within(screen.getByRole("navigation", { name: "Điều hướng" }));
    expect(await nav.findByRole("link", { name: "Việc cần xử lý, 3 việc" })).toBeTruthy();
    expect(nav.getByText("3", { selector: ".nav-count" }).getAttribute("aria-hidden")).toBe("true");
  });

  it("Làm mới ở trang Việc cần xử lý cập nhật huy hiệu thanh bên (không cần mở lại App)", async () => {
    let body: unknown = queueWithWork;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.split("?")[0] ?? "";
        const b = path === "/admin/queue" ? body : responses[path];
        return new Response(JSON.stringify(b ?? { error: "not_found" }), { status: b ? 200 : 404, headers: { "content-type": "application/json" } });
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    const nav = within(screen.getByRole("navigation", { name: "Điều hướng" }));
    expect(await nav.findByRole("link", { name: "Việc cần xử lý, 3 việc" })).toBeTruthy();
    body = { ...queueWithWork, conflict: { count: 4, items: [] } };
    await user.click(await screen.findByRole("button", { name: "Làm mới" }));
    expect(await nav.findByRole("link", { name: "Việc cần xử lý, 7 việc" })).toBeTruthy();
    body = responses["/admin/queue"];
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(await nav.findByRole("link", { name: "Việc cần xử lý" })).toBeTruthy();
    expect(document.querySelector(".nav-count")).toBeNull();
  });

  it("tải số việc lỗi: không hiện huy hiệu, không hiện hộp lỗi ở thanh bên", async () => {
    stubQueue({ error: "internal" }, 500);
    render(<App />);
    await screen.findByText("ops@example.com");
    const nav = within(screen.getByRole("navigation", { name: "Điều hướng" }));
    await screen.findAllByRole("alert"); // hộp lỗi của trang Việc cần xử lý (không phải của thanh bên)
    expect(nav.getByRole("link", { name: "Việc cần xử lý" })).toBeTruthy();
    expect(document.querySelector(".nav-count")).toBeNull();
    expect(nav.queryByRole("alert")).toBeNull();
  });

  it("thu gọn thanh bên: đổi lớp của khung, nhớ vào localStorage, mở lại vẫn thu gọn", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    expect(container.querySelector(".app")?.className).not.toContain("is-collapsed");
    await user.click(screen.getByRole("button", { name: "Thu gọn thanh bên" }));
    expect(container.querySelector(".app")?.className).toContain("is-collapsed");
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe("1");
    unmount();
    const again = render(<App />);
    expect(again.container.querySelector(".app")?.className).toContain("is-collapsed");
    await user.click(screen.getByRole("button", { name: "Mở rộng thanh bên" }));
    expect(again.container.querySelector(".app")?.className).not.toContain("is-collapsed");
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe("0");
  });

  it("localStorage bị chặn (ném lỗi): khung vẫn chạy, thu gọn vẫn bấm được", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    await user.click(screen.getByRole("button", { name: "Thu gọn thanh bên" }));
    expect(container.querySelector(".app")?.className).toContain("is-collapsed");
    get.mockRestore();
    set.mockRestore();
  });

  it("ngăn kéo: nút menu mở, focus vào nút Đóng, khóa cuộn nền, phần còn lại inert; Esc đóng và trả focus về nút menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const menu = screen.getByRole("button", { name: "Mở menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    await user.click(menu);
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(within(drawer).getByRole("button", { name: "Đóng menu" }));
    expect(document.documentElement.classList.contains("drawer-open")).toBe(true);
    expect(container.querySelector(".app-body")?.hasAttribute("inert")).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.documentElement.classList.contains("drawer-open")).toBe(false);
    expect(container.querySelector(".app-body")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(menu);
  });

  it("ngăn kéo: chạm lớp phủ hay nút Đóng thì đóng và trả focus về nút menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const menu = screen.getByRole("button", { name: "Mở menu" });
    await user.click(menu);
    await user.click(container.querySelector(".scrim") as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(menu);
    await user.click(menu);
    await user.click(screen.getByRole("button", { name: "Đóng menu" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it("ngăn kéo: focus không thoát ra ngoài: Shift+Tab ở phần tử đầu sang mục cuối, Tab ở mục cuối về đầu", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    await user.click(screen.getByRole("button", { name: "Mở menu" }));
    const drawer = within(screen.getByRole("dialog", { name: "Menu" }));
    const brand = drawer.getByRole("link", { name: "AI Translator Admin" });
    const last = drawer.getByRole("link", { name: "Công cụ" });
    await user.tab({ shift: true }); // từ nút Đóng (focus khi mở) về logo, phần tử đầu
    expect(document.activeElement).toBe(brand);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(brand);
  });

  it("đổi trang từ ngăn kéo: đóng ngăn kéo, focus vào nội dung, đọc tên trang mới, đổi tiêu đề tab", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    expect(document.title).toBe("Việc cần xử lý · AI Translator Admin");
    await user.click(screen.getByRole("button", { name: "Mở menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Đơn hàng" }));
    expect(window.location.pathname).toBe("/orders");
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(screen.getByText("Đã mở trang Đơn hàng").getAttribute("aria-live")).toBe("polite");
    expect(document.title).toBe("Đơn hàng · AI Translator Admin");
  });

  it("lần vẽ đầu không cướp focus; đổi trang bằng thanh bên thì focus vào main", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const main = screen.getByRole("main");
    expect(main.id).toBe("noi-dung");
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).not.toBe(main);
    await user.click(screen.getByRole("link", { name: "License" }));
    expect(document.activeElement).toBe(main);
  });

  it("liên kết Bỏ qua tới nội dung là phần tử đầu tiên khi Tab, bấm thì focus vào main", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    await user.tab();
    const skip = screen.getByRole("link", { name: "Bỏ qua tới nội dung" });
    expect(document.activeElement).toBe(skip);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(window.location.hash).toBe("");
  });
});
