// Bộ biểu tượng SVG nội tuyến, vẽ tay trên lưới 24×24 (spec giao diện mới, mục 2 và 3: không thêm thư viện biểu tượng,
// CSP chỉ cho ảnh 'self' và data:). Nét theo currentColor nên đổi màu bằng CSS `color`; mặc định 18px, aria-hidden vì
// biểu tượng chỉ minh họa: nút chỉ có biểu tượng phải tự có aria-label.
import { type ReactNode, useId } from "react";

export interface IconProps {
  /** Cạnh, px. Mặc định 18. */
  size?: number;
  className?: string;
  /** Độ dày nét. Mặc định 1.75. */
  strokeWidth?: number;
}

function icon(name: string, body: ReactNode) {
  function Icon({ size = 18, className, strokeWidth = 1.75 }: IconProps) {
    return (
      <svg
        className={className ? `icon icon-${name} ${className}` : `icon icon-${name}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {body}
      </svg>
    );
  }
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

/* ---------- Thanh bên ---------- */

/** Việc cần xử lý: khay thư. */
export const IconInbox = icon(
  "inbox",
  <>
    <path d="M3.5 13.5h4.25l1.5 2.5h5.5l1.5-2.5h4.25" />
    <path d="M6.2 5h11.6a1.5 1.5 0 0 1 1.42 1.02L20.5 13.5V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4.5l1.28-7.48A1.5 1.5 0 0 1 6.2 5Z" />
  </>,
);

/** Tổng quan: biểu đồ cột. */
export const IconChart = icon(
  "chart",
  <>
    <path d="M4 20h16" />
    <rect x="5.5" y="11" width="3" height="6" rx="1" />
    <rect x="10.5" y="5" width="3" height="12" rx="1" />
    <rect x="15.5" y="8.5" width="3" height="8.5" rx="1" />
  </>,
);

/** Đơn hàng: giỏ hàng. */
export const IconCart = icon(
  "cart",
  <>
    <path d="M3 4h2.2l2.3 10.6a1.5 1.5 0 0 0 1.47 1.18h8.3a1.5 1.5 0 0 0 1.46-1.14L20.5 8H6.3" />
    <circle cx="9.5" cy="19.5" r="1.25" />
    <circle cx="17" cy="19.5" r="1.25" />
  </>,
);

/** License: chìa khóa. */
export const IconKey = icon(
  "key",
  <>
    <circle cx="8" cy="15.5" r="4" />
    <path d="m10.9 12.6 8.6-8.6" />
    <path d="m16.5 7 2.5 2.5" />
    <path d="m14 9.5 2 2" />
  </>,
);

/** Máy và dùng thử: màn hình máy tính. */
export const IconMonitor = icon(
  "monitor",
  <>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M9 20.5h6" />
    <path d="M12 16.5v4" />
  </>,
);

/** Nhật ký: trang giấy có dòng chữ. */
export const IconLog = icon(
  "log",
  <>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3.5V8h4.5" />
    <path d="M9 12.5h6" />
    <path d="M9 16h4" />
  </>,
);

/** Hệ thống: hai khối máy chủ. */
export const IconServer = icon(
  "server",
  <>
    <rect x="3.5" y="4" width="17" height="7" rx="2" />
    <rect x="3.5" y="13" width="17" height="7" rx="2" />
    <path d="M7.5 7.5h.01" />
    <path d="M7.5 16.5h.01" />
    <path d="M11 7.5h2" />
    <path d="M11 16.5h2" />
  </>,
);

/** Công cụ: cờ lê. */
export const IconTool = icon(
  "tool",
  <path d="M14.6 4.2a4.6 4.6 0 0 0-4.3 6.1L4.4 16.2a1.9 1.9 0 0 0 2.7 2.7l5.9-5.9a4.6 4.6 0 0 0 6.1-4.3c0-.5-.1-1-.2-1.4l-2.6 2.6-2.4-.7-.7-2.4 2.6-2.6c-.4-.1-.9-.2-1.2-.2Z" />,
);

/* ---------- Thanh trên ---------- */

export const IconSearch = icon(
  "search",
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </>,
);

export const IconMenu = icon(
  "menu",
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </>,
);

export const IconClose = icon(
  "close",
  <>
    <path d="M6.5 6.5l11 11" />
    <path d="M17.5 6.5l-11 11" />
  </>,
);

export const IconArrowLeft = icon(
  "arrow-left",
  <>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </>,
);

export const IconArrowRight = icon(
  "arrow-right",
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);

export const IconUser = icon(
  "user",
  <>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </>,
);

/** Thu gọn thanh bên: khung có cột trái, mũi tên sang trái. */
export const IconSidebarCollapse = icon(
  "sidebar-collapse",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9 4.5v15" />
    <path d="m15.5 10-2 2 2 2" />
  </>,
);

/** Mở rộng thanh bên: như trên, mũi tên sang phải. */
export const IconSidebarExpand = icon(
  "sidebar-expand",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9 4.5v15" />
    <path d="m13.5 10 2 2-2 2" />
  </>,
);

/* ---------- Chung ---------- */

export const IconCopy = icon(
  "copy",
  <>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
  </>,
);

export const IconCheck = icon("check", <path d="m5 12.5 4.5 4.5L19 7.5" />);

/** Vòng tròn có dấu kiểm: mọi thứ ổn. */
export const IconCheckCircle = icon(
  "check-circle",
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="m8.25 12.25 2.5 2.5 5-5" />
  </>,
);

/** Cảnh báo: tam giác có dấu chấm than. */
export const IconWarning = icon(
  "warning",
  <>
    <path d="M10.27 4.5 3.1 17a2 2 0 0 0 1.73 3h14.34a2 2 0 0 0 1.73-3L13.73 4.5a2 2 0 0 0-3.46 0Z" />
    <path d="M12 9.5v4" />
    <path d="M12 16.75h.01" />
  </>,
);

/** Thông tin: vòng tròn có chữ i. */
export const IconInfo = icon(
  "info",
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 11v5" />
    <path d="M12 7.75h.01" />
  </>,
);

/** Lỗi, cần chú ý: vòng tròn có dấu chấm than. */
export const IconAlert = icon(
  "alert",
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 7.5v5" />
    <path d="M12 16.25h.01" />
  </>,
);

export const IconChevronDown = icon("chevron-down", <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />);
export const IconChevronUp = icon("chevron-up", <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />);
export const IconChevronLeft = icon("chevron-left", <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />);
export const IconChevronRight = icon("chevron-right", <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />);

export const IconRefresh = icon(
  "refresh",
  <>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </>,
);

export const IconExternal = icon(
  "external",
  <>
    <path d="M14 4.5h5.5V10" />
    <path d="m19.5 4.5-8 8" />
    <path d="M17.5 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h4" />
  </>,
);

/**
 * Biểu tượng thương hiệu (cùng hình với website/src/assets/img/logo.svg): ô vuông bo góc xanh chuyển màu, bong bóng lời
 * thoại trắng có năm vạch sóng âm. Mã gradient lấy từ useId để nhiều bản trên một trang không trùng nhau.
 */
export function BrandMark({ size = 30, className }: { size?: number; className?: string }) {
  const gradient = `brand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className={className ? `brand-mark ${className}` : "brand-mark"}
      width={size}
      height={size}
      viewBox="100 100 824 824"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b9bf5" />
          <stop offset="1" stopColor="#1a5cc0" />
        </linearGradient>
      </defs>
      <rect x="100" y="100" width="824" height="824" rx="184" fill={`url(#${gradient})`} />
      <g fill="#ffffff">
        <rect x="212" y="272" width="600" height="400" rx="120" />
        <polygon points="290,640 262,764 430,650" />
      </g>
      <g fill="#1d63c9">
        <rect x="304" y="417" width="56" height="110" rx="28" />
        <rect x="394" y="367" width="56" height="210" rx="28" />
        <rect x="484" y="322" width="56" height="300" rx="28" />
        <rect x="574" y="367" width="56" height="210" rx="28" />
        <rect x="664" y="417" width="56" height="110" rx="28" />
      </g>
    </svg>
  );
}
