// Trả focus khi hộp đóng (I-2 của vòng duyệt): nút mở hộp còn thì về nút; nút biến mất (trang tải lại sau thao tác) hay bị
// khóa thì về thông báo kết quả, không có thông báo thì về tiêu đề trang. Không bao giờ để focus rơi về body.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function Dialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} role="dialog" aria-label="Hộp">
      <button type="button" onClick={onClose}>
        Xong
      </button>
    </div>
  );
}

/** Trang giả. `afterClose`: điều xảy ra cùng lúc hộp đóng (nút mở hộp biến mất, bị khóa, có thông báo). */
function Page({ afterClose }: { afterClose: "keep" | "remove" | "disable" | "remove+notice" }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const gone = done && afterClose.startsWith("remove");
  return (
    <>
      <h1 className="page-title" tabIndex={-1}>
        Trang
      </h1>
      {done && afterClose === "remove+notice" && (
        <div className="notice" tabIndex={-1} data-notice="">
          Đã thu hồi.
        </div>
      )}
      {!gone && (
        <button type="button" disabled={done && afterClose === "disable"} onClick={() => setOpen(true)}>
          Thu hồi…
        </button>
      )}
      {open && (
        <Dialog
          onClose={() => {
            setOpen(false);
            setDone(true);
          }}
        />
      )}
    </>
  );
}

async function openAndClose(afterClose: Parameters<typeof Page>[0]["afterClose"]) {
  const user = userEvent.setup();
  render(<Page afterClose={afterClose} />);
  await user.click(screen.getByRole("button", { name: "Thu hồi…" }));
  screen.getByRole("button", { name: "Xong" }).focus();
  await user.click(screen.getByRole("button", { name: "Xong" }));
  expect(screen.queryByRole("dialog")).toBeNull();
}

describe("useFocusTrap: trả focus khi hộp đóng", () => {
  it("nút mở hộp còn: focus về đúng nút đó", async () => {
    await openAndClose("keep");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Thu hồi…" }));
  });

  it("nút mở hộp biến mất, không có thông báo: focus vào tiêu đề trang (h1), không về body", async () => {
    await openAndClose("remove");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Trang" }));
  });

  it("nút mở hộp biến mất, có thông báo kết quả: focus vào thông báo", async () => {
    await openAndClose("remove+notice");
    expect(document.activeElement).toBe(document.querySelector("[data-notice]"));
  });

  it("nút mở hộp còn nhưng bị khóa (không nhận focus): về tiêu đề trang", async () => {
    await openAndClose("disable");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Trang" }));
  });
});
