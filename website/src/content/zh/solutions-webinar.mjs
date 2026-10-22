import { pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "解决方案", path: "/zh/solutions/" },
  { name: "网络研讨会和视频", path: "/zh/solutions/webinar-and-video-translation/" },
];

export default {
  id: "solutions-webinar",
  lang: "zh",
  path: "/zh/solutions/webinar-and-video-translation/",
  title: "网络研讨会、课程和视频翻译字幕",
  description:
    "用 AI Translator 观看其他语言的网络研讨会、课程和视频时阅读实时翻译字幕：浏览器中无需安装任何东西，离线运行。",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "网络研讨会、课程和视频的翻译字幕",
  lead: "当你观看其他语言的网络研讨会、线上会议、课程或视频时，AI Translator 会在屏幕上显示翻译字幕。它收听电脑上播放的音频，所以不需要在浏览器或平台上安装任何东西，识别和翻译都在你的电脑上运行。",
  meta: "<span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["适用于", "电脑上任何会发出声音的内容<small>浏览器、媒体播放器、课程平台、网络研讨会工具</small>"],
  ["额外安装", "除了应用本身，什么都不需要<small>不需要浏览器扩展、插件或登录账户</small>"],
  ["语言", "英语、中文、日语、韩语、越南语<small>你可以选择想要阅读的语言</small>"],
  ["长时间会话", "连续运行 5 小时 23 分钟，没有出错<small>Mac M4 Pro、macOS、临时签名的正式版，测试一次</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "适合谁", title: "内容很好，却不是你的语言", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "在线学习者", text: "英语、中文、日语或韩语的课程和讲座视频，你想现在就跟上，而不是等别人翻译。" })}
${feature({ icon: "users", title: "会议听众", text: "有海外演讲者的网络研讨会和线上会议，你只需要听，不需要发言。" })}
${feature({ icon: "play", title: "视频观众", text: "技术视频、演讲和访谈，其自带字幕没有你的语言。" })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "无需额外安装", title: "不依赖播放器或平台" })}
<p>因为 AI Translator 采集的是电脑上正在播放的声音，所以它不依赖你正在观看的网站或平台。按下<strong>开始</strong>，然后播放视频；翻译字幕会显示在播放器窗口上方的悬浮字幕条上。我们用浏览器中的视频测试过，但没有逐一测试每个课程或网络研讨会平台。</p>
<p>在 macOS 上，你只需授予一次<em>系统录音</em>权限；不使用麦克风。请参阅<a href="/zh/guide/macos-audio-permission/">如何授予权限</a>。</p>
</div></section>

<section class="section"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">两者都能读</span>
<h2>原文和译文同时显示</h2>
<p>“设置 › 字幕”中的<em>在译文上方显示原文</em>选项（默认开启）会把原句以小字显示在译文正上方。它适合学习语言的人，以及想核对术语的人。</p>
${checkList([
  "字号 14–48 px，5 种文字颜色，5 种背景颜色，不透明度可调",
  "用鼠标滚轮或快捷键向上滚动，重读之前的句子；<em>最新</em>按钮带你回到实时的那一行",
  "<em>结束一句话的停顿</em>可在 50 到 800 ms 之间调整：看视频时不需要即时反馈，调高一些，句子就不容易被切断",
])}
</div>
<div>
${overlayShot({ slug: "overlay-custom", lang: "zh", alt: "大字号、藏青色背景上显示黄色文字的字幕条", caption: "同一个字幕条换了样式：藏青色背景上的黄色文字。" })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "长时间会话", title: "完整观看长时间活动，不被打断" })}
<p>一个连续 <strong>5 小时 23 分钟</strong>的会话（在浏览器中播放的英语讲座视频）结束时共有 6,019 个片段，没有错误，延迟中位数为 0.48 秒。条件：Mac M4 Pro、macOS、临时签名的正式版，运行一次；这不是正式的验收测试。另外一次 2 小时的稳定性测试中，也没有任何进程重启。</p>
${callout({ title: "长时间活动的翻译时长。", text: "只计算已翻译的语音，不计算静音；已经是你想阅读的语言的句子也不计算，但你倒回去重听两遍的片段会计算。Free 是 10 天试用，每天 30 分钟，所以较长的网络研讨会需要 Monthly（每 30 天 50 小时）、6 Months（每 30 天 100 小时）或 Yearly（不限时长）。请参阅<a href=\"/zh/pricing/\">价格</a>。" })}
</div></section>

<section class="section"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-transcript", lang: "zh", alt: "带有时间、原句和译文的转写记录，以及搜索框、全部复制按钮和导出格式选择器", caption: "转写记录：搜索、复制、导出为 TXT、SRT 或 Markdown。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">再次学习</span>
<h2>保留转写记录，以后复习</h2>
${checkList([
  "所有套餐都可以<strong>全部复制</strong>转写记录（时间、原文、译文）",
  "<strong>导出为 TXT、SRT 或 Markdown</strong> 以及保存历史记录是 Pro 功能",
  "<strong>TXT 和 Markdown</strong> 记录每句话的时钟时间；<strong>SRT</strong> 记录从你按下“开始”那一刻起的时间，并且可以选择用译文还是原文作为字幕文字",
])}
<p class="small muted">SRT 与你的视频不同步。只有当你恰好在视频从第 0 秒开始播放时按下“开始”，时间才会大致吻合；否则请用你自己的字幕工具调整时间。请参阅<a href="/zh/guide/history-and-export/">历史记录和导出</a>。</p>
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "专业课程", title: "为专业内容准备术语表" })}
<p>医学、金融或编程课程充满了容易被翻译错的术语。把“原文 → 译文”的词对加入<strong>术语表</strong>（Pro）：最多 500 条，支持 CSV 导入和导出，不区分大小写。应用会把匹配到的术语作为提示传给翻译，所以并不保证每次都这样翻译。请参阅<a href="/zh/guide/glossary/">术语表指南</a>。</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "技巧", title: "用得更顺手" })}
${checkList([
  "<strong>把音频来源设为“仅 {应用名称}”（macOS）：</strong>在“设置 › 音频”中选择你的浏览器或媒体播放器，这样其他声音就不会被翻译。列表只显示正在播放声音的应用，所以请先播放视频，再点击<em>刷新列表</em>。",
  "<strong>观看时把系统通知静音，</strong>尤其是在 Windows 上，因为目前还不能只选择一个应用。",
  "<strong>锁定源语言：</strong>整场活动只用一种语言时适用；如果发言人会切换语言，就保持自动检测。",
  "<strong>先按“开始”再播放：</strong>应用会在最初几秒加载模型（安装或更新后的第一次可能更久，最多几分钟）。",
])}
<p>五种语言可以任意互译。我们只测量过包含越南语的语言对的翻译质量；其他语言对（例如英语到日语）可以运行，但还没有质量评分。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "坦诚说明局限", title: "需要注意的事项" })}
${checkList([
  "<strong>译文可能有误，</strong>尤其是术语、专有名词和不清楚的语音。在重要决策中，请不要未经核实就依赖译文。",
  "<strong>延迟</strong>在 Mac M4 Pro 上使用 Standard 模型包时，中位数为 0.76–1.03 秒。性能较弱的电脑延迟会更高；我们没有在 M1 Mac 上测量过。看视频时不需要即时回应，所以延迟没有开会时那么重要。",
  "<strong>识别</strong>在越南语、日语、韩语和中文上使用 Lite 模型包时准确度较低；语音不清楚时（例如背景音乐或噪音很大）也会变差。",
  "<strong>可在 macOS</strong>（Apple 芯片，14.2 及以上）<strong>和 Windows 10/11</strong>（x64）上运行。译文只显示在悬浮字幕条上：不会加到视频里，也不会替代发布方的官方字幕。",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "继续阅读", title: "下一步", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/zh/guide/quick-start/", icon: "zap", title: "快速入门", text: "从安装到看到第一行字幕。", more: "打开指南" })}
${linkCard({ href: "/zh/solutions/online-meeting-translation/", icon: "users", title: "在线会议", text: "适用于 Zoom、Teams、Meet 和 Zalo。", more: "查看解决方案" })}
${linkCard({ href: "/zh/features/", icon: "sliders", title: "功能", text: "全部功能和性能测量结果。", more: "查看功能" })}
</div>
<p class="center-text reveal">想知道你观看的内容去了哪里？请阅读<a href="/zh/data-security/">数据与安全</a>。</p>
</div></section>

${ctaBand({ title: "用你自己的视频试试", text: "从 10 天免费试用开始，每天 30 分钟。无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/pricing/", label: "查看价格" } })}
`,
};
