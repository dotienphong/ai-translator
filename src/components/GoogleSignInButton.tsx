// Nút "Đăng nhập bằng Google" (spec 2026-11-05-dang-nhap-google §6.3). Biểu tượng "G" phải là tệp chính thức của Google do người vận
// hành đặt ở `src/assets/google/` (xem README ở đó); app không tự vẽ. Chưa có tệp thì nút chỉ có chữ. `import.meta.glob` (eager)
// không khớp tệp nào thì trả object rỗng, nên thiếu tệp không làm hỏng build hay lúc chạy.
const LOGOS = import.meta.glob<string>("../assets/google/google-g.{svg,png}", { eager: true, import: "default" });
const LOGO: string | null = LOGOS["../assets/google/google-g.svg"] ?? LOGOS["../assets/google/google-g.png"] ?? null;

export interface GoogleSignInButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

export function GoogleSignInButton({ label, disabled, onClick }: GoogleSignInButtonProps) {
  return (
    <button type="button" className="google-signin" disabled={disabled} onClick={onClick}>
      {LOGO && <img src={LOGO} alt="" width={18} height={18} />}
      <span>{label}</span>
    </button>
  );
}
