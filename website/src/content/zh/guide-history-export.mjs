import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "历史记录和导出转写记录", path: "/zh/guide/history-and-export/" },
];

const toc = [
  { level: 2, id: "transcript", text: "查看、搜索和复制转写记录" },
  { level: 2, id: "save-history", text: "开启历史记录" },
  { level: 2, id: "export", text: "导出为 TXT、SRT、Markdown" },
  { level: 2, id: "delete-data", text: "删除会话和数据" },
];

export default {
  id: "guide-history-export",
  lang: "zh",
  path: "/zh/guide/history-and-export/",
  title: "历史记录和导出：TXT、SRT、Markdown",
  description:
    "所有套餐都能查看、搜索和复制转写记录；开启加密的历史记录并导出为 TXT、SRT 或 Markdown 是 Pro 功能。另介绍 SRT 时间的计算方式和如何删除数据。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "在 AI Translator 中开启历史记录并导出转写记录",
      description: "开启历史记录，翻译一个会话，然后把它的转写记录导出为 TXT、SRT 或 Markdown。",
      totalTime: "PT5M",
      steps: [
        { name: "开启历史记录", text: "打开“设置 › 隐私”，开启“保存转写历史记录”。这需要付费套餐（Monthly、6 Months 或 Yearly）。" },
        { name: "翻译一个会话并按“停止”", text: "按下“停止”后，应用会把会话的转写记录加密保存到你电脑上的历史记录中。" },
        { name: "打开转写记录", text: "打开“转写记录”，或者在“历史记录”中用“打开”按钮打开已保存的会话。" },
        { name: "选择格式并导出", text: "在“导出为”中选择 TXT、SRT 或 Markdown（SRT 需选择“翻译”或“原文”），点击“导出…”并选择保存位置。" },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "历史记录和导出转写记录",
  lead: "AI Translator 的转写记录列出会话中每一句话的时间、原句和译文。所有套餐都可以查看、搜索和复制。保存会话历史记录（加密保存在你自己的电脑上）以及导出为 TXT、SRT 或 Markdown 是 Pro 功能；保存历史记录默认关闭。",
  meta: `<span><span class="badge badge-pro">Pro</span> 导出和历史记录</span><span>更新于 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本页内容",
  body: `
${facts([
  ["所有套餐", "查看、搜索和复制会话的转写记录"],
  ["Pro", "保存历史记录、重新打开过去的会话、导出为 TXT、SRT、Markdown"],
  ["保存历史记录", "默认关闭<small>在“设置 › 隐私”中开启</small>"],
  ["保存位置", "你的电脑上，加密保存<small>密钥保存在钥匙串（macOS）或凭据管理器（Windows）中</small>"],
])}

<h2 id="transcript">查看、搜索和复制转写记录</h2>
<p>在侧边栏中打开<strong>转写记录</strong>，或在主页上点击<strong>打开转写记录</strong>。每一行都有时间、原句和译文。被跳过的片段显示为“[已跳过片段]”，无法翻译的句子会标为“未翻译”。</p>
<ul>
<li><strong>搜索：</strong>在顶部带放大镜图标的搜索框中输入（占位文字为“原文或译文中的词语”）；<strong>全部复制</strong>在同一行的右侧。没有匹配时，应用会显示“没有与搜索匹配的句子。”</li>
<li><strong>全部复制：</strong>把整份转写记录以纯文本形式（与下面 TXT 导出的格式相同）放到剪贴板，并显示“已复制到剪贴板。”</li>
</ul>
${callout({
  kind: "warn",
  title: "转写记录只保留最新的会话。",
  text: "它保存在应用的内存中，开始新的会话会替换旧的会话。要保留它，请在开始下一个会话之前复制、导出，或者开启历史记录。字幕条只保留最近的 1000 句，而转写记录会保留会话中的每一句话。",
})}
${appShot({
  slug: "app-transcript",
  lang: "zh",
  alt: "转写记录页面：带放大镜图标的搜索框、全部复制按钮、导出格式选择器，以及包含时间、原句和译文的行列表",
  caption: "转写记录：搜索、复制和选择导出格式。",
})}

<h2 id="save-history">开启历史记录（Pro）</h2>
<ol>
<li>打开<strong>设置 › 隐私</strong>。</li>
<li>开启<strong>保存转写历史记录</strong>。在 Free 试用中，这个开关是锁定的，并显示“保存历史记录是 Pro 功能。”</li>
<li>照常翻译，然后点击<strong>停止</strong>。应用会保存会话的转写记录；没有任何句子的会话不会被保存。在会话中途退出应用、关机或注销，也会像按下“停止”一样保存，但如果被突然终止（强制退出、断电），这个会话就会丢失。</li>
<li>在侧边栏中打开<strong>历史记录</strong>。</li>
</ol>
${appShot({
  slug: "app-settings-privacy",
  lang: "zh",
  alt: "隐私设置：保存转写历史记录开关（关）、自动发送错误报告开关（开）、删除所有数据按钮和删除模型和数据按钮",
  caption: "设置 › 隐私：开启历史记录和删除数据。",
})}
<p><strong>历史记录</strong>中的每个会话按从新到旧排列，显示日期和时间、时长和句子数（“47 分钟 · 186 句”）、预览，以及<strong>打开</strong>和<strong>删除</strong>按钮。点击<strong>打开</strong>可以像在转写记录中一样查看、搜索、复制和导出；点击<strong>返回列表</strong>即可返回。如果保存已关闭，页面会显示“历史记录保存已关闭，所以新会话不会被保存。”</p>
${appShot({
  slug: "app-history",
  lang: "zh",
  alt: "历史记录页面：已保存的会话，带日期和时间、时长、句子数、预览以及打开和删除按钮",
  caption: "历史记录：保存在你电脑上的会话。",
})}
<p>历史记录和术语表共用一个只保存在你电脑上的加密数据库。密钥是应用在你的电脑上生成的随机值，保存在钥匙串（macOS）或凭据管理器（Windows）中。如果系统请求访问时你拒绝了，应用会显示“无法打开历史记录和术语表数据。…”；请允许后重试。更多内容见<a href="/zh/data-security/">数据与安全</a>。</p>

<h2 id="export">导出为 TXT、SRT 或 Markdown（Pro）</h2>
<ol>
<li>打开<strong>转写记录</strong>，或在<strong>历史记录</strong>中打开一个会话。</li>
<li>在<strong>导出为</strong>中选择 <strong>TXT</strong>、<strong>SRT</strong> 或 <strong>Markdown</strong>。选择 SRT 时，旁边会出现第二个菜单，用来选择文件中的文字：<strong>翻译</strong>或<strong>原文</strong>。</li>
<li>点击<strong>导出…</strong>并选择保存位置。应用会建议一个类似 <code>transcript-2026-10-02-1405.txt</code> 的名称（会话开始的日期和时间）。完成后会显示“已保存到 …”。</li>
</ol>
<p>在 Free 试用中，<strong>导出…</strong>按钮是锁定的，并附有说明“导出为文件是 Pro 功能。所有套餐都可以复制。”以及<strong>升级到 Pro</strong>按钮。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">格式</th><th scope="col">每行的内容和时间</th></tr></thead>
<tbody>
<tr><th scope="row">TXT</th><td>每句一段：<code>[时间] 原文</code>，下一行是 <code>→ 译文</code>，段与段之间空一行。时间是这句话开始时你电脑上的时钟时间（HH:MM:SS）。</td></tr>
<tr><th scope="row">SRT</th><td>一个编号、“开始 --&gt; 结束”，然后是一行文字：你选择的译文或原文。时间从会话开始时算起（HH:MM:SS,mmm）。</td></tr>
<tr><th scope="row">Markdown</th><td>一个包含开始日期和时间的标题，然后是一个三列的表格：时间、原文、译文。时间是你电脑上的时钟时间。</td></tr>
</tbody></table></div>
<h3>在视频中使用 SRT 文件</h3>
<p>SRT 每一行的时间从会话开始时算起，所以 00:00:00 是会话的开始，并不会自动对应视频的开头。AI Translator 不录制会议，所以无法知道你的视频是何时开始的；如果视频与会话有偏差，请在播放器或字幕编辑器中平移时间。在“翻译”的 SRT 中，没有译文的句子（已经是你的语言，或者没能翻译）会显示原文。</p>

<h2 id="delete-data">删除会话和所有数据</h2>
<ul>
<li><strong>删除</strong>（在历史记录中）：删除一个会话。</li>
<li><strong>删除所有会话：</strong>应用会询问“删除所有已保存的会话？此操作无法撤销。”，然后你点击<strong>删除</strong>。</li>
<li><strong>删除所有数据</strong>（设置 › 隐私，所有套餐）：从这台电脑上删除已保存的历史记录和术语表；你的许可证、翻译时长和设置会保留。应用会请你确认，然后显示“历史记录和术语表已删除。”</li>
<li><strong>删除模型和数据</strong>（同一页面）：还会删除已下载的模型。在 macOS 上，请在删除应用之前这样做。</li>
</ul>
<p>删除后无法撤销。接下来请参阅<a href="/zh/guide/glossary/">术语表指南</a>或<a href="/zh/guide/troubleshooting/">故障排除</a>。</p>
`,
})}
${docNav(
  [
    { href: "/zh/guide/glossary/", kicker: "上一篇", title: "使用术语表" },
    { href: "/zh/guide/buy-and-activate/", kicker: "下一篇", title: "购买套餐、激活密钥和更换电脑" },
  ],
  "相关指南",
)}
</div></section>
`,
};
