// Chữ hai tầng của dòng đang nói (spec 2026-10-10 §6.1, §6.3): phần ổn định như thường, phần tạm trong `span.tail` (nhạt;
// CSS của từng cửa sổ đặt độ mờ, bằng `.provisional`). `tail` tự mang khoảng trắng đầu khi cần (H4 của kế hoạch 00), nên
// hai phần nối thẳng vào nhau.
export function TwoTier({ stable, tail }: { stable: string; tail: string }) {
  return (
    <>
      {stable}
      {tail && <span className="tail">{tail}</span>}
    </>
  );
}
