import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Install on macOS", path: "/en/guide/install-macos/" },
];

const toc = [
  { level: 2, id: "requirements", text: "Will it run on your Mac?" },
  { level: 2, id: "install-command", text: "Quick way: install with one command" },
  { level: 2, id: "install-dmg", text: "Alternative: install from the .dmg file" },
  { level: 3, id: "verify-the-file", text: "Verify the installer (SHA-256)" },
  { level: 3, id: "drag-to-applications", text: "Drag AI Translator to Applications" },
  { level: 3, id: "first-launch", text: "First launch: why macOS blocks it" },
  { level: 2, id: "updates", text: "Every update" },
  { level: 2, id: "uninstall", text: "Uninstall properly" },
  { level: 2, id: "common-problems", text: "Common installation problems" },
];

const INSTALL_CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";

const HOWTO_STEPS = [
  { name: "Open Terminal", text: "Press Command + Space, type Terminal and press Enter." },
  { name: "Paste the install command and press Enter", text: "Paste curl -fsSL https://aitranslator.io.vn/install.sh | bash into Terminal and press Enter. No password is needed." },
  { name: "Wait for the app to open", text: "The command downloads the latest version, checks its SHA-256, copies AI Translator to Applications and opens it. When macOS asks for system audio recording permission, choose Allow." },
];

export default {
  id: "guide-install-macos",
  lang: "en",
  path: "/en/guide/install-macos/",
  title: "Install AI Translator on macOS",
  description:
    "Install AI Translator on macOS with one Terminal command and open it right away, no Open Anyway; or from the .dmg, with SHA-256 check, updates and uninstalling.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-09",
  llm: "Installing AI Translator on macOS with one Terminal command (curl ... install.sh | bash), which opens the app directly with no Open Anyway. Alternative: install from the .dmg (SHA-256 check, drag to Applications, Open Anyway because the build is ad-hoc signed and not notarized), Keychain prompts on updates, and uninstalling.",
  llmTitle: "Install AI Translator on macOS",
  schema: [
    howTo({
      name: "Install and open AI Translator on macOS with one command",
      description: "Paste one command into Terminal to download, verify and install AI Translator; the app then opens directly, with no Open Anyway step.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Install AI Translator on macOS",
  lead: "The fastest way to install AI Translator on macOS is to paste one command into Terminal: the app is downloaded, verified and opened right away, with no trip to System Settings to click Open Anyway. If you already have a .dmg downloaded in a browser you can still install it by dragging it to Applications, but macOS will block the first launch because the current build is ad-hoc signed and has not been notarized by Apple.",
  meta: "<span>For macOS 14.2 or later, Apple Silicon</span> <span>Updated October 9, 2026</span>",
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

<h2 id="install-command">Quick way: install with one command</h2>
<ol>
<li>Open <strong>Terminal</strong>: press <kbd>⌘</kbd> + <kbd>Space</kbd>, type <strong>Terminal</strong>, press Enter.</li>
<li>Paste the command below and press Enter. No password is needed.</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "Copy command", copied: "Copied", label: "Command that installs AI Translator on macOS" })}
<ol start="3">
<li>Wait about a minute. The command downloads the latest AI Translator, compares its SHA-256, checks the app's signature, copies the app to <code>/Applications</code> (or <code>~/Applications</code> if that is not writable) and opens it.</li>
<li>When macOS asks for <strong>system audio recording</strong> permission, choose Allow. Then continue with the <a href="/en/guide/quick-start/">quick start guide</a>.</li>
</ol>
<p><strong>Why is there no Open Anyway step?</strong> macOS only blocks an app whose file carries the “downloaded from the internet” tag (which browsers add). A file downloaded by <code>curl</code> in Terminal has no such tag, so the app opens directly even though Apple has not notarized it.</p>
${callout({ kind: "warn", title: "Understand what this command does.", text: "The command downloads a script from <strong>aitranslator.io.vn</strong>; the script downloads the installer from <strong>releases.aitranslator.io.vn</strong>, compares its SHA-256 and installs it. It does not use sudo and sends no data. The SHA-256 is served from the same place as the file, so it mainly protects against a corrupted download; you are still trusting <strong>aitranslator.io.vn</strong>. To read the script first: <code>curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh</code>. Run the same command again at any time to update to the latest version; the script quits the running app itself." })}
<p>Something went wrong? The script stops and says why (Mac not supported, no network, SHA-256 mismatch…). See <a href="#common-problems">common installation problems</a>.</p>

<h2 id="install-dmg">Alternative: install from the .dmg file</h2>
<p>Use this if you received the .dmg by email or prefer not to use Terminal. A file downloaded in a browser gets the “downloaded from the internet” tag from macOS, so the first launch needs the extra Open Anyway step.</p>

<h3 id="verify-the-file">Verify the installer (SHA-256)</h3>
${callout({ kind: "warn", title: "Only download the installer from an official source.", text: "The genuine .dmg is the one we send from <strong>support@aitranslator.io.vn</strong> or link to on <strong>aitranslator.io.vn</strong>. A file from anywhere else could be fake or tampered with. Do not open it, even if it is named AI Translator." })}
<p>Every installer we send by email comes with a SHA-256 checksum. Compare it before installing:</p>
<ol>
<li>Open <strong>Terminal</strong> (Applications › Utilities).</li>
<li>Type <code>shasum -a 256</code> followed by a space, drag the .dmg file from Finder into the Terminal window to fill in its path (spaces in the file name included), then press Enter. Or type the command below; if the file name contains spaces, keep it in double quotes as in the example.</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/"&lt;file-name&gt;.dmg"</code></pre></div>
<ol start="3">
<li>Compare the 64-character string it prints with the one we sent. They must be identical.</li>
<li>If they differ, do not open the file. Download it again; if it still differs, <a href="/en/contact/">contact support</a>.</li>
</ol>

<h3 id="drag-to-applications">Drag AI Translator to Applications</h3>
<ol>
<li>Double-click the <code>.dmg</code> file to open it.</li>
<li>Drag <strong>AI Translator</strong> into the <strong>Applications</strong> folder in the window that appears.</li>
</ol>

<h3 id="first-launch">First launch: why macOS blocks it and how to allow it</h3>
<p>macOS uses Gatekeeper to check apps downloaded from the internet. The current AI Translator build is ad-hoc signed and not yet notarized by Apple, because we do not have an Apple Developer ID yet. So macOS blocks the first launch and says it cannot verify the developer. If the file came from us and the SHA-256 matches, this is the normal path for this build.</p>
<ol>
<li>Open AI Translator from Applications. When macOS says it cannot verify the developer, click <strong>Done</strong> (the button that closes the dialog; its label may differ slightly between macOS versions).</li>
<li>Open <strong>System Settings › Privacy &amp; Security</strong>.</li>
<li>Scroll to the bottom of the page and click <strong>Open Anyway</strong> next to AI Translator.</li>
<li>Confirm with your login password or Touch ID.</li>
<li>The app opens and shows the first-time setup. Continue with the <a href="/en/guide/quick-start/">quick start guide</a>.</li>
</ol>
${callout({ kind: "warn", title: "From macOS 15, the right-click › Open trick no longer works.", text: "Go through Privacy &amp; Security as above. The Open Anyway button usually appears only after macOS has blocked an attempt to open the app; if you do not see it, open the app once more and come back." })}
<p>This step applies only to a .dmg downloaded in a browser; installing with the <a href="#install-command">one-line command</a> does not need it. Once we have a Developer ID and notarize the app, this step will go away for every way of installing.</p>

<h2 id="updates">Every update, macOS asks one thing again</h2>
<p>First, how updating works: The app checks for a new version about a minute after it opens and then every 24 hours, and downloads it in the background; when it is ready the app asks “Restart” or “Later” (the tray menu also has “Restart to update”), and the new version is installed when you restart or choose Quit. The update channel (Stable or Beta) is chosen in Settings › General; changing it checks right away.</p>
<p>The rest is a consequence of ad-hoc signing: every new build has a different signature, so macOS asks again for Keychain access. Since version 0.1.1 AI Translator keeps all its sensitive data (the history encryption key, license token, quota counters) in <strong>one</strong> Keychain item, so after each update you will see:</p>
<ul>
<li><strong>1 Keychain dialog</strong> asking for your Mac login password (we measured on one Mac running macOS 26: after re-signing the app twice to simulate a new build, each time there was only 1 dialog): enter it and choose <strong>Always Allow</strong>. Do not choose Deny: the app will not be able to read your license and quota. If you chose it by mistake, quit the app completely, reopen it and choose Always Allow.</li>
<li>The <strong>system audio recording</strong> permission may be asked for again once (our earlier measurement recorded 1 dialog): allow it.</li>
</ul>
<p><strong>Only the first update from 0.1.0 to 0.1.1</strong> is different: the app has to copy the 5 old Keychain items into the new one, so you see 5 Keychain dialogs once (we measured exactly 5, plus 1 dialog to allow recording); later updates give just 1.</p>
<p>After you choose Always Allow, later launches do not ask again. You do not lose data, your plan or your quota. On a fresh install we measured no Keychain dialogs (only the recording permission, plus Open Anyway if you install from a .dmg downloaded in a browser); if macOS asks anyway, choose Always Allow. The app warns you in the update prompt. This goes away once we have a Developer ID. You can also run the same install command to update; the Keychain dialog appears for the same reason.</p>

<h2 id="uninstall">Uninstall properly</h2>
<p>macOS gives the app no chance to clean up when you delete it, so remove the models and data first, then trash the app:</p>
<ol>
<li>Open AI Translator and go to <strong>Settings › Privacy</strong>.</li>
<li>Click <strong>Delete models and data</strong>, then confirm with <strong>Delete everything</strong>. The app removes every downloaded model (1.3 or 2.5 GB), your history and your glossary.</li>
<li>Choose <strong>Quit</strong> from the AI Translator icon in the menu bar.</li>
<li>Drag <strong>AI Translator</strong> from Applications to the Trash.</li>
</ol>
<p>Your license and remaining quota are kept, so reinstalling should not lose a plan you bought. The Free trial is tied to your Mac, so reinstalling does not reopen the 10 days. If you already deleted the app without deleting the models, they live in <code>~/Library/Application Support/com.aitranslator.desktop/models</code>.</p>

<h2 id="common-problems">Common installation problems</h2>
<ul>
<li><strong>The install command says it could not read https://releases.aitranslator.io.vn/stable/latest.json….</strong> Your Mac has no network, or a proxy/VPN is blocking <code>releases.aitranslator.io.vn</code>. Check your connection and run it again.</li>
<li><strong>The install command says the SHA-256 does not match.</strong> The download was corrupted or tampered with on the way. The script installs nothing; run it again, and if it still differs write to <a href="/en/contact/">support</a>.</li>
<li><strong>The install command says the app is still running.</strong> Quit AI Translator completely (AI Translator menu in the menu bar › Quit) and run the command again.</li>
<li><strong>The install command says it needs Apple Silicon or macOS 14.2.</strong> Your Mac does not meet the requirements; there is no build for Intel Macs.</li>
<li><strong>No Open Anyway button.</strong> (Only when installing from a .dmg downloaded in a browser.) Open the app once more so macOS records the block, then return to Privacy &amp; Security.</li>
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
