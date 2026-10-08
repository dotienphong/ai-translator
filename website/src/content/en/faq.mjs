import { pageHero, faq, callout, docLayout, ctaBand } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "FAQ", path: "/en/faq/" },
];

// Each group: id (anchor), h2 title, questions. Every answer starts with the direct answer.
const GROUPS = [
  {
    id: "overview",
    title: "Overview",
    items: [
      {
        q: "What is AI Translator?",
        a: `<p>AI Translator is a desktop app that shows live translated subtitles for any audio playing on your computer, such as a meeting, webinar or video. It recognizes speech and translates it on your own machine, then shows the translation on a floating subtitle bar. See the <a href="/en/features/">full list of features</a>.</p>`,
      },
      {
        q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
        a: `<p>Yes. The app captures system audio, so it works with any app that plays sound and needs no per-app setup: you just press Start. On macOS you can also choose to listen to a single app only (Settings › Audio) so notification sounds are not translated.</p><p>We have tried it on macOS 26 with Zoom, Google Meet (Chrome, Safari, Edge), Microsoft Teams and Zalo PC; we have not tried every macOS version and every app. These names are used only to describe compatibility, and AI Translator is not affiliated with them. See <a href="/en/solutions/online-meeting-translation/">meeting translation</a>.</p>`,
      },
      {
        q: "Do I need a bot, a plugin or an account?",
        a: `<p>None of the three. No bot joins your meeting, no plugin goes into your meeting app, and there is no sign-in. The Free plan only needs you to accept the terms; paid plans are activated with a license key sent by email.</p>`,
      },
      {
        q: "Where do I download AI Translator? Is there a Windows version?",
        a: `<p>There is no public download yet. AI Translator is in beta: you request the macOS installer (macOS 14.2 or later, Apple Silicon) by email on the <a href="/en/download/">Download page</a>. Windows 10/11 is coming soon, with no release date yet.</p>`,
      },
      {
        q: "Is AI Translator open source?",
        a: `<p>No. AI Translator is a commercial product used under the license in the <a href="/en/terms/">Terms of use</a>. It does use many open-source components from third parties, such as Whisper, whisper.cpp, llama.cpp, Hy-MT2 and Tauri. The full list of licenses is inside the app (About › Open-source licenses), with a summary on <a href="/en/about/#technology">About AI Translator</a>.</p>`,
      },
    ],
  },
  {
    id: "languages-and-quality",
    title: "Languages and quality",
    items: [
      {
        q: "Which languages does it support?",
        a: `<p>Five languages, for both the source audio and the translation: English, 中文 (Chinese), 日本語 (Japanese), 한국어 (Korean) and Tiếng Việt (Vietnamese). The app interface is in Vietnamese and English.</p><p>The app detects the spoken language among the ones you tick, or you can lock a single language. Translation quality has been measured for the eight directions that involve Vietnamese (English, Chinese, Japanese and Korean into Vietnamese, and Vietnamese into English, Chinese, Japanese and Korean). The other directions run, but we have not measured a quality score for them.</p>`,
      },
      {
        q: "Which direction does it translate? Does it translate my own voice?",
        a: `<p>One direction: from the audio playing on your computer into your language. The app does not yet translate your voice to play into the meeting. If both sides install the app, each side sees the other's subtitles.</p>`,
      },
      {
        q: "Are the translations accurate?",
        a: `<p>Not perfectly: translations can be wrong, incomplete or out of context, especially with technical terms, proper names and unclear speech. Do not rely on them for important decisions.</p><p>The glossary (a Pro feature) helps the translator use the right names and terms, but does not guarantee it every time. We do not publish an overall accuracy rate because we have not measured it on real meeting conversations; the measurements we have, with their conditions, are on the <a href="/en/features/">Features page</a>.</p>`,
      },
      {
        q: "What is the difference between the Standard and Lite model packs?",
        a: `<p>The Standard pack (about 2.5 GB) recognizes speech better, especially Vietnamese, Japanese, Korean and Chinese. The Lite pack (about 1.3 GB) is smaller and suits 8 GB machines. The app recommends a pack based on your RAM and graphics card.</p><p>On a standard set of read-aloud clips, the word error rate for Vietnamese is 8.7% with Standard and 22.5% with Lite (Mac M4 Pro, read speech rather than real meetings). If you listen to these languages a lot, use Standard.</p>`,
      },
      {
        q: "How long is the subtitle delay?",
        a: `<p>On a Mac M4 Pro, the median delay is under about 1.1 seconds from the moment a speaker finishes a sentence to the full translation appearing; the first translated words show after about 0.5 to 0.7 seconds. That is a measurement on one specific machine.</p><p>We have not measured a base Mac M1, 8 GB machines or Windows discrete graphics cards. A preliminary test on a Windows laptop with integrated graphics showed that the Standard pack does not meet our delay target. Details and conditions are on the <a href="/en/features/">Features page</a>.</p>`,
      },
    ],
  },
  {
    id: "privacy-and-data",
    title: "Privacy and data",
    items: [
      {
        q: "Does AI Translator work offline?",
        a: `<p>Yes: speech recognition and translation run 100% on your computer and need no internet once the models are downloaded. You still need the internet occasionally for a few things: the first model download (about 1.3 GB or 2.5 GB), the first Free trial registration, buying a plan, license checks (a paid plan works offline for at most 14 days between two checks) and app updates. See <a href="/en/compare/offline-vs-cloud-translation/">offline vs cloud translation</a>.</p>`,
      },
      {
        q: "Is my meeting audio sent anywhere?",
        a: `<p>No. Audio stays in RAM, is never written to disk and never sent over the network. We checked with a proxy and nettop on macOS: while translating, the app sends no audio or transcript text out. Windows has not been measured yet. Details are on <a href="/en/data-security/">Data and security</a>.</p>`,
      },
      {
        q: "Are there ads or data collection?",
        a: `<p>There are no ads and no analytics, and the app sends no automatic crash reports. Our servers store only your email (when you buy), orders, licenses, a hashed machine ID and the Free trial dates, so we can issue keys and keep to one device per key and one trial per device. We do not sell your data or share it for advertising.</p>`,
      },
      {
        q: "Are transcripts saved?",
        a: `<p>Not by default. The transcript of the running session is held in memory; you can view, search and copy it on every plan. Saving history (encrypted, on your computer only) and exporting to TXT, SRT or Markdown are Pro features. See the <a href="/en/guide/history-and-export/">history and export guide</a>.</p>`,
      },
      {
        q: "Do I need to tell the other people in the meeting? Is this legal?",
        a: `<p>We do not give legal advice. What we can say: AI Translator does not record meetings to disk; it only shows translated subtitles and, optionally, saves a transcript.</p><p>If the law or your company policy requires it, you are responsible for telling the other people in the meeting that you use a translation tool. The app reminds you at first-run setup, and the <a href="/en/terms/">Terms of use</a> say so explicitly.</p>`,
      },
      {
        q: "How do I delete my data?",
        a: `<p>On your computer: Settings › Privacy › Delete all data (history and glossary), or Delete models and data. On our servers: email support@aitranslator.io.vn from the email you used to buy and ask for deletion or anonymization. We remove your email and device name, and still keep the hashed machine ID, the time of consent and the accounting-level order row. See <a href="/en/data-security/#delete-data">how to request deletion</a>.</p>`,
      },
    ],
  },
  {
    id: "install-and-requirements",
    title: "Install and system requirements",
    items: [
      {
        q: "Will AI Translator run on my computer?",
        a: `<p>The beta runs on Apple Silicon Macs (M1 or later) with macOS 14.2 or later; at least 8 GB of RAM, 16 GB recommended. Intel Macs are not supported. Windows 10/11 64-bit (CPU with AVX2) is coming soon; Windows ARM64 is not supported.</p><p>If a machine has less than 8 GB of RAM or does not meet the requirements, the app explains why and does not download models. For a base Mac M1 specifically, we have no measurements yet.</p>`,
      },
      {
        q: "How much RAM and disk space does it need?",
        a: `<p>Models take about 2.5 GB of disk (Standard) or 1.3 GB (Lite), and you need 1 GB more free while downloading. On a Mac M4 Pro, the two engine processes use about 2.9 GiB of RAM (Standard) or 1.8 to 1.9 GiB (Lite), plus roughly 0.3 GB for the app. The engines shut down after 10 minutes without translating, so the app sitting in the menu bar does not hold that RAM. We have not measured other machines.</p>`,
      },
      {
        q: "Why does macOS say it cannot verify the developer?",
        a: `<p>Because the macOS build is currently ad-hoc signed and not notarized: we do not have an Apple Developer ID yet. macOS therefore blocks the first launch. Open System Settings › Privacy &amp; Security, scroll to the bottom, click Open Anyway next to AI Translator and confirm with your password or Touch ID. From macOS 15, the right-click › Open trick no longer works. See the <a href="/en/guide/install-macos/">macOS installation guide</a>.</p>`,
      },
      {
        q: "What permissions does it need on macOS?",
        a: `<p>Only System Audio Recording permission; AI Translator does not use the microphone. macOS asks the first time you press Start. If you decline, macOS shows no error and the app simply receives silence; the app will prompt you to turn it back on. See the <a href="/en/guide/macos-audio-permission/">audio permission guide</a>.</p>`,
      },
      {
        q: "How do I uninstall AI Translator?",
        a: `<p>On macOS, first choose Settings › Privacy › Delete models and data, then drag the app to the Trash (macOS gives no prompt when you remove an app). On Windows, once released, the uninstaller has an option to delete app data, which also removes the models. Deleting data or uninstalling does not remove your license or the quota you have left.</p>`,
      },
    ],
  },
  {
    id: "plans-and-payment",
    title: "Plans and payment",
    items: [
      {
        q: "Is the Free plan really free?",
        a: `<p>Free is a trial, not a permanent free plan: 10 days from the first time a device registers for the trial, up to 30 minutes of translation per day, once per device. Uninstalling and reinstalling does not restart the 10 days. After the trial you need Monthly (50,000 ₫, 50 hours per 30 days) or Yearly (500,000 ₫, unlimited for 365 days). See <a href="/en/pricing/">pricing</a>.</p>`,
      },
      {
        q: "How is translation time counted?",
        a: `<p>Only speech that has been translated is counted, by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The quota is per device, and the app warns you when less than 5 minutes remain.</p>`,
      },
      {
        q: "How do I pay? Can I use Visa or PayPal?",
        a: `<p>Not yet. For now we accept only bank transfers from a Vietnamese bank, in VND, through VietQR (the PayOS gateway). The app draws the QR code right on the Upgrade screen; the code works for 15 minutes, and when PayOS confirms the payment the app activates the plan and your key is emailed to you. There are no recurring payments and no e-invoices yet.</p>`,
      },
      {
        q: "Do plans renew automatically? What happens at expiry?",
        a: `<p>No automatic renewal: each plan is a prepaid order that simply ends, and you are never charged again. The app reminds you 7 days ahead. At expiry the device goes back to Free if it is still within its 10-day trial; after the trial you need to buy a plan to keep translating, and Pro features (history, glossary, export) are locked. Renewing the same plan adds another 30 days (Monthly) or 365 days (Yearly).</p>`,
      },
      {
        q: "Can I get a refund?",
        a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise. Send the request within 7 days of the payment date to support@aitranslator.io.vn with the order code. Changing plans is not refundable. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
      },
      {
        q: "How many devices can I use a key on? How do I move to another one?",
        a: `<p>One key works on one device; reinstalling the app on the same device does not count as a new one. To move, on the old device go to Settings › License › Deactivate this computer; or on the new device enter the key and choose “Remove that computer and use this one”.</p><p>If two devices activate at once, the key is locked on both until one of them removes it. Changing devices too often within 30 days locks the key temporarily and you will need to contact support. The Free trial is per device, so it cannot be moved. See the <a href="/en/guide/buy-and-activate/">guide to buying and activating a key</a>.</p>`,
      },
      {
        q: "I lost my key. What do I do?",
        a: `<p>Go to Settings › License › Lost your key?, enter the email you used to buy and choose Send my keys: every valid key for that email is sent to that same email. If that does not work, email support@aitranslator.io.vn from the email you used to buy.</p>`,
      },
    ],
  },
  {
    id: "daily-use",
    title: "Everyday use",
    items: [
      {
        q: "Does the subtitle bar cover my meeting? Can I adjust it?",
        a: `<p>You can adjust all of it. The bar always stays on top and does not take focus from your meeting app. Drag it to move it, drag an edge to resize it, and choose the font size (14 to 48 px), text color, background color and background opacity. Turn on Lock so the mouse passes through the bar; hide it quickly with the shortcut or the ✕ button when you hover over it. See the <a href="/en/guide/subtitle-bar-and-shortcuts/">subtitle bar and shortcuts guide</a>.</p>`,
      },
      {
        q: "What are the default shortcuts?",
        a: `<p>On macOS: ⌃⌥T starts or stops translating, ⌃⌥H shows or hides subtitles, ⌃⌥L locks or unlocks them, and ⌃⌥PageUp and ⌃⌥PageDown scroll to older and newer sentences (⌃ is Control, ⌥ is Option). On Windows it is Ctrl+Alt with T, H, L, PageUp and PageDown. You can change them under Settings › Shortcuts, so if one clashes with another app, just change it.</p>`,
      },
      {
        q: "Does closing the window quit the app?",
        a: `<p>No. Closing the window only hides it to the menu bar (macOS) or the system tray (Windows); shortcuts and a running session keep going. To quit completely, choose Quit from the menu bar or tray icon. On a Mac, ⌘Q does not quit the app either.</p>`,
      },
      {
        q: "Does the app update itself?",
        a: `<p>Yes, through the Stable or Beta channel (Settings › General › Update channel). The app checks at launch and every 24 hours, verifies the signature before writing any file, and then invites you to restart when it is idle. An installer sent by email at the start may not auto-update yet. On the ad-hoc signed macOS build, each update makes macOS ask again for Keychain access and audio recording; the app warns you in advance.</p>`,
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

// Plain text for the schema: strip tags, decode basic entities.
const toText = (html) =>
  html
    .replace(/<\/p>\s*<p>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export default {
  id: "faq",
  lang: "en",
  path: "/en/faq/",
  title: "AI Translator FAQ: use, privacy, plans and payment",
  description:
    "Short answers about AI Translator: using it with Zoom, Teams and Meet, languages, working offline, privacy, system requirements, plans, payment and everyday use.",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(ALL.map((f) => ({ q: f.q, a: toText(f.a) })))],
  llm: "Frequently asked questions: overview, languages and quality, privacy and data, install and system requirements, plans and payment, everyday use.",
  llmTitle: "AI Translator frequently asked questions",
  body: () => `
${pageHero({
  crumbs,
  title: "Frequently asked questions about AI Translator",
  lead: "These are the questions we get most, from using it with Zoom, Teams and Meet to privacy, system requirements and payment. Each answer starts with the short version; the rest is detail and conditions.",
  meta: `<span>${ALL.length} questions in ${GROUPS.length} groups</span><span>Updated 8 October 2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: GROUPS.map((g) => ({ level: 2, id: g.id, text: g.title })),
  tocTitle: "Question groups",
  body: `<p>Pick a group from the contents, or scroll down and open any question.</p>
${GROUPS.map((g) => `<h2 id="${g.id}">${g.title}</h2>\n${faq(g.items)}`).join("\n")}
${callout({ title: "Did not find your answer?", text: `Email <a href="mailto:support@aitranslator.io.vn">support@aitranslator.io.vn</a> or see the <a href="/en/contact/">Contact page</a> for what to include. We read every message.` })}`,
})}
</div></section>

${ctaBand({ title: "Still have a question? Ask us", text: "Send a short email; we read every message. Or get the beta and try it on your own meeting.", primary: { href: "/en/contact/", label: "Contact and support" }, secondary: { href: "/en/download/", label: "Get the beta" } })}
`,
};
