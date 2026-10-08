import { pageHero, callout, appShot, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Cấp quyền ghi âm thanh", path: "/huong-dan/cap-quyen-thu-am-macos/" },
];

const toc = [
  { level: 2, id: "quyen-nao", text: "App cần quyền nào?" },
  { level: 2, id: "hoi-quyen", text: "Hộp thoại hỏi quyền của macOS" },
  { level: 2, id: "da-tu-choi", text: "Nếu bạn đã từ chối" },
  { level: 2, id: "dau-hieu", text: "Dấu hiệu quyền chưa có" },
  { level: 2, id: "khong-bao-loi", text: "Vì sao macOS không báo lỗi" },
  { level: 2, id: "sau-cap-nhat", text: "Sau mỗi lần cập nhật" },
  { level: 2, id: "nguon-am-thanh", text: "Chọn nguồn âm thanh" },
];

const HOWTO_STEPS = [
  { name: "Mở System Settings", text: "Bấm Mở System Settings trong AI Translator, hoặc mở System Settings và chọn Privacy & Security." },
  { name: "Mở Screen & System Audio Recording", text: "Trong Privacy & Security, chọn Screen & System Audio Recording." },
  { name: "Bật AI Translator", text: "Ở mục System Audio Recording Only, bật công tắc của AI Translator." },
  { name: "Thử lại", text: "Mở lại AI Translator nếu cần, bấm Bắt đầu và phát âm thanh để kiểm tra phụ đề." },
];

export default {
  id: "guide-audio-permission",
  lang: "vi",
  path: "/huong-dan/cap-quyen-thu-am-macos/",
  title: "Cấp quyền ghi âm thanh hệ thống trên macOS",
  description:
    "Cách cấp quyền Ghi âm thanh hệ thống cho AI Translator trên macOS: trả lời hộp thoại, bật lại trong System Settings, nhận biết thiếu quyền, chọn nguồn âm thanh.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Cấp quyền Ghi âm thanh hệ thống (System Audio Recording) cho AI Translator trên macOS, bật lại khi đã từ chối, dấu hiệu thiếu quyền, và chọn nguồn âm thanh toàn hệ thống hay một app.",
  llmTitle: "Cấp quyền ghi âm thanh hệ thống trên macOS",
  schema: [
    howTo({
      name: "Bật lại quyền Ghi âm thanh hệ thống cho AI Translator",
      description: "Cách bật quyền System Audio Recording cho AI Translator trong System Settings khi bạn đã từ chối hộp thoại của macOS.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Cấp quyền ghi âm thanh hệ thống trên macOS",
  lead: "AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống (System Audio Recording), để nghe âm thanh mà máy Mac đang phát. App không dùng micro. Nếu bạn lỡ từ chối, hãy bật lại ở System Settings › Privacy & Security › Screen & System Audio Recording.",
  meta: "<span>Chỉ áp dụng cho macOS 14.2 trở lên</span><span>Cập nhật 08/10/2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
<h2 id="quyen-nao">App cần quyền nào?</h2>
<p>AI Translator thu âm thanh đang phát từ máy tính (tiếng của cuộc họp, video, webinar) để nhận dạng và dịch. Vì vậy macOS yêu cầu quyền <strong>Ghi âm thanh hệ thống</strong>. App <strong>không dùng micro</strong>, không thu tiếng nói của bạn, và không ghi âm cuộc họp xuống đĩa: âm thanh chỉ nằm trong RAM trong lúc dịch. Windows không có bước cấp quyền này.</p>
${facts([
  ["Tên quyền", "Ghi âm thanh hệ thống (System Audio Recording)"],
  ["Vị trí bật lại", "System Settings › Privacy &amp; Security › Screen &amp; System Audio Recording › System Audio Recording Only"],
  ["Khi nào hỏi", "Lần đầu AI Translator thu âm thanh: ở bước Nghe thử hoặc lần đầu bạn bấm Bắt đầu"],
])}

<h2 id="hoi-quyen">Hộp thoại hỏi quyền của macOS</h2>
<p>Lần đầu AI Translator thu âm thanh, macOS hiện hộp thoại hỏi quyền, kèm lời giải thích do chúng tôi viết, theo ngôn ngữ hệ thống của máy bạn. Bản tiếng Việt ghi:</p>
<blockquote>AI Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.</blockquote>
<p>Bản tiếng Anh ghi: “AI Translator captures the audio your Mac is playing to show translated subtitles. The audio never leaves your Mac.” Hãy chọn cho phép. App cũng nói trước về quyền này ở bước 5/9 của trình hướng dẫn lần đầu (xem <a href="/huong-dan/bat-dau-nhanh/">hướng dẫn bắt đầu nhanh</a>).</p>
${appShot({ slug: "app-onboarding-5", lang: "vi", alt: "Bước Cho phép ghi âm thanh hệ thống trong trình hướng dẫn, có nút Mở System Settings", caption: "Bước 5/9: app nói trước về quyền và có sẵn nút Mở System Settings." })}

<h2 id="da-tu-choi">Nếu bạn đã từ chối: bật lại trong System Settings</h2>
<ol>
<li>Trong AI Translator, bấm <strong>Mở System Settings</strong> (có ở bước 5 của trình hướng dẫn và trên màn hình chính khi app báo thiếu quyền). Hoặc tự mở System Settings.</li>
<li>Chọn <strong>Privacy &amp; Security</strong>, rồi <strong>Screen &amp; System Audio Recording</strong>.</li>
<li>Tìm mục <strong>System Audio Recording Only</strong> và bật công tắc của <strong>AI Translator</strong>.</li>
<li>Quay lại app, bấm <strong>Bắt đầu</strong> và phát một đoạn có tiếng.</li>
</ol>
<p>Nếu phụ đề vẫn không hiện, thoát hẳn AI Translator (chọn <strong>Thoát</strong> ở biểu tượng trên menu bar) rồi mở lại. Nếu chưa thấy AI Translator trong danh sách, hãy bấm Bắt đầu hoặc Phát câu mẫu một lần để app thử thu âm, rồi kiểm tra lại.</p>

<h2 id="dau-hieu">Dấu hiệu quyền chưa có</h2>
<p>Khi thiếu quyền, bạn thấy phụ đề không hiện dù cuộc họp có tiếng, và thanh “Mức âm lượng vào” trên màn hình chính đứng yên. Sau một lúc im lặng kéo dài mà app biết có app khác đang phát tiếng, <strong>màn hình chính</strong> báo:</p>
<blockquote>Không nghe thấy gì dù có app đang phát tiếng: có thể AI Translator chưa được phép ghi âm thanh hệ thống.</blockquote>
<p>Dòng này đi kèm nút <strong>Mở System Settings</strong>. Nếu phiên dịch dừng vì thiếu quyền, màn hình chính báo “AI Translator chưa được phép ghi âm thanh hệ thống.” cùng nút đó. Đừng nhầm với lời nhắc chung trên thanh phụ đề, “Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.”: lời nhắc này chỉ có nghĩa là một lúc lâu không có tiếng, có thể vì cuộc họp đang im lặng.</p>

<h2 id="khong-bao-loi">Vì sao macOS không báo lỗi khi bạn từ chối?</h2>
<p>Khi bị từ chối, macOS vẫn cho app tạo nguồn thu âm và vẫn báo nguồn đang chạy bình thường, nhưng dữ liệu nhận về toàn là im lặng. Vì không có lỗi nào để báo, AI Translator chỉ phát hiện được thiếu quyền bằng cách chờ im lặng kéo dài khi có app đang phát tiếng. Do đó dòng cảnh báo hiện sau một lúc chứ không hiện ngay.</p>

<h2 id="sau-cap-nhat">Sau mỗi lần cập nhật, macOS có thể hỏi lại</h2>
<p>Bản macOS hiện được ký ad-hoc, nên sau mỗi lần cập nhật macOS hỏi lại 1 hộp thoại quyền ghi âm (cùng 5 hộp thoại Keychain). Chọn cho phép; bạn không mất dữ liệu, gói hay hạn mức. Chi tiết trong <a href="/huong-dan/cai-dat-macos/">hướng dẫn cài đặt trên macOS</a>.</p>

<h2 id="nguon-am-thanh">Chọn nguồn âm thanh: toàn hệ thống hay một app</h2>
<p>Quyền ghi âm áp dụng cho cả hai chế độ. Chọn chế độ ở <strong>Cài đặt › Âm thanh › Nguồn âm thanh</strong>:</p>
<ul>
<li><strong>Toàn hệ thống, trừ app này</strong> (mặc định): dịch mọi thứ phát ra từ máy, kể cả tiếng thông báo.</li>
<li><strong>“Chỉ” kèm tên một app</strong>: chọn đúng app họp. Các âm thanh khác, như tiếng thông báo, không được dịch. Trình duyệt Safari và trang web trong các app khác được gộp thành “Safari và trang web trong các app khác”.</li>
</ul>
<p>Danh sách chỉ gồm các app <em>đang phát tiếng</em>; bấm <strong>Làm mới danh sách</strong> sau khi bật cuộc họp. Nguồn mới có tác dụng từ phiên dịch sau. Nếu app đã chọn ngừng phát tiếng, app báo “App đã chọn không phát tiếng” và dịch tiếp ngay khi nó phát lại.</p>
${appShot({ slug: "app-settings-audio", lang: "vi", alt: "Cài đặt Âm thanh với danh sách nguồn âm thanh, nút Làm mới danh sách và thanh Độ nhạy ngắt câu", caption: "Cài đặt › Âm thanh: chọn nguồn và độ nhạy ngắt câu." })}

${docNav(
  [
    { href: "/huong-dan/cai-dat-macos/", kicker: "Bài trước", title: "Cài đặt AI Translator trên macOS" },
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Bài sau", title: "Thanh phụ đề và phím tắt" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Liên quan", title: "Khắc phục sự cố" },
  ],
  "Bài liên quan",
)}
`,
})}
</div></section>
`,
};
