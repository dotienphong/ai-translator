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
});
