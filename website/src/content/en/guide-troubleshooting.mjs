import { pageHero, faq, keys, appShot, docLayout, docNav } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Troubleshooting", path: "/en/guide/troubleshooting/" },
];

const toc = [
  { level: 2, id: "no-audio", text: "No subtitles or no audio heard" },
  { level: 2, id: "slow-or-stopped", text: "Subtitles late, missing or stopped" },
  { level: 2, id: "models-macos", text: "Models, install, macOS and Windows" },
  { level: 2, id: "license-quota", text: "License, quota and trial" },
  { level: 2, id: "send-logs", text: "Send logs and report a problem" },
  { level: 2, id: "quick-answers", text: "Quick answers" },
];

const QUICK = [
  {
    q: "I closed the window but the app keeps running. How do I quit?",
    a: "<p>Closing the window only hides the app in the menu bar (macOS) or the system tray (Windows). Choose <strong>Quit</strong> from the AI Translator icon in the menu bar or tray; on a Mac, ⌘Q does not quit it.</p>",
  },
  {
    q: "Does reinstalling the app lose my key or restart the 10-day trial?",
    a: "<p>No. Reinstalling on the same computer does not count as a new computer, and the 10-day trial is tracked per computer, so it cannot be restarted.</p>",
  },
  {
    q: "Do the logs reveal what was said in my meeting?",
    a: "<p>No. Logs contain no audio and no transcript text, and the app never sends logs anywhere by itself.</p>",
  },
];

export default {
  id: "guide-troubleshooting",
  lang: "en",
  path: "/en/guide/troubleshooting/",
  title: "Troubleshooting: common errors and how to fix them",
  description:
    "Symptoms, causes and fixes for AI Translator: no subtitles, no audio heard, model download errors, a locked key, a used-up quota. How to send logs to support.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  schema: [faqPage(QUICK.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Symptom, cause and fix tables using the exact wording of the app's messages (audio, recording permission, models, license, quota, shortcuts), how to open and send logs, and what to include in a bug report.",
  llmTitle: "Troubleshooting AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Troubleshooting",
  lead: "Most AI Translator problems fall into four groups: recording permission, audio source, models and license. Find the message exactly as the app shows it in the tables below, follow the fix, and if it still fails, send your logs to support.",
  meta: `<span>Updated October 8, 2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
<h2 id="no-audio">No subtitles, or no audio heard</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Nothing is heard although an app is playing sound: AI Translator may not be allowed to record system audio.”</span><p><strong>Cause:</strong> macOS has not granted the permission, and gives no error: the app just receives silence.</p><p><strong>Fix:</strong> Click <strong>Open System Settings</strong>, turn on AI Translator under Privacy &amp; Security › Screen &amp; System Audio Recording › System Audio Recording Only, then click <strong>Start</strong> again. See <a href="/en/guide/macos-audio-permission/">the audio permission guide</a>. Windows has no such permission: if nothing is heard, check the playback device selected under Settings › Audio.</p></div>
<div class="card"><span class="card-title">“No audio heard. Check that the meeting sound is playing.” or “Could not capture audio.”</span><p><strong>Cause:</strong> Nothing is playing, the audio source is wrong, or the app could not open the source.</p><p><strong>Fix:</strong> Turn the meeting sound on. In Settings › Audio click <strong>Refresh list</strong>, choose the source again and click <strong>Start</strong> again. If it persists, send your logs.</p></div>
<div class="card"><span class="card-title">“The chosen app is not playing sound”</span><p><strong>Cause:</strong> You chose <strong>Only {app name}</strong> and that app is silent.</p><p><strong>Fix:</strong> Make the app play sound (translation resumes at once), or choose <strong>Whole system, except this app</strong> (from the next session).</p></div>
<div class="card"><span class="card-title">The subtitle bar is not visible</span><p><strong>Cause:</strong> The bar stays hidden when the app opens until you click Start, or you hid it with the ✕ button or the shortcut.</p><p><strong>Fix:</strong> On the Home screen, under <strong>Subtitle bar</strong>, click <strong>Show</strong>; or press ${keys(["⌃", "⌥", "H"])} (Windows: ${keys(["Ctrl", "Alt", "H"])}); or choose “Show subtitles” in the menu bar or tray menu. If it is locked, unlock it with ${keys(["⌃", "⌥", "L"])} (Windows: ${keys(["Ctrl", "Alt", "L"])}).</p></div>
<div class="card"><span class="card-title">“Some shortcuts could not be registered. Open Settings › Shortcuts to change them.”</span><p><strong>Cause:</strong> Another app already holds that key combination.</p><p><strong>Fix:</strong> In Settings › Shortcuts click <strong>Change</strong> and press a new combination with at least one of Ctrl, Alt or Cmd/Win (Shift alone is not enough).</p></div>
</div>

<h2 id="slow-or-stopped">Subtitles late, missing or stopped</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Falling behind”; “Running on the CPU (slower).”; “This computer ran out of memory. The Lite model pack is recommended.”</span><p><strong>Cause:</strong> The computer cannot keep up with the speech, or the GPU failed so the app moved to the CPU.</p><p><strong>Fix:</strong> Close heavy apps. In Settings › Model select the Lite pack and click <strong>Use this pack</strong> (if it is not downloaded yet, click <strong>Download and use</strong>); the new pack is used from the next session.</p></div>
<div class="card"><span class="card-title">“Translation unavailable: original text only”; “Translation stopped because of an error. Open the main window for details.”; “Speech recognition stopped working…”</span><p><strong>Cause:</strong> The translator or the recognizer failed. The app restarts them on its own; after more than 5 failures in 10 minutes it stops translating.</p><p><strong>Fix:</strong> Click <strong>Stop</strong>, then <strong>Start</strong>. If the app says part of it is missing or damaged, reinstall AI Translator. If it repeats, send your logs.</p></div>
</div>

<h2 id="models-macos">Models, install, macOS and Windows</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Could not reach the model server. Check your internet connection and try again.”</span><p><strong>Cause:</strong> No connection, or the network blocks the download.</p><p><strong>Fix:</strong> Check your network, then click <strong>Try again</strong>.</p></div>
<div class="card"><span class="card-title">“The download did not finish. Press Resume to continue where it stopped.” or “A downloaded file was damaged…”</span><p><strong>Cause:</strong> The connection dropped, or a file failed its integrity check.</p><p><strong>Fix:</strong> Click <strong>Resume</strong>. If the app says “The model is damaged. Please download it again.”, click <strong>Check and download again</strong> in Settings › Model.</p></div>
<div class="card"><span class="card-title">“Not enough free disk space for this pack…” or “Could not write the model files to disk.”</span><p><strong>Cause:</strong> The disk needs the download size plus 1 GB free (about 2.5 GB for Standard, 1.3 GB for Lite).</p><p><strong>Fix:</strong> Free up disk space, or choose the Lite pack.</p></div>
<div class="card"><span class="card-title">“This computer does not meet the minimum requirements, so models cannot be downloaded.”</span><p><strong>Cause:</strong> Below the minimum: a Mac with Apple Silicon and 8 GB of RAM, or a Windows 10/11 x64 PC with 8 GB of RAM and a CPU that supports AVX2. The app says why, for example “This computer's processor lacks AVX2…”.</p><p><strong>Fix:</strong> Use a computer that meets it. See the requirements on the <a href="/en/download/">download page</a>.</p></div>
<div class="card"><span class="card-title">macOS says it cannot verify the developer when you first open the app</span><p><strong>Cause:</strong> You opened the app from a .dmg downloaded in a browser, and the macOS build is ad-hoc signed and not yet notarized by Apple.</p><p><strong>Fix:</strong> The quickest is to run the <a href="/en/download/#install-macos">install command in Terminal</a> again (the app opens directly). Or click <strong>Done</strong>, open System Settings › Privacy &amp; Security, scroll to the bottom and click <strong>Open Anyway</strong> next to AI Translator. See <a href="/en/guide/install-macos/">installing on macOS</a>.</p></div>
<div class="card"><span class="card-title">macOS asks for your password several times after an update</span><p><strong>Cause:</strong> Normal for the ad-hoc signed build: your login password a few times and recording permission once.</p><p><strong>Fix:</strong> Enter your password, click <strong>Always Allow</strong> and allow the recording permission.</p></div>
<div class="card"><span class="card-title">Windows shows “Windows protected your PC” when you open the installer</span><p><strong>Cause:</strong> The Windows build is not code-signed yet, so Microsoft Defender SmartScreen may block it.</p><p><strong>Fix:</strong> Check the SHA-256, click <strong>More info</strong>, check that the App line shows the installer's file name, then click <strong>Run anyway</strong>. If there is no Run anyway button, a policy on your PC may block it: ask whoever manages the computer. See <a href="/en/guide/install-windows/">installing on Windows</a>.</p></div>
<div class="card"><span class="card-title">Antivirus software blocks or removes the Windows installer</span><p><strong>Cause:</strong> The installer is not code-signed and not yet widely downloaded, so some products treat it as suspicious.</p><p><strong>Fix:</strong> Check the SHA-256 again. If it matches and the installer is still blocked, <a href="/en/contact/">contact support</a> and tell us which antivirus you use.</p></div>
</div>

<h2 id="license-quota">License, quota and trial</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Translation quota used up · resets …”</span><p><strong>Cause:</strong> You used the 30 minutes for today (Free) or the 50 hours of the cycle (Monthly).</p><p><strong>Fix:</strong> Wait until the reset time on screen, or <a href="/en/guide/buy-and-activate/">renew or change plan</a>.</p></div>
<div class="card"><span class="card-title">“Your 10-day trial has ended”</span><p><strong>Cause:</strong> Free is a 10-day trial per computer; reinstalling does not restart it.</p><p><strong>Fix:</strong> Buy Monthly or Yearly to keep translating.</p></div>
<div class="card"><span class="card-title">“Connect to the internet once to start the free trial” or “Your plan could not be checked for 14 days, so Free is used. Connect to the internet.”</span><p><strong>Cause:</strong> The trial could not register without a connection, or a paid plan went over 14 days without a license check.</p><p><strong>Fix:</strong> Connect to the internet. If this computer has not registered its trial yet, click <strong>Start</strong> again so the app registers it. For a paid plan, click <strong>Check now</strong> in Settings › License.</p></div>
<div class="card"><span class="card-title">“This key is in use on 2 computers, so it is locked…”</span><p><strong>Cause:</strong> The key is held by two computers.</p><p><strong>Fix:</strong> Remove the key from one computer, then click <strong>Try again</strong>: see <a href="/en/guide/buy-and-activate/#switch-computers">how to switch computers</a>.</p></div>
<div class="card"><span class="card-title">“The computer clock looks wrong. Set the correct time, then try again.” or “This computer’s clock was moved back…”</span><p><strong>Cause:</strong> The system clock was set backwards.</p><p><strong>Fix:</strong> Set the correct time (preferably automatic) and connect to the internet so the app can check it.</p></div>
<div class="card"><span class="card-title">“This key is not valid…”; “This key is temporarily locked because computers were changed too often…”; “This copy of AI Translator is not genuine…”</span><p><strong>Cause:</strong> A mistyped key; too many computer changes; or an installer that is not the official one.</p><p><strong>Fix:</strong> Paste the key from your email again; contact support if the key is locked; download the official build again from the link we sent you or from aitranslator.io.vn.</p></div>
</div>

<h2 id="send-logs">Send logs and report a problem</h2>
<p>Open <strong>About › Open log folder</strong> to find <code>app.log</code> (on macOS: the <code>com.aitranslator.desktop</code> folder inside <code>~/Library/Logs/</code>). Logs stay on your computer and contain no audio, no transcript text and no full license key. The app never sends anything by itself: you decide whether to send them to <a href="/en/contact/">support</a> (support@aitranslator.io.vn).</p>
${appShot({
  slug: "app-about",
  lang: "en",
  alt: "The About screen: the app name, the Version line, the Open log folder button with a note that logs stay on this computer, and the terms and privacy section",
  caption: "About: the version and Open log folder.",
})}
<p>Contact support when a problem repeats after you followed the tables, when a key is locked or revoked, or when a payment goes wrong. Include:</p>
<ul>
<li>The app version (About › “Version …”), the macOS or Windows version, the chip or processor (for example MacBook Air M2), the RAM, and the graphics card on a Windows PC.</li>
<li>The model pack (Standard or Lite, in Settings › Model) and your license plan.</li>
<li>The message exactly as shown, or a screenshot, the meeting app you use and what you just did.</li>
<li>The order number for payment issues; <code>app.log</code> if you agree.</li>
</ul>

<h2 id="quick-answers">Quick answers</h2>
${faq(QUICK)}
`,
})}
${docNav(
  [
    { href: "/en/guide/buy-and-activate/", kicker: "Previous", title: "Buy a plan, activate your key and switch computers" },
    { href: "/en/faq/", kicker: "See also", title: "Frequently asked questions" },
  ],
  "Related guides",
)}
</div></section>
`,
};
