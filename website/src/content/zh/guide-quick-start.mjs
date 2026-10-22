import { pageHero, callout, appShot, overlayShot, facts, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "快速入门", path: "/zh/guide/quick-start/" },
];

const toc = [
  { level: 2, id: "what-you-need", text: "你需要什么" },
  { level: 2, id: "install-and-open", text: "安装并打开应用" },
  { level: 2, id: "first-time-setup", text: "七步完成首次设置" },
  { level: 2, id: "first-meeting", text: "翻译你的第一场会议" },
  { level: 2, id: "common-problems", text: "首次运行的常见问题" },
];

// 用于 HowTo 结构化数据的纯文本；页面上显示的内容在 body 中。
const HOWTO_STEPS = [
  { name: "安装并打开应用", text: "在 macOS 上，把安装命令（curl -fsSL https://aitranslator.io.vn/install.sh | bash）粘贴到终端：应用会被下载、校验并直接打开，不需要“仍要打开”。在 Windows 上，把安装命令（irm https://aitranslator.io.vn/install.ps1 | iex）粘贴到 PowerShell；如果你用的是在浏览器中下载的 .exe，而 SmartScreen 发出警告，请点击“更多信息”，然后点击“仍要运行”。" },
  { name: "选择界面语言", text: "已预先选中你电脑的语言；如有需要可以更改，然后点击“下一步”。这也会设置默认的目标语言。" },
  { name: "接受条款", text: "阅读最终用户许可协议（EULA）和隐私政策，勾选复选框，然后点击“下一步”。开始 Free 试用需要联网一次。" },
  { name: "选择并下载模型", text: "按照应用的推荐选择 Standard 模型包（约 2.5 GB）或 Lite 模型包（约 1.3 GB），然后等待下载完成。" },
  { name: "允许系统音频录制（仅 macOS）", text: "当 macOS 请求系统音频录制权限时，请允许。应用不使用麦克风。Windows 没有这一步。" },
  { name: "选择语言", text: "在“目标语言”中选择你想阅读的语言，并选择会议中可能使用的语言。" },
  { name: "试一试", text: "点击“播放示例句子”，看着字幕出现在字幕条上。" },
  { name: "阅读说明并完成", text: "阅读隐私说明以及关于菜单栏（macOS）或系统托盘（Windows）的说明，然后点击“开始使用 AI Translator”。" },
  { name: "翻译你的第一场会议", text: "打开一场有声音的会议或一个视频，点击“开始”，阅读悬浮字幕条上的字幕。完成后点击“停止”，如有需要可以打开转写记录。" },
];

export default {
  id: "guide-quick-start",
  lang: "zh",
  path: "/zh/guide/quick-start/",
  title: "AI Translator 快速入门（macOS 和 Windows）",
  description:
    "AI Translator 在 macOS 和 Windows 上的快速入门：安装应用、下载模型、试听示例句子，并实时翻译你的第一场会议。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "安装 AI Translator 并翻译你的第一场会议",
      description: "从安装包到第一行翻译字幕的步骤：安装、首次设置、开始翻译。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator 快速入门",
  lead: "第一次使用 AI Translator 时，先安装应用，完成一次性的设置（语言、条款、下载模型、macOS 上的音频权限、示例句子），然后在会议有声音时按下“开始”。翻译字幕会显示在悬浮字幕条上，语音识别和翻译都在你自己的电脑上运行。",
  meta: "<span>适用于 macOS 14.2 或更高版本（Apple 芯片）和 Windows 10/11 64 位</span> <span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本指南内容",
  body: `
<h2 id="what-you-need">你需要什么</h2>
${facts([
  ["macOS", "14.2 或更高版本，Apple 芯片（M1 或更新）<small>目前还没有 Intel Mac 版本。</small>"],
  ["Windows", "Windows 10 或 11，64 位（x64），CPU 支持 AVX2<small>目前还不支持 Windows ARM64。</small>"],
  ["内存", "最低 8 GB，建议 16 GB"],
  ["安装包", "macOS：约 9 MB 的 .dmg 文件 · Windows：约 22 MB 的 .exe 文件<small>两者都可以在<a href=\"/zh/download/\">下载</a>页面用一条命令安装</small>"],
  ["磁盘空间", "1.3 GB（Lite 模型包）或 2.5 GB（Standard 模型包）<small>下载模型时还需要额外 1 GB 可用空间</small>"],
  ["网络", "下载模型和登记 Free 试用时需要<small>之后识别和翻译都离线运行</small>"],
])}
${callout({ title: "使用 Windows？", text: "以下步骤在 Windows 上基本相同，只有几处区别：用 PowerShell 命令安装（也可以用 .exe 文件，但由于 Windows 版还没有代码签名，可能会触发 SmartScreen 警告），没有音频权限这一步，应用位于系统托盘而不是菜单栏，快捷键用 Ctrl+Alt 代替 ⌃⌥。" })}

<h2 id="install-and-open">安装并打开应用</h2>
<p><strong>在 macOS 上：</strong></p>
<ol>
<li>打开<strong>终端</strong>（按 <kbd>⌘</kbd> + <kbd>Space</kbd>，输入“终端”，按 Enter）。</li>
<li>粘贴<a href="/zh/download/#install-macos">下载</a>页面上的安装命令并按 Enter：<code>curl -fsSL https://aitranslator.io.vn/install.sh | bash</code>。</li>
<li>等待大约一分钟。应用会被下载、校验、复制到“应用程序”文件夹并直接打开。如果 macOS 请求系统音频录制权限，请选择“允许”。</li>
</ol>
<p>如果你已经在浏览器中下载了 <code>.dmg</code>：把 <strong>AI Translator</strong> 拖到<strong>应用程序</strong>中，然后打开它（由于当前版本是临时签名，还没有经过 Apple 公证，macOS 会阻止第一次打开），点击<strong>完成</strong>，然后进入<strong>系统设置 › 隐私与安全性</strong>，滚动到底部，点击<strong>仍要打开</strong>，并用密码或触控 ID 确认。</p>
<p><strong>在 Windows 上：</strong></p>
<ol>
<li>打开 <strong>PowerShell</strong>（按 <kbd>Windows</kbd> 键，输入 PowerShell，按 Enter）。</li>
<li>粘贴<a href="/zh/download/#install-windows">下载</a>页面上的安装命令并按 Enter：<code>irm https://aitranslator.io.vn/install.ps1 | iex</code>。不需要管理员权限。</li>
<li>等待大约一分钟。安装程序会静默运行，AI Translator 会自动打开。</li>
</ol>
<p>如果你已经在浏览器中下载了 <code>.exe</code>：双击它；如果 Windows 显示蓝色的“Windows 已保护你的电脑”界面，请点击<strong>更多信息</strong>，确认“应用”一行显示的是安装程序的文件名，然后点击<strong>仍要运行</strong>。</p>
<p>详细内容（包括如何核对安装包的 SHA-256），请参阅在 <a href="/zh/guide/install-macos/">macOS</a> 和 <a href="/zh/guide/install-windows/">Windows</a> 上安装的指南。</p>

<h2 id="first-time-setup">七步完成首次设置</h2>
<p>第一次启动时，应用会在窗口中间的卡片里显示一个 9 屏的设置向导：顶部有标志、“第 1 步，共 9 步”和进度条，底部有<strong>上一步</strong>和<strong>下一步</strong>。本指南把它们归纳为七个步骤。Windows 没有音频权限这一屏，所以向导共 8 屏；下面截图中的步骤编号以 macOS 为准。</p>

<h3>第 1 步：选择界面语言</h3>
<p>已预先选中你电脑的语言：<strong>Tiếng Việt</strong>、<strong>English</strong>、<strong>日本語</strong>、<strong>中文</strong>（简体中文）或<strong>한국어</strong>；如果你的电脑使用其他语言，则预先选中 English。如有需要可以更改，然后点击“下一步”。这也会设置你阅读字幕的语言；你可以在第 5 步再次更改。</p>
${appShot({ slug: "app-onboarding-1", lang: "zh", alt: "设置向导的第一屏，有五种界面语言选项：Tiếng Việt、English、日本語、中文和한국어", caption: "第 1 步，共 9 步：界面语言。" })}

<h3>第 2 步：接受条款</h3>
<p>阅读最终用户许可协议（EULA）和隐私政策，然后勾选“我已阅读并同意最终用户许可协议（EULA）和隐私政策”。勾选之前，“下一步”无法点击。两份文件都有越南语和英语版本；如果界面是日语、中文或韩语，应用会显示英语版本并附上简短说明。同一屏上还有一个可选的复选框，默认已勾选，用于在应用出错时自动发送错误报告（不含音频，也不含转写文字）；如果你不想发送，可以取消勾选，以后也可以在“设置 › 隐私”中更改。点击“下一步”时，应用会向服务器登记这台电脑的 Free 试用，所以需要联网一次。</p>
${appShot({ slug: "app-onboarding-2", lang: "zh", alt: "使用条款步骤：两份可折叠的文件、必须勾选的同意复选框，以及一个默认勾选的可选自动发送错误报告复选框", caption: "第 2 步，共 9 步：使用条款。" })}

<h3>第 3 步：选择并下载模型</h3>
<p>应用会显示你的内存和可用磁盘空间，并推荐一个模型包：内存约 16 GB 或以上的 Mac（或者内存 16 GB 或以上、配有 6 GB 显存独立显卡的 Windows 电脑）推荐 <strong>Standard</strong> 模型包（约 2.5 GB），其他电脑推荐 <strong>Lite</strong> 模型包（约 1.3 GB）。选好模型包后，下一屏会开始下载，并提供“暂停”和“继续”按钮。下载时你也可以点击“下一步”，模型会在后台继续下载。完成后，应用会显示“下载完成。AI Translator 已可以翻译。”</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-3", lang: "zh", alt: "检查电脑的步骤，显示内存、可用磁盘空间和推荐的模型包", caption: "第 3 步，共 9 步：检查这台电脑，选择模型包。" })}
${appShot({ slug: "app-onboarding-4", lang: "zh", alt: "下载模型的步骤，有进度条和暂停按钮", caption: "第 4 步，共 9 步：下载模型。" })}
</div>

<h3>第 4 步：允许系统音频录制（仅 macOS）</h3>
<p>AI Translator 第一次采集音频时，macOS 会请求<strong>系统音频录制</strong>权限。这一屏只是提前提醒你：macOS 的提示会在下面的“试一试”步骤，或你第一次点击“开始”时出现。请允许。如果不小心拒绝了，这一屏上的<strong>打开系统设置</strong>按钮会带你到正确的位置。应用不使用麦克风。详见<a href="/zh/guide/macos-audio-permission/">授予系统音频录制权限</a>。Windows 没有这一步。</p>
${appShot({ slug: "app-onboarding-5", lang: "zh", alt: "允许系统音频录制的步骤，有一个打开系统设置按钮", caption: "第 5 步，共 9 步：系统音频录制权限（仅 macOS）。" })}

<h3>第 5 步：选择语言</h3>
<p>在<strong>目标语言</strong>中选择你想阅读的语言。勾选会议中可能使用的语言（默认全部五种）。<strong>源语言</strong>可以保持“自动检测”，如果你知道会议只用一种语言，也可以锁定那种语言。</p>
${appShot({ slug: "app-onboarding-6", lang: "zh", alt: "选择语言的步骤，有目标语言菜单、代表会议语言的五个圆角标签以及源语言菜单", caption: "第 6 步，共 9 步：选择语言。" })}

<h3>第 6 步：试一试</h3>
<p>点击<strong>播放示例句子</strong>。应用会通过扬声器播放一句英语，它的字幕会出现在字幕条上，这一屏会显示“运行正常。翻译：…”。如果你的 Mac 处于静音状态，请调高音量。如果 macOS 此时请求录音权限，请允许。</p>
${appShot({ slug: "app-onboarding-7", lang: "zh", alt: "试一试步骤，有一个播放示例句子按钮", caption: "第 7 步，共 9 步：试一试。" })}

<h3>第 7 步：阅读说明并完成</h3>
<p>音频从不离开这台电脑。如果法律或你所在公司有要求，你有责任告诉其他参会者你在使用翻译工具。关闭窗口只会把应用隐藏到菜单栏（macOS）或系统托盘（Windows）中。在 Windows 上，新图标可能藏在任务栏的 ^ 箭头后面；最后一屏会告诉你如何把它显示出来。点击<strong>开始使用 AI Translator</strong>，进入主页。</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-8", lang: "zh", alt: "隐私步骤，说明音频从不离开电脑，以及在需要时必须告知其他参会者", caption: "第 8 步，共 9 步：你的隐私。" })}
${appShot({ slug: "app-onboarding-9", lang: "zh", alt: "最后一步，说明关闭窗口后 AI Translator 仍会在菜单栏中运行", caption: "第 9 步，共 9 步：它会继续在菜单栏中运行。" })}
</div>

<h2 id="first-meeting">翻译你的第一场会议</h2>
<p>主窗口左侧边栏中的每个页面都有一个图标；窗口较窄时只显示图标，鼠标悬停时会显示名称。</p>
<ol>
<li>在主页的<strong>语言</strong>卡片中，检查“目标语言”和“会议中使用的语言”。</li>
<li><strong>音频来源</strong>卡片默认为“整个系统（本应用除外）”。如果只想翻译一个应用，请点击<strong>更改</strong>。在 Windows 上，音频来源是默认播放设备或你选择的设备；目前还不能只选择一个应用。</li>
<li>打开一场有声音的会议或一个视频，点击<strong>开始</strong>（或按 ${keys(["⌃", "⌥", "T"])}；Windows 上按 ${keys(["Ctrl", "Alt", "T"])}）。状态会从“正在启动”变为“翻译中”；最初几秒，字幕条上可能显示“正在加载模型…”。</li>
<li>阅读悬浮字幕条上的字幕。有声音传来时，字幕条右上角的小圆点会变绿，主页上的“输入电平”条也会随之跳动；颜色较淡的一行是临时字幕，句子完成后会被替换。</li>
<li>完成后点击<strong>停止</strong>。字幕条会保留最后几行，方便你读完，并会出现<strong>打开转写记录</strong>，显示时间、原文和译文。所有套餐都可以使用<strong>全部复制</strong>。</li>
</ol>
${appShot({ slug: "app-home-running", lang: "zh", alt: "正在翻译时的主页：翻译中状态、停止按钮、语言卡片和输入电平条", caption: "正在翻译时的主页。" })}
<p>如何拖动、锁定、隐藏字幕条以及更改它的样式，请参阅<a href="/zh/guide/subtitle-bar-and-shortcuts/">字幕条和快捷键指南</a>。在 10 天试用期内，Free 套餐每天可翻译 30 分钟。</p>
${overlayShot({ slug: "overlay-default", lang: "zh", alt: "会议画面上的默认字幕条：原句以小字显示在上方，译文在下方", caption: "默认字幕条：上方是小字原文，下方是译文。" })}

<h2 id="common-problems">首次运行的常见问题</h2>
<ul>
<li><strong>macOS 打不开应用。</strong>在终端中运行安装命令（应用会直接打开），或者按上面的“仍要打开”步骤操作；详见<a href="/zh/guide/install-macos/">安装指南</a>。</li>
<li><strong>Windows 显示“Windows 已保护你的电脑”。</strong>点击“更多信息”，然后点击“仍要运行”；详见 <a href="/zh/guide/install-windows/">Windows 安装指南</a>。</li>
<li><strong>没有字幕，主页显示“有应用正在发声，却什么也没听到…”（macOS）。</strong>macOS 还没有允许系统音频录制；请参阅<a href="/zh/guide/macos-audio-permission/">权限指南</a>。</li>
<li><strong>示例句子没有显示字幕。</strong>请检查扬声器是否静音，然后再试一次。</li>
<li><strong>模型下载到一半停了。</strong>点击<strong>继续</strong>，从停下的地方接着下载。</li>
<li><strong>看不到字幕条。</strong>它可能被隐藏了：在“字幕条”卡片中点击<strong>显示</strong>，或按 ${keys(["⌃", "⌥", "H"])}（Windows：${keys(["Ctrl", "Alt", "H"])}）。</li>
<li><strong>第一次运行要等一会儿。</strong>安装或更新之后，应用可能会显示“正在为首次使用做准备，可能需要几分钟。”</li>
</ul>
<p>其他问题请参阅<a href="/zh/guide/troubleshooting/">故障排除</a>。</p>

${docNav(
  [
    { href: "/zh/guide/", kicker: "全部指南", title: "AI Translator 使用指南" },
    { href: "/zh/guide/install-macos/", kicker: "下一篇", title: "在 macOS 上安装 AI Translator" },
    { href: "/zh/guide/subtitle-bar-and-shortcuts/", kicker: "相关", title: "字幕条和快捷键" },
  ],
  "相关指南",
)}
`,
})}
</div></section>
`,
};
