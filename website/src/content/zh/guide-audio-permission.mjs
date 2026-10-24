import { pageHero, appShot, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "音频权限", path: "/zh/guide/macos-audio-permission/" },
];

const toc = [
  { level: 2, id: "which-permission", text: "应用需要什么权限？" },
  { level: 2, id: "permission-prompt", text: "macOS 的权限提示" },
  { level: 2, id: "if-you-refused", text: "如果你拒绝了" },
  { level: 2, id: "signs-of-missing-permission", text: "缺少权限的迹象" },
  { level: 2, id: "why-no-error", text: "macOS 为什么不报错" },
  { level: 2, id: "after-updates", text: "每次更新后" },
  { level: 2, id: "audio-source", text: "选择音频来源" },
];

const HOWTO_STEPS = [
  { name: "打开系统设置", text: "在 AI Translator 中点击“打开系统设置”，或者自己打开系统设置并选择“隐私与安全性”。" },
  { name: "打开“屏幕与系统音频录制”", text: "在“隐私与安全性”中选择“屏幕与系统音频录制”。" },
  { name: "开启 AI Translator", text: "在“仅系统音频录制”下，打开 AI Translator 的开关。" },
  { name: "再试一次", text: "如有需要，重新打开 AI Translator，点击“开始”并播放一些声音，确认字幕会出现。" },
];

export default {
  id: "guide-audio-permission",
  lang: "zh",
  path: "/zh/guide/macos-audio-permission/",
  title: "在 macOS 上授予系统音频录制权限",
  description:
    "在 macOS 上为 AI Translator 授予系统音频录制权限：回应提示、在系统设置中重新开启、识别缺少权限的迹象，以及选择音频来源。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-24",
  schema: [
    howTo({
      name: "为 AI Translator 重新开启系统音频录制",
      description: "在拒绝 macOS 的提示之后，如何在系统设置中为 AI Translator 开启系统音频录制权限。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "在 macOS 上授予系统音频录制权限",
  lead: "为了翻译电脑音频，AI Translator 需要一项 macOS 权限：系统音频录制，这样它才能听到你的 Mac 正在播放的音频。选择含麦克风的采集来源时，macOS 还会请求麦克风权限。如果你不小心拒绝了，请在“系统设置 › 隐私与安全性 › 屏幕与系统音频录制”中重新开启。",
  meta: "<span>仅适用于 macOS 14.2 或更高版本</span> <span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本指南内容",
  body: `
<h2 id="which-permission">应用需要什么权限？</h2>
<p>AI Translator 采集电脑上正在播放的音频（会议声音、视频、网络研讨会），以便识别和翻译。所以 macOS 要求<strong>系统音频录制</strong>权限。使用默认来源（<strong>电脑音频</strong>）时，应用不会打开麦克风；只有在你选择<strong>麦克风</strong>或<strong>电脑音频 + 麦克风</strong>时才会打开（见<a href="#microphone-permission">麦克风权限</a>）。应用不会把会议保存到磁盘：翻译时音频只留在内存中。Windows 没有系统音频的权限步骤。</p>
${facts([
  ["权限", "系统音频录制"],
  ["在哪里重新开启", "系统设置 › 隐私与安全性 › 屏幕与系统音频录制 › 仅系统音频录制"],
  ["macOS 何时询问", "AI Translator 第一次采集音频时：在“试一试”步骤，或你第一次点击“开始”时"],
])}

<h2 id="permission-prompt">macOS 的权限提示</h2>
<p>AI Translator 第一次采集音频时，macOS 会用你 Mac 的语言显示一个权限提示，并附上我们写的说明。中文版本如下：</p>
<blockquote>AI Translator 会采集 Mac 正在播放的音频，用于显示翻译字幕。音频不会离开你的 Mac。</blockquote>
<p>请允许。应用在首次设置的第 5 步（共 9 步）中也会告诉你这一点（见<a href="/zh/guide/quick-start/">快速入门指南</a>）。</p>
${appShot({ slug: "app-onboarding-5", lang: "zh", alt: "设置向导中允许系统音频录制的步骤，有一个打开系统设置按钮", caption: "第 5 步，共 9 步：应用说明这项权限，并提供打开系统设置按钮。" })}

<h2 id="if-you-refused">如果你拒绝了：在系统设置中重新开启</h2>
<ol>
<li>在 AI Translator 中点击<strong>打开系统设置</strong>（它位于首次设置的第 5 步，以及应用报告缺少权限时的主页上）。也可以自己打开系统设置。</li>
<li>选择<strong>隐私与安全性</strong>，然后选择<strong>屏幕与系统音频录制</strong>。</li>
<li>找到<strong>仅系统音频录制</strong>，打开 <strong>AI Translator</strong> 的开关。</li>
<li>回到应用，点击<strong>开始</strong>，然后播放有声音的内容。</li>
</ol>
<p>如果字幕仍然没有出现，请完全退出 AI Translator（从它的菜单栏图标选择<strong>退出</strong>），然后重新打开。如果列表中还没有 AI Translator，请回到应用点击一次“开始”（如果在设置向导中，则点击“播放示例句子”），让 macOS 请求权限；之后应用通常会出现在列表中，再检查一次即可。系统设置中各项的名称在不同 macOS 版本上可能略有不同。</p>

<h2 id="signs-of-missing-permission">缺少权限的迹象</h2>
<p>没有权限时，即使会议有声音也不会出现字幕，主页上的“输入电平”条也一直不动。在已知有其他应用正在发声、却持续一段时间静音之后，<strong>主页</strong>会显示：</p>
<blockquote>有应用正在发声，却什么也没听到：AI Translator 可能没有被允许录制系统音频。</blockquote>
<p>它附带一个<strong>打开系统设置</strong>按钮。如果会话因为缺少权限而停止，主页会显示“AI Translator 没有被允许录制系统音频。”，并附带同样的按钮。请不要把它们与字幕条上的一般提示“没有听到声音。请检查会议声音是否在播放。”混淆：那只表示有一段时间没有声音，可能只是会议很安静。</p>

<h2 id="why-no-error">你拒绝时 macOS 为什么不报错</h2>
<p>权限被拒绝时，macOS 仍然允许应用创建采集源，并且仍报告它在运行，但传来的每个采样都是静音。由于没有错误可以报告，AI Translator 只能在其他应用发声期间等待一段较长的静音，才能判断缺少权限。所以警告会在过一会儿后出现，而不是立刻出现。</p>

<h2 id="after-updates">每次更新后，macOS 可能会再次询问</h2>
<p>当前的 macOS 版本是临时签名，所以每次更新后，macOS 可能会再请求一次这项录音权限（同时还有 1 个钥匙串对话框）。请允许；你不会丢失数据、套餐或翻译时长。详见 <a href="/zh/guide/install-macos/">macOS 安装指南</a>。</p>

<h2 id="audio-source">选择音频来源：整个系统还是一个应用</h2>
<p>这项权限同时适用于两种模式。在<strong>设置 › 音频 › 音频来源</strong>中选择模式：</p>
<ul>
<li><strong>整个系统（本应用除外）</strong>（默认）：翻译 Mac 播放的所有声音，包括通知音。</li>
<li><strong>“仅”加应用名称</strong>：选择你的会议应用。其他声音（例如通知）不会被翻译。Safari 和其他应用内的网页会归为一项，显示为“Safari 以及其他应用内的网页”。</li>
</ul>
<p>列表只显示<em>此刻正在发声</em>的应用；请在会议开始后点击<strong>刷新列表</strong>。新的音频来源从下一个会话开始生效。如果所选应用停止发声，应用会显示“所选应用没有发声”，并在它再次发声时立刻继续。</p>
${appShot({ slug: "app-settings-audio", lang: "zh", alt: "音频设置：音频来源选择器（设为仅 Zoom）、刷新列表按钮和结束一句话的停顿滑块", caption: "设置 › 音频：音频来源和断句灵敏度。" })}

${docNav(
  [
    { href: "/zh/guide/install-macos/", kicker: "上一篇", title: "在 macOS 上安装 AI Translator" },
    { href: "/zh/guide/subtitle-bar-and-shortcuts/", kicker: "下一篇", title: "字幕条和快捷键" },
    { href: "/zh/guide/troubleshooting/", kicker: "相关", title: "故障排除" },
  ],
  "相关指南",
)}
`,
})}
</div></section>
`,
};
