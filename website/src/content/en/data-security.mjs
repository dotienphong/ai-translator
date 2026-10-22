import { pageHero, callout, docLayout, docNav, steps, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";
import { legalVersionLine } from "../legal.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Data and security", path: "/en/data-security/" },
];

const TOC = [
  { level: 2, id: "on-device", text: "What data stays on your computer?" },
  { level: 2, id: "network", text: "Where does the app connect?" },
  { level: 2, id: "verified", text: "How did we check that?" },
  { level: 2, id: "server", text: "What do our servers store, and for how long?" },
  { level: 2, id: "error-reports", text: "Error reports: what does the app send?" },
  { level: 2, id: "support-chat", text: "Support chat: where do messages go?" },
  { level: 2, id: "delete-data", text: "How do I delete my data?" },
  { level: 2, id: "processors", text: "Who else processes data?" },
  { level: 2, id: "protections", text: "Other protections" },
  { level: 2, id: "signing", text: "Code signing today" },
  { level: 2, id: "limits", text: "What we do not promise" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "data-security",
  lang: "en",
  path: "/en/data-security/",
  title: "Data and security in AI Translator",
  description:
    "AI Translator processes audio on your computer and never sends it out. See what stays on your device, where it connects, what servers store, and how to delete it.",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  llm: "What data stays on your device, the five places the app connects to, how it was checked with a proxy on macOS, what our servers store and for how long, automatic error reports (what is sent, how to turn them off), the support chat (what is stored, for how long), processors, protections, signing status and how to request deletion.",
  llmTitle: "Data and security in AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Where does your data go when you use AI Translator?",
  lead: "Meeting audio is processed entirely on your computer and is never sent out: speech recognition and translation use AI models that run on your machine, and no cloud AI service takes part. This page walks through each kind of data: what stays on your computer, what crosses the network and what our servers store, plus how we checked it and what we have not checked.",
  meta: `<span>Updated {{updated}}</span><span>Matches the Privacy policy: ${legalVersionLine("privacy.en.md")}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: TOC,
  tocTitle: "On this page",
  body: `
${facts([
  ["AI processing", "Speech recognition and translation use AI models running on your computer; no cloud AI"],
  ["Meeting data", "Only on your computer; our server has none"],
  ["Audio", "Only in RAM, never written to disk, never sent out"],
  ["Network", "Five places; none of them receives audio, transcripts or the text you type in Type &amp; Translate"],
  ["Servers store", "Email (when you buy, or when you choose to leave it in the support chat), orders, licenses, hashed machine ID, error reports, support chat messages"],
  ["Kept for", "Until you ask us to delete it; error reports 30 days; support chat 90 days"],
  ["Checked", "Proxy and nettop on macOS"],
  ["Code signing", "macOS ad-hoc signed, not notarized; Windows not signed"],
])}
<h2 id="on-device">What data stays on your computer?</h2>
<p>Audio, transcripts, translations and the text you type in Type &amp; Translate never leave your computer. The app also has no sign-in, no ads and no analytics. When it hits an error, it sends us an error report with personal data scrubbed out (see <a href="#error-reports">Error reports</a>); that report contains no audio, no transcript text and no translation.</p>
<div class="table-wrap" role="region" aria-label="Data that stays on your computer" tabindex="0"><table>
<thead><tr><th scope="col">Data</th><th scope="col">How it is handled</th></tr></thead>
<tbody>
<tr><th scope="row">System audio being captured</th><td>Only in RAM while translating. Never written to disk, never sent over the network. AI Translator does not record meetings to a file either.</td></tr>
<tr><th scope="row">Transcript and translation</th><td>Shown on screen and held in memory for the session. History is off by default; if you turn it on (a Pro feature), it is stored on your computer, encrypted.</td></tr>
<tr><th scope="row">Text you type in Type &amp; Translate and its translation</th><td>Held only in the app's memory until you paste it or quit the app. Not written to disk, not sent over the network, not in logs or error reports. The translation is copied to the clipboard to paste it and stays there until you copy something else.</td></tr>
<tr><th scope="row">Keys, tokens, quota counters</th><td>The history encryption key, license token, trial token and quota counters live in Keychain (macOS) or Credential Manager (Windows).</td></tr>
<tr><th scope="row">Logs</th><td>Stored on your computer and free of transcript content. Only the part of a log that relates to an error leaves your computer, inside an error report with personal data scrubbed out (see <a href="#error-reports">Error reports</a>).</td></tr>
<tr><th scope="row">Glossary, settings, models</th><td>Stored on your computer. Models are downloaded once and run entirely on your computer.</td></tr>
</tbody></table></div>
<p>On macOS, Type &amp; Translate asks for the Accessibility permission only to send the ⌘V paste keys to the chat box you are typing in. The app does not read text, content or the clipboard of other apps; without the permission it only copies the translation for you to paste (see <a href="/en/guide/type-and-translate/#accessibility">Type &amp; Translate</a>).</p>

<h2 id="network">Where does the app connect?</h2>
<p>To exactly five places, and none of them receives audio, transcript content or the text you type in Type &amp; Translate. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due), plus support chat messages while you have the Support screen open or press send. Section 4 of the <a href="/en/privacy/">Privacy policy</a> also lists five connections but counts them by purpose (model downloads and update checks both go to releases.aitranslator.io.vn; the PayOS and Creem payment pages are one item), while the table below counts them by destination.</p>
<div class="table-wrap" role="region" aria-label="Places the app connects to" tabindex="0"><table>
<thead><tr><th scope="col">Connects to</th><th scope="col">What for</th><th scope="col">What is sent</th></tr></thead>
<tbody>
<tr><th scope="row">api.aitranslator.io.vn</th><td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks, receiving error reports, the support chat; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key; error reports with personal data scrubbed out (only while the app is not translating); support chat messages you send, with the machine details line if you leave it ticked and your email if you choose to leave it (only if you use the chat)</td></tr>
<tr><th scope="row">releases.aitranslator.io.vn</th><td>Downloading models, checking for and downloading app updates</td><td>File download requests only</td></tr>
<tr><th scope="row">PayOS payment page (pay.payos.vn)</th><td>VietQR payment when you buy a plan</td><td>Opens in your browser, not inside the app</td></tr>
<tr><th scope="row">Creem payment page (www.creem.io)</th><td>International card payment when you buy a plan</td><td>Opens in your browser, not inside the app. Your email goes to Creem from our server, not from the app (see “Who else processes data?”)</td></tr>
<tr><th scope="row">aitranslator.io.vn (this website)</th><td>External links (policies, support, download page) open in your system browser</td><td>The app sends nothing</td></tr>
</tbody></table></div>

<h2 id="verified">How did we check that?</h2>
<p>On macOS we ran the app behind a traffic-capturing proxy (mitmproxy), measured in parallel with <code>nettop</code>, and translated a session using a sample English sentence played on repeat. The build was release 0.1.0, ad-hoc signed, on a MacBook Pro M4 Pro with macOS 26.6.2, on 6 October 2026.</p>
<ul>
<li><strong>A 15 minute 42 second session</strong> (158 segments, 0 errors): 3 outbound requests, all to our two servers (a license check and an update check). During translation there was only 1 request, the scheduled update check. This run took place before we moved to our own domain; a later repeat on our own domain (a session of about 9 minutes, nettop for 5 minutes) gave the same result.</li>
<li><strong>nettop</strong> watched 7 processes of the app (including the AI processing): no outbound data stream was seen.</li>
<li><strong>Marker words</strong> from the sample sentence: found neither in the app's log nor in the recorded requests.</li>
<li><strong>Automatic error reports</strong> (re-measured on 17 October 2026 with an ad-hoc signed release build that has this feature, same machine): in a 12-minute-31-second session we deliberately killed a helper program at the 5-minute mark so the app queued an error report. For the remaining 7-plus minutes of the session no request sent a report; it reached our server 1 second after Stop was pressed. The report body was 49.8 KB and contained no account name, personal folder path, email address or marker words from the sample sentence.</li>
</ul>
${callout({ kind: "warn", title: "Limits of this test", text: "Measured only on macOS, one machine, one ad-hoc signed build; the automatic error report was measured once (one 12-minute session, one report), and the support chat has not been measured with the proxy yet. This is an internal check, not an independent audit; the proxy mode cannot see WebView requests or non-HTTP traffic, so we covered that with nettop." })}

<h2 id="server">What do our servers store, and for how long?</h2>
<p>Our servers store the data below. The Free trial row applies to every device that registered for the trial; the other rows exist only if you buy a plan or activate a key, except the error-reports row, which applies to every device whose app sends a report, and the support-chat row, which applies to everyone who writes in the chat.</p>
<div class="table-wrap" role="region" aria-label="Data our servers store" tabindex="0"><table>
<thead><tr><th scope="col">Data</th><th scope="col">Purpose</th></tr></thead>
<tbody>
<tr><th scope="row">Email at purchase, time you consented to email processing</th><td>Sending and recovering keys; for card orders, pre-filling Creem's payment page; proof of consent</td></tr>
<tr><th scope="row">Orders: order code, plan, amount and currency, time, status, the payment gateway's session ID (PayOS or Creem)</th><td>Issuing and renewing licenses, reconciliation, accounting</td></tr>
<tr><th scope="row">License: key, plan, expiry, quota cycle</th><td>Granting the paid plan</td></tr>
<tr><th scope="row">Activated devices: hashed machine ID, device name, last check</th><td>One device per key, abuse prevention</td></tr>
<tr><th scope="row">Free trial: hashed machine ID, start and end times, last time the app called</th><td>One trial per device. No email or device name.</td></tr>
<tr><th scope="row">License change log</th><td>Support and incident investigation</td></tr>
<tr><th scope="row">Rate-limit counters (hashed values only, expire after about 3 hours)</th><td>Blocking key guessing and spam</td></tr>
<tr><th scope="row">Error reports: error type and code, machine details, hashed machine ID, the relevant part of the log</th><td>Finding and fixing bugs; deleted automatically after 30 days (see <a href="#error-reports">Error reports</a>)</td></tr>
<tr><th scope="row">Support chat: your messages and our replies, source, language, the page you were on (website), the machine details line if you left it ticked (app), your email if you chose to leave it</th><td>Replying to you; deleted automatically 90 days after the last message (see <a href="#support-chat">Support chat</a>)</td></tr>
</tbody></table></div>
<p><strong>Kept for:</strong> until you ask us to delete it; we never delete personal data on our own (except error reports, which are deleted automatically after 30 days, and the support chat, deleted 90 days after the last message). We do not receive your card or bank account numbers. For VietQR we do not send your email to PayOS; for an international card, we send the email you enter on the Upgrade screen to Creem, to pre-fill its payment page and so that Creem can email you a receipt. If you only use Free, our servers hold no email or device name for you, except an email you choose to leave in the support chat.</p>

<h2 id="error-reports">Error reports: what does the app send when it hits an error?</h2>
<p>When the app hits an error, it automatically sends us an error report so we can find and fix the problem. This is on by default (including after you update from an older version); you turn it off or back on in <strong>Settings › Privacy</strong>, and you can untick it right at the Terms step the first time you open the app. The <strong>Send log to support</strong> button on the <strong>About</strong> screen sends a report immediately (even if you turned automatic sending off) and gives you a <strong>report code</strong> to put in your email to support.</p>
<div class="table-wrap" role="region" aria-label="Error reports from the app" tabindex="0"><table>
<thead><tr><th scope="col">What</th><th scope="col">Details</th></tr></thead>
<tbody>
<tr><th scope="row">When the app sends one</th><td>When the previous run ended abruptly; when a translation session stops because of an error in the app (not errors caused by you or your environment, such as a missing recording permission, a used-up quota or no network); when one of the app's helper programs dies and restarts. Only while the app is not translating, at most 5 reports a day per machine.</td></tr>
<tr><th scope="row">A report contains</th><td>The report code, the type and code of the error; the app version, operating system, chip or CPU, RAM, type of GPU, model pack, the name of your license plan (never the key), the interface language; the hashed machine ID; and the part of the log that relates to the error, at most 64 KB.</td></tr>
<tr><th scope="row">A report does not contain</th><td>Audio, transcripts, translations, text typed in Type &amp; Translate, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses. The app scrubs personal folder paths, keys, tokens and email addresses from the log before sending; our server checks again and rejects a report if anything is left.</td></tr>
<tr><th scope="row">How it is tied to you</th><td>The hashed machine ID in the report is the same one we store for licensing and the Free trial, so we can link a report to that machine's license and email when handling a support request.</td></tr>
<tr><th scope="row">How long it is kept</th><td>At most 30 days, then deleted automatically (the server keeps at most 3,000 reports). A deletion request by email also deletes the reports of the machines that ever activated a key for that email.</td></tr>
</tbody></table></div>
<p>We use reports only to find and fix bugs, not for advertising, and we do not share them with anyone other than the processors in the table below. The full text is in section 10 of the <a href="/en/privacy/">Privacy policy</a>.</p>

<h2 id="support-chat">Support chat: where do your messages go, and for how long?</h2>
<p>You can write to us with the chat button at the bottom right of every page of this website, or on the <strong>Support</strong> screen in the app. Your messages go through our server to the person who runs AI Translator, and the reply appears in the same chat. Using the chat is up to you: if you have never written in it, the app makes no connection for it.</p>
<ul>
<li><strong>Our server stores:</strong> your messages and our replies, their times, the source (website or app), the language, the page you were on when you opened the chat (website), the machine details line if you left it ticked (app), and your email if you chose to leave it. No IP address is stored with the chat.</li>
<li><strong>Machine details (app):</strong> the box is ticked by default, can be unticked, goes only with your first message and is shown word for word before sending; it never contains your key, email, machine ID or computer name.</li>
<li><strong>Email:</strong> optional; used only to email you our reply when it has not reached your chat after about 2 minutes (for example because you closed the page or the app).</li>
<li><strong>How long:</strong> deleted automatically 90 days after the last message. You can delete the conversation right away from the ⋯ menu of the chat; the copy of your messages that reached the person who replies is deleted when you ask us by email.</li>
</ul>
<p>The full text, including who carries the messages, is in section 11 of the <a href="/en/privacy/">Privacy policy</a>.</p>

<h2 id="delete-data">How do I delete my data?</h2>
${steps(
  [
    { title: "Delete data on your computer", text: "Go to <strong>Settings › Privacy</strong>. <em>Delete all data</em> removes history and glossary; <em>Delete models and data</em> also removes downloaded models (on macOS, do this before you drag the app to the Trash). Your license, quota and settings are kept." },
    { title: "Ask us to delete server data", text: `Email ${MAIL} <strong>from the same email you used to buy, or the email you left in the support chat</strong>, so we can confirm it is you. Our Privacy policy also gives you the right to know what is stored, to withdraw consent and to complain, as set out in Vietnam's personal data protection law. We handle requests within the time the law sets.` },
    { title: "What we do", text: "We remove your email and device name, delete the error reports of the machines that ever activated a key for that email, and delete the support chats in which you left that email (including the copy that reached the person who replies). Your license still works, but can no longer be recovered by email." },
  ],
  true,
)}
<p><strong>After deletion we still keep:</strong> the hashed machine ID (only to prevent abuse: one device per key, one Free trial per device), the time you once consented to email processing, and the order row at accounting level (order code, date, amount and currency, the payment gateway's session ID). Technical logs that expire on their own and Resend's mail logs are outside our deletion, under those parties' own policies. Data you enter on Creem's page and the transaction records kept by Creem (as the merchant of record it must keep tax records) are outside a deletion request sent to us; to have them deleted at Creem, contact Creem. Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days.</p>

<h2 id="processors">Who else processes data?</h2>
<div class="table-wrap" role="region" aria-label="Other parties that process data" tabindex="0"><table>
<thead><tr><th scope="col">Party</th><th scope="col">Role</th><th scope="col">Data</th></tr></thead>
<tbody>
<tr><th scope="row">PayOS (Vietnam)</th><td>Processes VietQR payments</td><td>Order code, amount, order description. Not your email.</td></tr>
<tr><th scope="row">Creem (Armitage Labs OÜ, Estonia)</th><td>Merchant of record (reseller) for card orders: handles the payment, tax and receipt</td><td>We send the order code, plan, amount, currency and the email you entered as soon as you click to pay by card (even if you then do not pay), to pre-fill the payment page and so that Creem can email you a receipt. On its payment page, Creem itself collects your card number, name, billing address and country (to calculate tax) and IP address (to prevent fraud); we do not receive your card number. Creem processes that data under its own policy (https://www.creem.io/privacy). The payment notification Creem sends to our server includes the buyer's name and country; we do not store these two items.</td></tr>
<tr><th scope="row">Cloudflare</th><td>Runs the license server and database; stores and serves models and updates</td><td>The data in the table above, including error reports and the support chat; technical logs that expire on their own</td></tr>
<tr><th scope="row">Resend</th><td>Sends the email that contains your key, and our support chat reply if you left an email</td><td>Your email and the message (with the key, or our chat reply); mail logs kept under Resend's own policy</td></tr>
</tbody></table></div>
<p>Cloudflare and Resend operate servers outside Vietnam, and Creem is an Estonian company, so data may be processed abroad. Support chat messages also pass through a messaging service with servers in Vietnam to reach the person who replies (without your email); its name and the data it receives are in section 6 of the <a href="/en/privacy/">Privacy policy</a>. We do not sell your data and do not share it for advertising.</p>

<h2 id="protections">Other protections</h2>
<ul>
<li><strong>Digital signatures:</strong> app updates are signature-checked before anything is written to disk; the model manifest is signed with Ed25519 and each file is checked against SHA-256; license tokens are signed with Ed25519 and can be verified offline. The app contains only the public key.</li>
<li><strong>AI processing is separate from the interface:</strong> it only talks to the app inside your computer, accepts no connections from outside the machine and uses a random key on every run.</li>
<li><strong>Sensitive keys stay out of the app:</strong> the payment API key and signing keys live only on our servers; connections to our servers use HTTPS.</li>
<li><strong>Detecting a tampered app:</strong> on macOS the app checks that its ad-hoc signature is intact and the bundle id is right; a build whose signature does not match runs only the Free plan. This is an integrity check and does not replace a Developer ID signature. On Windows the current build is not code-signed yet, so the app has no such check; verify the installer's SHA-256 instead.</li>
</ul>

<h2 id="signing">Code signing today</h2>
<div class="table-wrap" role="region" aria-label="Code signing status" tabindex="0"><table>
<thead><tr><th scope="col">Platform</th><th scope="col">Status</th><th scope="col">What it means for you</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>Ad-hoc signed, <strong>not notarized</strong> (we do not have an Apple Developer ID yet)</td><td>A .dmg downloaded in a browser is blocked by macOS on first launch (you need to click Open Anyway in System Settings › Privacy &amp; Security); installing with the Terminal command opens directly. After each update, macOS asks again with 1 Keychain dialog and may ask again for the audio-recording permission.</td></tr>
<tr><th scope="row">Windows</th><td><strong>Not code-signed</strong> (we do not have a Windows code-signing certificate yet)</td><td>Installing with the PowerShell command does not trigger SmartScreen (a file downloaded by PowerShell has no “downloaded from the internet” tag). An .exe downloaded in a browser may show “Windows protected your PC”: click More info, then Run anyway; Publisher shows Unknown publisher. Smart App Control in blocking mode blocks an unsigned build.</td></tr>
</tbody></table></div>
<p>An ad-hoc signature does not tell Apple who the developer is, so install only with the command on the <a href="/en/download/">Download page</a> or from a file we send you, and compare the SHA-256 checksum. The same goes for the unsigned Windows build (install with the command on the Download page, or from a file we send you): Windows cannot confirm who published the file, so comparing the SHA-256 is how you know it has not been altered. We plan to move to a Developer ID and a Windows code-signing certificate when we can, with no date yet. See the installation guides for <a href="/en/guide/install-macos/">macOS</a> and <a href="/en/guide/install-windows/">Windows</a>.</p>

<h2 id="limits">What we do not promise</h2>
<ul>
<li>No system is absolutely safe. If an incident affects personal data, we will notify as the law requires.</li>
<li>We have not checked whether the subtitle bar is visible to viewers when you share your screen. If that worries you, hide the bar with its shortcut before sharing.</li>
<li>If the law or your company policy requires it, you are responsible for telling the other people in the meeting that you use a translation tool.</li>
</ul>
<p>Found a security issue? Follow the steps on the <a href="/en/contact/#security">Contact page</a>.</p>
`,
})}
${docNav(
  [
    { href: "/en/privacy/", kicker: "Full text", title: "Privacy policy" },
    { href: "/en/terms/", kicker: "Full text", title: "Terms of use" },
    { href: "/en/guide/history-and-export/", kicker: "Guide", title: "History and export" },
  ],
  "Keep reading",
)}
</div></section>

${ctaBand({ title: "Try it with control in your hands", text: "Translate right on your computer, with audio that never leaves it. 10-day Free trial, no card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/contact/", label: "Ask us" } })}
`,
};
