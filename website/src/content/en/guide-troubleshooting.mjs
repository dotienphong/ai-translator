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
  { level: 2, id: "models-macos", text: "Models, install and macOS" },
  { level: 2, id: "license-quota", text: "License, quota and trial" },
  { level: 2, id: "send-logs", text: "Send logs and report a problem" },
  { level: 2, id: "quick-answers", text: "Quick answers" },
];

const QUICK = [
  {
    q: "I closed the window but the app keeps running. How do I quit?",
    a: "<p>Closing the window only hides the app in the menu bar. Choose <strong>Quit</strong> from the AI Translator menu bar icon; ⌘Q does not quit it.</p>",
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
  meta: `<span>Updated 8 Oct 2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
<h2 id="no-audio">No subtitles, or no audio heard</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">You see</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
<tbody>
<tr><th scope="row">“Nothing is heard although an app is playing sound: AI Translator may not be allowed to record system audio.”</th><td>macOS has not granted the permission, and gives no error: the app just receives silence.</td><td>Click <strong>Open System Settings</strong>, turn on AI Translator under Privacy &amp; Security › Screen &amp; System Audio Recording › System Audio Recording Only, then click <strong>Start</strong> again. See <a href="/en/guide/macos-audio-permission/">the audio permission guide</a>.</td></tr>
<tr><th scope="row">“No audio heard. Check that the meeting sound is playing.” or “Could not capture audio.”</th><td>Nothing is playing, the audio source is wrong, or the app could not open the source.</td><td>Turn the meeting sound on. In Settings › Audio click <strong>Refresh list</strong>, choose the source again and click <strong>Start</strong> again. If it persists, send your logs.</td></tr>
<tr><th scope="row">“The chosen app is not playing sound”</th><td>You chose <strong>Only {app name}</strong> and that app is silent.</td><td>Make the app play sound (translation resumes at once), or choose <strong>Whole system, except this app</strong> (from the next session).</td></tr>
<tr><th scope="row">The subtitle bar is not visible</th><td>The bar stays hidden when the app opens until you click Start, or you hid it with the ✕ button or the shortcut.</td><td>On the Home screen, under <strong>Subtitle bar</strong>, click <strong>Show</strong>; or press ${keys(["⌃", "⌥", "H"])}; or choose “Show subtitles” in the menu bar. If it is locked, unlock it with ${keys(["⌃", "⌥", "L"])}.</td></tr>
<tr><th scope="row">“Some shortcuts could not be registered. Open Settings › Shortcuts to change them.”</th><td>Another app already holds that key combination.</td><td>In Settings › Shortcuts click <strong>Change</strong> and press a new combination with at least one of Ctrl, Alt or Cmd/Win (Shift alone is not enough).</td></tr>
</tbody></table></div>

<h2 id="slow-or-stopped">Subtitles late, missing or stopped</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">You see</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
<tbody>
<tr><th scope="row">“Falling behind”; “Running on the CPU (slower).”; “This computer ran out of memory. The Lite model pack is recommended.”</th><td>The computer cannot keep up with the speech, or the GPU failed so the app moved to the CPU.</td><td>Close heavy apps. In Settings › Model click <strong>Use this pack</strong> on the Lite pack (from the next session).</td></tr>
<tr><th scope="row">“Translation unavailable: original text only”; “Translation stopped because of an error. Open the main window for details.”; “Speech recognition stopped working…”</th><td>The translator or the recognizer failed. The app restarts them on its own; after more than 5 failures in 10 minutes it stops translating.</td><td>Click <strong>Stop</strong>, then <strong>Start</strong>. If the app says part of it is missing or damaged, reinstall AI Translator. If it repeats, send your logs.</td></tr>
</tbody></table></div>

<h2 id="models-macos">Models, install and macOS</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">You see</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
<tbody>
<tr><th scope="row">“Could not reach the model server. Check your internet connection and try again.”</th><td>No connection, or the network blocks the download.</td><td>Check your network, then click <strong>Try again</strong>.</td></tr>
<tr><th scope="row">“The download did not finish. Press Resume to continue where it stopped.” or “A downloaded file was damaged…”</th><td>The connection dropped, or a file failed its integrity check.</td><td>Click <strong>Resume</strong>. If the app says “The model is damaged. Please download it again.”, click <strong>Check and download again</strong> in Settings › Model.</td></tr>
<tr><th scope="row">“Not enough free disk space for this pack…” or “Could not write the model files to disk.”</th><td>The disk needs the download size plus 1 GB free (about 2.5 GB for Standard, 1.3 GB for Lite).</td><td>Free up disk space, or choose the Lite pack.</td></tr>
<tr><th scope="row">“This computer does not meet the minimum requirements, so models cannot be downloaded.”</th><td>Below the minimum: a Mac with Apple Silicon and 8 GB of RAM.</td><td>Use a computer that meets it. See the requirements on the <a href="/en/download/">download page</a>.</td></tr>
<tr><th scope="row">macOS says it cannot verify the developer when you first open the app</th><td>The macOS build is ad-hoc signed and not yet notarized by Apple.</td><td>Click <strong>Done</strong>, open System Settings › Privacy &amp; Security, scroll to the bottom and click <strong>Open Anyway</strong> next to AI Translator. See <a href="/en/guide/install-macos/">installing on macOS</a>.</td></tr>
<tr><th scope="row">macOS asks for your password several times after an update</th><td>Normal for the ad-hoc signed build: your login password a few times and recording permission once.</td><td>Enter your password, click <strong>Always Allow</strong> and allow the recording permission.</td></tr>
</tbody></table></div>

<h2 id="license-quota">License, quota and trial</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">You see</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
<tbody>
<tr><th scope="row">“Translation quota used up · resets …”</th><td>You used the 30 minutes for today (Free) or the 50 hours of the cycle (Monthly).</td><td>Wait until the reset time on screen, or <a href="/en/guide/buy-and-activate/">renew or change plan</a>.</td></tr>
<tr><th scope="row">“Your 10-day trial has ended”</th><td>Free is a 10-day trial per computer; reinstalling does not restart it.</td><td>Buy Monthly or Yearly to keep translating.</td></tr>
<tr><th scope="row">“Connect to the internet once to start the free trial” or “Your plan could not be checked for 14 days, so Free is used. Connect to the internet.”</th><td>The trial could not register without a connection, or a paid plan went over 14 days without a license check.</td><td>Connect to the internet, then click <strong>Check now</strong> in Settings › License (paid plans).</td></tr>
<tr><th scope="row">“This key is in use on 2 computers, so it is locked…”</th><td>The key is held by two computers.</td><td>Remove the key from one computer, then click <strong>Try again</strong>: see <a href="/en/guide/buy-and-activate/#switch-computers">how to switch computers</a>.</td></tr>
<tr><th scope="row">“The computer clock looks wrong. Set the correct time, then try again.” or “This computer’s clock was moved back…”</th><td>The system clock was set backwards.</td><td>Set the correct time (preferably automatic) and connect to the internet so the app can check it.</td></tr>
<tr><th scope="row">“This key is not valid…”; “This key is temporarily locked because computers were changed too often…”; “This copy of AI Translator is not genuine…”</th><td>A mistyped key; too many computer changes; or an installer that is not the official one.</td><td>Paste the key from your email again; contact support if the key is locked; download the official build from aitranslator.io.vn.</td></tr>
</tbody></table></div>

<h2 id="send-logs">Send logs and report a problem</h2>
<p>Open <strong>About › Open log folder</strong> to find <code>app.log</code> (on macOS: <code>~/Library/Logs/com.aitranslator.desktop/</code>). Logs stay on your computer and contain no audio, no transcript text and no full license key. The app never sends anything by itself: you decide whether to send them to <a href="/en/contact/">support</a> (support@aitranslator.io.vn).</p>
${appShot({
  slug: "app-about",
  lang: "en",
  alt: "The About screen: the app name, the Version line, the Open log folder button with a note that logs stay on this computer, and the terms and open-source license sections",
  caption: "About: the version and Open log folder.",
})}
<p>Contact support when a problem repeats after you followed the tables, when a key is locked or revoked, or when a payment goes wrong. Include:</p>
<ul>
<li>The app version (About › “Version …”), the macOS version, the chip (for example MacBook Air M2) and the RAM.</li>
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
