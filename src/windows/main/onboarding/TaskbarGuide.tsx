// Hình minh họa tạm cho bước 8 trên Windows: kéo icon từ mục icon ẩn (mũi tên ^) ra taskbar.
// Ảnh chụp thật của Windows 10 và 11 thay hình này ở phần Windows của kế hoạch 01.
export function TaskbarGuide({ label }: { label: string }) {
  return (
    <svg className="taskbar-guide" viewBox="0 0 320 120" role="img" aria-label={label}>
      <rect x="10" y="10" width="120" height="56" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="28" y="26" width="24" height="24" rx="4" fill="currentColor" opacity="0.35" />
      <rect x="64" y="26" width="24" height="24" rx="4" fill="currentColor" />
      <rect x="0" y="84" width="320" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M196 106 l8 -10 l8 10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="226" y="89" width="20" height="20" rx="3" fill="currentColor" />
      <path d="M88 60 C 140 110, 190 110, 222 99" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" />
      <path d="M214 94 l9 5 l-8 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
