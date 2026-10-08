import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertRowFull, AlertsResponse, ChannelInfo, ModelFile, ModelsInfo, ReleasesResponse } from "../api/types";
import { SystemPage } from "./SystemPage";

/** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 GMT+7. */
const T0 = 1_790_812_800;
const HOUR = 3600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const alertRow = (over: Partial<AlertRowFull> = {}): AlertRowFull => ({
  kind: "reconcile_failed",
  window_start: T0,
  count: 2,
  notified_count: 2,
  notified_at: T0 + 60,
  ...over,
});

const stable: ChannelInfo = {
  version: "0.4.2",
  pub_date: "2026-10-01T00:00:00Z",
  notes: "Sửa lỗi thanh phụ đề",
  platforms: ["darwin-aarch64", "windows-x86_64"],
};

const file = (over: Partial<ModelFile> = {}): ModelFile => ({
  id: "whisper-small",
  kind: "asr",
  version: "1",
  bytes: 574041195,
  tier: "free",
  min_app_version: "0.3.0",
  ...over,
});

const models: ModelsInfo = {
  sequence: 7,
  published_at: "2026-10-01T00:00:00Z",
  kid: "k2026-1",
  packs: ["base"],
  files: [file(), file({ id: "nllb-600m", kind: "mt", version: "2", bytes: 1024 * 1024, tier: "pro", min_app_version: "0.4.0" })],
};

function alerts(over: Partial<AlertsResponse> = {}): AlertsResponse {
  return { items: [], total: 0, pending: 0, ...over };
}

function releases(over: Partial<ReleasesResponse> = {}): ReleasesResponse {
  return {
    base_url: "https://releases.example.com",
    channels: { stable: { status: "ok", ...stable }, beta: { status: "ok", ...stable, version: "0.5.0-beta.1" } },
    models: { status: "ok", ...models },
    ...over,
  };
}

interface Reply {
  body: unknown;
  status?: number;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mock fetch theo URL: mỗi nguồn trả đúng trả lời của nó; đếm số lần gọi từng URL. */
function serve(a: Reply | AlertsResponse = alerts(), r: Reply | ReleasesResponse = releases()) {
  const wrap = (x: Reply | AlertsResponse | ReleasesResponse): Reply => ("body" in x ? (x as Reply) : { body: x });
  const replies: Record<string, Reply> = { "/admin/alerts": wrap(a), "/admin/releases": wrap(r) };
  const fetchMock = vi.fn(async (url: string) => {
    const rep = replies[url];
    return rep ? json(rep.body, rep.status ?? 200) : json({ error: "not_found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  const count = (url: string) => fetchMock.mock.calls.filter((c) => c[0] === url).length;
  return { fetchMock, count };
}

const section = (heading: string) => screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement;
const card = (name: string) => screen.getByRole("heading", { name }).closest(".panel") as HTMLElement;

describe("SystemPage: khung và cảnh báo vận hành", () => {
  it("tiêu đề, ba mục, gọi đúng hai API", async () => {
    const { count } = serve();
    render(<SystemPage />);
    expect(screen.getByRole("heading", { name: "Hệ thống", level: 1 })).toBeTruthy();
    await screen.findByText("Chưa có cảnh báo nào");
    expect(screen.getByRole("heading", { name: "Cảnh báo vận hành" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bản phát hành app" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Model" })).toBeTruthy();
    expect(count("/admin/alerts")).toBe(1);
    expect(count("/admin/releases")).toBe(1);
  });

  it("rỗng: 'Chưa có cảnh báo nào', không có bảng, vẫn có chú thích cron", async () => {
    serve(alerts());
    render(<SystemPage />);
    const s = await waitFor(() => {
      const el = section("Cảnh báo vận hành");
      expect(within(el).getByText("Chưa có cảnh báo nào")).toBeTruthy();
      return el;
    });
    expect(within(s).queryByRole("table")).toBeNull();
    expect(within(s).getByText("0 dòng, 0 chưa báo")).toBeTruthy();
    expect(within(s).getByText("Cron gửi email cảnh báo mỗi giờ")).toBeTruthy();
  });

  it("nhiều dòng: từng cột đúng, Chưa báo (count > notified_count) và Đã báo", async () => {
    serve(
      alerts({
        items: [
          alertRow({ kind: "d1_errors", window_start: T0 + 2 * HOUR, count: 5, notified_count: 3, notified_at: T0 }),
          alertRow({ kind: "payos_down", window_start: T0 + HOUR, count: 1, notified_count: 0, notified_at: null }),
          alertRow({ kind: "reconcile_failed", window_start: T0, count: 2, notified_count: 2 }),
        ],
        total: 3,
        pending: 2,
      }),
    );
    render(<SystemPage />);
    await screen.findByText("2 chưa báo", { exact: false });
    const s = section("Cảnh báo vận hành");
    expect(within(s).getByText("3 dòng, 2 chưa báo")).toBeTruthy();
    const heads = within(s)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(heads).toEqual(["Loại", "Từ giờ", "Số lần", "Đã báo", "Trạng thái"]);
    const rows = within(s).getAllByRole("row").slice(1);
    const cells = rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([
      ["d1_errors", "01/10/2026 09:00", "5", "3", "Chưa báo"],
      ["payos_down", "01/10/2026 08:00", "1", "0", "Chưa báo"],
      ["reconcile_failed", "01/10/2026 07:00", "2", "2", "Đã báo"],
    ]);
    // Loại nằm trong <code>; trạng thái là Badge đúng tông.
    expect(rows[0]?.querySelector("td code")?.textContent).toBe("d1_errors");
    expect(within(rows[0] as HTMLElement).getByText("Chưa báo").className).toContain("badge-warn");
    expect(within(rows[2] as HTMLElement).getByText("Đã báo").className).toContain("badge-ok");
    expect(within(s).queryByText("hiện", { exact: false })).toBeNull();
  });

  it("total lớn hơn số dòng trả về: ghi rõ chỉ hiện các dòng mới nhất", async () => {
    serve(alerts({ items: [alertRow(), alertRow({ kind: "b" })], total: 250, pending: 4 }));
    render(<SystemPage />);
    await screen.findByText("250 dòng, 4 chưa báo (hiện 2 dòng mới nhất)");
  });

  it("kind có <script> hiện như văn bản, không tạo phần tử script", async () => {
    serve(alerts({ items: [alertRow({ kind: "<script>window.hacked=1</script>" })], total: 1 }));
    const { container } = render(<SystemPage />);
    await screen.findByText("<script>window.hacked=1</script>");
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("SystemPage: bản phát hành app", () => {
  it("stable ok: phiên bản, ngày GMT+7, nền tảng nối dấu phẩy, ghi chú", async () => {
    serve(alerts(), releases());
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    const c = card("Stable");
    expect(within(c).getByText("0.4.2")).toBeTruthy();
    expect(within(c).getByText("01/10/2026 07:00")).toBeTruthy();
    expect(within(c).getByText("darwin-aarch64, windows-x86_64")).toBeTruthy();
    expect(within(c).getByText("Sửa lỗi thanh phụ đề")).toBeTruthy();
    expect(within(card("Beta")).getByText("0.5.0-beta.1")).toBeTruthy();
  });

  it("stable ok và beta missing: 'Chưa có bản nào' chỉ ở Beta", async () => {
    serve(alerts(), releases({ channels: { stable: { status: "ok", ...stable }, beta: { status: "missing" } } }));
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    expect(within(card("Beta")).getByText("Chưa có bản nào")).toBeTruthy();
    expect(within(card("Stable")).queryByText("Chưa có bản nào")).toBeNull();
  });

  it("một kênh error: 'Không đọc được (lý do)' với mã server trả; kênh kia vẫn hiện", async () => {
    serve(alerts(), releases({ channels: { stable: { status: "ok", ...stable }, beta: { status: "error", reason: "http_500" } } }));
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    expect(within(card("Beta")).getByText("Không đọc được (http_500)")).toBeTruthy();
  });

  it("network là một lý do hợp lệ", async () => {
    serve(alerts(), releases({ channels: { stable: { status: "error", reason: "network" }, beta: { status: "missing" } } }));
    render(<SystemPage />);
    await screen.findByText("Không đọc được (network)");
  });

  it("pub_date null thì '—'; notes rỗng thì 'Không có ghi chú'", async () => {
    serve(alerts(), releases({ channels: { stable: { status: "ok", ...stable, pub_date: null, notes: "" }, beta: { status: "missing" } } }));
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    const c = card("Stable");
    expect(within(c).getByText("—")).toBeTruthy();
    expect(within(c).getByText("Không có ghi chú")).toBeTruthy();
  });

  it("pub_date không parse được thì hiện nguyên chuỗi", async () => {
    serve(alerts(), releases({ channels: { stable: { status: "ok", ...stable, pub_date: "hôm qua" }, beta: { status: "missing" } } }));
    render(<SystemPage />);
    await screen.findByText("hôm qua");
  });

  it("ghi chú và phiên bản có <script> hiện như văn bản", async () => {
    serve(alerts(), releases({ channels: { stable: { status: "ok", ...stable, version: "<b>1</b>", notes: "<script>x()</script>" }, beta: { status: "missing" } } }));
    const { container } = render(<SystemPage />);
    await screen.findByText("<script>x()</script>");
    expect(screen.getByText("<b>1</b>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("SystemPage: model", () => {
  it("ok: tóm tắt (sequence, ngày đăng GMT+7, kid trong code, số file, tổng dung lượng) và bảng file", async () => {
    serve(alerts(), releases());
    render(<SystemPage />);
    await screen.findByText("whisper-small");
    const s = section("Model");
    expect(within(s).getByText(/Bản manifest số 7/)).toBeTruthy();
    expect(within(s).getByText(/đăng lúc 01\/10\/2026 07:00/)).toBeTruthy();
    expect(within(s).getByText("k2026-1").tagName).toBe("CODE");
    expect(within(s).getByText(/2 file/)).toBeTruthy();
    // 574041195 + 1048576 = 575089771 byte
    expect(within(s).getByText(/tổng 548,4 MB/)).toBeTruthy();
    const heads = within(s)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(heads).toEqual(["Id", "Loại", "Phiên bản", "Dung lượng", "Gói", "Cần app từ bản"]);
    const rows = within(s).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["whisper-small", "asr", "1", "547,4 MB", "free", "0.3.0"],
      ["nllb-600m", "mt", "2", "1 MB", "pro", "0.4.0"],
    ]);
  });

  it("published_at không parse được thì hiện chuỗi gốc", async () => {
    serve(alerts(), releases({ models: { status: "ok", ...models, published_at: "không rõ" } }));
    render(<SystemPage />);
    await screen.findByText(/đăng lúc không rõ/);
  });

  it("không có file: tổng 0 B, không có bảng", async () => {
    serve(alerts(), releases({ models: { status: "ok", ...models, files: [] } }));
    render(<SystemPage />);
    await screen.findByText(/0 file/);
    const s = section("Model");
    expect(within(s).getByText(/tổng 0 B/)).toBeTruthy();
    expect(within(s).queryByRole("table")).toBeNull();
  });

  it("missing: 'Chưa có bản nào'", async () => {
    serve(alerts(), releases({ models: { status: "missing" } }));
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    expect(within(section("Model")).getByText("Chưa có bản nào")).toBeTruthy();
  });

  it("error: 'Không đọc được (invalid_shape)'", async () => {
    serve(alerts(), releases({ models: { status: "error", reason: "invalid_shape" } }));
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    expect(within(section("Model")).getByText("Không đọc được (invalid_shape)")).toBeTruthy();
  });

  it("id và kid có <script> hiện như văn bản", async () => {
    serve(alerts(), releases({ models: { status: "ok", ...models, kid: "<script>k()</script>", files: [file({ id: "<script>i()</script>" })] } }));
    const { container } = render(<SystemPage />);
    await screen.findByText("<script>i()</script>");
    expect(screen.getByText("<script>k()</script>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
  });

  it("chú thích cuối trang", async () => {
    serve();
    render(<SystemPage />);
    await screen.findByText("whisper-small");
    expect(screen.getByText("Chỉ đọc từ URL công khai, không kiểm chữ ký; chữ ký do app kiểm.")).toBeTruthy();
  });
});

describe("SystemPage: lỗi và Làm mới", () => {
  it("alerts lỗi HTTP 500: hộp lỗi riêng cho cảnh báo, bản phát hành và model vẫn hiện", async () => {
    serve({ body: { error: "internal" }, status: 500 }, releases());
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    const s = section("Cảnh báo vận hành");
    expect(within(s).getByRole("alert").textContent).toContain("Lỗi máy chủ");
    expect(within(s).getByRole("button", { name: "Thử lại" })).toBeTruthy();
    expect(within(section("Model")).getByText("whisper-small")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("releases lỗi (503): hộp lỗi riêng, cảnh báo vẫn hiện", async () => {
    serve(alerts({ items: [alertRow()], total: 1 }), { body: { error: "releases_not_configured" }, status: 503 });
    render(<SystemPage />);
    await screen.findByText("reconcile_failed");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(within(section("Bản phát hành app")).getByRole("alert")).toBeTruthy();
  });

  it("'Thử lại' của nguồn lỗi chỉ gọi lại nguồn đó", async () => {
    const { count } = serve({ body: { error: "internal" }, status: 500 }, releases());
    render(<SystemPage />);
    await screen.findByText("0.4.2");
    fireEvent.click(within(section("Cảnh báo vận hành")).getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(count("/admin/alerts")).toBe(2));
    expect(count("/admin/releases")).toBe(1);
  });

  it("Làm mới gọi lại CẢ HAI nguồn", async () => {
    const { count } = serve();
    render(<SystemPage />);
    await screen.findByText("whisper-small");
    expect(count("/admin/alerts")).toBe(1);
    expect(count("/admin/releases")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => {
      expect(count("/admin/alerts")).toBe(2);
      expect(count("/admin/releases")).toBe(2);
    });
  });

  it("đang tải thì báo và nút Làm mới bị khóa, tải xong thì mở", async () => {
    serve();
    render(<SystemPage />);
    expect(screen.getAllByText("Đang tải…").length).toBeGreaterThan(0);
    const button = screen.getByRole("button", { name: "Làm mới" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await screen.findByText("whisper-small");
    await waitFor(() => expect(button.disabled).toBe(false));
  });
});
