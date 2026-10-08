import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "History and exporting transcripts", path: "/en/guide/history-and-export/" },
];

const toc = [
  { level: 2, id: "transcript", text: "View, search and copy the transcript" },
  { level: 2, id: "save-history", text: "Turn on history" },
  { level: 2, id: "export", text: "Export TXT, SRT, Markdown" },
  { level: 2, id: "delete-data", text: "Delete sessions and data" },
];

export default {
  id: "guide-history-export",
  lang: "en",
  path: "/en/guide/history-and-export/",
  title: "History and exporting transcripts: TXT, SRT, Markdown",
  description:
    "View, search and copy transcripts on every plan; turn on encrypted history and export TXT, SRT or Markdown (Pro). How SRT times work and how to delete your data.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "How to view, search and copy a session transcript (all plans), turn on encrypted history, export TXT, SRT or Markdown (Pro), how SRT times are counted and how to delete data.",
  llmTitle: "History and exporting transcripts in AI Translator",
  schema: [
    howTo({
      name: "Turn on history and export a transcript in AI Translator",
      description: "Turn on history, translate a session, then export its transcript as TXT, SRT or Markdown.",
      totalTime: "PT5M",
      steps: [
        { name: "Turn on history", text: "Open Settings › Privacy and switch on Save transcript history. This needs the Monthly or Yearly plan." },
        { name: "Translate a session and press Stop", text: "When you press Stop, the app saves the session transcript to the history, encrypted, on your computer." },
        { name: "Open the transcript", text: "Open Transcript, or open a saved session in History with the Open button." },
        { name: "Pick a format and export", text: "Under Export as choose TXT, SRT or Markdown (for SRT choose Translation or Original), click Export… and choose where to save." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "History and exporting transcripts",
  lead: "The AI Translator transcript lists the time, the original sentence and the translation of every sentence in a session. Every plan can view, search and copy it. Saving your session history (encrypted, on your own computer) and exporting to TXT, SRT or Markdown are Pro features; saving history is off by default.",
  meta: `<span><span class="badge badge-pro">Pro</span> export and history</span><span>Updated 8 Oct 2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
${facts([
  ["Every plan", "View, search and copy the session transcript"],
  ["Pro", "Save history, reopen past sessions, export TXT, SRT, Markdown"],
  ["Save history", "Off by default<small>Turn it on in Settings › Privacy</small>"],
  ["Stored", "On your computer, encrypted with SQLCipher<small>The key lives in Keychain (macOS) or Credential Manager (Windows)</small>"],
])}

<h2 id="transcript">View, search and copy the transcript</h2>
<p>Open <strong>Transcript</strong> in the sidebar, or click <strong>Open the transcript</strong> on the Home screen. Each line has the time, the original sentence and the translation. A skipped segment shows “[segment skipped]” and a sentence that could not be translated is marked “not translated”.</p>
<ul>
<li><strong>Search:</strong> type in the <strong>Search</strong> box (“Words in the original or the translation”). With no match the app says “No sentence matches your search.”</li>
<li><strong>Copy all:</strong> puts the whole transcript on the clipboard as plain text (the same layout as the TXT export below) and says “Copied to the clipboard.”</li>
</ul>
${callout({
  kind: "warn",
  title: "The transcript only keeps the latest session.",
  text: "It lives in the app’s memory, and starting a new session replaces the old one. To keep it, copy it, export it, or turn on history before you start the next session. The subtitle bar keeps only the latest 1000 sentences, while the transcript keeps every sentence of the session.",
})}
${appShot({
  slug: "app-transcript",
  lang: "en",
  alt: "The Transcript screen: a Search box, a Copy all button, the export format picker and a list of lines with time, original sentence and translation",
  caption: "Transcript: search, copy and pick an export format.",
})}

<h2 id="save-history">Turn on history (Pro)</h2>
<ol>
<li>Open <strong>Settings › Privacy</strong>.</li>
<li>Switch on <strong>Save transcript history</strong>. On the Free trial the switch is locked and reads “Saving history is a Pro feature.”</li>
<li>Translate as usual, then click <strong>Stop</strong>. The app saves the session transcript; a session with no sentences is not saved. Quitting the app, shutting down or logging out mid-session also saves it as if you had pressed Stop, but a sudden kill (Force Quit, power loss) loses that session.</li>
<li>Open <strong>History</strong> in the sidebar.</li>
</ol>
${appShot({
  slug: "app-settings-privacy",
  lang: "en",
  alt: "Privacy settings: the Save transcript history switch, the Delete all data button and the Delete models and data button",
  caption: "Settings › Privacy: turn on history and delete data.",
})}
<p>Each session in <strong>History</strong> shows the date and time, its length and sentence count (“12 min · 340 sentences”), a preview, and <strong>Open</strong> and <strong>Delete</strong> buttons, newest first. <strong>Open</strong> lets you view, search, copy and export it just like the Transcript; <strong>Back to the list</strong> returns. If saving is off, the screen says “Saving history is off, so new sessions are not saved.”</p>
${appShot({
  slug: "app-history",
  lang: "en",
  alt: "The History screen: saved sessions with date and time, length, sentence count, a preview and Open and Delete buttons",
  caption: "History: sessions saved on your computer.",
})}
<p>History and the glossary share one SQLite database, encrypted with SQLCipher and kept only on your computer. The key is a random value the app creates on your machine and stores in Keychain (macOS) or Credential Manager (Windows). If you refuse when the system asks for access, the app says “Could not open the history and glossary data…”; allow it and try again. More in <a href="/en/data-security/">data and security</a>.</p>

<h2 id="export">Export to TXT, SRT or Markdown (Pro)</h2>
<ol>
<li>Open <strong>Transcript</strong>, or open a session in <strong>History</strong>.</li>
<li>Under <strong>Export as</strong>, pick <strong>TXT</strong>, <strong>SRT</strong> or <strong>Markdown</strong>. For SRT, also pick <strong>Text of the SRT file</strong>: <strong>Translation</strong> or <strong>Original</strong>.</li>
<li>Click <strong>Export…</strong> and choose where to save. The app suggests a name like <code>transcript-2026-10-02-1405.txt</code> (the date and time the session started). When done it says “Saved to …”.</li>
</ol>
<p>On the Free trial the <strong>Export…</strong> button is locked, with the note “Exporting to a file is a Pro feature. Copying works on every plan.” and an <strong>Upgrade to Pro</strong> button.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Format</th><th scope="col">Content</th><th scope="col">Time on each line</th></tr></thead>
<tbody>
<tr><th scope="row">TXT</th><td>One block per sentence: <code>[time] original</code>, then <code>→ translation</code> on the next line, separated by a blank line.</td><td>Your computer’s clock time when the sentence began (HH:MM:SS).</td></tr>
<tr><th scope="row">SRT</th><td>A number, “start --&gt; end”, then one line of text: the translation or the original, as you chose.</td><td>Counted from the start of the session (HH:MM:SS,mmm).</td></tr>
<tr><th scope="row">Markdown</th><td>A heading with the start date and time, then a three-column table: time, original, translation.</td><td>Your computer’s clock time.</td></tr>
</tbody></table></div>
<h3>Using an SRT file with a video</h3>
<p>The time on each SRT line is counted from the start of the session, so 00:00:00 is the session start, not automatically the start of your video. AI Translator does not record the meeting, so it cannot know when your video began; if the video is offset from the session, shift the times in your player or subtitle editor. In a Translation SRT, a sentence with no translation (already in your language, or not translated) shows the original text.</p>

<h2 id="delete-data">Delete sessions and all data</h2>
<ul>
<li><strong>Delete</strong> (in History): removes one session.</li>
<li><strong>Delete all sessions:</strong> the app asks “Delete every saved session? This cannot be undone.” and you click <strong>Delete</strong>.</li>
<li><strong>Delete all data</strong> (Settings › Privacy, every plan): removes the saved history and the glossary from this computer; your license, quota and settings are kept. The app asks you to confirm, then says “History and glossary deleted.”</li>
<li><strong>Delete models and data</strong> (same screen): also removes the downloaded models. On macOS, do this before removing the app.</li>
</ul>
<p>Deleting cannot be undone. Next, see the <a href="/en/guide/glossary/">glossary guide</a> or <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>
`,
})}
${docNav(
  [
    { href: "/en/guide/glossary/", kicker: "Previous", title: "Use the glossary" },
    { href: "/en/guide/buy-and-activate/", kicker: "Next", title: "Buy a plan, activate your key and switch computers" },
  ],
  "Related guides",
)}
</div></section>
`,
};
