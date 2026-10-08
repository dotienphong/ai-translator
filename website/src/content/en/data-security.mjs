import { pageHero, callout, docLayout, docNav, steps, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Data and security", path: "/en/data-security/" },
];

const TOC = [
  { level: 2, id: "on-device", text: "What data stays on your computer?" },
  { level: 2, id: "network", text: "Where does the app connect?" },
  { level: 2, id: "verified", text: "How did we check that?" },
  { level: 2, id: "server", text: "What do our servers store, and for how long?" },
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
  modified: "2026-10-08",
  llm: "What data stays on your device, the four places the app connects to, how it was checked with a proxy on macOS (Windows not yet measured), what our servers store and for how long, processors, protections, signing status and how to request deletion.",
  llmTitle: "Data and security in AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Where does your data go when you use AI Translator?",
  lead: "Meeting audio is processed entirely on your computer and is never sent out. This page walks through each kind of data: what stays on your computer, what crosses the network and what our servers store, plus how we checked it and what we have not checked.",
  meta: "<span>Updated 8 October 2026</span><span>Matches Privacy policy version 1.1</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: TOC,
  tocTitle: "On this page",
  body: `
${facts([
  ["Audio", "Only in RAM, never written to disk, never sent out"],
  ["Network", "Four places; none of them receives audio or transcripts"],
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID"],
  ["Kept for", "Until you ask us to delete it"],
  ["Checked", "Proxy and nettop on macOS; Windows not measured yet"],
  ["Code signing", "macOS ad-hoc signed, not notarized; Windows not signed"],
])}
<h2 id="on-device">What data stays on your computer?</h2>
<p>Audio, transcripts and translations never leave your computer. The app also has no sign-in, no ads, no analytics and sends no automatic crash reports.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Data</th><th scope="col">How it is handled</th></tr></thead>
<tbody>
<tr><th scope="row">System audio being captured</th><td>Only in RAM while translating. Never written to disk, never sent over the network. AI Translator does not record meetings to a file either.</td></tr>
<tr><th scope="row">Transcript and translation</th><td>Shown on screen and held in memory for the session. History is off by default; if you turn it on (a Pro feature), it is stored on your computer, encrypted with SQLCipher.</td></tr>
<tr><th scope="row">Keys, tokens, quota counters</th><td>The history encryption key, license token, trial token and quota counters live in Keychain (macOS) or Credential Manager (Windows).</td></tr>
<tr><th scope="row">Logs</th><td>Stored on your computer and free of transcript content. You decide whether to send them to us.</td></tr>
<tr><th scope="row">Glossary, settings, models</th><td>Stored on your computer. Models are downloaded once and run entirely on your computer.</td></tr>
</tbody></table></div>

<h2 id="network">Where does the app connect?</h2>
<p>To exactly four places, and none of them receives audio or transcript content. Speech recognition and translation need no network; while translating, the app may only send a scheduled update check.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Connects to</th><th scope="col">What for</th><th scope="col">What is sent</th></tr></thead>
<tbody>
<tr><th scope="row">api.aitranslator.io.vn</th><td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key</td></tr>
<tr><th scope="row">releases.aitranslator.io.vn</th><td>Downloading models, checking for and downloading app updates</td><td>File download requests only</td></tr>
<tr><th scope="row">PayOS payment page (pay.payos.vn)</th><td>VietQR payment when you buy a plan</td><td>Opens in your browser, not inside the app</td></tr>
<tr><th scope="row">aitranslator.io.vn (this website)</th><td>External links (policies, support, download page) open in your system browser</td><td>The app sends nothing</td></tr>
</tbody></table></div>

<h2 id="verified">How did we check that?</h2>
<p>On macOS we ran the app behind a traffic-capturing proxy (mitmproxy), measured in parallel with <code>nettop</code>, and translated a real session. The build was release 0.1.0, ad-hoc signed, on a MacBook Pro M4 Pro with macOS 26.6.2, on 6 October 2026.</p>
<ul>
<li><strong>A 15 minute 42 second session</strong> (158 segments, 0 errors): 3 outbound requests, all to our two servers (a license check and an update check). During translation there was only 1 request, the scheduled update check. A 5-minute repeat on our own domain gave the same result.</li>
<li><strong>nettop</strong> watched 7 processes (the app, WebView and both engine processes): no outbound data stream was seen.</li>
<li><strong>Marker words</strong> from the sample sentence: found neither in the app's log nor in the recorded requests.</li>
</ul>
${callout({ kind: "warn", title: "Limits of this test", text: "Measured only on macOS, one machine, one ad-hoc signed build. <strong>Windows has not been measured.</strong> This is an internal check, not an independent audit; the proxy mode cannot see non-HTTP traffic, so we covered that with nettop." })}

<h2 id="server">What do our servers store, and for how long?</h2>
<p>Our servers store the data below. The Free trial row applies to every device that registered for the trial; the other rows exist only if you buy a plan or activate a key.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Data</th><th scope="col">Purpose</th></tr></thead>
<tbody>
<tr><th scope="row">Email at purchase, time you consented to email processing</th><td>Sending and recovering keys; proof of consent</td></tr>
<tr><th scope="row">Orders: order code, plan, amount, time, status</th><td>Issuing and renewing licenses, reconciliation, accounting</td></tr>
<tr><th scope="row">License: key, plan, expiry, quota cycle</th><td>Granting the paid plan</td></tr>
<tr><th scope="row">Activated devices: hashed machine ID, device name, last check</th><td>One device per key, abuse prevention</td></tr>
<tr><th scope="row">Free trial: hashed machine ID, start and end times</th><td>One trial per device. No email or device name.</td></tr>
<tr><th scope="row">License change log</th><td>Support and incident investigation</td></tr>
<tr><th scope="row">Rate-limit counters (hashed values only, expire after about 3 hours)</th><td>Blocking key guessing and spam</td></tr>
</tbody></table></div>
<p><strong>Kept for:</strong> until you ask us to delete it; we never delete personal data on our own. We do not receive your card or bank account numbers and we do not send your email to PayOS. If you only use Free, our servers hold no email or device name for you.</p>

<h2 id="delete-data">How do I delete my data?</h2>
${steps(
  [
    { title: "Delete data on your computer", text: "Go to <strong>Settings › Privacy</strong>. <em>Delete all data</em> removes history and glossary; <em>Delete models and data</em> also removes downloaded models (on macOS, do this before you drag the app to the Trash). Your license, quota and settings are kept." },
    { title: "Ask us to delete server data", text: `Email ${MAIL} <strong>from the same email you used to buy</strong>, so we can confirm it is you. Under Vietnam's personal data protection law you also have the right to know what is stored, to withdraw consent and to complain. We handle requests within the time the law sets.` },
    { title: "What we do", text: "We remove your email and device name. Your license still works, but can no longer be recovered by email." },
  ],
  true,
)}
<p><strong>After deletion we still keep:</strong> the hashed machine ID (only to prevent abuse: one device per key, one Free trial per device), the time you once consented to email processing, and the order row at accounting level (order code, date, amount). Technical logs that expire on their own and Resend's mail logs are outside our deletion, under those parties' own policies.</p>

<h2 id="processors">Who else processes data?</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Party</th><th scope="col">Role</th><th scope="col">Data</th></tr></thead>
<tbody>
<tr><th scope="row">PayOS (Vietnam)</th><td>Processes VietQR payments</td><td>Order code, amount, order description. Not your email.</td></tr>
<tr><th scope="row">Cloudflare</th><td>Runs the license server and database; stores and serves models and updates</td><td>The data in the table above</td></tr>
<tr><th scope="row">Resend</th><td>Sends the email that contains your key</td><td>Your email and the message (with the key)</td></tr>
</tbody></table></div>
<p>Cloudflare and Resend operate servers outside Vietnam, so data may be processed abroad. We do not sell your data and do not share it for advertising.</p>

<h2 id="protections">Other protections</h2>
<ul>
<li><strong>Digital signatures:</strong> app updates are signature-checked before anything is written to disk; the model manifest is signed with Ed25519 and each file is checked against SHA-256; license tokens are signed with Ed25519 and can be verified offline. The app contains only the public key.</li>
<li><strong>Two engines in two separate processes:</strong> speech recognition opens no network port; translation (<code>llama-server</code>) listens only on 127.0.0.1 and uses a random API key on every run.</li>
<li><strong>Sensitive keys stay out of the app:</strong> the payment API key and signing keys live only on our servers; connections to our servers use HTTPS.</li>
<li><strong>Against counterfeit builds:</strong> on macOS the app checks that its signature is intact and the bundle id is right; a non-genuine build runs only the Free plan.</li>
</ul>

<h2 id="signing">Code signing today</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Platform</th><th scope="col">Status</th><th scope="col">What it means for you</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>Ad-hoc signed, <strong>not notarized</strong> (we do not have an Apple Developer ID yet)</td><td>macOS blocks the first launch: you need to click Open Anyway in System Settings › Privacy &amp; Security. After each update, macOS asks again with 5 Keychain dialogs and 1 audio-recording dialog.</td></tr>
<tr><th scope="row">Windows</th><td>Not released, <strong>no code-signing certificate yet</strong></td><td>At release, SmartScreen may warn at first.</td></tr>
</tbody></table></div>
<p>An ad-hoc signature does not tell Apple who the developer is, so get the installer only from us and compare the SHA-256 checksum we send with it. We will use a Developer ID when we can. See the <a href="/en/guide/install-macos/">macOS installation guide</a>.</p>

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

${ctaBand({ title: "Try it with control in your hands", text: "Translate right on your computer, with audio that never leaves it. 10-day Free trial, no card, no account.", primary: { href: "/en/download/", label: "Get the beta" }, secondary: { href: "/en/contact/", label: "Ask us" } })}
`,
};
