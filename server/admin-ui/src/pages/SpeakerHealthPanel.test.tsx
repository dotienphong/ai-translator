import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeakerHealthResponse } from "../api/types";
import { ErrorsPage } from "./ErrorsPage";

const NOW = 1_790_812_800;

const row = (over: Record<string, unknown> = {}) => ({
  meeting_app: "teams",
  meeting_version: "26032.1100",
  os_name: "macos",
  reports: 10,
  devices: 8,
  broken_devices: 3,
  ok: 6,
  no_names: 2,
  no_speaking: 1,
  no_permission: 1,
  blocked: 0,
  minutes_ok: 300,
  minutes_total: 400,
  recipe_version: 2,
  last_at: NOW - 3600,
  ...over,
});

const response = (over: Partial<SpeakerHealthResponse> = {}): SpeakerHealthResponse => ({
  generated_at: NOW,
  days: 7,
  rows: [row()],
  canary: [{ meeting_app: "teams", meeting_version: "26032.1100", os_name: "macos", day: "2026-10-01", state: "ok", recipe_version: 2, app_version: "0.3.2" }],
  patterns: [{ meeting_app: "teams", meeting_version: "26032.1100", day: "2026-10-01", recipe_version: 2, patterns: [{ role: "AXGroup", path: [2, 0], states: [] }] }],
  ...over,
});

let urls: string[];
let speaker: () => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  urls = [];
  speaker = () => json(response());
  window.history.replaceState(null, "", "/errors?tab=speaker");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return url.startsWith("/admin/speaker-health") ? speaker() : json({ items: [], next_cursor: null });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("ErrorsPage: tab Bộ đọc tên", () => {
  it("mở từ ?tab=speaker, gọi /admin/speaker-health?days=7 và hiện bảng theo app họp và phiên bản", async () => {
    render(<ErrorsPage />);
    const table = await screen.findByRole("table", { name: /Tình trạng bộ đọc tên theo app họp/ });
    expect(urls).toEqual(["/admin/speaker-health?days=7"]);
    const cells = within(table).getAllByRole("row")[1]!.textContent ?? "";
    expect(cells).toContain("Microsoft Teams");
    expect(cells).toContain("26032.1100");
    expect(cells).toContain("3/8 máy (38%)");
    expect(cells).toContain("75%");
  });

  it("huy hiệu đỏ khớp ngưỡng của cron: từ 5 báo cáo, ít nhất 3 máy hỏng, từ 30% số MÁY; thiếu một điều kiện thì chỉ vàng", async () => {
    speaker = () =>
      json(
        response({
          rows: [
            row(), // 10 báo cáo, 3/8 máy hỏng: đỏ
            row({ meeting_version: "26040.1", reports: 3, devices: 3, broken_devices: 3, no_names: 3, ok: 0, no_speaking: 0, no_permission: 0 }), // ít báo cáo
            row({ meeting_version: "26050.1", reports: 12, devices: 2, broken_devices: 2, no_names: 12, ok: 0, no_speaking: 0, no_permission: 0 }), // nhiều báo cáo nhưng chỉ 2 máy
            row({ meeting_version: "26060.1", reports: 20, devices: 20, broken_devices: 3, no_names: 3, ok: 17, no_speaking: 0, no_permission: 0 }), // 3/20 máy = 15%
            row({ meeting_version: "26070.1", reports: 9, devices: 9, broken_devices: 0, no_names: 0, ok: 9, no_speaking: 0, no_permission: 0 }), // không hỏng
          ],
        }),
      );
    render(<ErrorsPage />);
    const table = await screen.findByRole("table", { name: /Tình trạng bộ đọc tên theo app họp/ });
    const badges = within(table).getAllByText(/máy \(\d+%\)/);
    expect(badges.map((b) => b.className.match(/badge-(bad|warn|ok)/)?.[1])).toEqual(["bad", "warn", "warn", "warn", "ok"]);
    expect(badges[2]!.textContent).toBe("2/2 máy (100%)");
  });

  it("hiện kết quả kiểm tra tự động và mẫu chỉ báo dạng văn bản", async () => {
    render(<ErrorsPage />);
    const canary = await screen.findByRole("table", { name: "Kết quả kiểm tra tự động hằng ngày" });
    expect(within(canary).getByText("Đọc được tên")).toBeTruthy();
    expect(screen.getByText(/"role":"AXGroup"/)).toBeTruthy();
  });

  it("đổi sang 30 ngày thì gọi lại với days=30; chưa có dữ liệu thì báo trống; lỗi thì có nút thử lại", async () => {
    const user = userEvent.setup();
    speaker = () => json(response({ rows: [], canary: [], patterns: [] }));
    render(<ErrorsPage />);
    expect(await screen.findByText("Chưa có báo cáo tình trạng nào")).toBeTruthy();
    expect(screen.getByText("Chưa có kết quả kiểm tra tự động")).toBeTruthy();
    expect(screen.getByText("Chưa có mẫu nào.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "30 ngày" }));
    await waitFor(() => expect(urls).toEqual(["/admin/speaker-health?days=7", "/admin/speaker-health?days=30"]));
    speaker = () => json({ error: "internal" }, 500);
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(await screen.findByText("Không tải được tình trạng bộ đọc tên")).toBeTruthy();
  });

  it("công tắc tab có mục Bộ đọc tên và chuyển được từ tab Nhóm lỗi", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/errors");
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    await user.click(screen.getByRole("radio", { name: "Bộ đọc tên" }));
    expect(await screen.findByRole("table", { name: /Tình trạng bộ đọc tên theo app họp/ })).toBeTruthy();
  });
});
