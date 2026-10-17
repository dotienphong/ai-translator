import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortHash } from "../format";
import { DEVICE, detail, FP, json, RID } from "./error-fixtures";
import { ErrorReportPage } from "./ErrorReportPage";

let calls: { url: string; method: string; body: unknown }[];
let current: () => Response;
let deleteReply: () => Response;

beforeEach(() => {
  calls = [];
  current = () => json(detail());
  deleteReply = () => json({ deleted: 1 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return url === "/admin/error-reports/delete" ? deleteReply() : current();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Giá trị của một dòng trong thẻ Thông tin (KeyValue). */
const valueOf = (label: string) => (screen.getByText(label, { selector: "dt" }).closest(".kv-row") as HTMLElement).querySelector("dd")?.textContent;

describe("ErrorReportPage: nội dung", () => {
  it("gọi báo cáo theo mã; mã là tiêu đề có nút chép; hiện loại và mọi thông tin máy", async () => {
    render(<ErrorReportPage id={RID} />);
    expect(await screen.findByRole("heading", { level: 1, name: RID })).toBeTruthy();
    expect(calls[0]?.url).toBe(`/admin/error-reports/${RID}`);
    expect(screen.getByRole("button", { name: "Chép mã báo cáo" })).toBeTruthy();
    expect(screen.getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(valueOf("Mã lỗi")).toBe("sidecarFailed");
    expect(valueOf("Phiên bản app")).toBe("0.1.10");
    expect(valueOf("Hệ điều hành")).toBe("macOS 15.6.1 (aarch64)");
    expect(valueOf("Chip")).toBe("Apple M4 Pro");
    expect(valueOf("RAM")).toBe("24 GB");
    expect(valueOf("GPU")).toBe("Metal");
    expect(valueOf("Gói model")).toBe("standard");
    expect(valueOf("Gói bản quyền")).toBe("Monthly");
    expect(valueOf("Ngôn ngữ giao diện")).toBe("vi");
    expect(screen.getByText("tiến trình phụ không khởi động được")).toBeTruthy();
  });

  it("máy là liên kết tới trang máy (kèm nút chép mã đầy đủ); dấu vân tay là liên kết tới trang nhóm; đường dẫn về nhóm", async () => {
    render(<ErrorReportPage id={RID} />);
    const device = await screen.findByRole("link", { name: shortHash(DEVICE) });
    expect(device.getAttribute("href")).toBe(`/devices/${DEVICE}`);
    expect(screen.getByRole("button", { name: "Chép mã máy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: FP }).getAttribute("href")).toBe(`/errors/groups/${FP}`);
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getByRole("link", { name: "Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
    expect(crumbs.getByRole("link", { name: "sidecarFailed" }).getAttribute("href")).toBe(`/errors/groups/${FP}`);
  });

  it("báo cáo gửi tay: không có dòng dấu vân tay, đường dẫn về tab Gửi tay", async () => {
    current = () => json(detail({ kind: "manual", code: null, fingerprint: "0000000000000000" }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(screen.queryByText("Dấu vân tay", { selector: "dt" })).toBeNull();
    expect(valueOf("Mã lỗi")).toBe("—");
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getByRole("link", { name: "Báo cáo lỗi" }).getAttribute("href")).toBe("/errors?tab=manual");
  });

  it("báo cáo của bản debug có huy hiệu debug ở dòng phiên bản", async () => {
    current = () => json(detail({ build: "debug" }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(within((screen.getByText("Phiên bản app", { selector: "dt" }).closest(".kv-row")) as HTMLElement).getByText("debug")).toBeTruthy();
  });

  it("thông tin thiếu (chip, RAM, GPU, gói model, gói bản quyền là null) hiện dấu —", async () => {
    current = () => json(detail({ chip: null, ram_mb: null, gpu_backend: null, model_pack: null, plan: null }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    for (const label of ["Chip", "RAM", "GPU", "Gói model", "Gói bản quyền"]) expect(valueOf(label)).toBe("—");
  });
});

describe("ErrorReportPage: log là văn bản thuần", () => {
  it("ba log, mỗi log một vùng có tên và nút chép riêng, nội dung nguyên văn", async () => {
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    const app = screen.getByRole("region", { name: "Log ứng dụng (app.log)" });
    const asr = screen.getByRole("region", { name: "Log nhận dạng giọng nói (asr-worker.log)" });
    const llama = screen.getByRole("region", { name: "Log bộ dịch (llama-server.log)" });
    expect(app.textContent).toBe("[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n");
    expect(asr.textContent).toBe("ggml_metal_init: error: failed to load\n");
    expect(llama.textContent).toBe("0.00.289.523 W load: special_eos_id is not in special_eog_ids\n");
    for (const name of ["Chép log ứng dụng", "Chép log nhận dạng giọng nói", "Chép log bộ dịch"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("log và thông báo chứa <img onerror>, <script>: hiện thành chữ, không dựng phần tử, không chạy", async () => {
    const evil = '<img src=x onerror="window.__pwned = 1">\n<script>window.__pwned = 2</script>';
    current = () => json(detail({ message: evil, logs: { app: evil, asr: evil, llama: evil } }));
    const { container } = render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByRole("region", { name: "Log ứng dụng (app.log)" }).textContent).toBe(evil);
    expect(screen.getAllByText(/onerror/)).toHaveLength(4);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("log rỗng: ghi Log trống, không có nút chép của log đó", async () => {
    current = () => json(detail({ logs: { app: "dòng", asr: "", llama: "" } }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(screen.getAllByText("Log trống")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Chép log nhận dạng giọng nói" })).toBeNull();
    expect(screen.getByRole("button", { name: "Chép log ứng dụng" })).toBeTruthy();
  });
});

describe("ErrorReportPage: xóa và lỗi", () => {
  it("xóa một báo cáo: hộp xác nhận không đòi lý do, gửi {id}, rồi hiện trạng thái đã xóa kèm nút về danh sách", async () => {
    const user = userEvent.setup();
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    await user.click(screen.getByRole("button", { name: "Xóa báo cáo…" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa báo cáo này?" });
    expect(within(dialog).queryByLabelText(/Lý do/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Xóa báo cáo" }));
    expect(await screen.findByText("Đã xóa báo cáo này")).toBeTruthy();
    expect(screen.getByText("Đã xóa báo cáo.")).toBeTruthy();
    expect(calls.find((c) => c.url === "/admin/error-reports/delete")).toEqual({ url: "/admin/error-reports/delete", method: "POST", body: { id: RID } });
    expect(screen.getByRole("link", { name: "Về Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
    expect(screen.queryByRole("region", { name: "Log ứng dụng (app.log)" })).toBeNull();
  });

  it("xóa gặp 404: hộp báo lỗi và trang tải lại, rồi hiện không tìm thấy", async () => {
    const user = userEvent.setup();
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    await user.click(screen.getByRole("button", { name: "Xóa báo cáo…" }));
    deleteReply = () => json({ error: "not_found" }, 404);
    current = () => json({ error: "not_found" }, 404);
    await user.click(within(screen.getByRole("dialog", { name: "Xóa báo cáo này?" })).getByRole("button", { name: "Xóa báo cáo" }));
    await waitFor(() => expect(calls.filter((c) => c.url === `/admin/error-reports/${RID}`)).toHaveLength(2));
  });

  it("không có báo cáo (404): trạng thái không tìm thấy với nút về danh sách", async () => {
    current = () => json({ error: "not_found" }, 404);
    render(<ErrorReportPage id={RID} />);
    expect(await screen.findByText("Không có báo cáo này")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
  });

  it("máy chủ lỗi: hiện câu lỗi có nút Thử lại", async () => {
    current = () => json({ error: "internal" }, 500);
    render(<ErrorReportPage id={RID} />);
    expect(await screen.findByText("Không tải được báo cáo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
