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
        a: `<p>AI Translator is a desktop app that shows live translated subtitles for any audio playing on your computer, such as a meeting, webinar or video, and, if you choose, for people speaking in the room through the microphone. It recognizes speech and translates it on your own machine, then shows the translation on a floating subtitle bar. See the <a href="/en/features/">full list of features</a>.</p>`,
      },
      {
        q: "Is there an offline app that translates meeting subtitles on my computer?",
        a: `<p>Yes. AI Translator (aitranslator.vn) is a desktop app for macOS 14.2 or later (Apple Silicon) and Windows 10/11 64-bit (x64) that shows live translated subtitles for any audio playing on your computer. Speech recognition and translation run on the device, so no internet is needed while translating and the audio never leaves your machine. It supports English, Chinese, Japanese, Korean and Vietnamese, with a 10-day free trial.</p>`,
      },
      {
        q: "How do I translate a Zoom meeting into my language without a bot?",
        a: `<p>Open AI Translator, choose the language you want to read and press Start. The app listens to the Zoom audio playing on your computer and shows translated subtitles in a floating bar. No bot joins the meeting and the host does not need to enable anything; other participants are not notified, so tell them yourself if your rules require it.</p>`,
      },
      {
        q: "Can I get translated meeting subtitles for free?",
        a: `<p>AI Translator has a free 10-day trial with up to 30 minutes of translation a day, no card and no account. After that you need a prepaid plan: Monthly 50,000 ₫ (50 hours per 30 days), 6 Months 269,000 ₫ (100 hours per 30 days, for 180 days) or Yearly 500,000 ₫ (unlimited for 365 days). Free is a trial, not a permanent free plan.</p>`,
      },
      {
        q: "Does it show bilingual subtitles (original and translation)?",
        a: `<p>Yes. The “Show the original text above the translation” option in Settings › Subtitles (on by default) shows the original sentence in small text above the translation; you can turn it off.</p>`,
      },
      {
        q: "Can it translate an English video playing in my browser?",
        a: `<p>Yes. The app listens to the audio playing on your computer, so it works with videos playing in a browser with no extension. We have tested capturing audio from Google Meet running in Chrome, Safari and Edge (macOS 26.6.2); we have not tested individual video platforms.</p>`,
      },
      {
        q: "Can I translate a livestream into my language? What about TikTok Live?",
        a: `<p>Yes, when you watch a livestream in English, Chinese, Japanese or Korean on a computer. We have not tested each livestream platform (TikTok Live, YouTube, Facebook Live). We have tested it with videos playing in a browser, and the app listens to the audio playing on your machine, so it does not depend on the website. See <a href="/en/solutions/livestream-translation/">livestream translation</a> and <a href="/en/solutions/tiktok-live-translation/">translating TikTok Live</a>.</p>`,
      },
      {
        q: "Can I use AI Translator on a phone to translate a livestream?",
        a: `<p>No. AI Translator only runs on macOS (Apple Silicon) and Windows 10/11. To get subtitles for a livestream, open it on a computer.</p>`,
      },
      {
        q: "I stream live. Can I translate for my viewers?",
        a: `<p>No. AI Translator has no feature that adds subtitles or a translated voice to your livestream. Subtitles appear only on the screen of the person using the app, translating the sound that plays on their computer into the language they choose.</p>`,
      },
      {
        q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
        a: `<p>Yes. The app captures system audio, so it does not depend on the meeting app and needs no per-app setup: you just press Start. On macOS you can also choose to listen to a single app only (Settings › Audio) so notification sounds are not translated.</p><p>We have checked system-audio capture on macOS 26 with Zoom, Google Meet (Chrome, Safari, Edge), Microsoft Teams and Zalo PC: the speaker's audio was captured clearly. That was a check of the capture component, confirmed by the tester, not a formal acceptance test on the release build, and we have not tried every macOS version or every app. These names are used only to describe compatibility, and AI Translator is not affiliated with them. See <a href="/en/solutions/online-meeting-translation/">meeting translation</a>.</p>`,
      },
      {
        q: "Do I need a bot, a plugin or an account?",
        a: `<p>None of the three. No bot joins your meeting, no plugin goes into your meeting app, and there is no sign-in. The Free plan only needs you to accept the terms; paid plans are activated with a license key sent by email.</p>`,
      },
      {
        q: "Where do I download AI Translator? Is there a Windows version?",
        a: `<p>On macOS (14.2 or later, Apple Silicon) you install with one command pasted into Terminal; it is on the <a href="/en/download/">Download page</a> and the app opens directly, with no Open Anyway. There is no .dmg download button yet. The Windows build (10/11, 64-bit) also installs with one command pasted into PowerShell on the same page. The Windows build is not code-signed yet: installed with the command SmartScreen does not ask, while an .exe downloaded in a browser may be warned about.</p>`,
      },
      {
        q: "Is AI Translator open source?",
        a: `<p>No. AI Translator is a commercial product used under the license in the <a href="/en/terms/">Terms of use</a>. It does use many open-source components from third parties. The full list of licenses is inside the app (About › Open-source licenses), with a summary on <a href="/en/about/#technology">About AI Translator</a>.</p>`,
      },
    ],
  },
  {
    id: "languages-and-quality",
    title: "Languages and quality",
    items: [
      {
        q: "Which languages does it support?",
        a: `<p>Five languages, for both the source audio and the translation: English, 中文 (Chinese), 日本語 (Japanese), 한국어 (Korean) and Tiếng Việt (Vietnamese). The app interface is in Vietnamese, English, Japanese, Chinese (Simplified) and Korean; on first launch it follows your computer's language.</p><p>The app detects the spoken language among the ones you tick, or you can lock a single language. Translation quality has been measured for the eight directions that involve Vietnamese (English, Chinese, Japanese and Korean into Vietnamese, and Vietnamese into English, Chinese, Japanese and Korean). The other directions run, but we have not measured a quality score for them.</p>`,
      },
      {
        q: "Will more languages be added?",
        a: `<p>We plan to add more languages in the future. There is no schedule or list yet, and the app currently supports five languages: English, Chinese (中文), Japanese (日本語), Korean (한국어) and Vietnamese (Tiếng Việt). When a new language arrives, we will update this page and the <a href="/en/features/">Features page</a>.</p>`,
      },
      {
        q: "Which direction does it translate? Does it translate my own voice?",
        a: `<p>Subtitles go one direction: from the audio playing on your computer into your language. The app does not yet translate your voice to play into the meeting. To reply in writing, use <a href="/en/guide/type-and-translate/">Type &amp; Translate</a>: type a message in your own language and the app pastes the translation into the chat box. If both sides install the app, each side sees the other's subtitles.</p>`,
      },
      {
        q: "Are the translations accurate?",
        a: `<p>Not perfectly: translations can be wrong, incomplete or out of context, especially with technical terms, proper names and unclear speech. Do not rely on them for important decisions.</p><p>The glossary (a Pro feature) hints your names and terms to the translator, but does not guarantee it uses them correctly every time. We do not publish an overall accuracy rate because we have not measured it on real meeting conversations; the measurements we have, with their conditions, are on the <a href="/en/features/">Features page</a>.</p>`,
      },
      {
        q: "What is the difference between the Standard and Lite model packs?",
        a: `<p>The Standard pack (about 2.5 GB) makes fewer recognition errors, especially in Vietnamese, Japanese, Korean and Chinese. The Lite pack (about 1.3 GB) is smaller and meant for machines with less RAM (8 GB minimum). The app recommends a pack based on your RAM and graphics card.</p><p>On a standard set of read-aloud clips, the word error rate for Vietnamese is 8.7% with Standard and 22.5% with Lite (Mac M4 Pro, read speech rather than real meetings). If you listen to these languages a lot and your machine has enough RAM (16 GB recommended), use Standard.</p>`,
      },
      {
        q: "How long is the subtitle delay?",
        a: `<p>On a Mac M4 Pro, the median delay is under about 1.1 seconds from the moment a speaker finishes a sentence to the full translation appearing; the first translated words show after about 0.5 to 0.7 seconds, with either model pack. That is a measurement on one specific machine, using audio played back in real time.</p><p>We have not measured a base Mac M1, 8 GB machines or Windows discrete graphics cards. A preliminary test on a Windows laptop with integrated graphics showed that the Standard pack does not meet our delay target. Details and conditions are on the <a href="/en/features/">Features page</a>.</p>`,
      },
    ],
  },
  {
    id: "privacy-and-data",
    title: "Privacy and data",
    items: [
      {
        q: "Does AI Translator use cloud AI or cloud models?",
        a: `<p>No. Both speech recognition and translation are AI models that run on your own computer. No cloud AI service takes part in recognizing or translating your meeting, so the audio, the transcript and the translation do not pass through any third party. The network is only used for things other than translating: checking your license, payments, downloading models and updating the app.</p>`,
      },
      {
        q: "Where is the data from my conversations stored?",
        a: `<p>Entirely on your computer. Audio exists only in RAM while translating; the transcript and translation appear on your screen and live in the session's memory; history is off by default, and if you turn it on it is stored encrypted on your machine. Our server holds no conversation data, only your email (when you buy), orders, licenses and device-activation details (a hashed machine ID and device name). See <a href="/en/data-security/">Data and security</a>.</p>`,
      },
      {
        q: "Does AI Translator work offline?",
        a: `<p>Yes: speech recognition and translation run 100% on your computer and need no internet once the models are downloaded. You still need the internet occasionally for a few things: the first model download (about 1.3 GB or 2.5 GB), the first Free trial registration, buying a plan, license checks (a paid plan works offline for at most 14 days between two checks) and app updates. See <a href="/en/compare/offline-vs-cloud-translation/">offline vs cloud translation</a>.</p>`,
      },
      {
        q: "Is my meeting audio sent anywhere?",
        a: `<p>No. Audio stays in RAM, is never written to disk and never sent over the network. We checked with a proxy and nettop on macOS: while translating, the app sends no audio or transcript text out. Details are on<a href="/en/data-security/">Data and security</a>.</p>`,
      },
      {
        q: "Are there ads or data collection?",
        a: `<p>There are no ads and no analytics. When the app hits an error, it automatically sends an error report with personal data scrubbed out (no audio, no transcript text, no keys and no email); you can turn it off in Settings › Privacy. Our servers store only your email (when you buy, or when you choose to leave it in the support chat), orders, licenses, a hashed machine ID, the device name (when you activate a key), the Free trial dates, a license change log, error reports (kept for 30 days) and support chat messages if you use the chat (kept for 90 days), so we can issue keys, keep to one device per key and one trial per device, fix bugs and reply to you. We do not sell your data or share it for advertising. Details are on <a href="/en/data-security/#error-reports">Data and security</a>.</p>`,
      },
      {
        q: "Are transcripts saved?",
        a: `<p>Not by default. The transcript of the running session is held in memory; you can view, search and copy it on every plan. Saving history (encrypted, on your computer only) and exporting to TXT, SRT or Markdown are Pro features. See the <a href="/en/guide/history-and-export/">history and export guide</a>.</p>`,
      },
      {
        q: "Do I need to tell the other people in the meeting? Is this legal?",
        a: `<p>We do not give legal advice. What we can say: AI Translator does not record meetings to disk; it only shows translated subtitles and, optionally, saves a transcript.</p><p>If the law or your company policy requires it, you are responsible for telling the other people in the meeting that you use a translation tool. The app reminds you at the Privacy step of first-run setup, and the <a href="/en/terms/">Terms of use</a> say so explicitly, together with the requirement to follow your organization's security rules and not to use the app to eavesdrop.</p>`,
      },
      {
        q: "How do I delete my data?",
        a: `<p>On your computer: Settings › Privacy › Delete all data (history and glossary), or Delete models and data. On our servers: email support@aitranslator.vn from the email you used to buy and ask for deletion or anonymization. We remove your email and device name, and still keep the hashed machine ID, the time of consent and the accounting-level order row. See <a href="/en/data-security/#delete-data">how to request deletion</a>.</p>`,
      },
    ],
  },
  {
    id: "install-and-requirements",
    title: "Install and system requirements",
    items: [
      {
        q: "Will AI Translator run on my computer?",
        a: `<p>AI Translator runs on Apple Silicon Macs (M1 or later) with macOS 14.2 or later; at least 8 GB of RAM, 16 GB recommended. Intel Macs are not supported. The Windows build runs on Windows 10/11 64-bit (x64) with a CPU that supports AVX2, at least 8 GB of RAM, 16 GB recommended; Windows ARM64 is not supported.</p><p>If a machine has less than 8 GB of RAM or does not meet the requirements, the app explains why and does not download models. For a base Mac M1 and for Windows PCs, we have no latency measurements yet.</p>`,
      },
      {
        q: "How much RAM and disk space does it need?",
        a: `<p>Models take about 2.5 GB of disk (Standard) or 1.3 GB (Lite), and you need 1 GB more free while downloading. On a Mac M4 Pro, the AI processing uses about 2.9 GiB of RAM (Standard) or 1.8 to 1.9 GiB (Lite), plus roughly 0.3 GB for the app. The AI processing shuts down after 10 minutes without translating, so the app sitting in the menu bar does not hold several GB of RAM. We have not measured other machines.</p>`,
      },
      {
        q: "Why does macOS say it cannot verify the developer?",
        a: `<p>Only if you download the .dmg in a browser: the macOS build is currently ad-hoc signed and not notarized (we do not have an Apple Developer ID yet), so macOS blocks the first launch of a file from the internet. Installing with the <a href="/en/download/#install-macos">command in Terminal</a> is not blocked. If you already downloaded the .dmg, open System Settings › Privacy &amp; Security, scroll to the bottom, click Open Anyway next to AI Translator and confirm with your password or Touch ID. From macOS 15, the right-click › Open trick no longer works. See the <a href="/en/guide/install-macos/">macOS installation guide</a>.</p>`,
      },
      {
        q: "Why does Windows show “Windows protected your PC” when I install it?",
        a: `<p>Only if you download the .exe in a browser: the Windows build is not code-signed yet (we do not have a Windows code-signing certificate), so Microsoft Defender SmartScreen may block the installer the first time. Installing with the <a href="/en/download/#install-windows">command in PowerShell</a> is not asked about. If you already downloaded the .exe: If the file came from us and the SHA-256 matches, click More info, check that the App line shows the installer's file name, then click Run anyway. Publisher showing Unknown publisher is normal for an unsigned build. Once we have a certificate, the warnings will decrease over time. If Windows 11 says an app is blocked and offers no way past it, that is Smart App Control (see the guide). See the <a href="/en/guide/install-windows/">Windows installation guide</a>.</p>`,
      },
      {
        q: "What permissions does it need on macOS?",
        a: `<p>To translate computer audio, only System Audio Recording permission is needed; macOS asks the first time you press Start. If you decline, macOS shows no error and the app simply receives silence; the app will prompt you to turn it back on. See the <a href="/en/guide/macos-audio-permission/">audio permission guide</a>. When you choose a source with the microphone (Microphone, or Computer audio + Microphone), macOS also asks for the Microphone permission (see <a href="/en/guide/macos-audio-permission/#microphone-permission">Microphone permission</a>). Type &amp; Translate can also ask for the Accessibility permission, only to paste the translation into the chat box for you; without it, the app copies the translation for you to paste (see <a href="/en/guide/type-and-translate/#accessibility">Type &amp; Translate</a>). Windows needs neither permission.</p>`,
      },
      {
        q: "Can it translate people speaking in the room?",
        a: `<p>Yes. In Settings › Audio, choose the <strong>Microphone</strong> source (people in the room only) or <strong>Computer audio + Microphone</strong> (hybrid meetings). A laptop microphone works best for people speaking nearby, about 1&nbsp;m away, in a quiet room; use an external microphone for larger rooms. With Computer audio + Microphone, someone in the room who speaks at the same moment as someone online may be missed; headphones give the best results. When you choose a source with the microphone, the app captures it for the whole session, even if you have muted yourself in the meeting app; the audio stays in RAM and is never written to disk or sent anywhere. See <a href="/en/features/#microphone">how it works</a>.</p>`,
      },
      {
        q: "How do I uninstall AI Translator?",
        a: `<p>On macOS, first choose Settings › Privacy › Delete models and data, then drag the app to the Trash (macOS gives no prompt when you remove an app). On Windows, uninstall from Settings › Apps › Installed apps; the uninstaller has an option to delete app data, which also removes the models (see the <a href="/en/guide/install-windows/#uninstall">guide</a>). Deleting data or uninstalling does not remove your license or the quota you have left.</p>`,
      },
    ],
  },
  {
    id: "plans-and-payment",
    title: "Plans and payment",
    items: [
      {
        q: "Is the Free plan really free?",
        a: `<p>Free is a trial, not a permanent free plan: 10 days from the first time a device registers for the trial, up to 30 minutes of translation per day, once per device. Uninstalling and reinstalling does not restart the 10 days. After the trial you need Monthly (50,000 ₫, 50 hours per 30 days), 6 Months (269,000 ₫, 100 hours per 30 days, for 180 days) or Yearly (500,000 ₫, unlimited for 365 days). See <a href="/en/pricing/">pricing</a>.</p>`,
      },
      {
        q: "How is translation time counted?",
        a: `<p>Only speech that has been translated is counted, by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The quota is per device, and the app warns you when less than 5 minutes remain. Messages translated with Type &amp; Translate are not counted.</p>`,
      },
      {
        q: "How do I pay? Can I pay by international card?",
        a: `<p>Yes. There are two ways, chosen under <strong>Payment method</strong> at the top of the Upgrade screen (if you do not see it, update the app to the latest version): <strong>VietQR bank transfer in VND</strong> (from a Vietnamese bank, through the PayOS gateway; the QR code is drawn in the app and works for 15 minutes) or <strong>international card in USD</strong> (the Creem payment page opens in your browser; Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax). Creem is the merchant of record (reseller) for orders paid by card and handles the payment and the tax on it; Creem's Buyer Terms: <a href="https://www.creem.io/buyer-terms" rel="noopener">https://www.creem.io/buyer-terms</a>. When the payment gateway confirms the payment, the app activates the plan and your key is emailed to you. For a card, pay within 30 minutes of creating the order; if you have paid but the app says the order did not go through or the payment time has passed, do not pay again: your key is still emailed (see <a href="/en/guide/buy-and-activate/#refunds">payment problems</a>).</p><p>There is no PayPal. Apple Pay or Google Pay are available only when Creem's payment page shows that option. Cards are not accepted in some countries, per Creem's list. There are no recurring payments; VietQR orders have no electronic invoice yet, while card orders get a receipt from Creem.</p>`,
      },
      {
        q: "Do plans renew automatically? What happens at expiry?",
        a: `<p>No automatic renewal: each plan is a prepaid order that simply ends, and you are never charged again. The app reminds you 7 days ahead. At expiry the device goes back to Free if it is still within its 10-day trial; after the trial you need to buy a plan to keep translating, and Pro features (history, glossary, export) are locked. Renewing the same plan adds another 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly).</p>`,
      },
      {
        q: "Can I get a refund?",
        a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise. Send the request to us first, within 7 days of the payment date, to support@aitranslator.vn with the order code. Changing plans is not refundable. For card payments Creem is the merchant of record, so Creem may also refund them under Creem's terms. When an order is refunded (in full or in part, including through a card dispute), we may shorten the time that order added to your license, or revoke the license if it consists only of that order; this is not automatic: the operator decides case by case. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
      },
      {
        q: "How many devices can I use a key on? How do I move to another one?",
        a: `<p>One key works on one device; reinstalling the app on the same device does not count as a new one. To move, on the old device go to Settings › License › Deactivate this computer; or on the new device enter the key and choose “Remove that computer and use this one”.</p><p>While a key is in use on another device, the second one is blocked by default; only if you deliberately choose “Activate on this computer anyway” and confirm is the key locked on both until one of them removes it. Changing devices too often within 30 days locks the key temporarily and you will need to contact support. The Free trial is per device, so it cannot be moved. See the <a href="/en/guide/buy-and-activate/">guide to buying and activating a key</a>.</p>`,
      },
      {
        q: "I lost my key. What do I do?",
        a: `<p>Go to Settings › License › Lost your key?, enter the email you used to buy and choose Send my keys: every valid key for that email is sent to that same email. If that does not work, email support@aitranslator.vn from the email you used to buy.</p>`,
      },
    ],
  },
  {
    id: "daily-use",
    title: "Everyday use",
    items: [
      {
        q: "Does the subtitle bar cover my meeting? Can I adjust it?",
        a: `<p>You can adjust a lot. The bar always stays on top and does not take focus from your meeting app. Drag it to move it, drag an edge to resize it, and choose the font size (14 to 48 px), text color, background color and background opacity. Turn on Lock so the mouse passes through the bar; hide it quickly with the shortcut (translation keeps going), or click the ✕ button that appears on hover to close the subtitles and stop translating. See the <a href="/en/guide/subtitle-bar-and-shortcuts/">subtitle bar and shortcuts guide</a>.</p>`,
      },
      {
        q: "What are the default shortcuts?",
        a: `<p>On macOS: ⌃⌥T starts or stops translating, ⌃⌥H shows or hides subtitles, ⌃⌥L locks or unlocks them, and ⌃⌥PageUp and ⌃⌥PageDown scroll to older and newer sentences (⌃ is Control, ⌥ is Option). On Windows it is Ctrl+Alt with T, H, L, PageUp and PageDown. ⌃⌥G (Ctrl+Alt+G) opens the Type &amp; Translate box. You can change them under Settings › Shortcuts, so if one clashes with another app, just change it.</p>`,
      },
      {
        q: "What is Type & Translate? Is the text I type sent anywhere?",
        a: `<p>Type &amp; Translate lets you message people in their language from the chat box you are using: press ⌃⌥G (Ctrl+Alt+G), type in your own language, press Enter to paste the translation into the chat box, then press Enter again to send. What you type and its translation are processed on your computer, not sent over the network and not written to disk; the app only copies the translation to the clipboard to paste it. Type &amp; Translate is included in every active plan and does not use translation time. See the <a href="/en/guide/type-and-translate/">Type &amp; Translate guide</a>.</p>`,
      },
      {
        q: "Does closing the window quit the app?",
        a: `<p>No. Closing the window only hides it to the menu bar (macOS) or the system tray (Windows); shortcuts and a running session keep going. To quit completely, choose Quit from the menu bar or tray icon. On a Mac, ⌘Q does not quit the app either.</p>`,
      },
      {
        q: "Does the app update itself?",
        a: `<p>Yes, through the Stable or Beta channel (Settings › General › Update channel). The app checks at launch and every 24 hours, verifies the signature before writing any file, and then invites you to restart when it is idle. To check right away, click <strong>Check for updates</strong> in the block at the top of Settings › General, next to “Version …” (after each check the app shows “Checked at HH:MM:SS”), or choose “Check for updates…” from the app icon menu. The Windows build has the same two channels; you can also run the install command again to update. On the ad-hoc signed macOS build, each update makes macOS ask again with 1 Keychain dialog and possibly the audio-recording permission; the app warns you in advance.</p>`,
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
  modified: "2026-10-25",
  schema: [faqPage(ALL.map((f) => ({ q: f.q, a: toText(f.a) })))],
  llm: "Frequently asked questions: overview, languages and quality, privacy and data, install and system requirements, plans and payment, everyday use.",
  llmTitle: "AI Translator frequently asked questions",
  body: () => `
${pageHero({
  crumbs,
  title: "Frequently asked questions about AI Translator",
  lead: "The questions people usually ask when getting to know AI Translator, from using it with Zoom, Teams and Meet to privacy, system requirements and payment. Each answer starts with the short version; the rest is detail and conditions.",
  meta: `<span>${ALL.length} questions in ${GROUPS.length} groups</span><span>Updated {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: GROUPS.map((g) => ({ level: 2, id: g.id, text: g.title })),
  tocTitle: "Question groups",
  body: `<p>Pick a group from the contents, or scroll down and open any question.</p>
${GROUPS.map((g) => `<h2 id="${g.id}">${g.title}</h2>\n${faq(g.items)}`).join("\n")}
${callout({ title: "Did not find your answer?", text: `Email <a href="mailto:support@aitranslator.vn">support@aitranslator.vn</a> or see the <a href="/en/contact/">Contact page</a> for what to include.` })}`,
})}
</div></section>

${ctaBand({ title: "Still have a question? Ask us", text: "Send us a short email. Or download the app and try it on your own meeting.", primary: { href: "/en/contact/", label: "Contact and support" }, secondary: { href: "/en/download/", label: "Download" } })}
`,
};
