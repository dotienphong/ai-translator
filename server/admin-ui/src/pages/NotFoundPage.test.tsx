import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "./NotFoundPage";

describe("NotFoundPage", () => {
  it("báo không có trang và có link về Việc cần xử lý ở /", () => {
    render(<NotFoundPage />);
    expect(screen.getByRole("heading", { name: "Không có trang này" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về Việc cần xử lý" }).getAttribute("href")).toBe("/");
  });
});
