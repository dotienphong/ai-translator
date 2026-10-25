import { dataFlow, pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "功能", path: "/zh/features/" },
];

export default {
  id: "features",
  lang: "zh",
  path: "/zh/features/",
  title: "AI Translator 功能：字幕、术语表、导出",
  description:
    "5 种语言的实时翻译字幕、字幕条、聊天用的输入翻译、术语表、历史记录以及 TXT/SRT/Markdown 导出。全部在你的电脑上离线运行。",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  body: () => `
${pageHero({ crumbs, title: "在你电脑上运行的会议实时翻译功能", lead: "这里介绍 AI Translator 目前能做的事，与应用中的实际表现完全一致。只有付费套餐才有的功能都会明确标出。" })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">功能一览</h2>
<div class="grid grid-4 reveal">
<a class="card card-link" href="#live-translation"><h3>实时翻译</h3><p class="muted">5 种语言，自动检测</p></a>
<a class="card card-link" href="#subtitle-bar"><h3>字幕条</h3><p class="muted">拖动、锁定、调整字号</p></a>
<a class="card card-link" href="#transcript"><h3>转写记录</h3><p class="muted">历史记录、导出（Pro）</p></a>
<a class="card card-link" href="#glossary"><h3>术语表</h3><p class="muted">人名和术语（Pro）</p></a>
<a class="card card-link" href="#type-and-translate"><h3>输入翻译</h3><p class="muted">用对方的语言聊天</p></a>
<a class="card card-link" href="#audio-source"><h3>音频来源</h3><p class="muted">任何会议应用，无需机器人</p></a>
<a class="card card-link" href="#shortcuts"><h3>快捷键和托盘</h3><p class="muted">不离开会议就能控制</p></a>
<a class="card card-link" href="#models"><h3>模型和硬件</h3><p class="muted">Standard 和 Lite 模型包</p></a>
<a class="card card-link" href="#performance"><h3>性能</h3><p class="muted">实测数据，附测试条件</p></a>
</div>
</div></section>

<section class="section band-dark" id="on-device-ai"><div class="container">
${sectionHead({ eyebrow: "设备端 AI", title: "AI 翻译，无需把会议放到云端", text: "两个 AI 模型，一个负责语音识别，一个负责翻译，直接在你的电脑上运行。没有任何环节会把你的音频或会议内容发送到服务器或云端 AI 服务。", center: true })}
${dataFlow("zh")}
<div class="grid grid-3">
${feature({ icon: "cpu", title: "两个在本地运行的 AI 模型", text: "一个模型识别语音，一个模型负责翻译。两者都只需下载一次，之后利用 GPU 或 CPU 在你的电脑上运行。", accent: true })}
${feature({ icon: "zap", title: "不绕路，所以延迟低", text: "不需要往返服务器，说话人说完一句话后译文很快就会出现。在 Mac M4 Pro 上中位数低于 1.1 秒；测试条件见下方的“性能”部分。" })}
${feature({ icon: "lock", title: "对话数据留在你的电脑上", text: "音频只存在于 RAM 中；转写文本和译文留在你的电脑上。历史记录默认关闭，开启后也会在你的电脑上加密保存。" })}
</div>
</div></section>

<section class="section" id="live-translation"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">实时翻译</span>
<h2>收听、识别、翻译、显示字幕，一气呵成</h2>
<p>AI Translator 采集电脑上播放的音频，把它切分成句子，识别语音，进行翻译，再把结果显示在字幕条上。在 Mac M4 Pro 上，说话人说完一句话后约 1 秒（中位数）就会显示完整译文；其他电脑可能更慢，请查看<a href=\"#performance\">测量数据</a>。</p>
${checkList([
  "源音频和译文都支持<strong>五种语言</strong>：英语、中文、日语（日本語）、韩语（한국어）、越南语（Tiếng Việt）。我们计划在未来增加更多语言（暂无时间表）",
  "在你于<em>会议中使用的语言</em>里勾选的语言中<strong>自动检测</strong>正在说的语言；如果你知道会说哪种语言，也可以在<em>源语言</em>中<strong>固定</strong>为一种",
  "已经是你想阅读的语言的句子会直接显示，不会再翻译一遍",
  "尚未定稿的句子颜色较浅，说话人继续说下去后会被完整的句子替换",
  "过滤语音识别在音乐或静音时容易“编造”出来的“幻影”句子",
  "识别出的中文会转换为简体字",
])}
</div>
<div>
${appShot({ slug: "app-home-free", lang: "zh", alt: "带有语言卡片的 AI Translator 主页：目标语言和会议中使用的语言", caption: "语言卡片：选择你想阅读的语言，以及会议中可能使用的语言。" })}
</div>
</div>
${callout({ title: "字幕是单向的：从会议到你。", text: "AI Translator 把电脑播放出来的音频翻译成你的语言，目前还不能把你自己的声音翻译给会议中的其他人。要在聊天中用文字回复，请使用<a href=\"#type-and-translate\">输入翻译</a>：你用自己的语言输入，应用会把译文粘贴到聊天框中。如果双方都安装了应用，每个人都能看到对方的字幕。" })}
</div></section>

<section class="section section-alt" id="subtitle-bar"><div class="container">
<div class="split reverse">
<div class="stack-lg reveal">
<span class="eyebrow">字幕条</span>
<h2>可自定义的悬浮字幕条，不妨碍你开会</h2>
<p>字幕条是一个独立的无边框窗口，背景半透明。它始终置顶，从不抢走会议应用的焦点，所以你可以像平时一样在聊天中打字或点击按钮。</p>
${checkList([
  "<strong>拖动</strong>即可移动，拖动边缘或角即可调整大小；每个屏幕都会记住它的位置和大小",
  "<strong>字号</strong> 14–48 px，<strong>5 种文字颜色</strong>（白、黄、绿、浅蓝、橙），<strong>5 种背景颜色</strong>，背景不透明度 0–100%",
  "<strong>锁定</strong>：鼠标点击会穿过字幕条，也不会有按钮挡路；用快捷键或托盘菜单解锁",
  "保留最近 1,000 句；用鼠标滚轮或快捷键<strong>回看</strong>，按<em>最新</em>按钮回到当前句子",
  "在译文上方以小字显示<strong>原文</strong>（默认开启，可以关闭）",
  "角落里的小提示：检测到声音正在收听、正在加载模型、处理跟不上、剩余翻译时间不足 5 分钟",
])}
<p class="more-link"><a href="/zh/guide/subtitle-bar-and-shortcuts/">了解字幕条和快捷键的用法 ${icon("arrow-right")}</a></p>
</div>
<div class="stack-lg">
${overlayShot({ slug: "overlay-custom", lang: "zh", alt: "大字号、藏青色背景上显示黄色文字的字幕条", caption: "同一个字幕条，改为黄色文字、藏青色背景、字号 26。" })}
${appShot({ slug: "app-settings-subtitles", lang: "zh", alt: "字幕设置：例句预览、字号、文字颜色、背景颜色、背景不透明度以及显示原文的选项", caption: "设置 › 字幕：预览和字幕条会立即更新。" })}
</div>
</div>
</div></section>

<section class="section" id="audio-source"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-settings-audio", lang: "zh", alt: "音频设置：采集来源设为“电脑音频 + 麦克风”，音频来源（仅 Zoom）、麦克风选择器、调低麦克风的说明、“过滤麦克风噪音”开关，以及设为 100 ms 的结束一句话的停顿滑块", caption: "设置 › 音频：收听整个系统，或只收听一个应用（macOS）。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">音频来源</span>
<h2>任何会议应用，无需机器人，无需插件</h2>
<p>由于应用采集的是系统音频，AI Translator 适用于任何能发出声音的内容：Zoom、Microsoft Teams、Google Meet、Zalo PC、网络研讨会、视频、在线课程，以及你在电脑上观看的直播（<a href="/zh/solutions/livestream-translation/">直播翻译</a>）。</p>
${checkList([
  "<strong>macOS：</strong>收听整个系统（应用本身除外），或只收听一个正在播放声音的应用，这样其他应用的提示音就不会被误翻译",
  "<strong>Windows：</strong>默认播放设备，或你选择的设备",
  "切换播放设备时（例如插上耳机或连接蓝牙），音频来源会自动重新打开",
  "<strong>结束一句话的停顿</strong>可在 50 到 800&nbsp;ms 之间调整：越短字幕出现越快，越长句子越不容易被截断",
])}
<p>在 macOS 上，第一次点“开始”时，系统会请求<em>录制系统音频</em>的权限。选择含麦克风的采集来源时，还会请求<em>麦克风</em>权限。<a href="/zh/guide/macos-audio-permission/">查看如何授予音频权限</a>。Windows 不需要这项权限。</p>
<h3 id="microphone">也翻译会议室里的声音</h3>
<p>在<strong>设置 › 音频 › 采集来源</strong>中，从三种来源中选择一种。所有套餐都能使用。</p>
${checkList([
  "<strong>电脑音频</strong>（默认）：在线会议、视频、网络研讨会",
  "<strong>麦克风</strong>：在房间里说话的人，例如线下会议或听课",
  "<strong>电脑音频 + 麦克风</strong>：既有在线参会者、也有会议室参会者的混合会议。在线的人说话时，麦克风会被调低，避免同一句话被翻译两次；会议室里的人恰好在这时插话，可能会被漏掉。戴耳机效果最好",
  "<strong>过滤麦克风噪音</strong>（默认开启）：忽略键盘声、笔的咔嗒声和敲桌子的声音。“OK”这类只有一两个词的回答可能会被漏掉；在安静的房间里，关闭这个开关就能保留它们",
])}
<p>笔记本电脑的麦克风最适合在安静的房间里收听近处（约 1&nbsp;米）的人说话；大房间请使用外接麦克风或会议麦克风。从麦克风采集时，应用同样会等到 50&nbsp;ms 的停顿才结束一句话，与电脑音频相同。真人说话有许多短暂停顿，所以如果句子被切得太碎，请在“设置 › 音频”中把<em>结束一句话的停顿</em>滑块调到 300–500&nbsp;ms 左右；代价是字幕出现得更晚。麦克风的声音也只翻译成你的语言；应用不会向会议播放任何声音。请参阅<a href="/zh/guide/macos-audio-permission/#microphone-permission">麦克风权限</a>。</p>
</div>
</div>
</div></section>

<section class="section section-alt" id="transcript"><div class="container">
${sectionHead({ eyebrow: "转写记录、历史记录和导出", title: "按你的方式保存听到的内容", text: "当前会话的转写记录适用于所有套餐。保存历史记录和导出到文件是 Pro 功能。", center: true })}
<div class="split">
<div>
${appShot({ slug: "app-transcript", lang: "zh", alt: "带有时间、原句和译文的转写记录，以及搜索框、全部复制按钮和导出格式选择器", caption: "转写记录：搜索、复制、导出为 TXT、SRT 或 Markdown。" })}
</div>
<div class="stack-lg reveal">
${checkList([
  "<strong>转写记录：</strong>每一行都有时间、原句和译文；所有套餐都可以搜索和全部复制",
  "<strong>导出</strong>为 TXT、SRT 或 Markdown；导出 SRT 时可以选择文本使用译文还是原文 <span class=\"badge badge-pro\">Pro</span>",
  "<strong>会话历史：</strong>逐个查看、打开和删除会话，或一次全部删除 <span class=\"badge badge-pro\">Pro</span>",
  "历史记录<strong>默认关闭</strong>。开启后会加密保存在你的电脑上，密钥保存在钥匙串（macOS）或凭据管理器（Windows）中",
  "一键从这台电脑上<strong>删除历史记录和术语表</strong>（需确认；另有一个按钮也会删除模型），所有套餐都可用",
])}
<p class="more-link"><a href="/zh/guide/history-and-export/">阅读历史记录和导出指南 ${icon("arrow-right")}</a></p>
${appShot({ slug: "app-history", lang: "zh", alt: "历史记录页面，列出已保存的会话及其日期和时间、分钟数、句子数和预览", caption: "历史记录：保存在你电脑上的会话。" })}
</div>
</div>
</div></section>

<section class="section" id="glossary"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-glossary", lang: "zh", alt: "术语表：成对的原文术语和译文，以及导入和导出 CSV 的按钮", caption: "术语表：添加、编辑、删除、导入和导出 CSV。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">术语表 <span class="badge badge-pro">Pro</span></span>
<h2>把人名和术语作为提示交给翻译</h2>
<p>为产品名、合作伙伴名称和行业术语添加“原文 → 译文”对。当句子里出现其中某个词时，应用会把它作为提示交给翻译。</p>
${checkList([
  "最多 <strong>500</strong> 条，支持 CSV 导入和导出（两列，UTF-8）",
  "匹配时不区分大小写；中文、日语和韩语术语在词语中间也能匹配",
  "每句话最多使用 20 条相关条目",
])}
<p class="small muted">术语只是给翻译的提示，所以不能保证每次都用得正确。应用中也是这样说明的。</p>
<p class="more-link"><a href="/zh/guide/glossary/">阅读术语表指南 ${icon("arrow-right")}</a></p>
</div>
</div>
</div></section>

<section class="section section-alt" id="type-and-translate"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">输入翻译</span>
<h2>就在你正在用的聊天框里，用对方的语言聊天</h2>
<p>在你正在使用的应用的聊天框中按 ${keys(["⌃", "⌥", "G"])}（Windows：${keys(["Ctrl", "Alt", "G"])}）。在悬浮的输入框中用自己的语言输入，译文会立即显示在下方。按 Enter 把译文粘贴到聊天框中，检查后再按一次 Enter 发送。</p>
${checkList([
  "翻译成<strong>你交谈对象的语言</strong>（取自你的字幕设置），或你选择的语言",
  "<strong>所有有效套餐</strong>都包含，试用期间的 Free 也可以用，而且<strong>不消耗</strong>翻译时间",
  "在你的电脑上翻译：你输入的内容和译文从不离开电脑",
  "使用你平常的键盘和输入法输入；如果翻译失败，应用绝不会粘贴你的原文",
])}
<p class="small muted">在 macOS 上，自动粘贴需要辅助功能权限；没有该权限时，应用会复制译文，你可以用 ⌘V 粘贴。请查看<a href="/zh/guide/type-and-translate/">输入翻译指南</a>。</p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "zh", alt: "输入翻译框：上方是中文消息，下方是英文译文", caption: "输入翻译框：按 Enter 把译文粘贴到聊天框中。" })}
</div>
</div>
</div></section>

<section class="section" id="shortcuts"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">快捷键和系统托盘</span>
<h2>不离开会议就能控制</h2>
<p>六个全局快捷键即使在 AI Translator 不是前台窗口时也能使用。每个快捷键都可以在“设置 › 快捷键”中更改。</p>
<div class="table-wrap" role="region" aria-label="键盘快捷键" tabindex="0"><table>
<thead><tr><th scope="col">操作</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">开始或停止翻译</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">显示或隐藏字幕</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">锁定或解锁字幕</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">向上滚动字幕（较早的句子）</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">向下滚动字幕（较新的句子）</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">打开或关闭输入翻译框</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">在 macOS 上，⌃ 是 Control，⌥ 是 Option。快捷键至少要包含 Ctrl、Alt 或 Cmd/Win 中的一个。</p>
<p>通过菜单栏图标（macOS）或系统托盘图标（Windows），可以开始或停止翻译、显示或隐藏和锁定字幕，以及打开主窗口。关闭窗口只会把应用隐藏到托盘；要完全退出，请选择<em>退出</em>。</p>
</div>
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "zh", alt: "快捷键设置，显示 macOS 上的六个默认快捷键", caption: "设置 › 快捷键：点“更改”，然后按下新的组合键。" })}
</div>
</div>
</div></section>

<section class="section section-alt" id="models"><div class="container stack-lg">
<div class="model-intro">
<div class="stack-lg reveal">
<span class="eyebrow">模型和你的电脑</span>
<h2>两种模型包，应用会推荐适合的一种</h2>
<p>识别和翻译模型只需下载一次，之后完全在你的电脑上运行。应用会检查你的内存、可用磁盘空间和显卡，然后推荐一种模型包。</p>
</div>
</div>
<div class="table-wrap reveal" role="region" aria-label="模型包对比" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">项目</span></th><th scope="col">Standard 模型包</th><th scope="col">Lite 模型包</th></tr></thead>
<tbody>
<tr><th scope="row">下载大小</th><td>约 2.5 GB</td><td>约 1.3 GB</td></tr>
<tr><th scope="row">运行时内存（M4 Pro）</th><td>约 2.9 GiB</td><td>约 1.8–1.9 GiB</td></tr>
<tr><th scope="row">应用推荐用于</th><td>16 GB 或以上的 Mac；16 GB 或以上、带 6 GB 显存独立显卡的 Windows</td><td>8 GB 到不足 16 GB 的电脑，或没有合适独立显卡的 Windows</td></tr>
</tbody></table></div>
<p class="small muted">Lite 模型包在越南语、日语、韩语和中文上的语音识别不如 Standard 清晰。如果你经常听这些语言，请选择 Standard 模型包。</p>
${facts([
  ["macOS", "macOS 14.2 或更高版本，Apple 芯片（M1 或更新）<small>没有 Intel Mac 版本</small>"],
  ["内存", "至少 8 GB，建议 16 GB"],
  ["磁盘", "在要下载的模型大小之外，至少还需 1 GB 可用空间"],
  ["Windows", "Windows 10/11 64 位（x64），支持 AVX2 的 CPU<small>Standard 模型包建议使用 6 GB 或以上显存的独立显卡。尚未进行代码签名，所以安装时 SmartScreen 可能会发出警告；Windows 上的延迟只在一台使用集成显卡的笔记本上做过初步测试，比 Mac M4 Pro 慢（见“性能”）</small>"],
])}
</div></section>

<section class="section" id="performance"><div class="container">
${sectionHead({ eyebrow: "性能", title: "真实测量数据，附测试条件", text: "我们只公布实际测得的数据，并说明是在哪台机器上测的；没有测试过的机器，我们也会如实说明。", center: true })}
<div class="table-wrap reveal" role="region" aria-label="性能测量" tabindex="0"><table>
<thead><tr><th scope="col">测量项目（Mac M4 Pro 24 GB，macOS 26，Apple GPU）</th><th scope="col">Standard 模型包</th><th scope="col">Lite 模型包</th></tr></thead>
<tbody>
<tr><th scope="row">延迟中位数（p50）：从说话人说完一句话到完整译文出现</th><td>0.76–1.03 秒</td><td>0.61–0.84 秒</td></tr>
<tr><th scope="row">p90 延迟</th><td>0.94–1.34 秒</td><td>0.73–1.14 秒</td></tr>
<tr><th scope="row">第一个译词出现（p50）</th><td>0.63–0.69 秒</td><td>0.52–0.57 秒</td></tr>
<tr><th scope="row">运行时内存</th><td>2.9 GiB</td><td>1.8–1.9 GiB</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${feature({ icon: "gauge", title: "长时间会话", text: "一次连续 5 小时 23 分的会话（英语讲座视频，临时签名的发布版本）：6,019 个片段，没有错误，延迟中位数 0.48 秒。在 2 小时的稳定性测试中，没有任何组件重启。" })}
${feature({ icon: "languages", title: "翻译和识别质量", text: "在一项内部测试中，我们通过应用自己的翻译流程测试了八个涉及越南语的方向，Standard 模型包的翻译模型在自动翻译质量评分（0 到 1，见下表）上平均约 0.84。翻译模型是在另一套测试集上比较多个模型后选出的。在清晰的朗读语音上，Standard 模型包的越南语识别词错误率为 8.7%。这是朗读语音，不是真实的会议对话。" })}
</div>
<h3 class="reveal" id="quality-by-direction">各方向的翻译和识别质量</h3>
<p class="reveal">自动翻译质量评分通过应用自己的翻译流程测得（与实际使用的设置相同），每个方向 100 句（越南语 → 中文、日语、韩语为 40 句）。这是 0 到 1 的相对分数，越高越好；<strong>它不是准确率百分比</strong>。</p>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">方向（文本）</th><th scope="col">Standard 模型包</th><th scope="col">Lite 模型包</th></tr></thead>
<tbody>
<tr><th scope="row">英语 → 越南语</th><td>0.842</td><td>0.841</td></tr>
<tr><th scope="row">中文 → 越南语</th><td>0.829</td><td>0.831</td></tr>
<tr><th scope="row">日本語 → 越南语</th><td>0.830</td><td>0.815</td></tr>
<tr><th scope="row">한국어 → 越南语</th><td>0.834</td><td>0.822</td></tr>
<tr><th scope="row">越南语 → 英语</th><td>0.821</td><td>0.822</td></tr>
<tr><th scope="row">越南语 → 中文</th><td>0.836</td><td>0.821</td></tr>
<tr><th scope="row">越南语 → 日本語</th><td>0.847</td><td>0.845</td></tr>
<tr><th scope="row">越南语 → 한국어</th><td>0.851</td><td>0.842</td></tr>
</tbody></table></div>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">语音识别（错误率，越低越好）</th><th scope="col">Standard 模型包</th><th scope="col">Lite 模型包</th></tr></thead>
<tbody>
<tr><th scope="row">英语（词错误）</th><td>5.4%</td><td>6.6%</td></tr>
<tr><th scope="row">越南语（词错误）</th><td>8.7%</td><td>22.5%</td></tr>
<tr><th scope="row">中文（字错误）</th><td>5.6%</td><td>9.6%</td></tr>
<tr><th scope="row">日本語（字错误）</th><td>4.5%</td><td>13.1%</td></tr>
<tr><th scope="row">한국어（字错误）</th><td>4.1%</td><td>8.2%</td></tr>
</tbody></table></div>
<p class="small muted reveal">如何解读：翻译测试集偏向日常口语，所以只能粗略反映会议用语；识别是在清晰的朗读语音（每种语言约 15 分钟）上测得的，不是真实的会议对话；在模拟窄带音频（类似通话模式下的蓝牙耳机）的测试中错误率会上升，我们没有测试过真实的耳机。上面八个方向都涉及越南语；英语、中文、日本語和한국어之间的其他 12 个方向可以使用，但还没有质量评分。Lite 模型包识别越南语、日语、韩语和中文的准确度明显较低。</p>
${callout({ kind: "warn", title: "我们没有测量、也不承诺的内容", text: "上面的所有数据都在同一台 Mac M4 Pro 上测得，断句停顿设为 300&nbsp;ms（应用当前的默认值是 50&nbsp;ms；5 小时的会话使用的是默认值）。我们没有测量：M1 Mac、8 GB 内存的电脑、Windows 独立显卡、电池和功耗、真实会议对话或蓝牙耳机下的准确度，以及不涉及越南语的方向的翻译质量（可以使用，但没有可公布的质量评分）。在一台 Windows 笔记本（Core i5-1345U，集成显卡，32 GB 内存，Windows 11；每种设置 6 次会话，每次 17–23 句）上的初步测试中，Lite 模型包的延迟中位数为 1.3–2.6 秒，Standard 模型包为 2.7–5.4 秒，没有达到我们的延迟目标。这台笔记本比我们的最低配置更强，所以这些不是弱配置电脑上的数据。" })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "按套餐", title: "各功能包含在哪些套餐中", center: true })}
<div class="table-wrap reveal" role="region" aria-label="按套餐划分的功能" tabindex="0"><table class="compare">
<thead><tr><th scope="col">功能</th><th scope="col">Free（试用）</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">实时翻译字幕，5 种语言</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">可自定义的字幕条、快捷键、托盘</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">查看、搜索和复制转写记录</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">术语表（最多 500 条）</th><td><span class="no">无</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">保存会话历史</th><td><span class="no">无</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">导出为 TXT、SRT、Markdown</th><td><span class="no">无</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">翻译时间</th><td>每天 30 分钟，共 10 天</td><td>每 30 天 50 小时</td><td>180 天内每 30 天 100 小时</td><td>365 天内不限时长</td></tr>
<tr><th scope="row">价格（VietQR，VND）</th><td>0 ₫</td><td>50,000 ₫</td><td>269,000 ₫</td><td>500,000 ₫</td></tr>
<tr><th scope="row">价格（国际银行卡，USD，不含税）</th><td>—</td><td>US$3.99</td><td>US$21.99</td><td>US$39.99</td></tr>
</tbody></table></div>
<p class="center-text reveal"><a class="btn btn-primary" href="/zh/pricing/">查看完整价格详情 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "在真实会议中试试看", text: "免费试用 10 天，每天 30 分钟。无需银行卡，无需账号。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/guide/quick-start/", label: "阅读快速入门指南" } })}
`,
};
