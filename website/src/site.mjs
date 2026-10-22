// Cấu hình dùng chung của website: thông tin site, chuỗi giao diện (chrome) hai ngôn ngữ, điều hướng, chân trang.
// Nội dung từng trang nằm ở src/content/. Giá và hạn mức ở plans.mjs (có test đối chiếu với server/wrangler.jsonc).
import { resolveRelease } from "./release.mjs";
import { formatDate } from "./langs.mjs";

// Phiên bản và ngày phát hành không gõ tay: xem src/release.mjs (spec 2026-10-13-website-version-tu-dong-design.md).
const release = await resolveRelease();

export const SITE = {
  origin: "https://aitranslator.io.vn",
  name: "AI Translator",
  owner: "Đỗ Tiến Phong",
  email: "support@aitranslator.io.vn",
  defaultLang: "vi",
  year: 2026,
  updated: "2026-10-13",
  securityExpires: "2027-10-08T00:00:00.000Z",
  version: release.version,
  releaseDate: release.releaseDate,
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
  ja: {
    language: "言語",
    home: "ホーム",
    mainNav: "メインナビゲーション",
    menu: "メニューを開く",
    theme: "ライト/ダークを切り替え",
    skip: "本文へスキップ",
    cta: { label: "ダウンロード", href: "/ja/download/" },
    ogAlt: "AI Translator — 会議の音声をリアルタイムで翻訳字幕に。パソコン上で動作",
    footerAbout: "AI による翻訳字幕をあなたのパソコン上で生成します。会議のデータはクラウドに送りません。ボットもアカウントも広告もありません。",
    provider: "提供者",
    colon: "：",
    updated: "更新日",
    trademark: "Zoom、Microsoft Teams、Google Meet、Zalo などの製品名は各所有者に帰属します。AI Translator はこれらの企業と提携していません。",
  },
  zh: {
    language: "语言",
    home: "首页",
    mainNav: "主导航",
    menu: "打开菜单",
    theme: "切换浅色/深色",
    skip: "跳到主要内容",
    cta: { label: "下载", href: "/zh/download/" },
    ogAlt: "AI Translator — 在你的电脑上运行的会议实时翻译字幕",
    footerAbout: "由在你电脑上运行的 AI 生成翻译字幕，会议数据不会发送到云端。无需机器人，无需账号，没有广告。",
    provider: "提供方",
    colon: "：",
    updated: "更新于",
    trademark: "Zoom、Microsoft Teams、Google Meet、Zalo 等产品名称归各自所有者所有；AI Translator 与它们没有关联。",
  },
  ko: {
    language: "언어",
    home: "홈",
    mainNav: "주 메뉴",
    menu: "메뉴 열기",
    theme: "밝은/어두운 테마 전환",
    skip: "본문으로 건너뛰기",
    cta: { label: "다운로드", href: "/ko/download/" },
    ogAlt: "AI Translator — 내 컴퓨터에서 실행되는 회의 실시간 번역 자막",
    footerAbout: "내 컴퓨터에서 실행되는 AI로 번역 자막을 만듭니다. 회의 데이터는 클라우드로 보내지 않습니다. 봇, 계정, 광고가 없습니다.",
    provider: "제공자",
    updated: "업데이트",
    trademark: "Zoom, Microsoft Teams, Google Meet, Zalo 및 기타 제품 이름은 각 소유자의 자산이며, AI Translator는 이들과 제휴 관계가 없습니다.",
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
  ja: [
    { label: "機能", href: "/ja/features/" },
    {
      label: "ソリューション",
      href: "/ja/solutions/",
      children: [
        { label: "Zoom・Teams・Meet の会議", href: "/ja/solutions/online-meeting-translation/", hint: "あらゆる会議アプリに翻訳字幕" },
        { label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/", hint: "外国語のコンテンツを理解する" },
      ],
    },
    {
      label: "ガイド",
      href: "/ja/guide/",
      children: [
        { label: "クイックスタート", href: "/ja/guide/quick-start/", hint: "インストールから最初の字幕まで" },
        { label: "すべてのガイド", href: "/ja/guide/", hint: "インストール、権限、ショートカット、トラブルシューティング" },
      ],
    },
    { label: "料金", href: "/ja/pricing/" },
    { label: "よくある質問", href: "/ja/faq/" },
  ],
  zh: [
    { label: "功能", href: "/zh/features/" },
    {
      label: "解决方案",
      href: "/zh/solutions/",
      children: [
        { label: "Zoom、Teams、Meet 会议", href: "/zh/solutions/online-meeting-translation/", hint: "为任何会议应用提供翻译字幕" },
        { label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/", hint: "看懂外语内容" },
      ],
    },
    {
      label: "使用指南",
      href: "/zh/guide/",
      children: [
        { label: "快速入门", href: "/zh/guide/quick-start/", hint: "从安装到第一条字幕" },
        { label: "全部指南", href: "/zh/guide/", hint: "安装、权限、快捷键、故障排除" },
      ],
    },
    { label: "价格", href: "/zh/pricing/" },
    { label: "常见问题", href: "/zh/faq/" },
  ],
  ko: [
    { label: "기능", href: "/ko/features/" },
    {
      label: "솔루션",
      href: "/ko/solutions/",
      children: [
        { label: "Zoom, Teams, Meet 회의", href: "/ko/solutions/online-meeting-translation/", hint: "모든 회의 앱에 번역 자막" },
        { label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/", hint: "외국어 콘텐츠 이해하기" },
      ],
    },
    {
      label: "가이드",
      href: "/ko/guide/",
      children: [
        { label: "빠른 시작", href: "/ko/guide/quick-start/", hint: "설치부터 첫 자막까지" },
        { label: "전체 가이드", href: "/ko/guide/", hint: "설치, 권한, 단축키, 문제 해결" },
      ],
    },
    { label: "요금", href: "/ko/pricing/" },
    { label: "자주 묻는 질문", href: "/ko/faq/" },
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
  ja: [
    { title: "製品", links: [{ label: "機能", href: "/ja/features/" }, { label: "料金", href: "/ja/pricing/" }, { label: "ダウンロード", href: "/ja/download/" }, { label: "オフライン翻訳とクラウド翻訳", href: "/ja/compare/offline-vs-cloud-translation/" }] },
    { title: "ソリューション", links: [{ label: "Zoom・Teams・Meet の会議", href: "/ja/solutions/online-meeting-translation/" }, { label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/" }] },
    { title: "サポート", links: [{ label: "ユーザーガイド", href: "/ja/guide/" }, { label: "よくある質問", href: "/ja/faq/" }, { label: "トラブルシューティング", href: "/ja/guide/troubleshooting/" }, { label: "お問い合わせ", href: "/ja/contact/" }] },
    { title: "会社情報", links: [{ label: "AI Translator について", href: "/ja/about/" }, { label: "データとセキュリティ", href: "/ja/data-security/" }, { label: "利用規約（英語）", href: "/en/terms/" }, { label: "プライバシーポリシー（英語）", href: "/en/privacy/" }] },
  ],
  zh: [
    { title: "产品", links: [{ label: "功能", href: "/zh/features/" }, { label: "价格", href: "/zh/pricing/" }, { label: "下载", href: "/zh/download/" }, { label: "离线翻译与云端翻译", href: "/zh/compare/offline-vs-cloud-translation/" }] },
    { title: "解决方案", links: [{ label: "Zoom、Teams、Meet 会议", href: "/zh/solutions/online-meeting-translation/" }, { label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/" }] },
    { title: "支持", links: [{ label: "使用指南", href: "/zh/guide/" }, { label: "常见问题", href: "/zh/faq/" }, { label: "故障排除", href: "/zh/guide/troubleshooting/" }, { label: "联系我们", href: "/zh/contact/" }] },
    { title: "公司", links: [{ label: "关于 AI Translator", href: "/zh/about/" }, { label: "数据与安全", href: "/zh/data-security/" }, { label: "使用条款（英文）", href: "/en/terms/" }, { label: "隐私政策（英文）", href: "/en/privacy/" }] },
  ],
  ko: [
    { title: "제품", links: [{ label: "기능", href: "/ko/features/" }, { label: "요금", href: "/ko/pricing/" }, { label: "다운로드", href: "/ko/download/" }, { label: "오프라인 번역과 클라우드 번역", href: "/ko/compare/offline-vs-cloud-translation/" }] },
    { title: "솔루션", links: [{ label: "Zoom, Teams, Meet 회의", href: "/ko/solutions/online-meeting-translation/" }, { label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/" }] },
    { title: "지원", links: [{ label: "사용 가이드", href: "/ko/guide/" }, { label: "자주 묻는 질문", href: "/ko/faq/" }, { label: "문제 해결", href: "/ko/guide/troubleshooting/" }, { label: "문의하기", href: "/ko/contact/" }] },
    { title: "회사", links: [{ label: "AI Translator 소개", href: "/ko/about/" }, { label: "데이터와 보안", href: "/ko/data-security/" }, { label: "이용약관(영어)", href: "/en/terms/" }, { label: "개인정보 처리방침(영어)", href: "/en/privacy/" }] },
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
export const RELEASE = {
  vi: `Phiên bản ${SITE.version}, phát hành ${formatDate(SITE.releaseDate, "vi")} cho macOS và Windows`,
  en: `Version ${SITE.version}, released ${formatDate(SITE.releaseDate, "en")} for macOS and Windows`,
  ja: `バージョン ${SITE.version}（${formatDate(SITE.releaseDate, "ja")}リリース、macOS と Windows 向け）`,
  zh: `版本 ${SITE.version}，${formatDate(SITE.releaseDate, "zh")}发布，适用于 macOS 和 Windows`,
  ko: `버전 ${SITE.version}, ${formatDate(SITE.releaseDate, "ko")} 출시, macOS 및 Windows용`,
};
