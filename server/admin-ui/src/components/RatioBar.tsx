// Thanh tỷ lệ SVG (rãnh và phần đầy, màu theo lớp tông của CSS: tone-ok, tone-warn…). Bề rộng là thuộc tính của SVG nên
// không cần style inline (CSP). Chỉ để nhìn: chỗ dùng phải có chữ nói cùng con số.
export function RatioBar({ value, className }: { value: number; className?: string }) {
  // Có giá trị thì luôn thấy một mẩu (tối thiểu 1,5%), 0 thì chỉ có rãnh.
  const w = value <= 0 ? 0 : Math.max(1.5, Math.min(100, value));
  return (
    <svg className={className ? `ratio-bar ${className}` : "ratio-bar"} width="100%" height="8" aria-hidden="true" focusable="false">
      <rect className="ratio-track" x="0" y="0" width="100%" height="8" rx="4" />
      {w > 0 && <rect className="ratio-fill" x="0" y="0" width={`${w}%`} height="8" rx="4" />}
    </svg>
  );
}
