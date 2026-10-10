// Cấu hình dùng chung của website: thông tin site, chuỗi giao diện (chrome) hai ngôn ngữ, điều hướng, chân trang.
// Nội dung từng trang nằm ở src/content/. Giá và hạn mức ở plans.mjs (có test đối chiếu với server/wrangler.jsonc).

export const SITE = {
  origin: "https://aitranslator.io.vn",
  name: "AI Translator",
  owner: "Đỗ Tiến Phong",
  email: "support@aitranslator.io.vn",
  defaultLang: "vi",
  year: 2026,
  updated: "2026-10-10",
  securityExpires: "2027-10-08T00:00:00.000Z",
  version: "0.1.6",
  releaseDate: "2026-10-10",
  llmSummaryEn:
    "AI Translator is a desktop app (macOS and Windows) that shows live translated subtitles for any audio playing on your computer — Zoom, Microsoft Teams, Google Meet, webinars, videos — and processes everything on your computer with AI models that run on-device: low latency, no audio or conversation data sent to the cloud, no cloud AI service used, no bot, no account, no ads. It supports five languages today; more are planned for the future.",
  llmSummaryVi:
    "AI Translator là app desktop (macOS và Windows) hiện phụ đề dịch trực tiếp cho mọi âm thanh đang phát trên máy tính — Zoom, Microsoft Teams, Google Meet, webinar, video — và xử lý mọi thứ ngay trên máy bằng model AI chạy tại chỗ: độ trễ thấp, không gửi âm thanh hay dữ liệu cuộc hội thoại lên cloud, không dùng dịch vụ AI trên cloud, không cần bot, không cần tài khoản, không quảng cáo. Hiện hỗ trợ năm ngôn ngữ; dự định bổ sung thêm trong tương lai.",
  featureListVi: [
    "Phụ đề dịch trực tiếp cho âm thanh hệ thống, năm ngôn ngữ (tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt)",
    "Nhận dạng giọng nói và dịch chạy trên máy, âm thanh không rời khỏi máy",
    "Thanh phụ đề nổi tùy chỉnh: kéo, đổi kích thước, khóa click xuyên qua, cỡ chữ và màu",
    "Dùng với mọi app họp, webinar và video, không cần bot hay plugin",
    "Từ điển thuật ngữ, lịch sử các phiên, xuất TXT, SRT, Markdown (gói trả phí)",
    "Phím tắt toàn cục và biểu tượng trên thanh menu (macOS) hoặc khay hệ thống (Windows)",
  ],
  featureListEn: [
    "Live translated subtitles for system audio in five languages (tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt)",
    "Speech recognition and translation run on-device; audio never leaves the machine",
    "Customizable floating subtitle bar: drag, resize, click-through lock, text size and colors",
    "Works with any meeting app, webinar or video, with no bot or plugin",
    "Glossary, session history, TXT, SRT and Markdown export (paid plans)",
    "Global keyboard shortcuts and a menu bar (macOS) or system tray (Windows) icon",
  ],
};

export const T = {
  vi: {
    ogLocale: "vi_VN",
    langName: "Tiếng Việt",
    language: "Ngôn ngữ",
    home: "Trang chủ",
    mainNav: "Điều hướng chính",
    menu: "Mở menu",
    theme: "Đổi giao diện sáng/tối",
    skip: "Bỏ qua tới nội dung chính",
    cta: { label: "Tải xuống", href: "/tai-xuong/" },
    ogAlt: "AI Translator — phụ đề dịch trực tiếp cho cuộc họp, chạy offline trên máy tính",
    footerAbout:
      "Phụ đề dịch bằng AI chạy trên máy bạn, không gửi dữ liệu cuộc họp lên cloud. Không bot, không tài khoản, không quảng cáo.",
    provider: "Bên cung cấp",
    updated: "Cập nhật",
    trademark:
      "Zoom, Microsoft Teams, Google Meet, Zalo và các tên sản phẩm khác thuộc về chủ sở hữu tương ứng; AI Translator không liên kết với họ.",
  },
  en: {
    ogLocale: "en_US",
    langName: "English",
    language: "Language",
    home: "Home",
    mainNav: "Main navigation",
    menu: "Open menu",
    theme: "Toggle light/dark theme",
    skip: "Skip to main content",
    cta: { label: "Download", href: "/en/download/" },
    ogAlt: "AI Translator — live translated subtitles for meetings, running on your computer",
    footerAbout:
      "AI-translated subtitles that run on your computer, with no meeting data sent to the cloud. No bot, no account, no ads.",
    provider: "Provider",
    updated: "Updated",
    trademark:
      "Zoom, Microsoft Teams, Google Meet, Zalo and other product names belong to their respective owners; AI Translator is not affiliated with them.",
  },
};

export const NAV = {
  vi: [
    { label: "Tính năng", href: "/tinh-nang/" },
    {
      label: "Giải pháp",
      href: "/giai-phap/",
      children: [
        { label: "Họp Zoom, Teams, Meet", href: "/giai-phap/dich-hop-truc-tuyen/", hint: "Phụ đề dịch cho mọi app họp" },
        { label: "Webinar và video", href: "/giai-phap/dich-webinar-va-video/", hint: "Xem nội dung tiếng nước ngoài" },
      ],
    },
    {
      label: "Hướng dẫn",
      href: "/huong-dan/",
      children: [
        { label: "Bắt đầu nhanh", href: "/huong-dan/bat-dau-nhanh/", hint: "Từ cài đặt tới phụ đề đầu tiên" },
        { label: "Tất cả hướng dẫn", href: "/huong-dan/", hint: "Cài đặt, quyền, phím tắt, khắc phục sự cố" },
      ],
    },
    { label: "Bảng giá", href: "/bang-gia/" },
    { label: "Hỏi đáp", href: "/cau-hoi-thuong-gap/" },
  ],
  en: [
    { label: "Features", href: "/en/features/" },
    {
      label: "Solutions",
      href: "/en/solutions/",
      children: [
        { label: "Zoom, Teams, Meet meetings", href: "/en/solutions/online-meeting-translation/", hint: "Translated subtitles for any meeting app" },
        { label: "Webinars and videos", href: "/en/solutions/webinar-and-video-translation/", hint: "Follow foreign-language content" },
      ],
    },
    {
      label: "Guides",
      href: "/en/guide/",
      children: [
        { label: "Quick start", href: "/en/guide/quick-start/", hint: "From install to your first subtitles" },
        { label: "All guides", href: "/en/guide/", hint: "Install, permissions, shortcuts, troubleshooting" },
      ],
    },
    { label: "Pricing", href: "/en/pricing/" },
    { label: "FAQ", href: "/en/faq/" },
  ],
};

export const FOOTER = {
  vi: [
    {
      title: "Sản phẩm",
      links: [
        { label: "Tính năng", href: "/tinh-nang/" },
        { label: "Bảng giá", href: "/bang-gia/" },
        { label: "Tải xuống", href: "/tai-xuong/" },
        { label: "Dịch offline và dịch cloud", href: "/so-sanh/dich-offline-va-cloud/" },
      ],
    },
    {
      title: "Giải pháp",
      links: [
        { label: "Họp Zoom, Teams, Meet", href: "/giai-phap/dich-hop-truc-tuyen/" },
        { label: "Webinar và video", href: "/giai-phap/dich-webinar-va-video/" },
      ],
    },
    {
      title: "Hỗ trợ",
      links: [
        { label: "Hướng dẫn sử dụng", href: "/huong-dan/" },
        { label: "Câu hỏi thường gặp", href: "/cau-hoi-thuong-gap/" },
        { label: "Khắc phục sự cố", href: "/huong-dan/khac-phuc-su-co/" },
        { label: "Liên hệ", href: "/lien-he/" },
      ],
    },
    {
      title: "Công ty",
      links: [
        { label: "Về AI Translator", href: "/ve-chung-toi/" },
        { label: "Dữ liệu và bảo mật", href: "/bao-mat-du-lieu/" },
        { label: "Điều khoản sử dụng", href: "/dieu-khoan/" },
        { label: "Chính sách quyền riêng tư", href: "/chinh-sach-quyen-rieng-tu/" },
      ],
    },
  ],
  en: [
    {
      title: "Product",
      links: [
        { label: "Features", href: "/en/features/" },
        { label: "Pricing", href: "/en/pricing/" },
        { label: "Download", href: "/en/download/" },
        { label: "Offline vs cloud translation", href: "/en/compare/offline-vs-cloud-translation/" },
      ],
    },
    {
      title: "Solutions",
      links: [
        { label: "Zoom, Teams, Meet meetings", href: "/en/solutions/online-meeting-translation/" },
        { label: "Webinars and videos", href: "/en/solutions/webinar-and-video-translation/" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "User guides", href: "/en/guide/" },
        { label: "FAQ", href: "/en/faq/" },
        { label: "Troubleshooting", href: "/en/guide/troubleshooting/" },
        { label: "Contact", href: "/en/contact/" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About AI Translator", href: "/en/about/" },
        { label: "Data and security", href: "/en/data-security/" },
        { label: "Terms of use", href: "/en/terms/" },
        { label: "Privacy policy", href: "/en/privacy/" },
      ],
    },
  ],
};

// Ảnh chia sẻ theo nhóm trang (tools/og/render.mjs sinh `<nhóm>-<ngôn ngữ>.jpg`).
const OG_GROUP = {
  home: "default", features: "features", pricing: "pricing", download: "download", faq: "faq", about: "about", contact: "contact",
  "data-security": "security", "compare-offline-cloud": "compare", solutions: "solutions", "solutions-meetings": "solutions",
  "solutions-webinar": "solutions", terms: "legal", privacy: "legal",
};
export const ogFor = (page) => page.ogImage ?? `/assets/og/${page.id.startsWith("guide") ? "guide" : (OG_GROUP[page.id] ?? "default")}-${page.lang}.jpg`;

// Dòng "phiên bản hiện tại" dùng ở trang chủ, Tải xuống, Giới thiệu: sinh từ SITE để không lệch số phiên bản và ngày phát hành.
const dmy = (iso) => iso.split("-").reverse().join("/");
const longEn = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
export const RELEASE = {
  vi: `Phiên bản ${SITE.version}, phát hành ${dmy(SITE.releaseDate)} cho macOS và Windows`,
  en: `Version ${SITE.version}, released ${longEn(SITE.releaseDate)} for macOS and Windows`,
};
