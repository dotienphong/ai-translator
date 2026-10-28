import { pageHero, callout, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "字幕条和快捷键", path: "/zh/guide/subtitle-bar-and-shortcuts/" },
];

const toc = [
  { level: 2, id: "move-and-resize", text: "移动和调整大小" },
  { level: 2, id: "lock", text: "锁定和解锁" },
  { level: 2, id: "show-hide", text: "显示和隐藏" },
  { level: 2, id: "scroll", text: "回看之前的句子" },
  { level: 2, id: "style", text: "字号、颜色、不透明度" },
  { level: 2, id: "speakers", text: "谁在说话：颜色和姓名" },
  { level: 2, id: "indicators", text: "字幕条上的提示" },
  { level: 2, id: "shortcuts", text: "默认快捷键" },
  { level: 2, id: "change-shortcuts", text: "更改快捷键" },
  { level: 2, id: "menu-bar", text: "菜单栏和托盘菜单" },
  { level: 2, id: "closing-the-window", text: "为什么关闭窗口不会退出" },
];

export default {
  id: "guide-subtitle-bar",
  lang: "zh",
  path: "/zh/guide/subtitle-bar-and-shortcuts/",
  title: "AI Translator 字幕条和快捷键",
  description:
    "移动、锁定、隐藏和滚动 AI Translator 的字幕条，设置字号、颜色和不透明度，并了解 macOS 和 Windows 的默认快捷键以及菜单栏菜单。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "字幕条和快捷键",
  lead: "字幕条是一个始终置顶的悬浮窗口，显示译文时不会抢走会议应用的焦点。拖动它可以移动，拖动边缘可以调整大小，锁定后鼠标可以穿透，还可以用 ⌃⌥T（开始或停止）和 ⌃⌥H（显示或隐藏）等快捷键来控制。",
  meta: "<span>macOS 和 Windows</span> <span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本指南内容",
  body: `
<h2 id="move-and-resize">移动和调整大小</h2>
<p>字幕条未锁定时，拖动它的任何位置都可以移动；顶部边缘中间的小把手表示它可以移动。拖动边缘或角落可以调整大小，最小尺寸为 320 × 80。应用会为每个屏幕分别记住位置和大小。默认情况下，字幕条位于屏幕中间、靠近底部边缘的位置。</p>
${overlayShot({ slug: "overlay-default", lang: "zh", alt: "默认字幕条：半透明黑色背景上的白色文字，原句以小字显示在译文上方", caption: "默认字幕条。未锁定时，顶部边缘中间会显示一个小把手，边框也更亮。" })}

<h2 id="lock">锁定和解锁（点击穿透）</h2>
<p>锁定字幕条后，鼠标会直接穿过它，所以它永远不会挡住会议的按钮或聊天框。锁定时，顶部的把手会消失，边框变淡，字幕条上没有任何按钮。</p>
<ul>
<li>在主页的<strong>字幕条</strong>卡片中：点击<strong>锁定（点击穿透）</strong>或<strong>解锁</strong>。</li>
<li>快捷键 ${keys(["⌃", "⌥", "L"])}。</li>
<li>菜单栏菜单：<strong>锁定字幕（点击穿透）</strong>或<strong>解锁字幕</strong>。</li>
</ul>
${overlayShot({ slug: "overlay-locked", lang: "zh", alt: "已锁定的字幕条，没有把手和按钮，在会议画面上显示译文", caption: "已锁定的字幕条：简洁、没有按钮，点击会穿透过去。" })}
${callout({ title: "已锁定的字幕条无法点击。", text: "要解锁，请使用快捷键、菜单栏菜单或主页上的按钮。" })}

<h2 id="show-hide">显示和隐藏</h2>
<p>把鼠标悬停在未锁定的字幕条上，右上角会出现 <strong>✕</strong> 按钮（“关闭字幕并停止翻译”；鼠标悬停时变为红色）。点击它会同时隐藏字幕条并停止翻译，所以你不需要再点击“停止”；应用不会退出。如果想隐藏字幕条但继续翻译，请使用 ${keys(["⌃", "⌥", "H"])}、主页上的<strong>隐藏</strong>按钮或菜单栏菜单；用同样的方式可以让字幕条重新出现。打开应用时字幕条是隐藏的，点击“开始”时会出现，点击“停止”时会保留最后几行。</p>

<h2 id="scroll">回看之前的句子</h2>
<p>字幕条最多保留本次会话的最后 1000 句。停在最底部时，它会自动跟随新句子。用鼠标滚轮或触控板向上滚动（未锁定时），它就会停止跟随，并在右下角显示 <strong>↓ 最新</strong>按钮；点击它即可回到当前句子。字幕条锁定时鼠标会穿透，所以请使用 ${keys(["⌃", "⌥", "PageUp"])} 和 ${keys(["⌃", "⌥", "PageDown"])}，每次滚动约字幕条高度的 80%；此时“最新”标签只是提示你正在看较早的句子。MacBook 键盘没有单独的 Page Up 和 Page Down 键；如果用起来不方便，请更改这两个快捷键。</p>

<h2 id="style">字号、颜色、不透明度</h2>
<p>打开<strong>设置 › 字幕</strong>。顶部的<strong>预览</strong>会用你设置的文字颜色、背景、不透明度和字号绘制一句示例，即使在拖动滑块时也会实时更新。真实的字幕条也会立即变化；如果在没有翻译时想在真实的字幕条上查看，请点击“字幕条”一行中的<strong>显示</strong>。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">设置</th><th scope="col">选项</th><th scope="col">默认值</th></tr></thead>
<tbody>
<tr><th scope="row">字体大小</th><td>14 到 48 px</td><td>20 px</td></tr>
<tr><th scope="row">文字颜色</th><td>白色、黄色、绿色、浅蓝色、橙色</td><td>白色</td></tr>
<tr><th scope="row">背景颜色</th><td>黑色、深灰色、藏青色、深棕色、深紫色</td><td>黑色</td></tr>
<tr><th scope="row">背景不透明度</th><td>0 到 100%（0% 为透明背景，100% 为不透明）</td><td>60%</td></tr>
<tr><th scope="row">在译文上方显示原文</th><td>开或关</td><td>开</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${appShot({ slug: "app-settings-subtitles", lang: "zh", alt: "字幕设置：顶部是示例句子预览，下面是字号滑块、两行颜色色块、背景不透明度滑块和显示原文的开关", caption: "设置 › 字幕。" })}
${overlayShot({ slug: "overlay-custom", lang: "zh", alt: "自定义字幕条：藏青色背景上的黄色文字，字号更大", caption: "示例：黄色文字、藏青色背景、较大字号。" })}
</div>

<h2 id="speakers">谁在说话：颜色和姓名</h2>
<p>在 macOS 上，AI Translator 0.3.2 及以上版本的字幕条可以显示谁在说话。所有套餐默认开启，可在<strong>设置 › 字幕 › 说话人</strong>中关闭。</p>
<ul>
<li><strong>每个声音一种颜色。</strong>声音在你的电脑上区分，并按出现顺序标为“说话人1”“说话人2”。标签和彩色竖条出现在每次发言的第一行；同一个人后面的句子只有彩色竖条。</li>
<li><strong>来自 Microsoft Teams 的真实姓名。</strong>在电脑上安装的 Teams 应用里翻译会议时，应用从会议窗口读取参会者姓名，只有足够确定时才显示姓名；不确定时保持“说话人N”，因为错误的姓名比通用标签更糟。应用不读取聊天，也不截屏。Google Meet 和 Zoom 的姓名暂时还没有。</li>
<li><strong>可以自己修正。</strong>在主窗口的转写记录中，点击标签可以重命名、<em>从会议参与者中选择</em>，或在两个标签其实是同一个人时<em>合并到其他说话人</em>。修改对当前整个会话生效。</li>
<li><strong>权限。</strong>为了读取姓名，macOS 会请求<em>辅助功能</em>权限：字幕条会显示一行简短提示（<em>允许辅助功能权限以显示说话人姓名</em>）和打开设置的按钮；应用不会自己弹出系统对话框。应用更新后 macOS 可能再次请求。不授予权限时仍有颜色和“说话人N”。</li>
<li><strong>历史记录和导出。</strong>标签和姓名仅在你使用 Pro 套餐并开启“保存历史记录”时才会存入历史记录和导出的文件；复制按钮和导出在所有套餐中都会在文本里带上标签。</li>
</ul>
<p>局限：声音非常相似的两个人可能共用一个标签，多人同时说话时标签可能出错。暂不支持 Windows；在 Google Meet 和 Zoom 中，应用会显示颜色和“说话人N”，但暂时没有姓名。</p>

<h2 id="indicators">字幕条上的提示</h2>
<p>字幕条右上角会显示一个圆点和几条简短的提示：</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">你看到的</th><th scope="col">含义</th></tr></thead>
<tbody>
<tr><th scope="row">一个绿色小圆点</th><td>有声音传来。没有声音时，圆点是淡白色。圆点只在会话进行中显示</td></tr>
<tr><th scope="row">正在加载模型…</th><td>会话最初几秒，AI 处理正在启动</td></tr>
<tr><th scope="row">处理跟不上</th><td>字幕比语音慢</td></tr>
<tr><th scope="row">没有听到声音…</th><td>一段时间没有声音；请检查会议是否在播放</td></tr>
<tr><th scope="row">剩余翻译时间不足 5 分钟</th><td>你快用完翻译时长了</td></tr>
<tr><th scope="row">翻译时间已用完 · … 重置</th><td>会话已停止；翻译时长会在字幕条上显示的时间恢复</td></tr>
</tbody></table></div>
<p>颜色较淡的一行是临时字幕，发言人继续说下去时会被完整的句子替换。一个小小的“未翻译”标签表示应用没能翻译这句话。</p>

<h2 id="shortcuts">默认快捷键</h2>
<p>快捷键在任何应用中都有效，即使 AI Translator 不是最前面的窗口。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">操作</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">开始或停止翻译</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">显示或隐藏字幕</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">锁定或解锁字幕</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">向上滚动字幕（较早的句子）</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">向下滚动字幕（较新的句子）</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">打开或关闭输入翻译框</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">在 macOS 上，⌃ 是 Control 键，⌥ 是 Option 键（不是 Command）。</p>
<p>输入翻译的快捷键只在开启输入翻译时有效（设置 › 输入翻译）。输入框的用法请参阅<a href="/zh/guide/type-and-translate/">输入翻译</a>。</p>

<h2 id="change-shortcuts">更改快捷键</h2>
<ol>
<li>打开<strong>设置 › 快捷键</strong>。</li>
<li>点击操作旁边的<strong>更改</strong>。</li>
<li>按下新的快捷键，或按 <strong>Esc</strong> 取消。</li>
</ol>
<p>新的快捷键至少需要包含 Ctrl、Alt 或 Cmd 中的一个；只有 Shift 是不够的。如果你选了应用自己已有的快捷键，应用会显示“此快捷键已用于另一个操作。”；如果操作系统不接受，则显示“系统拒绝了此快捷键；可能有其他应用正在使用它。”我们没有检查默认按键是否与 Zoom、Teams 或 Meet 的快捷键冲突；如果发现冲突，请在这里更改快捷键。</p>
${appShot({ slug: "app-settings-hotkeys", lang: "zh", alt: "快捷键设置，列出包括打开输入翻译在内的六个操作、它们在 macOS 上的默认组合键以及更改按钮", caption: "设置 › 快捷键。" })}

<h2 id="menu-bar">菜单栏和托盘菜单</h2>
<p>菜单栏中的 AI Translator 图标（带声波的对话气泡）让你无需打开主窗口就能控制应用。把鼠标悬停在上面可以看到状态：“就绪”或“翻译中”。</p>
<p>在 Windows 上，图标（应用的彩色标志）位于任务栏右端的系统托盘中；Windows 可能会把它藏在 <strong>^</strong> 箭头后面。右键点击图标会打开下面的菜单；左键点击则打开主窗口。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">菜单项</th><th scope="col">何时出现</th></tr></thead>
<tbody>
<tr><th scope="row">开始翻译 / 停止翻译</th><td>随状态变化</td></tr>
<tr><th scope="row">显示字幕 / 隐藏字幕</th><td>随状态变化</td></tr>
<tr><th scope="row">锁定字幕（点击穿透） / 解锁字幕</th><td>随状态变化</td></tr>
<tr><th scope="row">打开主窗口</th><td>始终显示</td></tr>
<tr><th scope="row">检查更新…</th><td>始终显示；打开“设置 › 通用”并立即检查</td></tr>
<tr><th scope="row">重启以更新</th><td>更新已下载且应用没有在翻译时</td></tr>
<tr><th scope="row">退出</th><td>始终显示；停止正在进行的会话，然后彻底退出</td></tr>
<tr><th scope="row">有快捷键未能注册</th><td>只在有快捷键注册失败时显示</td></tr>
</tbody></table></div>

<h2 id="closing-the-window">为什么关闭窗口不会退出应用</h2>
<p>AI Translator 被设计为常驻在菜单栏（macOS）或系统托盘（Windows）中，这样在你关闭主窗口后，快捷键和正在进行的会话仍能继续工作。关闭按钮只会隐藏窗口。在 Mac 上，⌘Q 也不会退出：应用会重新显示主窗口，并提示“AI Translator 会继续在菜单栏中运行。要退出，请在菜单栏图标中选择“退出”。”要完全退出，请从菜单栏或系统托盘中的图标选择<strong>退出</strong>。</p>
<p>有什么不对劲？请参阅<a href="/zh/guide/troubleshooting/">故障排除</a>。整体介绍请参阅<a href="/zh/features/">功能</a>页面。</p>

${docNav(
  [
    { href: "/zh/guide/macos-audio-permission/", kicker: "上一篇", title: "在 macOS 上授予系统音频录制权限" },
    { href: "/zh/guide/type-and-translate/", kicker: "下一篇", title: "输入翻译" },
    { href: "/zh/guide/troubleshooting/", kicker: "相关", title: "故障排除" },
  ],
  "相关指南",
)}
`,
})}
</div></section>
`,
};
