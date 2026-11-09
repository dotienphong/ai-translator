import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "解决方案", path: "/zh/solutions/" },
  { name: "YouTube 翻译", path: "/zh/solutions/youtube-translation/" },
];

const FAQ = [
  {
    q: "如何把 YouTube 视频翻译成中文？",
    a: `<p>在电脑上安装 AI Translator，用浏览器（Chrome、Safari、Edge、Firefox）打开任何 YouTube 视频，在“翻译目标语言”中选择中文，然后点击<strong>开始</strong>。应用会直接收听电脑播放的音频，在浮动字幕条上实时生成中文字幕，无论原视频作者是否提供了字幕。</p>`,
  },
  {
    q: "AI Translator 能翻译 YouTube 直播（YouTube Live）吗？",
    a: `<p>可以。因为应用直接采集电脑系统声音，所以 YouTube Live 直播流与普通录制视频一样可以实时翻译。我们用浏览器中播放的视频做过测试，还在 Mac M4 Pro 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日），在约 4 分钟的观看中，字幕稳定连续显示。</p>`,
  },
  {
    q: "可以在手机的 YouTube 应用上使用吗？",
    a: `<p>不能。AI Translator 仅支持 macOS（Apple 芯片）和 Windows 10/11 x64 桌面电脑，没有手机或平板版本。如需查看翻译字幕，请在电脑浏览器中打开 YouTube。</p>`,
  },
  {
    q: "需要安装浏览器插件或扩展程序吗？",
    a: `<p>不需要。无需安装任何浏览器扩展或插件，也不需要关联您的 YouTube 账号。AI Translator 作为独立桌面软件在本地电脑上安全捕获音频。</p>`,
  },
  {
    q: "用 AI Translator 翻译 YouTube 是免费的吗？",
    a: `<p>Free 套餐提供 10 天免费试用，每天最多可翻译 30 分钟（需使用 Google 账号登录，无需信用卡）。试用期结束后，可在<a href="/zh/pricing/">价格页面</a>选择 Monthly、6 Months 或 Yearly 等预付套餐。</p>`,
  },
];

export default {
  id: "solutions-youtube",
  lang: "zh",
  path: "/zh/solutions/youtube-translation/",
  title: "YouTube 翻译：视频与直播实时翻译字幕",
  description:
    "在电脑上将YouTube视频和直播的声音实时生成翻译字幕。AI在本地离线运行，无需浏览器插件。免费试用10天。",
  type: "article",
  published: "2026-11-09",
  breadcrumbs: crumbs,
  modified: "2026-11-09",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "YouTube 翻译：视频与直播实时翻译字幕",
  lead: "想观看海外优质的技术演讲、公开课或国际 YouTube Live 直播，但视频没有中文字幕？AI Translator 能收听电脑播放的音频，实时在屏幕悬浮条上呈现双语翻译字幕。AI 完全在本地设备离线运行，无需安装浏览器插件，不上传视频文件，保护隐私安全。",
  meta: "<span>更新于 {{updated}}</span><span>在 macOS 和 Windows 电脑上运行，不支持手机</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "使用前须知：仅限电脑端运行。", text: "AI Translator 专为 macOS 和 Windows 设计，不在手机上运行。请在电脑浏览器中打开 YouTube 视频或直播以查看实时翻译字幕。" })}
</div></section>

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["适用场景", "电脑浏览器中播放的 YouTube 视频与直播<small>支持 Chrome、Safari、Edge、Firefox 等主流浏览器</small>"],
  ["支持语言", "英语、中文、日语、韩语、越南语相互翻译<small>全方向覆盖，已通过严格的翻译质量基准评测</small>"],
  ["翻译延迟", "中位延迟 0.76–1.03 秒<small>在说话人停顿后测得；基于 Mac M4 Pro，使用 Standard 模型包</small>"],
  ["运行方式", "100% 本地端侧 AI 离线推理<small>音频绝不上传至任何外部服务器，无需安装浏览器扩展</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "典型用途", title: "当 YouTube 视频没有提供目标语言字幕时", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "教学视频与专业公开课", text: "轻松理解英语、日语、韩语的技术教程、计算机科学讲座与学术公开课，不再受限于语言门槛。" })}
${feature({ icon: "users", title: "国际新闻与深度访谈", text: "实时跟进全球前沿资讯、行业峰会专家对话以及长达数小时的技术播客，字幕流畅稳定。" })}
${feature({ icon: "play", title: "YouTube Live 实时直播", text: "在发布会、大型赛事或创作者直播进行的同时，实时同步阅读中文字幕，不错过关键信息。" })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "特性对比", title: "与 YouTube 自带自动字幕相比有何优势？" })}
<p>虽然 YouTube 部分视频具备自动生成字幕功能，但很多非英语视频不支持自动翻译为中文，且在实时直播场景下经常不可用或存在较长延迟。使用 AI Translator 具备显著优势：</p>
${checkList([
  "<strong>兼容全部视频：</strong> 直接基于系统声音驱动，无论视频作者是否启用字幕或平台是否生成自动字幕均可稳定翻译。",
  "<strong>全面支持 YouTube Live：</strong> 在实时直播过程中同步生成双语字幕，不受平台直播字幕功能限制。",
  "<strong>灵活的悬浮字幕条：</strong> 可随意拖动字幕至画面任意位置，自定义字号（14–48 px）、字体颜色及背景透明度。",
  "<strong>双语对照学习模式：</strong> 上方显示紧凑原文，下方显示清晰译文，非常适合专业术语对照及外语学习。",
])}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "快速上手", title: "开启 YouTube 实时翻译字幕的 4 个步骤" })}
${steps([
  { title: "安装并启动 AI Translator", text: "将<a href=\"/zh/download/\">下载页面</a>中的安装命令粘贴至终端（macOS）或 PowerShell（Windows）。在“翻译目标语言”中选择中文。" },
  { title: "在浏览器中播放 YouTube 视频或直播", text: "在电脑浏览器（Chrome、Edge、Safari、Firefox）中打开 YouTube 视频或直播页面，确保音频正常播放。" },
  { title: "点击“开始”", text: "点击<strong>开始</strong>（快捷键 ⌃⌥T，Windows 为 Ctrl+Alt+T）。macOS 首次运行需授予<em>系统音频录制</em>权限（参阅<a href=\"/zh/guide/macos-audio-permission/\">权限设置指南</a>）。" },
  { title: "调整悬浮字幕条位置", text: "将字幕条拖动到视频播放器下方，在“设置 › 字幕”中调节文字大小，点击<em>锁定（鼠标穿透）</em>以便操作网页。" },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "观看技巧", title: "如何获得更流畅的 YouTube 观看体验" })}
${checkList([
  "<strong>仅采集浏览器声音（macOS）：</strong> 避免系统通知音干扰翻译，可在“设置 › 音频”中选择<em>仅 Google Chrome</em>（或当前浏览器）后再启动翻译。",
  "<strong>调节断句停顿时间：</strong> 对于语速缓慢或停顿较多的讲座视频，可在设置中适当增加<em>结束句子的停顿时间</em>（50–800 ms），使字幕断句更完整自然。",
  "<strong>导出逐字稿用于复习：</strong> 观看长时间的课程后，可一键复制带时间戳的完整字幕逐字稿，或导出为 TXT、SRT 文件（参阅<a href=\"/zh/guide/history-and-export/\">历史与导出</a>）。",
  "<strong>添加行业专业术语：</strong> 对于医学、编程或金融等专业领域的视频，可将特定词汇添加到<em>自定义术语表</em>以提高专有名词的翻译准确度。",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "客观限制", title: "哪些场景不适合使用 AI Translator？", text: "我们明确说明软件边界，避免不适用的场景浪费您的时间。" })}
${checkList([
  "<strong>希望在手机端使用 YouTube。</strong> AI Translator 专为 macOS 和 Windows 设计，不在手机上运行。请在电脑浏览器中观看。",
  "<strong>希望下载带有中文字幕的视频文件。</strong> 应用不下载视频文件，不修改也不转存视频，仅在播放时实时呈现浮动字幕并提供文本逐字稿。",
  "<strong>需要配音或将字幕烧录压制到视频中。</strong> 不提供配音，也不将硬字幕压制到视频文件中；字幕仅以悬浮条形式叠加显示于屏幕上。",
  "<strong>源视频语言超出当前支持范围。</strong> 当前仅支持英语、中文、日语、韩语、越南语 5 种语言互译，暂不支持其他语言。",
  "<strong>电脑硬件配置过低。</strong> 说话人停顿后字幕出现的中位延迟为 0.76–1.03 秒（在 Mac M4 Pro 上使用 Standard 模型包测得），配置较低的电脑延迟会更高。",
], true)}
${callout({ kind: "warn", title: "自动翻译可能存在识别或用词偏差。", text: "AI 翻译旨在辅助实时听懂内容，请勿在未经人工核对的情况下将其作为重要法律、商务或医疗决策的唯一依据。" })}
<p>我们用浏览器中播放的视频做过测试，还在 Mac M4 Pro 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日），在约 4 分钟的观看中字幕稳定连续。AI Translator 旨在为电脑端 YouTube 观看者提供即时、便捷的双语字幕体验。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "YouTube 翻译常见疑问解答" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "了解更多", title: "后续指引", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/zh/solutions/webinar-and-video-translation/", icon: "book", title: "网络研讨会与课程", text: "在线公开课、研讨会及长时间专业视频翻译方案。", more: "查看解决方案" })}
${linkCard({ href: "/zh/solutions/livestream-translation/", icon: "play", title: "直播视频翻译", text: "探索多平台实时直播流的双语悬浮字幕翻译。", more: "查看解决方案" })}
${linkCard({ href: "/zh/pricing/", icon: "wallet", title: "方案价格", text: "10 天免费试用；提供 Monthly、6 Months 和 Yearly 灵活预付套餐。", more: "查看价格" })}
</div>
<p class="center-text reveal">想了解音频与数据如何受到保护？请查阅<a href="/zh/data-security/">数据与安全说明</a>。</p>
<p class="disclaimer">YouTube 是 Google LLC 的商标；AI Translator 与 Google 或 YouTube 之间不存在附属或关联关系。</p>
</div></section>

${ctaBand({
  title: "立即使用 AI Translator 开启 YouTube 翻译",
  text: "一行命令快捷安装，在 macOS 与 Windows 上享受 10 天免费试用，无需绑定信用卡。",
  primary: { href: "/zh/download/", label: "立即下载" },
  secondary: { href: "/zh/pricing/", label: "查看价格方案" },
})}
`,
};
