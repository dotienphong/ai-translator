import { pageHero, callout, facts, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "输入翻译", path: "/zh/guide/type-and-translate/" },
];

const toc = [
  { level: 2, id: "how-to-use", text: "输入翻译如何工作" },
  { level: 2, id: "keys", text: "输入框中的按键" },
  { level: 2, id: "language", text: "翻译成哪种语言" },
  { level: 2, id: "accessibility", text: "macOS 自动粘贴：辅助功能" },
  { level: 2, id: "windows", text: "在 Windows 上" },
  { level: 2, id: "when-paste-fails", text: "限制以及粘贴失败时" },
  { level: 2, id: "privacy", text: "你输入的文字去了哪里" },
];

export default {
  id: "guide-type-translate",
  lang: "zh",
  path: "/zh/guide/type-and-translate/",
  title: "输入翻译：翻译聊天消息并粘贴",
  description:
    "如何使用 AI Translator 的输入翻译：按 ⌃⌥G 或 Ctrl+Alt+G，用自己的语言输入，按 Enter 就会把译文粘贴到你正在使用的聊天框中。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-17",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "用 AI Translator 的输入翻译发送翻译后的消息",
      description: "在 AI Translator 的输入框中用自己的语言写消息，把译文粘贴到聊天框中并发送。",
      totalTime: "PT1M",
      steps: [
        { name: "点击聊天框", text: "打开你正在使用的聊天应用或网页，点击输入消息的框。" },
        { name: "打开输入框", text: "在 macOS 上按 ⌃⌥G，在 Windows 上按 Ctrl+Alt+G。输入翻译框会出现在屏幕中间，光标已经在里面。" },
        { name: "输入你的消息", text: "用自己的语言输入。稍停片刻，译文就会出现在下方。" },
        { name: "按 Enter 粘贴", text: "输入框关闭，译文被粘贴到聊天框中。此时还没有发送任何内容。" },
        { name: "再按一次 Enter 发送", text: "在聊天框中检查译文，然后按聊天应用的 Enter 发送。" },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "输入翻译",
  lead: "输入翻译让你可以在正在使用的应用的聊天框里，给说另一种语言的人发消息。你在一个悬浮输入框中用自己的语言输入，AI Translator 在你的电脑上翻译，然后把译文粘贴到聊天框中，由你检查后发送。",
  meta: `<span>更新于 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本指南内容",
  body: `
${facts([
  ["快捷键", "macOS 上为 ⌃⌥G，Windows 上为 Ctrl+Alt+G<small>可在“设置 › 快捷键”中更改</small>"],
  ["套餐", "所有有效套餐<small>包括试用期内的 Free；不占用翻译时长</small>"],
  ["语言", "English、中文、日本語、한국어、Tiếng Việt<small>默认是与你交谈的人所用的语言</small>"],
  ["长度", "每条消息最多 4000 个字符<small>太长的行请拆开</small>"],
  ["网络", "不需要<small>在你的电脑上翻译</small>"],
  ["macOS 自动粘贴", "需要辅助功能权限<small>没有权限时，应用会复制译文，由你自己粘贴</small>"],
])}

<h2 id="how-to-use">输入翻译是如何工作的？</h2>
<ol>
<li>点击你正在使用的应用（Messenger、Slack、Zalo、Zoom 聊天……）的聊天框，就像准备打字一样。</li>
<li>在 macOS 上按 ${keys(["⌃", "⌥", "G"])}，在 Windows 上按 ${keys(["Ctrl", "Alt", "G"])}。<strong>输入翻译</strong>框会出现在鼠标指针所在屏幕的中间，光标已经在里面。聊天应用仍在前面，聊天框里的内容也保持不变。</li>
<li>用自己的语言输入消息。停顿大约半秒，AI Translator 就会翻译你输入的全部内容；译文边生成边显示在下方。继续输入，它会再次翻译。</li>
<li>按 <strong>Enter</strong>。输入框关闭，光标回到聊天框，译文被粘贴到那里。<strong>此时还没有发送任何内容。</strong></li>
<li>在聊天框中检查译文，如有需要可以修改，然后按（聊天应用中的）Enter 发送。</li>
</ol>
${overlayShot({
  slug: "compose-done",
  lang: "zh",
  alt: "输入翻译框：输入框里是中文消息，下方是英文译文，底部是 Enter：粘贴 · Shift+Enter：换行 · Esc：关闭",
  caption: "译文准备好后的输入翻译框：按 Enter 把它粘贴到聊天框中。",
})}
<p>输入框顶部一行显示目标语言和当前状态：“正在加载模型…”（应用闲置一段时间后的第一次）、“正在翻译…”，或者当你的消息已经是目标语言时显示“已经是English”（此时按 Enter 会按你输入的原样粘贴）。译文与你的文字还不一致时，会以较淡的颜色显示。</p>
<p>用 Esc、快捷键或点击框外关闭输入框时，你的草稿会保留。再次打开时文字还在，并且已经全选，方便你直接覆盖输入。粘贴之后输入框会清空；退出应用时草稿会丢失。</p>
${callout({
  title: "和字幕一样，需要先下载模型。",
  text: "输入翻译使用与字幕相同的翻译模型，所以需要已下载的模型包（设置 › 模型）。字幕运行时它也能使用；这时你每翻译一条消息，字幕可能会稍晚一点出现。输入翻译不使用术语表。",
})}

<h2 id="keys">输入框中的按键</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">按键</th><th scope="col">作用</th></tr></thead>
<tbody>
<tr><th scope="row">Enter</th><td>把译文粘贴到聊天框。如果正在翻译，会在翻译完成后粘贴。如果翻译失败，会重新翻译：翻译失败后，应用<strong>绝不会粘贴你的原文</strong>。输入框为空时，会关闭输入框。</td></tr>
<tr><th scope="row">Shift+Enter</th><td>换行。每一行分别翻译，译文会保留你的分行。</td></tr>
<tr><th scope="row">Esc</th><td>不粘贴，关闭输入框，并保留草稿。</td></tr>
<tr><th scope="row">${keys(["⌃", "⌥", "G"])} / ${keys(["Ctrl", "Alt", "G"])}</th><td>输入框打开时：像 Esc 一样关闭它。</td></tr>
<tr><th scope="row">点击框外</th><td>像 Esc 一样关闭它。</td></tr>
</tbody></table></div>
<p>当输入法正在选字时（日语、中文或韩语输入），Enter 只会确认文字，不会粘贴。你可以在<strong>设置 › 快捷键</strong>中“打开输入翻译”一行更改快捷键（见<a href="/zh/guide/subtitle-bar-and-shortcuts/">字幕条和快捷键</a>）。</p>

<h2 id="language">翻译成哪种语言？</h2>
<p>默认翻译成<strong>与你交谈的人所用的语言</strong>，根据字幕设置得出：“自动会根据字幕设置使用对方的语言：会议只有一种语言时用该语言，否则用 English（字幕为 English 时用 Tiếng Việt）。”例如，如果你用中文阅读字幕，并把源语言锁定为英语，输入翻译就会翻译成英语。</p>
<p>如果想始终使用同一种语言，请打开<strong>设置 › 输入翻译</strong>，在<strong>目标语言</strong>下选择：“自动（当前：…）”或五种语言之一。这一组中还有<strong>开启输入翻译</strong>开关：关闭时，输入框的快捷键不会有任何作用（你选择的快捷键会保留）。</p>
${appShot({
  slug: "app-settings-compose",
  lang: "zh",
  alt: "输入翻译设置组：开启输入翻译开关、目标语言为自动、自动粘贴到聊天框开关，以及显示已授权的辅助功能权限一行和打开辅助功能设置按钮",
  caption: "macOS 上的“设置 › 输入翻译”。",
})}

<h2 id="accessibility">macOS 自动粘贴：辅助功能权限</h2>
<p>为了替你把译文粘贴到另一个应用中，macOS 要求<strong>辅助功能</strong>权限。AI Translator 只用它向你正在输入的聊天框发送粘贴键 ⌘V；应用不会读取其他应用的文字或内容。</p>
<ol>
<li>在没有权限的情况下第一次按 Enter 时，输入框会保持打开：译文已经复制，输入框中显示“译文已复制。若要让 AI Translator 自动粘贴，请在“辅助功能”中允许它。如果已开启却仍出现此提示（常见于更新后），请点击“开启自动粘贴”以刷新授权。”你可以按 Enter 或 Esc，然后在聊天框中自己按 ⌘V 粘贴。</li>
<li>点击<strong>开启自动粘贴</strong>。macOS 会打开“系统设置 › 隐私与安全性 › 辅助功能”；打开 AI Translator 的开关。</li>
<li>如果你不想授予权限，请点击<strong>始终只复制</strong>：此后按 Enter 只会复制译文并关闭输入框，由你用 ⌘V 粘贴。要改回来，请在<strong>设置 › 输入翻译 › 自动粘贴到聊天框</strong>中更改。</li>
</ol>
<p>权限状态显示在“设置 › 输入翻译”的<strong>辅助功能权限</strong>一行（“已授权。”或“未授权。…”），旁边有一个<strong>打开辅助功能设置</strong>按钮。</p>
${callout({
  kind: "warn",
  title: "应用更新后，可能需要重新开启权限。",
  text: "macOS 版还没有用 Apple 开发者证书签名，所以每次更新后，macOS 可能会把 AI Translator 当作另一个应用：它在“辅助功能”中的条目仍是开启的，但应用仍然显示未授权。从 0.1.14 版开始，点击<strong>开启自动粘贴</strong>（在权限提示框中）或<strong>打开辅助功能设置</strong>（在设置中），应用会自行清除旧的授权，你只需再打开一次开关。在更早的版本上，请把 AI Translator 从列表中移除（− 按钮）再重新添加（+ 按钮）；只把开关关掉再打开是没有用的。在获得权限之前，输入翻译仍会复制译文，由你自己粘贴。",
})}

<h2 id="windows">在 Windows 上</h2>
<p>Windows 不需要任何权限。按 Enter 时，AI Translator 会把你正在聊天的窗口重新带到前面，并发送 Ctrl+V。如果那个窗口已经关闭，或者没有及时回到前面，应用只会复制译文（不会向其他窗口发送按键），由你自己按 Ctrl+V 粘贴。</p>

<h2 id="when-paste-fails">限制以及粘贴失败时</h2>
<ul>
<li><strong>我们试过的环境：</strong>在 macOS 上的 Chrome 和 Safari 浏览器、文本编辑、备忘录、Slack、Teams 和 Telegram（这三个聊天应用只试过与自己的私聊）；我们还没有试过所有聊天应用。粘贴的原理是向你正在输入的框发送 ⌘V（Ctrl+V），所以通常在任何接受粘贴的框中都能用；如果某个应用表现异常，请通过<a href="/zh/contact/">联系</a>页面告诉我们。</li>
<li><strong>译文始终在剪贴板上。</strong>粘贴后，译文会留在剪贴板上（替换原来的内容）。如果聊天框中没有出现文字，请点击聊天框，自己按 ⌘V 或 Ctrl+V 粘贴。</li>
<li><strong>有些框不接受自动粘贴：</strong>密码框（macOS 会在那里阻止其他应用发送的按键）、Windows 上以管理员身份运行的应用，以及阻止粘贴的应用。应用无法检测这些情况。</li>
<li><strong>每条消息最多 4000 个字符。</strong>如果某一行太长，输入框会显示“有一行太长，无法翻译。请拆分成多行或多条消息。”</li>
<li><strong>翻译失败：</strong>输入框会显示“无法翻译这段文字。请按 Enter 重试。”</li>
<li><strong>快捷键打不开输入框：</strong>请检查“设置 › 输入翻译”是否已开启；在 Windows 上，可能有其他应用占用了这个快捷键（“设置 › 快捷键”会显示未能注册），请换一个。在 macOS 上，如果其他应用也使用 ⌃⌥G，请更改其中一个的快捷键。</li>
</ul>
<p>其他错误（模型未下载、试用已结束、密钥被锁定）会显示在输入框中，并附带一个打开应用中相应页面的按钮。另请参阅<a href="/zh/guide/troubleshooting/">故障排除</a>。</p>

<h2 id="privacy">你输入的文字去了哪里？</h2>
<p>哪里都没去。你输入的文字及其译文只保存在你电脑上 AI Translator 的内存中：不通过网络发送，不写入磁盘，也不会出现在日志或错误报告中。应用只是为了粘贴而把译文<strong>写入</strong>剪贴板；它不会读取剪贴板或其他应用中的文字。请参阅<a href="/zh/data-security/">数据与安全</a>。</p>
`,
})}
${docNav(
  [
    { href: "/zh/guide/subtitle-bar-and-shortcuts/", kicker: "上一篇", title: "字幕条和快捷键" },
    { href: "/zh/guide/glossary/", kicker: "下一篇", title: "使用术语表" },
  ],
  "相关指南",
)}
</div></section>
`,
};
