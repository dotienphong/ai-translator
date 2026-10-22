import { RELEASE } from "../../site.mjs";
import { dataFlow, demo, demoVideo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, facts, linkCard, appShot, overlayShot, callout, checkList } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_TEXT = `一场在线会议中，同事说英语，屏幕上出现中文字幕；接着，输入翻译把你用中文写的回复转成英文，发到聊天里。视频时长 ${videoMeta("zh").seconds} 秒，有声音。`;

export const HOME_FAQ = [
  {
    q: "使用 AI Translator 需要联网吗？",
    a: `<p>翻译时不需要。语音识别、翻译和字幕显示都在你的电脑上完成。只有在以下情况下需要联网：第一次下载应用和模型（约 1.3 GB 或 2.5 GB）、登记免费试用、购买套餐、验证许可证（付费套餐在两次验证之间最多可离线使用 14 天）以及更新应用。</p>`,
  },
  {
    q: "有没有能在电脑上离线翻译会议字幕的应用？",
    a: "<p>有。AI Translator（aitranslator.io.vn）是一款桌面应用，支持 macOS 14.2 或更高版本（Apple 芯片）和 Windows 10/11 64 位（x64），可以为电脑上播放的任何音频显示实时翻译字幕。语音识别和翻译都在设备上运行，所以翻译时不需要联网，音频也不会离开你的电脑。支持英语、中文、日语、韩语和越南语，并提供 10 天免费试用。</p>",
  },
  {
    q: "如何不用机器人就把 Zoom 会议翻译成我的语言？",
    a: "<p>打开 AI Translator，选择你想阅读的语言，然后点“开始”。应用会收听电脑上正在播放的 Zoom 音频，并在悬浮字幕条中显示翻译字幕。不会有机器人加入会议，主持人也无需开启任何功能；其他参会者不会收到通知，如果你的规定要求告知，请自行告诉他们。</p>",
  },
  {
    q: "可以免费获得会议翻译字幕吗？",
    a: "<p>AI Translator 提供 10 天免费试用，每天最多翻译 30 分钟，无需银行卡，也无需账号。之后需要购买预付套餐：Monthly 50,000 ₫（每 30 天 50 小时）、6 Months 269,000 ₫（180 天内每 30 天 100 小时）或 Yearly 500,000 ₫（365 天不限时长）。Free 是试用，不是永久免费的套餐。</p>",
  },
  {
    q: "我的会议音频会被发送到别处吗？",
    a: `<p>不会。翻译时，音频只存在于内存（RAM）中，从不写入磁盘，也从不通过网络发送。我们在 macOS 上用网络代理做过检查：翻译期间，应用没有向外发送任何音频或转写文本。</p>`,
  },
  {
    q: "可以用于 Zoom、Teams、Google Meet 和 Zalo 吗？",
    a: `<p>可以。应用采集的是电脑的系统音频，所以不受你使用哪款会议应用、网络研讨会或视频的影响，也不需要机器人或插件。我们在 macOS 上测试过 Zoom、Google Meet、Microsoft Teams 和 Zalo PC 的音频采集（内部测试，不是这些公司的认证）。在 macOS 上，你还可以选择只收听某一个应用的声音。</p>`,
  },
  {
    q: "AI Translator 支持哪些语言？",
    a: `<p>源音频和译文都支持五种语言：英语、中文、日语（日本語）、韩语（한국어）和越南语（Tiếng Việt）。我们计划在未来增加更多语言（暂无具体时间）。应用界面提供越南语、英语、日语、中文（简体）和韩语。</p>`,
  },
  {
    q: "需要注册账号吗？",
    a: `<p>不需要，没有登录环节。Free 试用只要求你同意使用条款；付费套餐通过付款后发送到你邮箱的许可证密钥激活。</p>`,
  },
  {
    q: "在越南境外可以付款吗？",
    a: `<p>可以。除了从越南银行用越南盾（VND）进行 VietQR 转账外，你还可以在应用的升级页面，通过 Creem 付款页面用国际银行卡以美元付款：Monthly US$3.99、6 Months US$21.99、Yearly US$39.99，价格不含税。根据 Creem 的名单，部分国家不支持银行卡付款。Free 试用不需要任何付款方式。</p>`,
  },
  {
    q: "现在可以在哪里下载？",
    a: `<p>在 macOS 上，只需把一行命令粘贴到终端即可安装，命令在<a href="/zh/download/">下载页面</a>上，应用会直接打开，不需要点“仍要打开”。Windows 版同样只需把同一页面上的一行命令粘贴到 PowerShell 即可安装。</p>`,
  },
];

export default {
  id: "home",
  lang: "zh",
  path: "/zh/",
  title: "会议实时翻译字幕，离线运行 | AI Translator",
  description:
    "在 Zoom、Teams、Google Meet 或任何应用中阅读实时翻译字幕。支持英语、中文、日语、韩语、越南语。AI 在你的电脑上运行，不经过云端。",
  software: true,
  modified: "2026-10-22",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    videoObject({ lang: "zh", name: "AI Translator 演示视频：会议翻译字幕与输入翻译", description: VIDEO_TEXT, uploadDate: "2026-10-22" }),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS（Apple 芯片）· Windows 10/11 · 免费试用 10 天</p>
<h1 class="reveal">为<em>每一场会议</em><span class="nowrap">提供</span> AI 翻译字幕，在你的电脑上运行</h1>
<p class="lead reveal">AI Translator 使用在你自己电脑上运行的 AI，把电脑上播放的音频变成屏幕上的翻译字幕，延迟很低。你的音频和会议内容不会被发送到云端，也不会经过任何云端 AI 服务。可用于 Zoom、Microsoft Teams、Google Meet、Zalo PC、网络研讨会和视频：无需机器人，无需账号。</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/zh/download/">下载 ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-it-works">了解工作方式</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI 100% 在你的设备上运行</li>
<li>${icon("check")} 会议数据从不上传云端</li>
<li>${icon("check")} 低延迟</li>
<li>${icon("check")} 无需机器人，无需账号</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "团队会议（示意）",
  rec: "翻译中",
  langs: "EN → ZH",
  note: "示意图：一场在线会议，屏幕底部浮动着翻译字幕条",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "We will send the quotation by next week.", dst: "我们会在下周之前把报价单发给您。" },
    { src: "Will this specification be ready for next month's release?", dst: "这个规格能赶上下个月的发布吗？" },
    { src: "Let's review the schedule in the next meeting.", dst: "我们在下次会议上再看一下进度吧。" },
  ],
  floatA: { icon: "wifi-off", text: "离线运行" },
  floatB: { icon: "lock", text: "音频留在你的设备上" },
})}
</div>
</div></section>

<section class="section-tight" id="video-demo"><div class="container">
${sectionHead({ eyebrow: "演示视频", title: "看看 AI Translator 如何工作", text: VIDEO_TEXT, center: true })}
${demoVideo({ lang: "zh", label: "AI Translator 演示视频：会议翻译字幕与输入翻译", fallback: "下载演示视频（MP4，2 MB）" })}
</div></section>

<section class="section-tight"><div class="container narrow">
<h2 class="sr-only">AI Translator 是什么？</h2>
<p class="lead reveal"><strong>AI Translator</strong> 是一款为电脑上播放的音频显示实时翻译字幕的桌面应用。它识别语音、翻译，并把结果显示在悬浮字幕条上，全部在你自己的电脑上完成：不会有机器人加入你的会议，也不需要注册账号。macOS 版（Apple 芯片）只需一行命令即可安装；Windows 10/11 版同样只需一行 PowerShell 命令。</p>
<div class="reveal">${facts([
  ["产品类型", "实时翻译字幕桌面应用"],
  ["当前版本", RELEASE.zh],
  ["平台", "macOS 14.2 或更高版本（Apple 芯片）和 Windows 10/11 x64<small>都只需一行命令即可安装</small>"],
  ["语言", "英语、中文、日语（日本語）、韩语（한국어）、越南语（Tiếng Việt）<small>源音频和译文均支持。计划在未来增加更多语言</small>"],
  ["处理方式", "100% 在你的设备上处理，音频从不外传<small>语音识别和翻译都在设备上运行</small>"],
  ["价格", "免费试用 10 天 · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>通过 VietQR（VND）或国际银行卡（USD）预付，不自动续费</small>"],
  ["提供方", "Đỗ Tiến Phong<small>支持：support@aitranslator.io.vn</small>"],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<ul class="app-strip reveal"><li>Zoom</li><li>Microsoft Teams</li><li>Google Meet</li><li>Zalo PC</li><li>网络研讨会</li><li>在线视频</li></ul>
<p class="disclaimer">适用于电脑上播放的任何音频。Zoom、Microsoft Teams、Google Meet 和 Zalo 是各自所有者的产品名称；AI Translator 与它们没有关联。</p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "你的数据留在你的电脑上", title: "AI 在你的电脑上运行，会议内容不会离开它", text: "语音识别、翻译和字幕显示都在你自己的电脑上完成。AI Translator 不会把你的会议音频或内容发送到云端，也不使用任何云端 AI 服务来处理它们。", center: true })}
${dataFlow("zh")}
<div class="grid grid-3">
${feature({ icon: "lock", title: "什么都不上传云端", text: "音频只存在于 RAM 中：从不写入磁盘，也从不通过网络发送。转写文本和译文显示在你的屏幕上，留在你的电脑里；历史记录默认关闭，开启后也会加密保存在你的电脑上。", accent: true })}
${feature({ icon: "zap", title: "低延迟", text: "不需要往返服务器，所以说话人说完一句话后字幕很快就会出现：在 Mac M4 Pro（Standard 模型包）上的中位数低于 1.1 秒。其他电脑会更慢：在一台使用集成显卡的 Windows 笔记本上的初步测试中，中位数为 1.3–5.4 秒（见功能页面的“性能”部分）。" })}
${feature({ icon: "shield", title: "降低信息泄露风险", text: "合同、人事、财务、产品计划：你的会议内容不会为了翻译而交给任何第三方。我们的服务器只保存你的电子邮箱（购买时，或你在客服聊天中自愿留下时）、订单、许可证、设备激活信息（经过哈希处理的设备 ID 和设备名称）、Free 试用的开始时间（经过哈希处理的设备 ID）、许可证变更记录、去除了个人数据的错误报告（保存 30 天），以及你使用客服聊天时的聊天消息（保存 90 天），从不保存会议内容。" })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/zh/data-security/">详细了解你的数据去向 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt" id="how-it-works"><div class="container">
${sectionHead({ eyebrow: "工作方式", title: "从安装到第一条字幕，只需三步", text: "没有复杂的设置，也不需要邀请机器人加入会议。", center: true })}
${steps([
  { title: "安装应用，下载一次模型", text: "打开应用，按照欢迎步骤操作，允许录制系统音频（macOS），然后把模型下载到你的电脑上（根据模型包不同，约 1.3 GB 或 2.5 GB）。之后一切都可以离线运行。" },
  { title: "会议开始时点“开始”", text: "选择你想阅读的语言（<strong>目标语言</strong>），然后点<strong>开始</strong>或使用快捷键。应用会收听电脑上正在播放的任何声音，无论是 Zoom、Teams、Meet 还是视频。" },
  { title: "阅读悬浮字幕", text: "说话人说完一句话后，字幕条很快就会显示译文（在 Mac M4 Pro 上延迟中位数低于 1.1 秒；其他电脑可能更慢），原文以小字显示在上方（可以关闭）。你可以拖动、调整大小、改变字号或锁定它的位置。" },
])}
<p class="center-text reveal"><a class="btn btn-ghost" href="/zh/guide/quick-start/">阅读快速入门指南 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">字幕条</span>
<h2>在任何背景上都清晰可读的悬浮字幕</h2>
<p class="lead">一条始终置顶、从不抢走会议应用焦点的字幕条。译文逐词出现，尚未定稿的句子颜色较浅，原文以小字显示在上方（默认开启，可以关闭）。</p>
${checkList([
  "拖动即可移动，拖动边缘即可调整大小；每个屏幕都会记住它的位置",
  "字号 14–48 px，5 种文字颜色、5 种背景颜色，背景不透明度可调",
  "<strong>锁定</strong>后鼠标点击会直接穿过字幕条，从不妨碍你操作会议应用",
  "用鼠标滚轮或快捷键回看之前的句子",
])}
<p><a class="btn btn-secondary" href="/zh/features/">查看全部功能 ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "zh", alt: "AI Translator 字幕条：原文以小字显示在上方，下方是中文译文", caption: "真实的字幕条：上方是小字原文，下方是译文。" })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-home-running", lang: "zh", alt: "会话进行中的 AI Translator 主页：翻译中状态、语言、音频来源和剩余翻译时间", caption: "会话进行中的主页（Monthly 套餐）。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">操作简单</span>
<h2>一个页面，满足所有需要</h2>
<p class="lead">选择想阅读的语言，选好音频来源，点“开始”即可。剩余的翻译时间直接显示在主页上。</p>
${checkList([
  "五种可识别和可翻译的语言：英语、中文、日语（日本語）、韩语（한국어）、越南语（Tiếng Việt）",
  "自动检测说话的语言；如果你知道会说哪种语言，也可以固定为一种",
  "全局快捷键，不离开会议应用就能开始翻译、显示或隐藏、锁定和滚动字幕",
  "关闭窗口后，菜单栏图标会让应用继续运行",
])}
</div>
</div>
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">输入翻译</span>
<h2>用对方的语言回复</h2>
<p class="lead">在你正在使用的聊天框中按 ⌃⌥G（Windows：Ctrl+Alt+G），用自己的语言输入并按 Enter：译文会被粘贴到聊天框中，你检查后再发送。</p>
${checkList([
  "在任何支持粘贴（⌘V、Ctrl+V）的应用中，粘贴到你正在输入的框里",
  "在你的电脑上翻译：你输入的内容从不离开电脑",
  "所有套餐都包含，而且不消耗翻译时间",
])}
<p><a class="btn btn-secondary" href="/zh/guide/type-and-translate/">阅读输入翻译指南 ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "zh", alt: "输入翻译框：上方是中文消息，下方是英文译文", caption: "输入翻译框：按 Enter 把译文粘贴到聊天框中。" })}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "为什么选择 AI Translator", title: "与云端工具工作方式不同的会议翻译", text: "许多会议翻译工具会在远程服务器上处理你的音频。AI Translator 正好相反：一切都在你的电脑上完成。", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "从设计上保护隐私", text: "音频只存在于 RAM 中：从不写入磁盘，也从不发送到任何地方。应用没有任何统计分析；遇到错误时，会发送一份去除了个人数据的错误报告（可以在设置中关闭）。", accent: true })}
${feature({ icon: "wifi-off", title: "翻译时离线", text: "语音识别和翻译在你的设备上运行，即使网络不稳定或断开，字幕也会继续出现。应用只是偶尔需要联网处理少数事情，比如验证许可证。" })}
${feature({ icon: "video", title: "任何会议应用，无需机器人", text: "不需要邀请机器人，也不需要安装插件。电脑上任何能发出声音的内容都可以变成字幕。" })}
${feature({ icon: "book", title: "术语表", text: "让它认识你的人名、产品名和行业术语。术语会作为提示交给翻译（最多 500 条，支持 CSV 导入和导出；Pro 功能）。" })}
${feature({ icon: "history", title: "历史记录和导出", text: "把转写记录加密保存在你的电脑上，并导出为 TXT、SRT 或 Markdown。历史记录默认关闭，由你决定是否开启（Pro 功能）。" })}
${feature({ icon: "languages", title: "五种语言", text: "英语、中文、日语（日本語）、韩语（한국어）和越南语（Tiếng Việt），任意两种之间都可以互译。我们计划在未来增加更多语言。应用界面提供越南语、英语、日语、中文（简体）和韩语。" })}
</div>
<div class="stats reveal">
<div class="stat"><b>&lt; 1.1 秒</b><span>从说话人说完一句话到完整译文出现的延迟中位数（Mac M4 Pro，Standard 模型包）</span></div>
<div class="stat"><b>0</b><span>翻译期间向外发送的音频或转写数据（在 macOS 上用网络代理检查）</span></div>
<div class="stat"><b>5 小时 23 分</b><span>在 macOS 上的内部测试中，一次连续会话没有任何错误</span></div>
</div>
<p class="disclaimer">数据在一台特定的机器（Mac M4 Pro，24 GB，macOS 26）上测得。其他电脑可能更慢；请查看<a href="/zh/features/#performance">性能详情和测试条件</a>。</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "用途", title: "无论对话用哪种语言，你都能跟上", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/zh/solutions/online-meeting-translation/", icon: "users", title: "在线会议", text: "为 Zoom、Teams、Google Meet 和 Zalo PC 提供翻译字幕，不需要别人安装任何东西。", more: "查看解决方案" })}
${linkCard({ href: "/zh/solutions/webinar-and-video-translation/", icon: "play", title: "网络研讨会和视频", text: "借助屏幕上的翻译字幕，看懂外语讲座、课程和视频。", more: "查看解决方案" })}
</div>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "价格", title: "四种简单的套餐，通过 VietQR 或国际银行卡预付", text: "不自动续费，不定期扣费，从不自动收费。", center: true })}
${plansGrid("zh", { ctaLabel: "下载", freeLabel: "安装并免费试用" })}
<p class="disclaimer">VND 价格通过越南银行的 VietQR 支付；USD 价格通过国际银行卡支付，不含税（如有）。</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/zh/pricing/">详细比较各套餐 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "我们坦白说明的事项", text: "macOS 版目前是临时签名（ad-hoc），尚未经过公证（notarize）：用终端命令安装会直接打开，但用浏览器下载的 .dmg 在首次启动时会被 macOS 阻止，需要在系统设置中允许（我们提供了<a href=\"/zh/guide/install-macos/\">分步安装指南</a>）。Windows 版还没有代码签名：用 PowerShell 命令安装时 SmartScreen 不会询问，而用浏览器下载的 .exe 可能会收到警告，处于阻止模式的智能应用控制会阻止它（见 <a href=\"/zh/guide/install-windows/\">Windows 安装指南</a>）；此外，Windows 上的延迟只在一台使用集成显卡的笔记本上做过初步测试，比 Mac M4 Pro 慢。我们提前说明，免得你去猜。" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "你可能最先想知道的事" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/zh/faq/">查看全部问题 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "准备好听懂每一场会议了吗？", text: "一行命令即可安装（Mac 用终端，Windows 用 PowerShell），免费试用 10 天，无需银行卡。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/guide/quick-start/", label: "阅读快速入门指南" } })}
`,
};
