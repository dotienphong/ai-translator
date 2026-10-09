import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Use the glossary", path: "/en/guide/glossary/" },
];

const toc = [
  { level: 2, id: "how-it-works", text: "How the glossary works" },
  { level: 2, id: "add-edit-delete", text: "Add, edit and delete terms" },
  { level: 2, id: "import-export-csv", text: "Import and export CSV" },
  { level: 2, id: "writing-tips", text: "Writing good terms" },
  { level: 2, id: "examples", text: "Examples" },
];

export default {
  id: "guide-glossary",
  lang: "en",
  path: "/en/guide/glossary/",
  title: "Use the glossary: add terms, import CSV, writing tips",
  description:
    "How to use the AI Translator glossary (a Pro feature): add, edit and delete terms, import and export CSV, how terms reach the translator, and tips for good terms.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "How to use the glossary (Pro feature): add, edit, delete, import and export CSV, the 500-term limit, how the app passes terms to the translator, and tips for writing terms.",
  llmTitle: "Use the glossary in AI Translator",
  schema: [
    howTo({
      name: "Add a term to the AI Translator glossary",
      description: "Add one term with its translation, then import more terms from a CSV file.",
      totalTime: "PT5M",
      steps: [
        { name: "Open Glossary", text: "Click Glossary in the left sidebar of the main window. The glossary needs the Monthly or Yearly plan." },
        { name: "Enter the term and its translation", text: "Type the term in the Term box and the translation you want in the Translation box. Each box takes at most 200 characters." },
        { name: "Click Add", text: "The new pair appears in the list. Later sentences use it right away, even while a session is running." },
        { name: "Import a CSV file (optional)", text: "Click Import CSV…, then choose a two-column UTF-8 CSV file of at most 1 MB. The app reports how many terms were added, updated, skipped or over the limit." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Use the glossary",
  lead: "The AI Translator glossary stores up to 500 “term → translation” pairs for names, abbreviations and industry terms. When a sentence being translated contains one of your terms, the app passes that pair to the translator as a hint. The glossary is a Pro feature, included in the Monthly and Yearly plans.",
  meta: `<span><span class="badge badge-pro">Pro</span></span><span>Updated {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
${facts([
  ["Plan", "Pro: Monthly and Yearly<small>Free shows a locked screen</small>"],
  ["Capacity", "Up to 500 terms<small>Each box up to 200 characters</small>"],
  ["CSV file", "Two columns, UTF-8<small>Up to 1 MB</small>"],
  ["During translation", "Up to 20 terms per sentence"],
  ["Matching", "Ignores case<small>Chinese, Japanese and Korean terms also match inside words</small>"],
  ["Stored", "On your computer<small>In an encrypted database</small>"],
])}

<h2 id="how-it-works">How does the glossary work?</h2>
<p>Each time a sentence has been recognized, the app looks for your terms in the <strong>original sentence</strong> (the text the speech recognizer wrote down) and gives the pairs it finds to the translator along with that sentence. If you edit the glossary during a session, later sentences use the new version straight away.</p>
<ul>
<li><strong>A hint, not a command.</strong> The app states that the translator “may not use them every time”. The glossary makes the right word more likely; it does not guarantee it.</li>
<li><strong>Case is ignored:</strong> “api” matches “API”.</li>
<li><strong>Latin-script terms match whole words:</strong> “AI” matches in “AI’s” but not in “said”.</li>
<li><strong>Chinese, Japanese and Korean terms also match inside words,</strong> because Chinese and Japanese have no spaces between words and Korean attaches particles to words.</li>
<li><strong>At most 20 terms per sentence.</strong> If more match, the app keeps the longer, more specific terms first.</li>
</ul>
${callout({
  title: "The Free plan cannot use the glossary.",
  text: "The Glossary screen shows a locked panel that reads “The glossary is a Pro feature: your terms are used when translating.” with an <strong>Upgrade to Pro</strong> button. To buy a plan, see <a href=\"/en/guide/buy-and-activate/\">Buy a plan, activate your key and switch computers</a>; prices are on the <a href=\"/en/pricing/\">pricing page</a>.",
})}

<h2 id="add-edit-delete">Add, edit and delete terms</h2>
<ol>
<li>Click <strong>Glossary</strong> in the left sidebar. Below the hint at the top, the app shows how many terms you have, for example “8 of 500 terms”.</li>
<li>Type the source text in the <strong>Term</strong> box, exactly as speakers will say it, and the translation you want to see in the <strong>Translation</strong> box. Each box takes at most 200 characters, with no line breaks or tabs.</li>
<li>Click <strong>Add</strong>. The new pair appears in the list as “term → translation”.</li>
<li>To change a pair, click <strong>Edit</strong>, adjust the two boxes, then click <strong>Save</strong> (or <strong>Cancel</strong>). To remove it, click <strong>Delete</strong>.</li>
</ol>
<p>Errors appear right under the input row: “Fill in both the term and its translation.”, “Use at most 200 characters.” or “This term is already in the glossary.” (duplicates are detected ignoring case). Once the glossary holds 500 terms, the input row disappears and the app says “The glossary already has 500 terms. Delete some before adding more.”</p>
${appShot({
  slug: "app-glossary",
  lang: "en",
  alt: "The Glossary screen: the count of terms out of a maximum of 500, the Term and Translation boxes, the Import CSV and Export CSV buttons, and the list of term and translation pairs",
  caption: "The Glossary screen with a Monthly or Yearly plan.",
})}

<h2 id="import-export-csv">Import and export CSV</h2>
<p>Importing lets you load a long list at once; exporting gives you a backup or a file to edit in a spreadsheet. The file must meet these conditions.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Requirement</th><th scope="col">Details</th></tr></thead>
<tbody>
<tr><th scope="row">Columns</th><td>Column 1 is the term, column 2 is the translation. A first row <code>source,target</code> is optional and is skipped on import.</td></tr>
<tr><th scope="row">Encoding</th><td>UTF-8. If your spreadsheet saves in another encoding, the app rejects the file. In Excel, save as “CSV UTF-8”.</td></tr>
<tr><th scope="row">Size</th><td>Up to 1 MB.</td></tr>
<tr><th scope="row">Each cell</th><td>Up to 200 characters, no line breaks.</td></tr>
</tbody></table></div>
<p>Example file content:<br><code>source,target</code><br><code>API gateway,cổng API</code><br><code>burn rate,tốc độ đốt tiền</code></p>
<ol>
<li>Click <strong>Import CSV…</strong> and choose the file in the system dialog.</li>
<li>Read the report: “Imported: … added, … updated, … rows skipped, … over the 500-term limit.”</li>
</ol>
<ul>
<li><strong>Added:</strong> new terms.</li>
<li><strong>Updated:</strong> terms already in the glossary (ignoring case); the app takes the translation from the file.</li>
<li><strong>Skipped:</strong> rows with a missing column, empty rows, cells over 200 characters or with line breaks.</li>
<li><strong>Over the 500-term limit:</strong> valid rows that did not fit because the glossary is full.</li>
</ul>
<p>If the file cannot be read, the app says “This CSV file could not be read. Nothing was imported.” and leaves the glossary unchanged; a file over 1 MB is refused with “This file is too large. A glossary file is at most 1 MB.”</p>
<p>Click <strong>Export CSV…</strong> to save the whole glossary to a file (the button is disabled while the glossary is empty). The exported file starts with <code>source,target</code> and uses UTF-8 so Excel shows accented text correctly. A cell that starts with <code>=</code>, <code>+</code>, <code>-</code> or <code>@</code> gets a leading apostrophe so a spreadsheet does not treat it as a formula; when you import the file again, the app removes that apostrophe.</p>

<h2 id="writing-tips">How do I write good terms?</h2>
<ul>
<li><strong>Names:</strong> companies, products, people, places. Write the translation you want to see; keeping the name unchanged is fine.</li>
<li><strong>Abbreviations:</strong> use the form speakers use and add an explanation if needed: “SLA” → “service level agreement (SLA)”.</li>
<li><strong>Industry terms:</strong> words the translator tends to render with the wrong sense in your field.</li>
<li><strong>Write it the way it is transcribed.</strong> Run a short session and read the <a href="/en/guide/history-and-export/">transcript</a>. If a name is always transcribed differently, you can add that spelling as a term too.</li>
<li><strong>One term, one translation.</strong> The glossary is not tied to a language pair, so write the translation in the language you read. If you change the target language on the Home screen, review your translations.</li>
<li><strong>Short and specific.</strong> Avoid very common words such as “meeting” or “project”: they appear in many sentences and rarely need correcting.</li>
</ul>

<h2 id="examples">Examples</h2>
<p>The first column is the direction (the speaker’s language → the language you read). All pairs can live in one glossary: the app only uses a pair when its term appears in the sentence being translated.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Direction</th><th scope="col">Term</th><th scope="col">Translation</th></tr></thead>
<tbody>
<tr><td>English → Vietnamese</td><td>API gateway</td><td>cổng API</td></tr>
<tr><td>English → Vietnamese</td><td>Acme Holdings</td><td>Acme Holdings (name kept as is)</td></tr>
<tr><td>Chinese → Vietnamese</td><td>增值税</td><td>thuế giá trị gia tăng</td></tr>
<tr><td>Korean → Vietnamese</td><td>회의록</td><td>biên bản họp</td></tr>
<tr><td>Vietnamese → English</td><td>biên bản nghiệm thu</td><td>acceptance report</td></tr>
<tr><td>Vietnamese → English</td><td>Đà Nẵng</td><td>Da Nang</td></tr>
</tbody></table></div>
<p>To review what was translated, open the <a href="/en/guide/history-and-export/">transcript and history</a>. If the glossary does not behave as you expect, see <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>
`,
})}
${docNav(
  [
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Previous", title: "Subtitle bar and shortcuts" },
    { href: "/en/guide/history-and-export/", kicker: "Next", title: "History and exporting transcripts" },
  ],
  "Related guides",
)}
</div></section>
`,
};
