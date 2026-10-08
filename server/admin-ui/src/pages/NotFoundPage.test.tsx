import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "../components/SearchBox";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "./NotFoundPage";

describe("NotFoundPage", () => {
  it("báo không có trang và có link về Việc cần xử lý ở /", () => {
    render(<NotFoundPage />);
    expect(screen.getByRole("heading", { name: "Không có trang này" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về Việc cần xử lý" }).getAttribute("href")).toBe("/");
  });

  it("Mở ô tra cứu: đưa focus vào ô tra cứu ở thanh trên", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SearchBox />
        <NotFoundPage />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Mở ô tra cứu" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Tra cứu" }));
  });
});
