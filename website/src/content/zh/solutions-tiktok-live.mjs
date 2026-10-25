import { pageHero, sectionHead, checkList, callout, ctaBand, steps, linkCard, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "解决方案", path: "/zh/solutions/" },
  { name: "TikTok 直播翻译", path: "/zh/solutions/tiktok-live-translation/" },
];

const FAQ = [
  {
    q: "能把 TikTok 直播翻译成我的语言吗？",
    a: `<p>从原理上说可以。应用收听的是电脑播放的音频，所以不依赖网站，能把说英语、中文、日语、韩语或越南语的人所讲的话翻译成这五种语言中的另一种，并显示为字幕。不过，对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果。应用采集到了声音，但识别错了语言，还重复了没有人说过的句子，所以字幕无法使用。我们没有英语、中文、日语或韩语 TikTok 直播的结果。我们用浏览器中播放的视频做过测试，还在 macOS 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日）。做法是在浏览器中打开直播，在 AI Translator 中点“开始”，然后阅读悬浮字幕条上的翻译字幕。</p>`,
  },
  {
    q: "能在手机上使用吗？",
    a: `<p>不能。AI Translator 只能在 macOS（Apple 芯片）和 Windows 10/11 上运行。它不能在 TikTok 应用内或手机上使用，请改为在电脑的浏览器中打开直播。</p>`,
  },
  {
    q: "需要在 TikTok 或浏览器里安装什么吗？",
    a: `<p>不需要。没有浏览器扩展或插件，AI Translator 也不需要连接你的 TikTok 账户，它只收听电脑上正在播放的声音。观看是否需要登录，由 TikTok 决定。</p>`,
  },
  {
    q: "我在 TikTok 直播带货，能为海外客户翻译吗？",
    a: `<p>不能。AI Translator 没有为你的直播添加字幕或翻译语音的功能。它生成的字幕是给使用该应用的人本人阅读的，显示在这个人自己电脑上的悬浮字幕条上。</p>`,
  },
];

export default {
  id: "solutions-tiktok-live",
  lang: "zh",
  path: "/zh/solutions/tiktok-live-translation/",
  title: "TikTok 直播实时翻译（电脑端）",
  description:
    "在电脑浏览器中观看 TikTok 直播时显示翻译字幕的方法。AI Translator 没有手机版；介绍步骤与限制。",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "在电脑上观看时实时翻译 TikTok 直播",
  lead: "如果你想在观看 TikTok 直播时阅读翻译字幕，而主播说的是中文、日语、韩语或应用支持的五种语言中的其他语言，请在电脑的浏览器中打开直播，然后运行 AI Translator。它收听你电脑上正在播放的音频，并在悬浮字幕条上显示译文。它只能在 macOS 和 Windows 上运行，所以不能在手机上的 TikTok 应用内使用，而且字幕只供使用该应用观看直播的人自己阅读，不是给你自己直播的观众看的。",
  meta: "<span>更新于 {{updated}}</span><span>在 macOS 和 Windows 电脑上运行，不支持手机</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "试用前请注意：仅支持电脑。", text: "AI Translator 没有手机版。如果你平时用手机看 TikTok 直播，请在电脑的浏览器中打开同一场直播，就能看到翻译字幕。对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果，字幕无法使用（见下文的“坦诚说明局限”）。" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "开始使用", title: "四步观看带翻译字幕的 TikTok 直播" })}
${steps([
  { title: "安装并打开 AI Translator", text: "把<a href=\"/zh/download/\">下载</a>页面上的安装命令粘贴到终端（macOS）或 PowerShell（Windows）。把<em>目标语言</em>设为你想阅读的语言。" },
  { title: "在电脑上打开 TikTok 直播", text: "在电脑浏览器中打开 TikTok 网站上的直播（如果 TikTok 允许在网页上观看），并让它播放声音。是否需要登录以及谁可以观看，都由 TikTok 决定，与 AI Translator 无关。" },
  { title: "在直播播放时点“开始”", text: "点<strong>开始</strong>（快捷键 ⌃⌥T，Windows：Ctrl+Alt+T）。在 macOS 上，第一次使用时系统会请求<em>系统音频录制</em>权限，请参阅<a href=\"/zh/guide/macos-audio-permission/\">如何授予权限</a>。应用会在最初几秒加载模型（安装或更新后的第一次可能更久，最多几分钟）。" },
  { title: "把字幕条拖到视频旁边", text: "把字幕条拖到直播画面正下方，在“设置 › 字幕”中设置字号，然后点击<em>锁定（点击穿透）</em>，让鼠标可以穿过字幕条。" },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "技巧", title: "句子被切断、背景音乐和多人说话时怎么办" })}
${checkList([
  "<strong>句子在中间被切断（说话人犹豫或停下来换气）：</strong>调高<em>结束一句话的停顿</em>（50–800 ms），句子就更不容易被切断，但字幕会稍晚出现。更改从下一次会话开始生效。",
  "<strong>背景音乐或噪音很大：</strong>识别效果会变差，应用可能识别错语言，或反复显示一句没人说过的话，译文因此可能变得毫无意义；语音清楚的直播效果更好。",
  "<strong>多人同时说话：</strong>应用根据听到的声音逐句翻译，不会区分是谁在说话。",
  "<strong>只收听浏览器（macOS）：</strong>为了不翻译系统通知，请先播放直播，再在“设置 › 音频”中点击<em>刷新列表</em>，选择<em>仅 {浏览器名称}</em>，然后再点“开始”。Safari 对应的选项名为<em>仅 Safari 以及其他应用内的网页</em>。新的来源从下一次会话开始生效；该浏览器的其他标签页仍会被收听。",
  "<strong>Windows 目前还不能只选择一个应用：</strong>观看时请把系统通知静音。",
  "<strong>中文、韩语、日语或英语直播：</strong>把<em>目标语言</em>设为你的语言（英语、越南语、中文、日语或韩语）；如果你知道直播说的是哪种语言，就设置<em>源语言</em>，如果说话人会切换语言，就保持自动检测。我们只测量过包含越南语的语言对的翻译质量（<a href=\"/zh/features/#quality-by-direction\">查看表格</a>）；其他语言对可以运行，但没有测得的评分。",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "坦诚说明局限", title: "哪些情况下 AI Translator 不适合 TikTok 直播？", text: "提前了解局限，可以省去一次没有结果的试用。" })}
${checkList([
  "<strong>你用手机观看 TikTok 直播。</strong>AI Translator 只能在 macOS 和 Windows 上运行，所以无法在手机上的 TikTok 应用内显示字幕。",
  "<strong>你是主播，想为你的观众翻译。</strong>应用生成的字幕是给使用该应用的人本人阅读的，显示在这个人自己电脑上的悬浮字幕条上。它不会为你的直播添加字幕或翻译语音。",
  "<strong>你需要录制直播或下载视频。</strong>应用不会把音频或视频录制到磁盘，也不处理视频文件；它只有文字转写记录。",
  "<strong>直播语言不是英语、中文、日语、韩语或越南语。</strong>应用只支持这五种语言；泰语、印尼语或其他语言的直播目前还无法翻译。",
], true)}
${callout({ kind: "warn", title: "机器翻译可能出错。", text: "在重要决策（购物、付款、合同）中，请不要未经核实就依赖 AI Translator。对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果。应用采集到了声音，但识别错了语言，还重复了没有人说过的句子，所以字幕无法使用。我们用浏览器中播放的视频做过测试，还在 macOS 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日）。" })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "关于 TikTok 直播翻译的常见问题" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "继续阅读", title: "下一步", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/zh/solutions/livestream-translation/", icon: "play", title: "直播翻译", text: "工作原理、往往无法倒回的直播的使用技巧，以及翻译时长；内容不限于特定直播平台。", more: "查看解决方案" })}
${linkCard({ href: "/zh/guide/quick-start/", icon: "zap", title: "快速入门", text: "从安装到看到第一行字幕。", more: "打开指南" })}
${linkCard({ href: "/zh/pricing/", icon: "wallet", title: "价格", text: "10 天 Free 试用；之后可预付 Monthly、6 Months 或 Yearly。", more: "查看价格" })}
</div>
<p class="disclaimer">TikTok 是其各自所有者的商标；AI Translator 与 TikTok 没有关联。</p>
</div></section>

${ctaBand({ title: "在你下一次观看的 TikTok 直播上试试", text: "一行命令即可安装，用 Free 免费试用 10 天，每天 30 分钟。无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/guide/quick-start/", label: "打开指南" } })}
`,
};
