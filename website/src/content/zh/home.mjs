import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `一场在线会议中，同事说英语，屏幕上出现中文字幕。视频时长 ${videoMeta("zh", "meeting").seconds} 秒，有声音。`, label: "AI Translator 演示视频：会议实时翻译", fallback: "下载视频（MP4，1 MB）" },
  { kind: "typing", text: `输入翻译把你用中文写的回复转成英文并粘贴到聊天框。视频时长 ${videoMeta("zh", "typing").seconds} 秒，有声音。`, label: "AI Translator 演示视频：输入翻译", fallback: "下载视频（MP4，1 MB）" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "可以用于 Zoom、Teams、Google Meet 和 Zalo 吗？",
    a: `<p>可以，无需机器人或插件：应用采集的是电脑的系统音频，所以不受你使用哪款会议应用的影响。我们在 macOS 上测试过 Zoom、Google Meet、Microsoft Teams 和 Zalo PC 的音频采集（内部测试，不是这些公司的认证）。其他参会者不会收到通知，如果相关规定要求告知，请自行告诉他们。</p>`,
  },
  {
    q: "使用 AI Translator 需要联网吗？",
    a: `<p>翻译时不需要。语音识别、翻译和字幕显示都在你的电脑上完成。只有在以下情况下需要联网：第一次下载应用和模型（约 1.3 GB 或 2.5 GB）、登记免费试用、购买套餐、验证许可证（付费套餐在两次验证之间最多可离线使用 14 天）以及更新应用。</p>`,
  },
  {
    q: "我的会议音频会被发送到别处吗？",
    a: `<p>不会。翻译时，音频只存在于内存（RAM）中，从不写入磁盘，也从不通过网络发送。我们在 macOS 上用网络代理做过检查：翻译期间，应用没有向外发送任何音频或转写文本。</p>`,
  },
  {
    q: "能把直播翻译成我的语言吗？",
    a: `<p>在电脑上可以。应用收听的是电脑播放的音频，所以不依赖网站。我们在 macOS 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日），测试期间越南语字幕一直正常显示。对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果。应用采集到了声音，但识别错了语言，还重复了没有人说过的句子，所以字幕无法使用。我们没有测试过 Facebook Live。没有手机版，应用也不会为你自己的直播添加给观众看的字幕。请参阅<a href="/zh/solutions/livestream-translation/">直播翻译</a>。</p>`,
  },
  {
    q: "可以免费获得会议翻译字幕吗？",
    a: `<p>AI Translator 提供 10 天免费试用，每天最多翻译 30 分钟，无需银行卡，也无需账号。这是试用，不是永久免费的套餐；之后需要购买预付套餐：Monthly 50,000 ₫、6 Months 269,000 ₫ 或 Yearly 500,000 ₫。</p>`,
  },
  {
    q: "在越南境外可以付款吗？",
    a: `<p>可以。除了从越南银行用越南盾（VND）进行 VietQR 转账外，你还可以在应用的升级页面，通过 Creem 付款页面用国际银行卡以美元付款：Monthly US$3.99、6 Months US$21.99、Yearly US$39.99，价格不含税。根据 Creem 的名单，部分国家不支持银行卡付款。Free 试用不需要任何付款方式。</p>`,
  },
];

export default {
  id: "home",
  lang: "zh",
  path: "/zh/",
  title: "直播与会议实时翻译字幕，离线运行 | AI Translator",
  description:
    "为直播、视频和 Zoom、Teams、Meet 会议提供实时翻译字幕，支持英语、中文、日语、韩语、越南语。AI 在你的电脑上运行，不经过云端。",
  software: true,
  modified: "2026-10-27",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "zh", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS（Apple 芯片）· Windows 10/11 · 免费试用 10 天</p>
<h1 class="reveal">为<em>每一场会议</em><span class="nowrap">提供</span> AI 翻译字幕，在你的电脑上运行</h1>
<p class="lead reveal"><strong>AI Translator</strong> 是一款适用于 macOS 和 Windows 的 AI 实时翻译桌面应用：把电脑上播放的音频实时变成悬浮在屏幕上的翻译字幕，并把你输入的消息翻译成对方的语言。AI 在你自己的电脑上运行，所以你的音频和会议内容不会被发送到云端。可用于 Zoom、Microsoft Teams、Google Meet、Zalo PC、网络研讨会、视频，以及你在电脑上观看的直播。</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/zh/download/">下载 ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">了解使用方法</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI 100% 在你的设备上运行</li>
<li>${icon("check")} 会议数据从不上传云端</li>
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

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "主要功能", title: "会议翻译、输入翻译、历史记录", center: true })}
${featureTabs({
  listLabel: "选择功能",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "会议翻译",
      title: "会议说外语，字幕用你的语言",
      lead: "应用收听电脑上正在播放的音频，把译文显示在悬浮字幕条上。不会有机器人加入会议。",
      bullets: [
        "五种语言，任意两种之间互译：英语、中文、日语、韩语、越南语；自动检测说话的语言",
        `说话人说完一句话后，字幕就会出现：在 Mac M4 Pro（Standard 模型包）上中位数低于 1.1 秒，其他电脑可能更慢（<a href="/zh/features/#performance">测试条件</a>）`,
        `可用于 Zoom、Teams、Meet 和 Zalo；线下会议把采集来源选为<strong>麦克风</strong>（<a href="/zh/features/#microphone">使用方法</a>）；也适用于你在电脑上观看的直播（<a href="/zh/solutions/livestream-translation/">直播翻译</a>）`,
      ],
      cta: { href: "/zh/features/", label: "查看全部功能" },
      media: demoVideo({ lang: "zh", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "输入翻译",
      title: "用对方的语言回复",
      lead: "在你正在使用的聊天框中按 ⌃⌥G（Windows：Ctrl+Alt+G），用自己的语言输入并按 Enter：译文会被粘贴到聊天框中，你检查后再发送。",
      bullets: [
        "在任何支持粘贴（⌘V、Ctrl+V）的应用中，粘贴到你正在输入的框里",
        "在你的电脑上翻译：你输入的内容从不离开电脑",
        "所有套餐都包含，而且不消耗翻译时间",
      ],
      cta: { href: "/zh/guide/type-and-translate/", label: "阅读输入翻译指南" },
      media: demoVideo({ lang: "zh", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "历史记录",
      title: "会议结束后回看内容",
      lead: "每次会话都有转写记录，包含每句话的时间、原文和译文。",
      bullets: [
        "所有套餐：查看、搜索和复制最近一次会话的转写记录",
        "Pro 功能：保存会话的历史记录，重新打开以前的会话，导出为 TXT、SRT 或 Markdown",
        "保存历史记录默认关闭；开启后会加密，只保存在你的电脑上",
      ],
      cta: { href: "/zh/guide/history-and-export/", label: "阅读历史记录指南" },
      media: appShot({ slug: "app-history", lang: "zh", alt: "历史记录页面：已保存会话的列表，显示日期和时间、分钟数、句子数、预览，以及打开和删除按钮", caption: "历史记录：保存在你电脑上的会话。" }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "使用方法", title: "四步开始使用", text: "安装和设置只需一次，之后每次会议只要点“开始”。", center: true })}
<div class="split wide-left">
${steps([
  { title: "一行命令安装", text: `把<a href="/zh/download/">下载页面</a>上的命令粘贴到终端（macOS）或 PowerShell（Windows）。` },
  { title: "首次设置", text: "选择语言，下载模型（约 1.3 GB 或 2.5 GB），允许录制系统音频（仅 macOS）。" },
  { title: "开会时点“开始”", text: "在<strong>目标语言</strong>中选择语言，然后点<strong>开始</strong>（⌃⌥T，Windows：Ctrl+Alt+T）。" },
  { title: "回复和回看", text: "按 ⌃⌥G（Windows：Ctrl+Alt+G）使用输入翻译；会议结束后打开<strong>转写记录</strong>或<strong>历史记录</strong>。" },
], true)}
${appShot({ slug: "app-home-running", lang: "zh", alt: "会话进行中的 AI Translator 主页：翻译中状态、语言、音频来源和剩余翻译时间", caption: "会话进行中的主页（Monthly 套餐）。" })}
</div>
<p class="disclaimer">macOS 版是临时签名（ad-hoc），尚未经过公证（notarize）；Windows 版还没有代码签名。用命令安装时，macOS 会直接打开应用，SmartScreen 也不会询问；用浏览器下载的文件在首次启动时可能被阻止或收到警告。请查看 <a href="/zh/guide/install-macos/">macOS</a> 和 <a href="/zh/guide/install-windows/">Windows</a> 安装指南。</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/zh/guide/quick-start/">阅读快速入门指南 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "你的数据留在你的电脑上", title: "AI 在你的电脑上运行，会议内容不会离开它", center: true })}
${dataFlow("zh")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "音频不离开你的电脑", text: "音频只存在于 RAM 中：从不写入磁盘，也从不通过网络发送，我们已在 macOS 上用网络代理验证过。网络断开时字幕也会继续出现。", accent: true })}
${feature({ icon: "shield", title: "服务器上没有会议内容", text: "服务器只保存销售套餐、激活设备和提供支持所需的数据（详见下方），从不保存会议内容。" })}
</div>
<details class="more-details reveal"><summary>服务器具体保存哪些数据？</summary><p>我们的服务器只保存你的电子邮箱（购买时，或你在客服聊天中自愿留下时）、订单、许可证、设备激活信息（经过哈希处理的设备 ID 和设备名称）、Free 试用的开始时间（经过哈希处理的设备 ID）、许可证变更记录、去除了个人数据的错误报告（保存 30 天），以及你使用客服聊天时的聊天消息（保存 90 天），从不保存会议内容。</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/zh/data-security/">详细了解你的数据去向 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "价格", title: "四种简单的套餐，通过 VietQR 或国际银行卡预付", text: "不自动续费，不定期扣费，从不自动收费。", center: true })}
${plansGrid("zh", { ctaLabel: "下载", freeLabel: "安装并免费试用" })}
<p class="disclaimer">VND 价格通过越南银行的 VietQR 支付；USD 价格通过国际银行卡支付，不含税（如有）。</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/zh/pricing/">详细比较各套餐 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "你可能最先想知道的事" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/zh/faq/">查看全部问题 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "准备好听懂每一场会议了吗？", text: "一行命令即可安装（Mac 用终端，Windows 用 PowerShell），免费试用 10 天，无需银行卡。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/guide/quick-start/", label: "阅读快速入门指南" } })}
`,
};
