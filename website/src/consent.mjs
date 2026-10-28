// Google Analytics 4 cho website (chính sách quyền riêng tư 1.9, mục 14): chỉ tải sau khi khách bấm "Đồng ý" ở thanh thông báo.
// Chữ của thanh thông báo và nút "Cài đặt cookie" ở chân trang theo ngôn ngữ trang; site.js đọc chúng từ thuộc tính data-consent
// của thẻ script (layout.mjs), nên CSP không cần script nội tuyến mới.
export const GA_ID = "G-HSYP3R60BB";

export const CONSENT = {
  vi: {
    text: "Website dùng Google Analytics để đo lượt truy cập, chỉ khi bạn đồng ý. Nếu từ chối, không có cookie đo lường nào được đặt.",
    accept: "Đồng ý", decline: "Từ chối", policy: "Chính sách quyền riêng tư", settings: "Cài đặt cookie", label: "Cookie và đo lường truy cập",
  },
  en: {
    text: "This website uses Google Analytics to measure visits, only if you accept. If you decline, no measurement cookies are set.",
    accept: "Accept", decline: "Decline", policy: "Privacy policy", settings: "Cookie settings", label: "Cookies and visit measurement",
  },
  ja: {
    text: "このサイトはアクセス測定に Google アナリティクスを使います。同意した場合のみ有効で、拒否すると計測用の Cookie は設定されません。",
    accept: "同意する", decline: "拒否する", policy: "プライバシーポリシー（英語）", settings: "Cookie 設定", label: "Cookie とアクセス測定",
  },
  zh: {
    text: "本网站使用 Google Analytics 统计访问量，仅在你同意后启用；拒绝则不会设置任何统计 Cookie。",
    accept: "同意", decline: "拒绝", policy: "隐私政策（英文）", settings: "Cookie 设置", label: "Cookie 与访问统计",
  },
  ko: {
    text: "이 웹사이트는 방문 측정을 위해 Google Analytics를 사용하며, 동의한 경우에만 작동합니다. 거부하면 측정용 쿠키가 설정되지 않습니다.",
    accept: "동의", decline: "거부", policy: "개인정보 처리방침(영어)", settings: "쿠키 설정", label: "쿠키와 방문 측정",
  },
};

/** Trang chính sách quyền riêng tư để dẫn tới: tiếng Việt có bản riêng, các ngôn ngữ còn lại dùng bản tiếng Anh (như chân trang). */
export const privacyPath = (lang) => (lang === "vi" ? "/chinh-sach-quyen-rieng-tu/" : "/en/privacy/");
