import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "使用术语表", path: "/zh/guide/glossary/" },
];

const toc = [
  { level: 2, id: "how-it-works", text: "术语表如何工作" },
  { level: 2, id: "add-edit-delete", text: "添加、编辑和删除术语" },
  { level: 2, id: "import-export-csv", text: "导入和导出 CSV" },
  { level: 2, id: "writing-tips", text: "如何写好术语" },
  { level: 2, id: "examples", text: "示例" },
];

export default {
  id: "guide-glossary",
  lang: "zh",
  path: "/zh/guide/glossary/",
  title: "使用术语表：添加术语、导入 CSV、写法建议",
  description:
    "如何使用 AI Translator 的术语表（Pro 功能）：添加、编辑和删除术语，导入和导出 CSV，术语如何传给翻译，以及写好术语的建议。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "向 AI Translator 的术语表添加术语",
      description: "添加一条术语及其翻译，然后从 CSV 文件导入更多术语。",
      totalTime: "PT5M",
      steps: [
        { name: "打开术语表", text: "在主窗口左侧边栏中点击“术语表”。术语表需要付费套餐（Monthly、6 Months 或 Yearly）。" },
        { name: "输入术语及其翻译", text: "在“术语”框中输入术语，在“翻译”框中输入你想要的翻译。每个框最多 200 个字符。" },
        { name: "点击“添加”", text: "新的词对会出现在列表中。即使会话正在进行，之后的句子也会立即使用它。" },
        { name: "导入 CSV 文件（可选）", text: "点击“导入 CSV…”，然后选择一个两列、UTF-8 编码、不超过 1 MB 的 CSV 文件。应用会报告新增、更新、跳过或超出上限的术语数量。" },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "使用术语表",
  lead: "AI Translator 的术语表最多可保存 500 组“术语 → 翻译”，用于名称、缩写和行业术语。当正在翻译的句子包含你的某个术语时，应用会把这组词作为提示交给翻译。术语表是 Pro 功能，包含在 Monthly、6 Months 和 Yearly 套餐中。",
  meta: `<span><span class="badge badge-pro">Pro</span></span><span>更新于 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本页内容",
  body: `
${facts([
  ["套餐", "Pro：Monthly、6 Months 和 Yearly<small>Free 显示锁定的界面</small>"],
  ["容量", "最多 500 条术语<small>每个框最多 200 个字符</small>"],
  ["CSV 文件", "两列，UTF-8<small>最大 1 MB</small>"],
  ["翻译时", "每句最多 20 条术语"],
  ["匹配", "忽略大小写<small>中文、日文和韩文术语在词语中间也能匹配</small>"],
  ["保存位置", "你的电脑上<small>在加密的数据库中</small>"],
])}

<h2 id="how-it-works">术语表是如何工作的？</h2>
<p>每当一句话被识别出来，应用就会在<strong>原句</strong>（语音识别写下的文字）中查找你的术语，并把找到的词对连同这句话一起交给翻译。如果你在会话中编辑术语表，之后的句子会立即使用新的版本。</p>
<ul>
<li><strong>是提示，不是命令。</strong>应用明确说明翻译“不一定每次都会采用”。术语表会提高用对词的可能性，但不能保证。</li>
<li><strong>忽略大小写：</strong>“api”与“API”匹配。</li>
<li><strong>拉丁字母的术语按整个单词匹配：</strong>“AI”能匹配“AI’s”，但不会匹配“said”。</li>
<li><strong>中文、日文和韩文术语在词语中间也能匹配，</strong>因为中文和日文的词之间没有空格，而韩文会在词后附加助词。</li>
<li><strong>每句最多 20 条术语。</strong>如果匹配到更多，应用会优先保留更长、更具体的术语。</li>
</ul>
${callout({
  title: "Free 套餐无法使用术语表。",
  text: "术语表页面会显示一个锁定的面板，上面写着“术语表是 Pro 功能：翻译时会使用你的术语。”，并附有<strong>升级到 Pro</strong>按钮。购买套餐请参阅<a href=\"/zh/guide/buy-and-activate/\">购买套餐、激活密钥和更换电脑</a>；价格见<a href=\"/zh/pricing/\">价格页面</a>。",
})}

<h2 id="add-edit-delete">添加、编辑和删除术语</h2>
<ol>
<li>在左侧边栏中点击<strong>术语表</strong>。在顶部的提示下方，应用会显示你已有的术语数量，例如“8 / 500 条术语”。</li>
<li>在<strong>术语</strong>框中按发言人会说的样子输入原文，在<strong>翻译</strong>框中输入你想看到的翻译。每个框最多 200 个字符，不能有换行或制表符。</li>
<li>点击<strong>添加</strong>。新的词对会以“术语 → 翻译”的形式出现在列表中。</li>
<li>要修改某组词，点击<strong>编辑</strong>，调整两个框，然后点击<strong>保存</strong>（或<strong>取消</strong>）。要删除，点击<strong>删除</strong>。</li>
</ol>
<p>错误会显示在输入行的正下方：“请同时填写术语及其翻译。”、“最多使用 200 个字符。”或“此术语已在术语表中。”（判断重复时忽略大小写）。术语表达到 500 条后，输入行会消失，应用会显示“术语表已有 500 条术语。请先删除一些再添加。”</p>
${appShot({
  slug: "app-glossary",
  lang: "zh",
  alt: "术语表页面：术语数量（最多 500 条）、术语和翻译输入框、导入 CSV 和导出 CSV 按钮，以及术语和翻译词对列表",
  caption: "付费套餐（Monthly、6 Months 或 Yearly）下的术语表页面。",
})}

<h2 id="import-export-csv">导入和导出 CSV</h2>
<p>导入可以一次加载一长串术语；导出则可以得到一份备份，或一个可以在电子表格中编辑的文件。文件必须满足以下条件。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">要求</th><th scope="col">详情</th></tr></thead>
<tbody>
<tr><th scope="row">列</th><td>第 1 列是术语，第 2 列是翻译。第一行 <code>source,target</code> 可有可无，导入时会被跳过。</td></tr>
<tr><th scope="row">编码</th><td>UTF-8。如果你的电子表格用其他编码保存，应用会拒绝该文件。在 Excel 中，请另存为“CSV UTF-8”。</td></tr>
<tr><th scope="row">大小</th><td>最大 1 MB。</td></tr>
<tr><th scope="row">每个单元格</th><td>最多 200 个字符，不能换行。</td></tr>
</tbody></table></div>
<p>文件内容示例：<br><code>source,target</code><br><code>API gateway,API 网关</code><br><code>burn rate,烧钱率</code></p>
<ol>
<li>点击<strong>导入 CSV…</strong>，在系统对话框中选择文件。</li>
<li>查看报告：“已导入：新增 … 条，更新 … 条，跳过 … 行，超出 500 条上限 … 条。”</li>
</ol>
<ul>
<li><strong>新增：</strong>新的术语。</li>
<li><strong>更新：</strong>术语表中已有的术语（忽略大小写）；应用采用文件中的翻译。</li>
<li><strong>跳过：</strong>缺少一列的行、空行、超过 200 个字符或含有换行的单元格。</li>
<li><strong>超出 500 条上限：</strong>因为术语表已满而放不下的有效行。</li>
</ul>
<p>如果文件无法读取，应用会显示“无法读取此 CSV 文件。没有导入任何内容。”，术语表保持不变；超过 1 MB 的文件会被拒绝，并显示“此文件太大。术语表文件最大为 1 MB。”</p>
<p>点击<strong>导出 CSV…</strong>可以把整个术语表保存到文件中（术语表为空时按钮不可用）。导出的文件以 <code>source,target</code> 开头，并使用 UTF-8，这样 Excel 就能正确显示带重音的文字等。以 <code>=</code>、<code>+</code>、<code>-</code> 或 <code>@</code> 开头的单元格会在前面加一个撇号，避免电子表格把它当作公式；再次导入该文件时，应用会去掉这个撇号。</p>

<h2 id="writing-tips">如何写好术语？</h2>
<ul>
<li><strong>名称：</strong>公司、产品、人名、地名。写下你想看到的翻译；保持名称不变也可以。</li>
<li><strong>缩写：</strong>使用发言人常用的形式，必要时加上解释：“SLA” → “服务等级协议（SLA）”。</li>
<li><strong>行业术语：</strong>在你的领域里，翻译容易译错意思的词。</li>
<li><strong>按转写出来的样子写。</strong>先试一个简短的会话，阅读<a href="/zh/guide/history-and-export/">转写记录</a>。如果某个名称总是被转写成别的拼写，你也可以把那种拼写添加为术语。</li>
<li><strong>一个术语对应一个翻译。</strong>术语表不与语言对绑定，所以请用你阅读的语言写翻译。如果你在主页上更改了目标语言，请检查一下你的翻译。</li>
<li><strong>简短而具体。</strong>避免“会议”或“项目”这类非常常见的词：它们会出现在很多句子中，却很少需要纠正。</li>
</ul>

<h2 id="examples">示例</h2>
<p>第一列是方向（发言人的语言 → 你阅读的语言）。所有词对都可以放在同一个术语表中：只有当术语出现在正在翻译的句子里时，应用才会使用这组词。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">方向</th><th scope="col">术语</th><th scope="col">翻译</th></tr></thead>
<tbody>
<tr><td>英语 → 中文</td><td>API gateway</td><td>API 网关</td></tr>
<tr><td>英语 → 中文</td><td>Acme Holdings</td><td>Acme Holdings（名称保持不变）</td></tr>
<tr><td>日语 → 中文</td><td>見積書</td><td>报价单</td></tr>
<tr><td>韩语 → 中文</td><td>회의록</td><td>会议纪要</td></tr>
<tr><td>中文 → 英语</td><td>验收报告</td><td>acceptance report</td></tr>
<tr><td>中文 → 英语</td><td>深圳</td><td>Shenzhen</td></tr>
</tbody></table></div>
<p>要回顾翻译内容，请打开<a href="/zh/guide/history-and-export/">转写记录和历史记录</a>。如果术语表没有按你预期工作，请参阅<a href="/zh/guide/troubleshooting/">故障排除</a>。</p>
`,
})}
${docNav(
  [
    { href: "/zh/guide/type-and-translate/", kicker: "上一篇", title: "输入翻译" },
    { href: "/zh/guide/history-and-export/", kicker: "下一篇", title: "历史记录和导出转写记录" },
  ],
  "相关指南",
)}
</div></section>
`,
};
