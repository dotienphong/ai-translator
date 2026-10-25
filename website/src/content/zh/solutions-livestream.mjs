import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "解决方案", path: "/zh/solutions/" },
  { name: "直播翻译", path: "/zh/solutions/livestream-translation/" },
];

const FAQ = [
  {
    q: "如何把直播翻译成我的语言？",
    a: `<p>在电脑上安装 AI Translator，用浏览器打开直播，在“目标语言”中选择你想阅读的语言（英语、越南语、中文、日语或韩语），然后点“开始”。应用收听电脑上正在播放的音频，在悬浮字幕条上显示翻译字幕。从说话人说完一句话到字幕出现，延迟中位数为 0.76–1.03 秒，在 Mac M4 Pro（Standard 模型包）上测得。我们只测量过包含越南语的语言对的翻译质量（<a href="/zh/features/#quality-by-direction">查看表格</a>）；其他语言对（例如日语到英语）可以运行，但没有测得的评分。</p>`,
  },
  {
    q: "可以用于 TikTok Live、YouTube 和 Facebook Live 吗？",
    a: `<p>应用采集的是电脑的系统音频，所以不依赖平台，只要直播在你的电脑上发出声音，应用就能听到。我们用浏览器中播放的视频做过测试，还在 Mac M4 Pro 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日）。在约 4 分钟的观看中，越南语字幕一直正常显示，把音频来源设为“仅 Google Chrome”时也是如此；译文大体与讲话内容相符，但有几处小错误。对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果。应用采集到了声音，但背景音乐导致识别出错，所以字幕无法使用。我们没有测试过 Facebook Live。另请参阅<a href="/zh/solutions/tiktok-live-translation/">翻译 TikTok 直播</a>。</p>`,
  },
  {
    q: "能在手机上翻译直播吗？",
    a: `<p>不能。AI Translator 只能在 macOS（Apple 芯片）和 Windows 10/11 上运行，所以只有在电脑上观看直播时才能使用。</p>`,
  },
  {
    q: "实时翻译需要联网吗？",
    a: `<p>翻译本身不需要。语音识别、翻译和字幕都在你的电脑上运行，你的音频不会被发送到任何地方。不过，观看直播仍然需要联网。</p>`,
  },
  {
    q: "能把我自己的直播翻译给我的观众吗？",
    a: `<p>不能。AI Translator 没有为你的直播添加字幕或翻译语音的功能。它生成的字幕是给使用该应用的人本人阅读的，显示在这个人自己电脑上的悬浮字幕条上。</p>`,
  },
  {
    q: "直播翻译是免费的吗？",
    a: `<p>Free 套餐是 10 天试用，每天最多翻译 30 分钟，无需银行卡，也无需账户。之后需要购买预付套餐，请参阅<a href="/zh/pricing/">价格</a>。Free 是试用，不是永久免费的套餐。</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "zh",
  path: "/zh/solutions/livestream-translation/",
  title: "直播实时翻译字幕（电脑端）",
  description:
    "在电脑上观看 YouTube、TikTok 等直播时显示实时翻译字幕。AI 在你的电脑上运行；没有手机版，也不能把你自己的直播翻译给观众。",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "直播视频翻译器：为直播显示实时字幕",
  lead: "AI Translator 是一款用于电脑的直播视频翻译器，可以实时翻译直播，并以字幕形式显示在你的屏幕上。它收听你电脑上正在播放的音频，所以无需任何扩展就能用于浏览器中的直播视频，语音识别和翻译也都在你自己的电脑上运行。它只能在 macOS 和 Windows 上运行，不能在手机上使用。字幕只供使用该应用观看直播的人自己阅读；应用不会把你自己的直播翻译给你的观众。",
  meta: "<span>更新于 {{updated}}</span><span>在 macOS 和 Windows 电脑上运行，不支持手机</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["适用于", "在电脑的浏览器或应用中播放的直播<small>例如 TikTok Live、YouTube、Facebook Live。应用收听的是电脑发出的声音，所以不依赖平台。我们用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日）。在一场带背景音乐的越南语 TikTok 直播上，背景音乐导致字幕无法使用。我们没有测试过 Facebook Live。</small>"],
  ["语言", "英语、中文、日语（日本語）、韩语（한국어）、越南语（Tiếng Việt）<small>只有包含越南语的语言对测量过翻译质量</small>"],
  ["延迟", "中位数 0.76–1.03 秒<small>从说话人说完一句话算起；Mac M4 Pro，Standard 模型包；性能较弱的电脑会更慢</small>"],
  ["平台", "macOS 14.2+（Apple 芯片）和 Windows 10/11 x64<small>没有手机或平板电脑版本</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "适合谁", title: "直播很精彩，却不是你的语言", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "观看外语直播的人", text: "创作者、演讲者或媒体用英语、中文、日语或韩语进行的直播，你想在直播进行时就看懂。" })}
${feature({ icon: "users", title: "观看直播活动的人", text: "外语的大会、产品发布会或直播带货，你在其中只是观看和收听。" })}
${feature({ icon: "book", title: "学习者", text: "外语的直播讲座、课程和演讲，你想一句一句地跟上。" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">工作原理</span>
<h2>在你自己的电脑上实时翻译直播</h2>
${checkList([
  "在电脑的浏览器（或应用）中打开直播，然后在 AI Translator 中点<strong>开始</strong>",
  "应用采集电脑上正在播放的声音，把它切分成句子，然后在你的电脑上识别并翻译语音",
  "译文显示在直播窗口上方的悬浮字幕条上，原文以小字显示在译文上方",
  "不需要浏览器扩展，应用也不连接任何平台账户。字幕条从不抢走你正在使用的窗口的焦点，所以你可以继续在聊天中输入",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "zh", alt: "显示三句话的 AI Translator 字幕条：两句英语各以小字显示原文，下方是大字的中文译文；另一句本来就是中文，只占一行", caption: "真实的字幕条：上方是小字原文，下方是译文。" })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "开始使用", title: "四步观看带翻译字幕的直播" })}
${steps([
  { title: "在电脑上打开直播", text: "在电脑的浏览器（或应用）中打开直播，并让它播放声音。在 macOS 上，第一次点“开始”时，系统会请求<em>系统音频录制</em>权限，请参阅<a href=\"/zh/guide/macos-audio-permission/\">如何授予权限</a>。" },
  { title: "选择语言", text: "把<em>目标语言</em>设为你想阅读的语言。如果整场直播只用一种语言，就把<em>源语言</em>设为该语言，而不是<em>自动检测</em>；如果说话人会切换语言，就保持自动检测。" },
  { title: "点“开始”", text: "在直播播放之前或刚开始时点<strong>开始</strong>（快捷键 ⌃⌥T，Windows：Ctrl+Alt+T）。应用会在最初几秒加载模型（安装或更新后的第一次可能更久，最多几分钟）。" },
  { title: "摆好字幕条", text: "把字幕条拖到视频正下方，在“设置 › 字幕”中设置字号和颜色，然后点击<em>锁定（点击穿透）</em>，让鼠标可以穿过字幕条。" },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "技巧", title: "直播往往无法倒回，这些设置能帮上忙" })}
${checkList([
  "<strong>把来源设为“仅 {应用名称}”（macOS）：</strong>为了不翻译系统通知，请先播放直播，再在“设置 › 音频”中点击<em>刷新列表</em>（列表只显示正在播放声音的应用），选择正在播放直播的浏览器，然后再点“开始”。Safari 对应的选项名为<em>仅 Safari 以及其他应用内的网页</em>。新的来源从下一次会话开始生效。该浏览器的其他标签页仍会被收听，所以请把它们静音。",
  "<strong>Windows 目前还不能只选择一个应用：</strong>观看时请把系统通知静音。",
  "<strong>结束一句话的停顿</strong>可在 50 到 800 ms 之间调整。调短，字幕出现得更快；调长，句子更不容易被切断。如果句子在中间被切断（说话人犹豫或停下来换气），可以试着调高；更改从下一次会话开始生效。",
  "<strong>漏看了一句？</strong>字幕条锁定时，按 ⌃⌥PageUp（Windows：Ctrl+Alt+PageUp）查看之前的句子，按 ⌃⌥PageDown 返回；字幕条未锁定时，在字幕条上滚动，再点击<em>最新</em>回到实时的那一行。所有套餐都可以查看、搜索和复制最近一次会话的转写记录；开始新的会话后，它会被替换（<a href=\"/zh/guide/history-and-export/\">历史记录和导出</a>）。",
])}
${callout({ title: "长时间直播的翻译时长。", text: "时长只计算已翻译的语音，不计算静音；已经是你想阅读的语言的句子也不计算。Free 是 10 天试用，每天 30 分钟，所以较长的直播需要 Monthly（每 30 天 50 小时）、6 Months（每 30 天 100 小时）或 Yearly（不限时长）。请参阅<a href=\"/zh/pricing/\">价格</a>。" })}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "坦诚说明局限", title: "哪些直播场景不适合 AI Translator？", text: "提前了解局限，可以省去一次没有结果的试用。" })}
${checkList([
  "<strong>你用手机观看。</strong>AI Translator 只能在 macOS 和 Windows 上运行，所以无法在手机应用内显示字幕。要使用它，请在电脑上打开直播。",
  "<strong>你是主播，想为你的观众翻译。</strong>应用生成的字幕是给使用该应用的人本人阅读的，显示在这个人自己电脑上的悬浮字幕条上。它不会为你的直播添加字幕或翻译语音。",
  "<strong>你需要录制直播、下载视频，或从视频文件生成字幕文件。</strong>应用不会把音频或视频录制到磁盘，也不处理视频文件；它只有文字转写记录，也没有摘要模式。",
  "<strong>音频不清楚。</strong>背景音乐很大、有噪音或多人同时说话时，识别效果会变差，译文也更容易出错。",
  "<strong>你需要在 Windows 或性能较弱的电脑上获得较快的速度。</strong>0.76–1.03 秒的延迟是在 Mac M4 Pro 上用 Standard 模型包测得的；Windows 只在一台使用集成显卡的笔记本上做过初步测量，速度更慢（<a href=\"/zh/features/#performance\">测试条件</a>）。",
  "<strong>直播语言不是英语、中文、日语、韩语或越南语。</strong>应用只支持这五种语言；泰语、印尼语或其他语言的直播目前还无法翻译。",
], true)}
${callout({ kind: "warn", title: "机器翻译可能出错。", text: "在重要决策（购物、合同、医疗、法律、财务）中，请不要在未经专业人士核实的情况下依赖 AI Translator。" })}
<p>我们用浏览器中播放的视频做过测试，还在 Mac M4 Pro 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日）。在约 4 分钟的观看中，越南语字幕一直正常显示，把音频来源设为“仅 Google Chrome”时也是如此；译文大体与讲话内容相符，但有几处小错误。对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果。应用采集到了声音，但背景音乐导致识别出错，所以字幕无法使用。我们没有测试过 Facebook Live。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "关于直播翻译的常见问题" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "继续阅读", title: "下一步", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/zh/solutions/tiktok-live-translation/", icon: "play", title: "翻译 TikTok 直播", text: "如何在电脑浏览器中观看带翻译字幕的 TikTok 直播，以及它特有的局限。", more: "查看指南" })}
${linkCard({ href: "/zh/solutions/webinar-and-video-translation/", icon: "book", title: "网络研讨会、课程和视频", text: "其他语言的录制内容，包括长达数小时的会话。", more: "查看解决方案" })}
${linkCard({ href: "/zh/guide/quick-start/", icon: "zap", title: "快速入门", text: "从安装到看到第一行字幕。", more: "打开指南" })}
</div>
<p class="center-text reveal">想知道你观看的内容会不会被发送到别处？请阅读<a href="/zh/data-security/">数据与安全</a>。</p>
<p class="disclaimer">TikTok、YouTube、Facebook 等产品名称归各自所有者所有；AI Translator 与它们没有关联。</p>
</div></section>

${ctaBand({ title: "在你观看的下一场直播上试试", text: "一行命令即可安装，用 Free 免费试用 10 天，每天 30 分钟。无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/pricing/", label: "查看价格" } })}
`,
};
