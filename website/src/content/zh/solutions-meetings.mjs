import { pageHero, sectionHead, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, steps, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "解决方案", path: "/zh/solutions/" },
  { name: "在线会议", path: "/zh/solutions/online-meeting-translation/" },
];

export default {
  id: "solutions-meetings",
  lang: "zh",
  path: "/zh/solutions/online-meeting-translation/",
  title: "AI Translator：Zoom、Teams、Meet、Zalo 翻译字幕",
  description:
    "用 AI Translator 在 Zoom、Teams、Google Meet 和 Zalo 通话中阅读实时翻译字幕：不需要机器人，离线运行。设置技巧和坦诚的局限说明。",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "在线会议翻译字幕（Zoom、Teams、Meet、Zalo）",
  lead: "AI Translator 通过收听电脑上播放的音频，为 Zoom、Microsoft Teams、Google Meet 和 Zalo PC 通话显示实时翻译字幕。不需要邀请机器人，主持人也不需要开启任何功能，语音识别和翻译都在你自己的电脑上运行。",
  meta: "<span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["适用于", "Zoom、Microsoft Teams、Google Meet、Zalo PC<small>不需要机器人，不需要插件；任何通过电脑播放声音的应用都可以采集</small>"],
  ["语言", "英语、中文、日语、韩语、越南语<small>字幕是单向的，翻译成你选择的语言</small>"],
  ["延迟", "中位数 0.76–1.03 秒<small>Mac M4 Pro，Standard 模型包；性能较弱的电脑会更慢</small>"],
  ["平台", "macOS 14.2+（Apple 芯片）和 Windows 10/11 x64<small>Windows 版还没有代码签名，所以安装时 SmartScreen 可能会发出警告</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "问题", title: "为什么用外语开会这么累？" })}
<p>在用外语进行的会议中，你要一边听一边在脑子里翻译，一旦有人说得快或者用了很多术语，就很容易漏掉要点。大型会议平台提供内置的翻译字幕，但通常属于较高级的付费套餐，并且在云端处理你的音频；许多第三方工具也在云端运行。如果你所在机构的套餐不包含这项功能，或者你不希望会议音频离开你的电脑，就需要另一种方式。</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-home-running", lang: "zh", alt: "正在翻译时的 AI Translator 主页：翻译中状态、语言、音频来源和剩余翻译时间", caption: "正在翻译时的主页。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">工作原理</span>
<h2>AI Translator 在听的一方运行</h2>
${checkList([
  "它采集电脑上正在播放的声音（在 macOS 上需要允许<em>系统录音</em>；不使用麦克风；见<a href=\"/zh/guide/macos-audio-permission/\">如何授予权限</a>）",
  "它把音频切分成句子，然后用在你电脑上运行的模型识别并翻译语音",
  "它把译文显示在悬浮字幕条上，字幕条从不抢走会议应用的焦点，所以你可以继续在聊天中输入",
  "其他人什么都不用做：会议室里没有机器人，主持人也不需要开启字幕",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "会议之前", title: "五分钟准备", center: true })}
<div class="split wide-right">
<div>
${appShot({ slug: "app-settings-audio", lang: "zh", alt: "音频设置：音频来源选择器（设为仅 Zoom）以及刷新正在播放声音的应用列表的按钮", caption: "设置 › 音频：收听整个系统，或只收听一个应用。" })}
</div>
<div>
${steps(
  [
    { title: "如果知道会议语言，就锁定源语言", text: "在“语言”卡片上，把<em>源语言</em>设为会议使用的语言，而不是<em>自动检测</em>；这样应用在短句上更不容易猜错。如果会上会说几种语言，就保持自动检测，只勾选可能出现的语言。" },
    { title: "把专有名词加入术语表（Pro）", text: "输入合作伙伴名称、产品名称和缩写以及你想要的译法，最多 500 条。它们是给翻译的提示，并不保证一定这样翻译。请参阅<a href=\"/zh/guide/glossary/\">术语表指南</a>。" },
    { title: "摆好字幕条并锁定", text: "把它拖到不会挡住发言人的位置，通常就在视频正下方；在“设置 › 字幕”中设置字号（14–48 px）、颜色和不透明度。点击<em>锁定（点击穿透）</em>，让鼠标可以穿过字幕条。" },
    { title: "只收听 Zoom（macOS）", text: "“设置 › 音频”中的列表只显示正在播放声音的应用，所以请先加入通话，再点击<em>刷新列表</em>。选择 Zoom 那一项（显示为<em>仅 {应用名称}</em>），这样通知音和其他视频就不会被翻译。如果在浏览器中使用 Meet，请选择浏览器（它的其他标签页仍会被收听）。从下一个会话开始生效。" },
  ],
  true,
)}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "会议期间", title: "不离开通话也能随时掌控", text: "请在会议开始前按下“开始”，让模型完成加载（之后每次只需几秒；安装或更新后的第一次可能更久，最多几分钟）；静音时段不计入翻译时长。", center: true })}
${overlayShot({ slug: "overlay-default", lang: "zh", alt: "AI Translator 字幕条：原文以小字显示在上方，下方是中文译文", caption: "字幕条：上方是小字原文，下方是译文。" })}
<div class="split">
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">操作</th><th scope="col">macOS</th></tr></thead>
<tbody>
<tr><th scope="row">开始或停止翻译</th><td>${keys(["⌃", "⌥", "T"])}</td></tr>
<tr><th scope="row">显示或隐藏字幕</th><td>${keys(["⌃", "⌥", "H"])}</td></tr>
<tr><th scope="row">锁定或解锁</th><td>${keys(["⌃", "⌥", "L"])}</td></tr>
<tr><th scope="row">向上滚动（较早的句子）</th><td>${keys(["⌃", "⌥", "PageUp"])}</td></tr>
<tr><th scope="row">向下滚动（较新的句子）</th><td>${keys(["⌃", "⌥", "PageDown"])}</td></tr>
</tbody></table></div>
<div class="stack reveal">
${checkList([
  "<strong>漏听了一句：</strong>向上滚动就能重读（保留最近 1000 句）；<em>最新</em>按钮带你回到最新位置，即使字幕条已锁定，滚动快捷键也能使用。",
  "<strong>颜色较淡的文字</strong>是临时字幕，发言人继续说下去时会被替换。请保持<em>在译文上方显示原文</em>开启（默认开启），以便核对人名和数字。",
  "<strong>快速隐藏</strong>可以用快捷键（翻译会继续）；在未锁定的字幕条上点击 ✕ 按钮，则会关闭字幕并停止翻译。",
])}
</div>
</div>
<p class="small muted">在 Windows 上，快捷键用 Ctrl+Alt 代替 ⌃⌥。如果与会议应用冲突，请在“设置 › 快捷键”中修改。我们没有检查过共享屏幕时字幕条是否会出现在共享的区域中，所以请先测试，或在共享时隐藏字幕条。请参阅<a href="/zh/guide/subtitle-bar-and-shortcuts/">字幕条和快捷键</a>。</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "会议之后", title: "留下你需要的内容" })}
<p>按下<strong>停止</strong>后，再按<strong>打开转写记录</strong>，就能看到每一行及其时间、原文和译文；所有套餐都有搜索框（放大镜图标）和<em>全部复制</em>按钮。</p>
<p>导出为 TXT、SRT 或 Markdown 以及历史记录是 Pro 功能（见<a href="/zh/pricing/">价格</a>）。历史记录默认关闭；在“设置 › 隐私”中开启后，每个会话都会加密保存在你的电脑上。应用不会自行把转写记录保存到磁盘，而且它是文字转写记录，不是会议纪要。请参阅<a href="/zh/guide/history-and-export/">历史记录和导出</a>。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "我们测试过的内容", title: "目前试过的应用和设备" })}
<p>我们使用一个单独的音频采集测试工具（而不是应用完整的识别和翻译流程），在 macOS 26.6.2 上测试了 <strong>Zoom（应用）</strong>、Chrome、Safari 和 Edge 中的 <strong>Google Meet</strong>、<strong>Microsoft Teams（新版应用）</strong>以及 <strong>Zalo PC</strong> 的系统音频采集，分别通过扬声器、有线耳机和 AirPods。</p>
<p>这是内部测试，由测试人员用耳朵确认。它不是针对每个应用和 macOS 版本（最低 14.2）在正式版上进行的正式验收测试。</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "隐私", title: "隐私以及告知其他参会者" })}
<p>AI Translator 采集电脑上正在播放的声音，其中包括其他人的声音。音频留在内存中：不写入磁盘，也不通过网络发送（我们在 macOS 上用代理检查过）。应用不会录制会议。请参阅<a href="/zh/data-security/">数据与安全</a>。</p>
${callout({ title: "其他参会者不会收到通知。", text: "因为没有机器人，应用也不连接会议平台，所以其他参会者看不到任何关于你在使用 AI Translator 的提示。如果法律或你所在公司的规定有要求，你有责任告诉其他参会者你在使用翻译工具。<a href=\"/en/terms/\">使用条款（英文）</a>第 6 节也是这样规定的。我们不提供法律建议。" })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "坦诚说明局限", title: "需要注意的事项" })}
${checkList([
  "<strong>延迟：</strong>中位数 0.76–1.03 秒，p90 为 0.94–1.34 秒，在 24 GB 内存的 Mac M4 Pro 上用 Standard 模型包测量。性能较弱的电脑延迟会更高：我们没有在 M1 Mac 上测量过，而在一台使用集成显卡的 Windows 笔记本上，Standard 模型包没有达到我们的目标。请参阅<a href=\"/zh/features/\">测量条件</a>。",
  "<strong>质量会因</strong>语言和音频清晰度而不同。在越南语、日语、韩语和中文上，Lite 模型包的转写准确度低于 Standard。我们没有测量过通过真实蓝牙耳机时的准确度。",
  "<strong>译文可能有误，</strong>尤其是术语和专有名词。在重要决策中，请不要在未经专业人士核实的情况下依赖译文。",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "继续阅读", title: "下一步", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/zh/guide/quick-start/", icon: "zap", title: "快速入门", text: "从安装到看到第一行字幕。", more: "打开指南" })}
${linkCard({ href: "/zh/compare/offline-vs-cloud-translation/", icon: "layers", title: "离线翻译与云端翻译", text: "客观比较这两种方式。", more: "阅读对比" })}
${linkCard({ href: "/zh/solutions/webinar-and-video-translation/", icon: "play", title: "网络研讨会和视频", text: "会议演讲、课程、讲座。", more: "查看解决方案" })}
</div>
</div></section>

${ctaBand({ title: "在你自己的通话上试试", text: "从 10 天免费试用开始，每天 30 分钟。无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/guide/quick-start/", label: "快速入门指南" } })}
`,
};
