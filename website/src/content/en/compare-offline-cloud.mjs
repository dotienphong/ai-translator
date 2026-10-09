import { pageHero, ctaBand, callout, faq, docLayout } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

// There is no /compare/ index page, so the breadcrumb has two levels (a middle link would be broken).
const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Offline vs cloud translation", path: "/en/compare/offline-vs-cloud-translation/" },
];

export const COMPARE_FAQ = [
  {
    q: "Is offline translation as accurate as cloud translation?",
    a: "<p>We have no direct measurement comparing the two, so we draw no conclusion. Quality depends on the model, the language pair and how clear the audio is. Our own internal tests only compared open-source models with each other, not with any cloud service.</p>",
  },
  {
    q: "Does offline translation really need no internet?",
    a: "<p>Not while it is translating. You need a connection to download the models the first time, start the trial, buy a plan, check your license (a paid plan works offline for at most 14 days between checks) and update the app.</p>",
  },
  {
    q: "Is offline translation suitable for sensitive meetings?",
    a: "<p>The audio never leaves your computer, so no third party processes it. But overall safety also depends on your machine and your organization's rules, so ask your security team. The app does not record meetings, and transcript history is off by default.</p>",
  },
  {
    q: "What computer do I need for offline translation?",
    a: "<p>At least 8 GB of RAM (16 GB recommended), a Mac with Apple Silicon running macOS 14.2 or later, and about 1.3 GB (Lite pack) or 2.5 GB (Standard pack) of disk space for the models. The Windows build needs Windows 10/11 64-bit (x64) with a CPU that supports AVX2; Intel Macs and Windows ARM64 are not supported.</p>",
  },
  {
    q: "Can offline translation translate my voice for the other people?",
    a: "<p>Not yet. AI Translator works one way, from the audio playing on your computer into your language; it does not translate your voice for others to hear.</p>",
  },
];

const toc = [
  { level: 2, id: "comparison-table", text: "Comparison table" },
  { level: 2, id: "privacy", text: "Privacy" },
  { level: 2, id: "internet-and-bots", text: "Internet and bots" },
  { level: 2, id: "cost", text: "Cost" },
  { level: 2, id: "latency-hardware-languages", text: "Latency, hardware, languages" },
  { level: 2, id: "updates-integration", text: "Updates and integration" },
  { level: 2, id: "which-to-choose", text: "Which to choose" },
  { level: 2, id: "faq", text: "FAQ" },
];

export default {
  id: "compare-offline-cloud",
  lang: "en",
  path: "/en/compare/offline-vs-cloud-translation/",
  title: "Offline vs cloud meeting translation: the differences",
  description:
    "A balanced comparison of offline and cloud meeting translation: privacy, internet, bots, cost, latency, hardware, languages, and when to choose which approach.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(COMPARE_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "A balanced comparison of offline meeting translation (processed on your computer) and cloud translation (processed on a server): privacy, internet, bots, cost, latency, hardware, languages, updates, integration and when to choose which.",
  llmTitle: "Offline vs cloud meeting translation: the differences",
  body: () => `
${pageHero({
  crumbs,
  title: "Offline vs cloud translation: what is the difference?",
  lead: "Cloud translation sends your audio to the provider's servers to be processed; offline translation processes it on your own computer, as AI Translator does. Offline keeps the audio on your machine, keeps working without a connection and needs no bot, but it needs a capable computer and currently covers five languages. Cloud is light on your machine, usually covers more languages and can be built into the meeting platform, but your audio has to leave your computer.",
  meta: "<span>Updated 8 Oct 2026</span>",
})}

<section class="section"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
<h2 id="comparison-table">Comparison table</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Criterion</th><th scope="col">Cloud translation</th><th scope="col">Offline translation (AI Translator)</th></tr></thead>
<tbody>
<tr><th scope="row">Where the AI model runs</th><td>On the provider's cloud</td><td>On your computer</td></tr>
<tr><th scope="row">Where audio is processed</th><td>On the provider's servers</td><td>On your computer</td></tr>
<tr><th scope="row">Does audio leave your machine?</th><td>Yes</td><td>No, it stays in memory</td></tr>
<tr><th scope="row">Internet needed while translating</th><td>Yes</td><td>No</td></tr>
<tr><th scope="row">Bot or plugin</th><td>Built-in features need none; third-party tools may</td><td>None, works with any app that plays sound</td></tr>
<tr><th scope="row">Cost of one more minute</th><td>Uses the provider's server resources</td><td>Uses none of the provider's infrastructure; it uses your machine</td></tr>
<tr><th scope="row">Latency</th><td>Depends on your connection and server load</td><td>Depends on your hardware</td></tr>
<tr><th scope="row">Number of languages</th><td>Usually more</td><td>5 languages</td></tr>
<tr><th scope="row">Computer requirements</th><td>Low</td><td>From 8 GB of RAM, 1.3–2.5 GB model download</td></tr>
<tr><th scope="row">Model updates</th><td>The provider updates it, you get it at once</td><td>You download new models; the app asks first</td></tr>
<tr><th scope="row">Integration</th><td>Built into the meeting platform</td><td>A separate app with its own subtitle bar</td></tr>
</tbody></table></div>

<h2 id="privacy">Privacy and where processing happens</h2>
<p>With cloud translation your audio is sent to the provider's servers. Many providers have contracts and security certifications, so cloud is not automatically less safe, but you have to trust their policies and weigh them against your organization's rules.</p>
<p>With AI Translator, speech recognition and translation run on your machine: audio stays in memory, is not written to disk and is not sent anywhere. A proxy check on macOS showed no audio or transcript text leaving the computer while it translated (Windows has not been measured). See <a href="/en/data-security/">data and security</a>.</p>

<h2 id="internet-and-bots">Internet, bots and the meeting host</h2>
<p>Cloud translation needs a steady connection during the meeting. AI Translator keeps translating on a flaky connection or when the connection drops. It only needs the internet to download models, start the trial, activate, buy a plan, check the license (a paid plan needs a check at least every 14 days) and update, so a network that is completely cut off from the internet is not a good fit.</p>
<p>Built-in captions may need the host or an administrator to enable them, and third-party tools may need a bot to join the room. AI Translator runs on your side, so nobody has to do anything; in return, the other participants are not told. If rules require it, you tell them yourself (see <a href="/en/solutions/online-meeting-translation/">the online meeting solution</a>).</p>

<h2 id="cost">Cost and quota</h2>
<p>With cloud, every minute of translation uses the provider's server resources. Translated captions built into the big meeting platforms are usually offered only on higher paid plans. With offline translation the computing happens on your machine, so one more minute costs us no extra infrastructure. AI Translator's quotas (30 minutes a day during the trial, 50 hours per 30 days on Monthly, unlimited on Yearly) are a pricing policy, not a technical limit.</p>
<p>The cost moves to your machine: RAM, disk and power (we have not measured battery use). See <a href="/en/pricing/">pricing</a>.</p>

<h2 id="latency-hardware-languages">Latency, hardware requirements and languages</h2>
<p>Cloud pushes the heavy work to servers, so it can run on weak machines, but latency also depends on your connection. Offline translation needs a capable computer: AI Translator needs at least 8 GB of RAM (16 GB recommended), a Mac with Apple Silicon on macOS 14.2 or later, and a one-time model download of 1.3 GB (Lite) or 2.5 GB (Standard).</p>
<p>On a Mac M4 Pro the median latency is 0.76–1.03 seconds with the Standard pack. Less powerful machines will see higher latency; we have not measured an M1 Mac. Cloud services usually support more languages than AI Translator's five (English, 中文, 日本語, 한국어, Tiếng Việt). We do not compare translation quality, because there is no shared measurement.</p>

<h2 id="updates-integration">Model updates and integration</h2>
<p>A cloud service is updated by its provider on the server, so you get improvements without doing anything. An offline model stays as it is on your machine until you download a new one; the app asks before downloading.</p>
<p>On integration, translated captions built into the meeting platform are more convenient when everyone uses the same platform and your plan already includes the feature: nothing extra to install, no windows to arrange. AI Translator is a separate app with its own subtitle bar; in exchange it works with any meeting app, webinar or video.</p>

<h2 id="which-to-choose">Which should you choose?</h2>
<h3>Cloud is the better fit when</h3>
<ul>
<li>You need a language beyond AI Translator's five</li>
<li>Your computer is weak, has under 8 GB of RAM, or you would rather not download models</li>
<li>Your meeting platform already includes translated captions in your plan and everyone uses it</li>
</ul>
<h3>AI Translator (offline) is the better fit when</h3>
<ul>
<li>Audio must not leave your machine because of sensitive content or internal rules</li>
<li>Your connection is unreliable or often drops (the app still needs the internet now and then to check the license)</li>
<li>You meet on several different apps, or watch webinars and videos</li>
<li>Your platform plan has no translated captions and you do not want a bot in the room</li>
</ul>
${callout({ title: "The two are not mutually exclusive.", text: "You can use built-in captions where they exist and AI Translator for the other meetings and videos. See <a href=\"/en/features/\">features</a> and the <a href=\"/en/guide/quick-start/\">quick start guide</a>." })}

<h2 id="faq">Frequently asked questions</h2>
${faq(COMPARE_FAQ)}
`,
})}
</div></section>

${ctaBand({ title: "Try offline translation on your own meeting", text: "Start with the free 10-day trial, 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/data-security/", label: "How we handle data" } })}
`,
};
