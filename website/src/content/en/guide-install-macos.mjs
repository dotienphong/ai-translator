import { pageHero, callout, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Install on macOS", path: "/en/guide/install-macos/" },
];

const toc = [
  { level: 2, id: "requirements", text: "Will it run on your Mac?" },
  { level: 2, id: "verify-the-file", text: "Verify the installer (SHA-256)" },
  { level: 2, id: "drag-to-applications", text: "Drag AI Translator to Applications" },
  { level: 2, id: "first-launch", text: "First launch: why macOS blocks it" },
  { level: 2, id: "updates", text: "Every update" },
  { level: 2, id: "uninstall", text: "Uninstall properly" },
  { level: 2, id: "common-problems", text: "Common installation problems" },
];

const HOWTO_STEPS = [
  { name: "Check the SHA-256 of the .dmg file", text: "Run shasum -a 256 on the .dmg in Terminal and compare it with the SHA-256 we sent with the installer." },
  { name: "Drag the app to Applications", text: "Open the .dmg and drag AI Translator into the Applications folder." },
  { name: "Open the app and click Done", text: "Open AI Translator. When macOS says it cannot verify the developer, click Done." },
  { name: "Click Open Anyway", text: "Go to System Settings > Privacy & Security, scroll to the bottom and click Open Anyway next to AI Translator." },
  { name: "Confirm", text: "Confirm with your login password or Touch ID so the app opens." },
];

export default {
  id: "guide-install-macos",
  lang: "en",
  path: "/en/guide/install-macos/",
  title: "Install AI Translator on macOS",
  description:
    "How to install AI Translator on macOS: system requirements, drag to Applications, open it the first time with Open Anyway, verify SHA-256, updates and uninstalling.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Installing AI Translator on macOS: requirements, SHA-256 check, drag to Applications, Open Anyway because the build is ad-hoc signed and not notarized, Keychain prompts on updates, and uninstalling.",
  llmTitle: "Install AI Translator on macOS",
  schema: [
    howTo({
      name: "Install and first-launch AI Translator on macOS",
      description: "Verify the installer, drag AI Translator into Applications and allow the app to open with Open Anyway.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Install AI Translator on macOS",
  lead: "To install AI Translator on macOS, open the .dmg file, drag the app into your Applications folder, then open it for the first time by allowing it in System Settings › Privacy & Security (the Open Anyway button). That extra step is needed because the current build is ad-hoc signed and has not been notarized by Apple.",
  meta: "<span>For macOS 14.2 or later, Apple Silicon</span><span>Updated October 8, 2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
<h2 id="requirements">Will it run on your Mac?</h2>
${facts([
  ["Chip", "Apple Silicon (M1 or later)<small>No Intel Mac build. Check your chip under Apple menu › About This Mac.</small>"],
  ["Operating system", "macOS 14.2 or later"],
  ["Memory", "8 GB minimum, 16 GB recommended<small>Under 8 GB, the app explains why and will not download a model.</small>"],
  ["Installer", "A .dmg file of about 9 MB"],
  ["Disk space for models", "1.3 GB (Lite pack) or 2.5 GB (Standard pack)<small>Plus 1 GB free while downloading.</small>"],
  ["Internet", "Needed to download the model and register the Free trial<small>After that, translation runs offline.</small>"],
])}
<p class="small muted">We have not measured performance on a base-model M1 Mac, so we cannot promise latency there. On an 8 GB Mac, the Lite pack is the sensible choice.</p>

<h2 id="verify-the-file">Verify the installer (SHA-256)</h2>
${callout({ kind: "warn", title: "Only download the installer from an official source.", text: "The genuine .dmg is the one we send from <strong>support@aitranslator.io.vn</strong> or link to on <strong>aitranslator.io.vn</strong>. A file from anywhere else could be fake or tampered with. Do not open it, even if it is named AI Translator." })}
<p>Every installer comes with a SHA-256 checksum that we send you. Compare it before installing:</p>
<ol>
<li>Open <strong>Terminal</strong> (Applications › Utilities).</li>
<li>Type the command below, or type <code>shasum -a 256</code> followed by a space and drag the .dmg file into the Terminal window to fill in its path, then press Enter.</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/&lt;file-name&gt;.dmg</code></pre></div>
<ol start="3">
<li>Compare the 64-character string it prints with the one we sent. They must be identical.</li>
<li>If they differ, do not open the file. Download it again; if it still differs, <a href="/en/contact/">tell us</a>.</li>
</ol>

<h2 id="drag-to-applications">Drag AI Translator to Applications</h2>
<ol>
<li>Double-click the <code>.dmg</code> file to open it.</li>
<li>Drag <strong>AI Translator</strong> into the <strong>Applications</strong> folder in the window that appears.</li>
</ol>

<h2 id="first-launch">First launch: why macOS blocks it and how to allow it</h2>
<p>macOS uses Gatekeeper to check apps downloaded from the internet. The current AI Translator build is ad-hoc signed and not yet notarized by Apple, because we do not have an Apple Developer ID yet. So macOS blocks the first launch and says it cannot verify the developer. If the file came from us and the SHA-256 matches, this is the normal path for this build.</p>
<ol>
<li>Open AI Translator from Applications. When macOS says it cannot verify the developer, click <strong>Done</strong>.</li>
<li>Open <strong>System Settings › Privacy &amp; Security</strong>.</li>
<li>Scroll to the bottom of the page and click <strong>Open Anyway</strong> next to AI Translator.</li>
<li>Confirm with your login password or Touch ID.</li>
<li>The app opens and shows the first-time setup. Continue with the <a href="/en/guide/quick-start/">quick start guide</a>.</li>
</ol>
${callout({ kind: "warn", title: "From macOS 15, the right-click › Open trick no longer works.", text: "Go through Privacy &amp; Security as above. The Open Anyway button only appears after macOS has blocked an attempt to open the app; if you do not see it, open the app once more and come back." })}
<p>You only need to do this when you open a downloaded installer for the first time. Once we have a Developer ID and notarize the app, this step will go away.</p>

<h2 id="updates">Every update, macOS asks a few things again</h2>
<p>This is a consequence of ad-hoc signing. After each update to a new build you will see, once:</p>
<ul>
<li><strong>5 Keychain dialogs</strong> asking for your Mac login password: enter it and choose <strong>Always Allow</strong>. Do not choose Deny.</li>
<li><strong>1 system audio recording permission dialog</strong>: allow it.</li>
</ul>
<p>After that, later launches do not ask again. You do not lose data, your plan or your quota. A fresh install is not asked about the Keychain. The app warns you in the update prompt: “After updating, macOS will ask for your login password a few times and for audio-recording permission once…”. This goes away once we have a Developer ID. A .dmg we send by hand during the beta may not update itself; in that case you download the new .dmg.</p>

<h2 id="uninstall">Uninstall properly</h2>
<p>macOS gives the app no chance to clean up when you delete it, so remove the models and data first, then trash the app:</p>
<ol>
<li>Open AI Translator and go to <strong>Settings › Privacy</strong>.</li>
<li>Click <strong>Delete models and data</strong>, then confirm with <strong>Delete everything</strong>. The app removes every downloaded model (1.3 or 2.5 GB), your history and your glossary.</li>
<li>Choose <strong>Quit</strong> from the AI Translator icon in the menu bar.</li>
<li>Drag <strong>AI Translator</strong> from Applications to the Trash.</li>
</ol>
<p>Your license and remaining quota are kept, so reinstalling does not lose a plan you bought. The Free trial is tied to your Mac, so reinstalling does not reopen the 10 days. If you already deleted the app without deleting the models, they live in <code>~/Library/Application Support/com.aitranslator.desktop/models</code>.</p>

<h2 id="common-problems">Common installation problems</h2>
<ul>
<li><strong>No Open Anyway button.</strong> Open the app once more so macOS records the block, then return to Privacy &amp; Security.</li>
<li><strong>It will not install on an Intel Mac.</strong> AI Translator is built for Apple Silicon only.</li>
<li><strong>The app says “This computer has less than 8 GB of RAM, which AI Translator does not support yet.”</strong> Macs under 8 GB cannot download a model.</li>
<li><strong>The app says “This copy of AI Translator is not genuine, so only Free works.”</strong> The installation was altered or came from the wrong source. Download it again from an official source.</li>
<li><strong>macOS asks about the Keychain many times after an update.</strong> Normal for an ad-hoc signed build: enter your password and choose Always Allow.</li>
</ul>
<p>If subtitles do not appear after installing, see <a href="/en/guide/macos-audio-permission/">how to grant system audio recording permission</a>.</p>

${docNav(
  [
    { href: "/en/guide/quick-start/", kicker: "Previous", title: "AI Translator quick start" },
    { href: "/en/guide/macos-audio-permission/", kicker: "Next", title: "Grant system audio recording permission on macOS" },
    { href: "/en/guide/troubleshooting/", kicker: "Related", title: "Troubleshooting" },
  ],
  "Related guides",
)}
`,
})}
</div></section>
`,
};
