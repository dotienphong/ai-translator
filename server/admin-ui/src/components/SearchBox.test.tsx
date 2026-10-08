import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { currentSearch, resetSearch } from "../search";
import { SearchBox } from "./SearchBox";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetSearch();
});

describe("SearchBox", () => {
  it("email: sang /search, từ khóa không lên URL hay history.state, chỉ giữ trong bộ nhớ", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(screen.getByLabelText("Tra cứu"), "khach@example.com{Enter}");
    expect(window.location.pathname).toBe("/search");
    expect(window.location.href).not.toContain("khach");
    expect(window.history.state).toBeNull();
    expect(currentSearch()?.query).toEqual({ email: "khach@example.com" });
  });

  it("từ khóa (email, key) không vào localStorage hay sessionStorage", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    render(<SearchBox />);
    const box = screen.getByLabelText("Tra cứu");
    await user.type(box, "khach@example.com{Enter}");
    await user.clear(box);
    await user.type(box, "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB{Enter}");
    const stored = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(stored).not.toContain("khach");
    expect(stored).not.toContain("K7Q2");
    expect(window.location.href).not.toContain("K7Q2");
  });

  it("mã đơn, license id, mã máy: mở thẳng trang chi tiết", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    const box = screen.getByLabelText("Tra cứu");
    await user.type(box, "1000012{Enter}");
    expect(window.location.pathname).toBe("/orders/1000012");
    await user.clear(box);
    await user.type(box, "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69{Enter}");
    expect(window.location.pathname).toBe("/licenses/0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69");
    await user.clear(box);
    await user.type(box, `${"b".repeat(64)}{Enter}`);
    expect(window.location.pathname).toBe(`/devices/${"b".repeat(64)}`);
    expect(currentSearch()).toBeNull();
  });

  it("chuỗi lạ: báo không nhận ra, không đổi trang, không gọi tra cứu", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(screen.getByLabelText("Tra cứu"), "xin chào{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Không nhận ra loại chuỗi");
    expect(window.location.pathname).toBe("/");
    expect(currentSearch()).toBeNull();
  });

  it("phím / và Ctrl hay Cmd + K đưa focus vào ô tra cứu khi đang không gõ ở đâu", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Nút khác</button>
        <SearchBox />
      </>,
    );
    const box = screen.getByLabelText("Tra cứu");
    expect(box.getAttribute("aria-keyshortcuts")).toBe("/ Control+K Meta+K");
    screen.getByRole("button", { name: "Nút khác" }).focus();
    await user.keyboard("/");
    expect(document.activeElement).toBe(box);
    expect((box as HTMLInputElement).value).toBe(""); // dấu / không bị gõ vào ô
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}k{/Control}");
    expect(document.activeElement).toBe(box);
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(document.activeElement).toBe(box);
  });

  it("đang gõ ở ô nhập khác: / là chữ, không nhảy; Ctrl + K vẫn nhảy", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Ghi chú" />
        <SearchBox />
      </>,
    );
    const note = screen.getByLabelText("Ghi chú") as HTMLInputElement;
    await user.click(note);
    await user.keyboard("a/b");
    expect(note.value).toBe("a/b");
    expect(document.activeElement).toBe(note);
    await user.keyboard("{Control>}k{/Control}");
    expect(document.activeElement).toBe(screen.getByLabelText("Tra cứu"));
  });

  it("có hộp thoại đang mở (aria-modal): phím tắt không cướp focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <div role="dialog" aria-modal="true" aria-label="Hộp">
          <button type="button">Hủy</button>
        </div>
        <SearchBox />
      </>,
    );
    const cancel = screen.getByRole("button", { name: "Hủy" });
    cancel.focus();
    await user.keyboard("/");
    await user.keyboard("{Control>}k{/Control}");
    expect(document.activeElement).toBe(cancel);
  });

  it("gợi ý phím / khi ô trống; có chữ thì thay bằng nút Tìm; lỗi gắn vào ô qua aria-describedby", async () => {
    const user = userEvent.setup();
    const { container } = render(<SearchBox />);
    expect(container.querySelector("kbd")?.textContent).toBe("/");
    expect(screen.queryByRole("button", { name: "Tìm" })).toBeNull();
    const box = screen.getByLabelText("Tra cứu");
    await user.type(box, "xin chào");
    expect(container.querySelector("kbd")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    const alert = screen.getByRole("alert");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe(alert.id);
  });
});
