import { pageHero, sectionHead, feature, linkCard, checkList, callout, ctaBand, facts } from "../../build/components.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "解决方案", path: "/zh/solutions/" },
];

export default {
  id: "solutions",
  lang: "zh",
  path: "/zh/solutions/",
  title: "解决方案：会议、直播和视频翻译字幕",
  description:
    "AI Translator 为 Zoom、Teams、Meet 和 Zalo 通话、直播、网络研讨会和视频显示翻译字幕。了解如何使用，以及哪些情况不适合。",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  body: () => `
${pageHero({ crumbs, title: "AI Translator 可以用来做什么？", lead: "AI Translator 为电脑上播放的任何音频显示实时翻译字幕，语音识别和翻译都在你自己的电脑上运行。主要用途包括在线会议、观看直播，以及观看你听不懂的语言的网络研讨会、课程或视频。本页帮助你选择合适的设置，也会告诉你哪些情况不适合使用这款应用。" })}

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "主要用途", title: "选择最接近你的情况", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/zh/solutions/online-meeting-translation/", icon: "users", title: "在线会议：Zoom、Teams、Meet、Zalo", text: "与海外合作伙伴通话时显示翻译字幕，不需要机器人，也不需要请主持人开启任何功能。包括通话前如何准备、通话中的快捷键以及通话后的转写内容。", more: "查看会议解决方案" })}
${linkCard({ href: "/zh/solutions/webinar-and-video-translation/", icon: "play", title: "网络研讨会、课程和视频", text: "观看其他语言的会议演讲、课程或视频时阅读翻译字幕，即使是长达数小时的会话也可以，之后还能复制或导出转写内容来复习。", more: "查看网络研讨会和视频解决方案" })}
${linkCard({ href: "/zh/solutions/livestream-translation/", icon: "video", title: "在电脑上观看直播", text: "在电脑上观看英语、中文、日语或韩语直播时显示翻译字幕，不需要在浏览器中安装任何东西。坦诚说明局限：不支持手机，也不能翻译你自己的直播。", more: "查看直播解决方案" })}
${linkCard({ href: "/zh/solutions/tiktok-live-translation/", icon: "laptop", title: "TikTok 直播", text: "如何在电脑浏览器中观看带翻译字幕的 TikTok 直播，以及它特有的局限。", more: "查看 TikTok 直播指南" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "共同点", title: "在任何情况下都不变的部分", text: "无论你是在开会还是在看视频，AI Translator 的工作方式都一样。", center: true })}
<div class="grid grid-2">
${feature({ icon: "speaker", title: "它听取系统音频", text: "应用采集电脑上正在播放的声音，所以适用于任何会发出声音的应用或网页。不需要机器人、插件，也不需要会议或视频平台的账户。" })}
${feature({ icon: "wifi-off", title: "翻译时离线", text: "语音识别和翻译在你的电脑上运行。音频留在内存中：不写入磁盘，也不发送到任何地方。请参阅<a href=\"/zh/data-security/\">数据与安全</a>。" })}
${feature({ icon: "languages", title: "五种语言", text: "英语、中文、日语、韩语和越南语，说话的音频和译文都支持。你可以选择自己想阅读的语言。" })}
${feature({ icon: "captions", title: "悬浮字幕条", text: "一条始终置顶的字幕条，从不抢走你正在使用的应用的焦点。可以拖动、调整文字大小，也可以锁定让鼠标穿透。请参阅<a href=\"/zh/features/\">全部功能</a>。" })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "开始之前", title: "你需要什么", center: true })}
<div class="reveal">${facts([
  ["平台", "Apple 芯片上的 macOS 14.2 或更高版本，以及 Windows 10/11 x64<small>Intel Mac 和 Windows ARM64：不支持</small>"],
  ["电脑", "至少 8 GB 内存，建议 16 GB<small>一次性下载模型：1.3 GB（Lite）或 2.5 GB（Standard）</small>"],
  ["语言", "英语、中文、日语、韩语、越南语<small>应用界面：英语、越南语、日语、简体中文、韩语</small>"],
  ["价格", "免费试用 10 天 · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>通过 VietQR 或国际银行卡（USD）预付，不自动续费。根据 Creem 的列表，部分国家不接受银行卡付款。</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "快速选择", title: "什么情况，用什么设置？" })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">情况</th><th scope="col">小提示</th></tr></thead>
<tbody>
<tr><th scope="row">与合作伙伴的 Zoom、Teams 或 Meet 通话</th><td>锁定源语言，把专有名词加入术语表（Pro），把字幕条放在视频正下方</td></tr>
<tr><th scope="row">Zalo PC 通话</th><td>保持“自动检测”，如果知道对方的语言也可以锁定</td></tr>
<tr><th scope="row">直播或 TikTok 直播</th><td>在电脑浏览器中观看，只听取浏览器的声音（macOS），如果句子被切得零碎，就调高“结束一句话的停顿”；不支持手机</td></tr>
<tr><th scope="row">网络研讨会或会议演讲</th><td>保留原文显示（默认开启），并且只听取播放器的声音（macOS）</td></tr>
<tr><th scope="row">课程或讲座视频</th><td>导出转写内容以便复习（Pro），把专业术语加入术语表（Pro）</td></tr>
</tbody></table></div>
</div></section>

<section class="section section-alt" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "坦诚说明局限", title: "哪些情况不适合 AI Translator", text: "提前了解局限，可以省去一次没有结果的试用。" })}
${checkList([
  "<strong>你需要让其他人听到你翻译后的声音。</strong>AI Translator 的字幕只有一个方向，把电脑上播放的音频翻译成你的语言。它不会翻译你的声音并播放到会议中；如需书面回复，可以使用<a href=\"/zh/guide/type-and-translate/\">输入翻译</a>。",
  "<strong>你需要录制会议。</strong>应用不会把音频录制到磁盘。它只保留文字转写内容，而保存历史记录是默认关闭的 Pro 功能。",
  "<strong>你需要自动生成会议纪要、摘要或区分说话人。</strong>暂不提供。",
  "<strong>你使用的是 Intel Mac、Windows ARM64，或者 CPU 不支持 AVX2 的 Windows 电脑。</strong>AI Translator 可在 Apple 芯片上的 macOS 14.2 或更高版本，以及 CPU 支持 AVX2 的 Windows 10/11 64 位（x64）上运行。",
  "<strong>你的电脑内存不足 8 GB，</strong>或者你需要上述五种语言以外的语言：应用目前还无法满足。",
  "<strong>你没有越南银行账户，而且所在国家不在 Creem 接受银行卡付款的范围内。</strong>国际银行卡通过 Creem 付款，而 Creem 不接受部分国家的买家（按 Creem 的列表），也没有 PayPal。这种情况下目前无法为付费套餐付款；Free 试用仍然可以使用。",
  "<strong>你用手机观看直播，或者想为你的观众翻译你自己的直播。</strong>AI Translator 不能在手机上运行，也不会为你的直播添加字幕或翻译语音；请参阅<a href=\"/zh/solutions/livestream-translation/\">直播翻译</a>。",
], true)}
${callout({ kind: "warn", title: "自动翻译可能出错。", text: "在重要决策（合同、医疗、法律、财务）中，请不要在未经专业人士核实的情况下依赖 AI Translator。" })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "继续阅读", title: "想深入了解？", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/zh/compare/offline-vs-cloud-translation/", icon: "layers", title: "离线翻译与云端翻译", text: "客观比较：隐私、成本、延迟、硬件，以及什么情况下该选哪种。", more: "阅读对比" })}
${linkCard({ href: "/zh/guide/quick-start/", icon: "zap", title: "快速入门", text: "从安装到看到第一行字幕，包括 macOS 的录音权限。", more: "打开指南" })}
${linkCard({ href: "/zh/pricing/", icon: "wallet", title: "价格", text: "免费试用 10 天，Monthly 50,000 ₫，6 Months 269,000 ₫，Yearly 500,000 ₫。", more: "查看价格" })}
</div>
</div></section>

${ctaBand({ title: "在你自己的通话或视频上试试", text: "从 10 天免费试用开始，每天 30 分钟。无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/pricing/", label: "查看价格" } })}
`,
};
