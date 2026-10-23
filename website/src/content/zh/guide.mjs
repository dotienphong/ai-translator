import { pageHero, sectionHead, linkCard, callout, facts, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
];

const MORE = "阅读指南";

export default {
  id: "guide",
  lang: "zh",
  path: "/zh/guide/",
  title: "AI Translator 使用指南",
  description:
    "十篇分步指南：在 macOS 或 Windows 上安装、录音权限、快捷键、输入翻译、术语表、历史记录和导出、购买密钥、故障排除。",
  schemaType: "CollectionPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator 使用指南",
  lead: "十篇 AI Translator 分步指南，从在 macOS 或 Windows 上安装，到购买密钥和解决问题。每篇都使用你在应用中看到的按钮和菜单的原名，大多数还附有真实界面的截图。",
})}

<section class="section-tight"><div class="container">
${callout({ title: "这些指南同时适用于 macOS 和 Windows。", text: "大多数步骤在两个系统上都一样。Windows 上的主要区别：用 PowerShell 命令安装（也可以用 .exe 文件，但由于 Windows 版还没有代码签名，可能会触发 SmartScreen 警告），不需要授予音频权限，图标位于系统托盘而不是菜单栏，快捷键用 Ctrl+Alt 代替 ⌃⌥。还没有安装包？请参阅<a href=\"/zh/download/\">下载页面</a>。" })}
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "入门", title: "从安装包到第一行字幕" })}
<div class="grid grid-2">
${linkCard({ href: "/zh/guide/quick-start/", icon: "play", title: "快速入门", text: "七个只需做一次的设置步骤，然后翻译你的第一场会议，附有应用设置界面的截图。", more: MORE })}
${linkCard({ href: "/zh/guide/install-macos/", icon: "download", title: "在 macOS 上安装", text: "用一条命令安装，或者用 .dmg 安装（拖到“应用程序”、仍要打开），核对 SHA-256 以及卸载。", more: MORE })}
${linkCard({ href: "/zh/guide/install-windows/", icon: "download", title: "在 Windows 上安装", text: "用一条 PowerShell 命令安装，或者用 .exe 安装（SHA-256、SmartScreen），智能应用控制以及卸载。", more: MORE })}
${linkCard({ href: "/zh/guide/macos-audio-permission/", icon: "mic", title: "音频权限（macOS）", text: "回应系统音频录制的提示，在系统设置中重新开启，并选择音频来源。", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "日常使用", title: "用好字幕条、输入翻译、术语表和转写记录" })}
<div class="grid grid-2">
${linkCard({ href: "/zh/guide/subtitle-bar-and-shortcuts/", icon: "captions", title: "字幕条和快捷键", text: "移动、锁定、隐藏和滚动字幕条，更改字号和颜色，快捷键表以及菜单栏菜单。", more: MORE })}
${linkCard({ href: "/zh/guide/type-and-translate/", icon: "message", title: "输入翻译", text: "在你正在使用的聊天框中按 ⌃⌥G（Ctrl+Alt+G），用自己的语言输入，按 Enter 粘贴译文；macOS 上需要辅助功能权限。", more: MORE })}
${linkCard({ href: "/zh/guide/glossary/", icon: "book", title: "使用术语表", text: "添加名称和术语，导入和导出 CSV，并了解为什么术语表只是给翻译的提示，而不是保证。", more: MORE })}
${linkCard({ href: "/zh/guide/history-and-export/", icon: "history", title: "历史记录和导出转写记录", text: "开启保存历史记录，回看过去的会话，复制转写记录，并导出为 TXT、SRT 或 Markdown。", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "套餐和支持", title: "套餐、密钥以及出现问题时" })}
<div class="grid grid-2">
${linkCard({ href: "/zh/guide/buy-and-activate/", icon: "key", title: "购买套餐、激活密钥和更换电脑", text: "在应用内用 VietQR 或国际银行卡购买 Monthly、6 Months 或 Yearly，输入密钥，更换电脑，续期以及找回丢失的密钥。", more: MORE })}
${linkCard({ href: "/zh/guide/troubleshooting/", icon: "support", title: "故障排除", text: "没有字幕、翻译时长用完、密钥被锁定、模型下载失败：每种情况的原因和解决方法。", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
${sectionHead({ title: "按情况查找指南" })}
${facts([
  ["macOS 在首次启动时阻止了应用", "请参阅<a href=\"/zh/guide/install-macos/\">在 macOS 上安装</a>中的“首次启动”一节"],
  ["Windows 显示“Windows 已保护你的电脑”", "请参阅<a href=\"/zh/guide/install-windows/\">在 Windows 上安装</a>中的“运行安装程序”一节"],
  ["按下“开始”后什么都没有出现", "请参阅<a href=\"/zh/guide/macos-audio-permission/\">音频权限</a>，然后参阅<a href=\"/zh/guide/troubleshooting/\">故障排除</a>"],
  ["字幕条不见了或没有反应", "请参阅<a href=\"/zh/guide/subtitle-bar-and-shortcuts/\">字幕条和快捷键</a>中的“显示和隐藏”和“锁定”两节"],
  ["你想保存或导出转写记录", "请参阅<a href=\"/zh/guide/history-and-export/\">历史记录和导出</a>"],
  ["你需要名称和术语始终译得一致", "请参阅<a href=\"/zh/guide/glossary/\">术语表</a>"],
  ["你想用对方的语言回复", "请参阅<a href=\"/zh/guide/type-and-translate/\">输入翻译</a>"],
  ["你换了电脑或丢了密钥", "请参阅<a href=\"/zh/guide/buy-and-activate/\">购买和激活密钥</a>"],
])}
</div></section>

<section class="section-tight"><div class="container narrow">
<div class="card reveal">
<h2>需要帮助？</h2>
<p>在指南中没有找到答案？请阅读<a href="/zh/faq/">常见问题</a>，或者通过<a href="/zh/contact/">联系</a>页面给我们写信。你可以发邮件到 <strong>support@aitranslator.vn</strong>。</p>
<p class="more-link"><a class="btn btn-secondary" href="/zh/contact/">联系客服 ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/zh/faq/">常见问题</a></p>
</div>
</div></section>
`,
};
