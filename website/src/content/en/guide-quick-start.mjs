import { pageHero, callout, appShot, overlayShot, facts, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Quick start", path: "/en/guide/quick-start/" },
];

const toc = [
  { level: 2, id: "what-you-need", text: "What you need" },
  { level: 2, id: "install-and-open", text: "Install and open the app" },
  { level: 2, id: "first-time-setup", text: "First-time setup in seven steps" },
  { level: 2, id: "first-meeting", text: "Translate your first meeting" },
  { level: 2, id: "common-problems", text: "Common first-run problems" },
];

// Plain text for the HowTo structured data; the visible version is in body.
const HOWTO_STEPS = [
  { name: "Install the app and open it", text: "Drag AI Translator into Applications, open it, click Done on the warning dialog, then click Open Anyway in System Settings > Privacy & Security." },
  { name: "Choose the interface language", text: "Choose Tiếng Việt or English and click Next. This also sets your default translation language." },
  { name: "Accept the terms", text: "Read the License Agreement (EULA) and the Privacy Policy, tick the box and click Next. One internet connection is needed to start the Free trial." },
  { name: "Choose and download a model", text: "Pick the Standard pack (about 2.5 GB) or the Lite pack (about 1.3 GB) as the app recommends, and wait for the download." },
  { name: "Allow system audio recording", text: "When macOS asks for System Audio Recording permission, allow it. The app does not use the microphone." },
  { name: "Choose your languages", text: "Pick the language you want to read in Translate into, and the languages that may be spoken in the meeting." },
  { name: "Try it", text: "Click Play a sample sentence and watch the subtitle appear on the subtitle bar." },
  { name: "Read the notes and finish", text: "Read the privacy notes and the note about the menu bar, then click Start using AI Translator." },
  { name: "Translate your first meeting", text: "Open a meeting or video with sound, click Start and read the subtitles on the floating bar. Click Stop when done and open the transcript if you need it." },
];

export default {
  id: "guide-quick-start",
  lang: "en",
  path: "/en/guide/quick-start/",
  title: "AI Translator quick start for macOS",
  description:
    "Quick start for AI Translator on macOS: install the app, allow system audio recording, download the model, try a sample and translate your first meeting live.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "From installer to first subtitles on macOS: install the app, seven first-run setup steps, start translating, the subtitle bar, the transcript and common first-run problems.",
  llmTitle: "AI Translator quick start",
  schema: [
    howTo({
      name: "Install AI Translator on macOS and translate your first meeting",
      description: "The steps from the installer to your first translated subtitles: install, first-time setup, start translating.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator quick start",
  lead: "To use AI Translator for the first time on macOS, install the app, step through a one-time setup (language, terms, model download, audio permission, a sample sentence), then press Start when your meeting has sound. Translated subtitles appear on a floating bar, and both speech recognition and translation run on your own Mac.",
  meta: "<span>For macOS 14.2 or later, Apple Silicon</span><span>Updated October 8, 2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
<h2 id="what-you-need">What you need</h2>
${facts([
  ["Chip", "Apple Silicon (M1 or later)<small>There is no Intel Mac build yet.</small>"],
  ["Operating system", "macOS 14.2 or later"],
  ["Memory", "8 GB minimum, 16 GB recommended"],
  ["Installer", "A .dmg file of about 9 MB<small>Sent by email when you sign up for the beta on the <a href=\"/en/download/\">Download</a> page</small>"],
  ["Disk space", "1.3 GB (Lite pack) or 2.5 GB (Standard pack)<small>Plus 1 GB free while downloading the model</small>"],
  ["Internet", "Needed to download the model and register the Free trial<small>After that, recognition and translation run offline</small>"],
])}
${callout({ title: "The Windows version is not released yet.", text: "This guide covers macOS only. There is no Windows release date yet." })}

<h2 id="install-and-open">Install and open the app</h2>
<ol>
<li>Open the <code>.dmg</code> file and drag <strong>AI Translator</strong> into the <strong>Applications</strong> folder.</li>
<li>Open AI Translator. macOS blocks the first launch because the current build is ad-hoc signed and not yet notarized by Apple. Click <strong>Done</strong>.</li>
<li>Go to <strong>System Settings › Privacy &amp; Security</strong>, scroll to the bottom, click <strong>Open Anyway</strong> next to AI Translator, then confirm with your password or Touch ID.</li>
</ol>
<p>For the details, including how to check the installer's SHA-256, see the <a href="/en/guide/install-macos/">guide to installing AI Translator on macOS</a>.</p>

<h2 id="first-time-setup">First-time setup in seven steps</h2>
<p>On first launch the app shows a setup wizard of 9 screens (the top line reads “Step 1 of 9”). This guide groups them into seven steps. Every screen has <strong>Back</strong> and <strong>Next</strong> buttons.</p>

<h3>Step 1. Choose the interface language</h3>
<p>Choose <strong>Tiếng Việt</strong> or <strong>English</strong> and click Next. This also sets the language you read subtitles in; you can change it again in step 5.</p>
${appShot({ slug: "app-onboarding-1", lang: "en", alt: "First screen of the setup wizard with two options, Tiếng Việt and English, for the interface language", caption: "Step 1 of 9: interface language." })}

<h3>Step 2. Accept the terms</h3>
<p>Read the License Agreement (EULA) and the Privacy Policy, then tick “I have read and agree…”. Until you do, Next stays disabled. When you click Next, the app registers your Mac's Free trial with the server, so you need an internet connection once.</p>
${appShot({ slug: "app-onboarding-2", lang: "en", alt: "Terms of use step with two collapsible documents and the required consent checkbox", caption: "Step 2 of 9: terms of use." })}

<h3>Step 3. Choose and download a model</h3>
<p>The app shows your memory and free disk space and recommends a pack: a Mac with about 16 GB of RAM or more gets the <strong>Standard</strong> pack (about 2.5 GB), any other Mac gets the <strong>Lite</strong> pack (about 1.3 GB). Choose a pack and the next screen downloads it, with Pause and Resume buttons. You can click Next while it downloads; the model keeps downloading in the background. When it finishes, the app says “Download complete. AI Translator is ready to translate.”</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-3", lang: "en", alt: "Computer check step showing memory, free disk space and the recommended model pack", caption: "Step 3 of 9: check this computer, choose a pack." })}
${appShot({ slug: "app-onboarding-4", lang: "en", alt: "Model download step with a progress bar and a pause button", caption: "Step 4 of 9: download the model." })}
</div>

<h3>Step 4. Allow system audio recording</h3>
<p>macOS asks for <strong>System Audio Recording</strong> permission the first time AI Translator captures audio. Allow it. If you refused by mistake, the <strong>Open System Settings</strong> button on this screen takes you to the right place. The app does not use the microphone. More in <a href="/en/guide/macos-audio-permission/">granting system audio recording permission</a>.</p>
${appShot({ slug: "app-onboarding-5", lang: "en", alt: "Allow system audio recording step with an Open System Settings button", caption: "Step 5 of 9: system audio recording permission (macOS only)." })}

<h3>Step 5. Choose your languages</h3>
<p>In <strong>Translate into</strong>, pick the language you want to read. Tick the languages that may be spoken in the meeting (all five by default). Leave <strong>Source language</strong> on “Detect automatically”, or lock one language if you know the meeting uses only that one.</p>
${appShot({ slug: "app-onboarding-6", lang: "en", alt: "Choose your languages step with the Translate into menu, five spoken-language checkboxes and the Source language menu", caption: "Step 6 of 9: choose your languages." })}

<h3>Step 6. Try it</h3>
<p>Click <strong>Play a sample sentence</strong>. The app plays an English sentence through your speakers and its subtitle appears on the subtitle bar, followed by “It works. Translation: …”. Turn the volume up if your Mac is muted. If macOS asks for the audio recording permission now, allow it.</p>
${appShot({ slug: "app-onboarding-7", lang: "en", alt: "Try it step with a Play a sample sentence button", caption: "Step 7 of 9: try it." })}

<h3>Step 7. Read the notes and finish</h3>
<p>Audio never leaves your Mac. If the law or your company requires it, you are responsible for telling other participants that you use a translation tool. Closing the window only hides the app in the menu bar. Click <strong>Start using AI Translator</strong> to reach the main screen.</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-8", lang: "en", alt: "Your privacy step saying audio never leaves the computer and that you must inform other participants if required", caption: "Step 8 of 9: your privacy." })}
${appShot({ slug: "app-onboarding-9", lang: "en", alt: "Last step saying AI Translator keeps running in the menu bar when you close the window", caption: "Step 9 of 9: it keeps running in the menu bar." })}
</div>

<h2 id="first-meeting">Translate your first meeting</h2>
<ol>
<li>On the main screen, check “Translate into” and “Languages spoken in the meeting” in the <strong>Languages</strong> card.</li>
<li>The <strong>Audio source</strong> card defaults to “Whole system, except this app”. To translate just one app, click <strong>Change</strong>. The “Input level” bar moves when your Mac plays sound.</li>
<li>Open a meeting or a video with sound and click <strong>Start</strong> (or press ${keys(["⌃", "⌥", "T"])}). The status goes from “Starting” to “Translating”; for the first few seconds the bar may read “Loading models…”.</li>
<li>Read the subtitles on the floating bar. The “Listening” dot turns green when sound arrives; a lighter line is a provisional subtitle that will be replaced by the finished sentence.</li>
<li>Click <strong>Stop</strong> when you are done. The bar keeps its last lines so you can finish reading, and <strong>Open the transcript</strong> appears, showing time, original text and translation. <strong>Copy all</strong> works on every plan.</li>
</ol>
${appShot({ slug: "app-home-running", lang: "en", alt: "Main screen while translating: Translating status, a Stop button, the Languages card and the input level bar", caption: "The main screen while translating." })}
<p>How to drag, lock, hide and restyle the bar is covered in <a href="/en/guide/subtitle-bar-and-shortcuts/">the subtitle bar and shortcuts guide</a>. The Free plan gives you 30 minutes of translation a day during the 10-day trial.</p>
${overlayShot({ slug: "overlay-default", lang: "en", alt: "Default subtitle bar showing the original sentence in small type above the translation over a meeting background", caption: "The default subtitle bar: original in small type, translation below." })}

<h2 id="common-problems">Common first-run problems</h2>
<ul>
<li><strong>macOS will not open the app.</strong> Do the Open Anyway step above; details in the <a href="/en/guide/install-macos/">installation guide</a>.</li>
<li><strong>No subtitles, and the main screen says “Nothing is heard although an app is playing sound…”.</strong> macOS has not allowed system audio recording; see the <a href="/en/guide/macos-audio-permission/">permission guide</a>.</li>
<li><strong>The sample sentence shows no subtitle.</strong> Check that your speakers are not muted and try again.</li>
<li><strong>The model download stops halfway.</strong> Click <strong>Resume</strong> to continue from where it stopped.</li>
<li><strong>You cannot see the subtitle bar.</strong> It may be hidden: click <strong>Show</strong> in the Subtitle bar card, or press ${keys(["⌃", "⌥", "H"])}.</li>
<li><strong>The first run takes a while.</strong> After an install or update the app may say “Preparing for first use. This can take a few minutes.”</li>
</ul>
<p>Other problems are covered in <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>

${docNav(
  [
    { href: "/en/guide/", kicker: "All guides", title: "AI Translator user guides" },
    { href: "/en/guide/install-macos/", kicker: "Next", title: "Install AI Translator on macOS" },
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Related", title: "The subtitle bar and shortcuts" },
  ],
  "Related guides",
)}
`,
})}
</div></section>
`,
};
