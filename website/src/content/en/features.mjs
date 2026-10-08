import { pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Features", path: "/en/features/" },
];

export default {
  id: "features",
  lang: "en",
  path: "/en/features/",
  title: "AI Translator features: subtitles, glossary, export",
  description:
    "Live translated subtitles in 5 languages, a customizable subtitle bar, glossary, history, TXT/SRT/Markdown export and shortcuts. All offline, on your computer.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Complete list of what the app does today (live translated subtitles, subtitle bar, glossary, history, export, shortcuts, models), with performance figures and the conditions they were measured under.",
  llmTitle: "AI Translator features",
  body: () => `
${pageHero({ crumbs, title: "Everything you need to follow a meeting in another language", lead: "This is what AI Translator can do today, exactly as it works in the app. Anything that is only in the paid plans is marked clearly." })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">Features at a glance</h2>
<div class="grid grid-4 reveal">
<a class="card card-link" href="#live-translation"><h3>Live translation</h3><p class="muted">5 languages, auto-detect</p></a>
<a class="card card-link" href="#subtitle-bar"><h3>Subtitle bar</h3><p class="muted">Drag, lock, resize the text</p></a>
<a class="card card-link" href="#transcript"><h3>Transcript</h3><p class="muted">History, export (Pro)</p></a>
<a class="card card-link" href="#glossary"><h3>Glossary</h3><p class="muted">Names and terms (Pro)</p></a>
<a class="card card-link" href="#audio-source"><h3>Audio source</h3><p class="muted">Any meeting app, no bot</p></a>
<a class="card card-link" href="#shortcuts"><h3>Shortcuts and tray</h3><p class="muted">Control without leaving the meeting</p></a>
<a class="card card-link" href="#models"><h3>Models and hardware</h3><p class="muted">Standard and Lite packs</p></a>
<a class="card card-link" href="#performance"><h3>Performance</h3><p class="muted">Measured, with conditions</p></a>
</div>
</div></section>

<section class="section" id="live-translation"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Live translation</span>
<h2>Listen, recognize, translate and show subtitles in one loop</h2>
<p>AI Translator captures the audio playing on your computer, splits it into sentences, recognizes the speech, translates it and shows the result on the subtitle bar. On a Mac M4 Pro the full translation appears about a second (median) after the speaker finishes a sentence; other computers may be slower, see the <a href=\"#performance\">measurements</a>.</p>
${checkList([
  "<strong>Five languages</strong> for both the source audio and the translation: English, 中文, 日本語, 한국어, Tiếng Việt",
  "<strong>Automatic detection</strong> of the spoken language among the ones you tick under <em>Languages spoken in the meeting</em>, or <strong>lock</strong> a single one in <em>Source language</em> when you know what will be spoken",
  "A sentence that is already in the language you want to read is shown as it is, not translated again",
  "A sentence that is not final yet appears dimmer, then is replaced by the complete sentence when the speaker carries on",
  "Filters out the \"phantom\" sentences that speech recognition tends to invent over music or silence",
  "Recognized Chinese text is converted to Simplified characters",
])}
</div>
<div>
${appShot({ slug: "app-home-free", lang: "en", alt: "AI Translator main screen with the Languages card: the language to translate into and the languages spoken in the meeting", caption: "The Languages card: choose the language you want to read and the languages that may be spoken in the meeting." })}
</div>
</div>
${callout({ title: "One direction: from the meeting to you.", text: "AI Translator translates the audio coming out of your computer into your language. It does not translate your own voice into the meeting yet. If both sides install the app, each person sees subtitles of the other side." })}
</div></section>

<section class="section section-alt" id="subtitle-bar"><div class="container">
<div class="split reverse">
<div class="stack-lg reveal">
<span class="eyebrow">Subtitle bar</span>
<h2>A floating bar you can customize, out of your meeting's way</h2>
<p>The subtitle bar is its own borderless window with a translucent background. It stays on top and never takes focus from your meeting app, so you can keep typing in chat or clicking buttons as usual.</p>
${checkList([
  "<strong>Drag</strong> it to move it, drag an edge or corner to resize it; its position and size are remembered for each screen",
  "<strong>Text size</strong> 14–48 px, <strong>5 text colors</strong> (white, yellow, green, light blue, orange), <strong>5 background colors</strong>, background opacity 0–100%",
  "<strong>Lock</strong>: mouse clicks pass through the bar and no buttons get in the way; unlock it with a shortcut or from the tray menu",
  "Keeps the last 1,000 sentences; <strong>scroll back</strong> with the mouse wheel or a shortcut, and the <em>Latest</em> button takes you back to the current sentence",
  "The <strong>original text</strong> in small type above the translation (on by default, can be turned off)",
  "Small indicators in the corner: listening with sound detected, loading models, falling behind, less than 5 minutes of translation left",
])}
<p class="more-link"><a href="/en/guide/subtitle-bar-and-shortcuts/">Learn how to use the subtitle bar and shortcuts ${icon("arrow-right")}</a></p>
</div>
<div class="stack-lg">
${overlayShot({ slug: "overlay-custom", lang: "en", alt: "Subtitle bar with yellow text on a navy background at a large font size", caption: "The same bar with yellow text, a navy background and a size of 26." })}
${appShot({ slug: "app-settings-subtitles", lang: "en", alt: "Subtitles settings: font size, text color, background color, background opacity and the option to show the original text", caption: "Settings › Subtitles: every change shows on the bar immediately." })}
</div>
</div>
</div></section>

<section class="section" id="audio-source"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-settings-audio", lang: "en", alt: "Audio settings listing the apps that are playing sound so you can choose one as the source", caption: "Settings › Audio: listen to the whole system or to just one app (macOS)." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Audio source</span>
<h2>Any meeting app, no bot, no plugin</h2>
<p>Because the app captures system audio, AI Translator works with anything that makes sound: Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars, videos and online courses.</p>
${checkList([
  "<strong>macOS:</strong> listen to the whole system (except the app itself) or to a single app that is playing sound, so notification sounds from other apps are not translated by mistake",
  "<strong>Windows (when released):</strong> the default playback device, or a device you choose",
  "The source reopens automatically when you switch playback devices, for example when you plug in headphones or connect Bluetooth",
  "<strong>Pause that ends a sentence</strong> is adjustable from 50 to 800&nbsp;ms: shorter gives you subtitles sooner, longer cuts fewer sentences in half",
])}
<p>On macOS, the first time you press Start the system asks for the <em>system audio recording</em> permission. The app does not use the microphone. <a href="/en/guide/macos-audio-permission/">See how to grant the audio permission</a>.</p>
</div>
</div>
</div></section>

<section class="section section-alt" id="transcript"><div class="container">
${sectionHead({ eyebrow: "Transcript, history and export", title: "Keep what you heard, your way", text: "The transcript of the current session works on every plan. Saving history and exporting to a file are Pro features.", center: true })}
<div class="split">
<div>
${appShot({ slug: "app-transcript", lang: "en", alt: "Transcript with time, original sentence and translation, a search box, a Copy all button and an export format picker", caption: "The transcript: search, copy, export to TXT, SRT or Markdown." })}
</div>
<div class="stack-lg reveal">
${checkList([
  "<strong>Transcript:</strong> every line has a time, the original sentence and the translation; search and copy all on every plan",
  "<strong>Export</strong> to TXT, SRT or Markdown; for SRT you choose whether the text is the translation or the original <span class=\"badge badge-pro\">Pro</span>",
  "<strong>Session history:</strong> review, open and delete sessions one by one, or all at once <span class=\"badge badge-pro\">Pro</span>",
  "History is <strong>off by default</strong>. When you turn it on, it is stored on your computer, encrypted, with the key kept in the Keychain (macOS) or Credential Manager (Windows)",
  "<strong>Delete all data</strong> with one button (after a confirmation), on every plan",
])}
<p class="more-link"><a href="/en/guide/history-and-export/">Read the guide to history and export ${icon("arrow-right")}</a></p>
${appShot({ slug: "app-history", lang: "en", alt: "History screen listing saved sessions with date and time, minutes, number of sentences and a preview", caption: "History: sessions saved on your computer." })}
</div>
</div>
</div></section>

<section class="section" id="glossary"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-glossary", lang: "en", alt: "Glossary with pairs of source terms and translations and buttons to import and export CSV", caption: "Glossary: add, edit, delete, import and export CSV." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Glossary <span class="badge badge-pro">Pro</span></span>
<h2>Hints for names and terms, passed to the translator</h2>
<p>Add source → target pairs for product names, partner names and industry terms. When a sentence contains one of them, the app passes it to the translator as a hint.</p>
${checkList([
  "Up to <strong>500</strong> terms, with CSV import and export (two columns, UTF-8)",
  "Matching ignores case; Chinese, Japanese and Korean terms also match inside words",
  "Up to 20 relevant entries are used for each sentence",
])}
<p class="small muted">Terms are hints for the translator, so correct use is not guaranteed every time. The app says so too.</p>
<p class="more-link"><a href="/en/guide/glossary/">Read the glossary guide ${icon("arrow-right")}</a></p>
</div>
</div>
</div></section>

<section class="section section-alt" id="shortcuts"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Shortcuts and system tray</span>
<h2>Control it without leaving the meeting</h2>
<p>Five global shortcuts work even when AI Translator is not the window in front. You can change each one in Settings › Shortcuts.</p>
<div class="table-wrap" role="region" aria-label="Keyboard shortcuts" tabindex="0"><table>
<thead><tr><th scope="col">Action</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">Start or stop translating</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">Show or hide subtitles</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">Lock or unlock subtitles</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">Scroll subtitles up (older sentences)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">Scroll subtitles down (newer sentences)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
<p class="small muted">On macOS, ⌃ is Control and ⌥ is Option. A shortcut needs at least one of Ctrl, Alt or Cmd/Win. The Windows version is not released yet.</p>
<p>The menu bar icon (macOS) or system tray icon (Windows) lets you start or stop translating, show or hide and lock the subtitles, and open the main window. Closing the window only hides the app in the tray; to quit completely, choose <em>Quit</em>.</p>
</div>
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "en", alt: "Shortcuts settings showing the five default shortcuts on macOS", caption: "Settings › Shortcuts: press Change, then the new key combination." })}
</div>
</div>
</div></section>

<section class="section" id="models"><div class="container stack-lg">
<div class="model-intro">
<div class="stack-lg reveal">
<span class="eyebrow">Models and your computer</span>
<h2>Two model packs, and the app recommends the one that fits</h2>
<p>The recognition and translation models are downloaded once and then run entirely on your computer. The app checks your RAM, free disk space and graphics card to recommend a pack.</p>
</div>
</div>
<div class="table-wrap reveal" role="region" aria-label="Model packs compared" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">Detail</span></th><th scope="col">Standard pack</th><th scope="col">Lite pack</th></tr></thead>
<tbody>
<tr><th scope="row">Download</th><td>about 2.5 GB</td><td>about 1.3 GB</td></tr>
<tr><th scope="row">Recognition</th><td>Whisper large-v3-turbo</td><td>Whisper small</td></tr>
<tr><th scope="row">Translation</th><td>Hy-MT2-1.8B (Q8_0)</td><td>Hy-MT2-1.8B (Q4_K_M)</td></tr>
<tr><th scope="row">Engine RAM (M4 Pro)</th><td>about 2.9 GiB</td><td>about 1.8–1.9 GiB</td></tr>
<tr><th scope="row">The app recommends it for</th><td>A Mac with 16 GB or more; Windows with 16 GB or more and a discrete card with 6 GB of VRAM</td><td>Computers with 8 GB up to under 16 GB, or Windows without a capable discrete card</td></tr>
</tbody></table></div>
<p class="small muted">The Lite pack recognizes speech less clearly than Standard in Vietnamese, Japanese, Korean and Chinese. If you listen to those languages a lot, choose the Standard pack.</p>
${facts([
  ["macOS", "macOS 14.2 or later, Apple Silicon (M1 or newer)<small>No version for Intel Macs</small>"],
  ["RAM", "At least 8 GB, 16 GB recommended"],
  ["Disk", "At least 1 GB free on top of the size of the model being downloaded"],
  ["Windows", "Windows 10/11 64-bit, CPU with AVX2: not released yet<small>For the Standard pack, a discrete Vulkan-capable graphics card with 6 GB or more of VRAM is recommended</small>"],
])}
</div></section>

<section class="section section-alt" id="performance"><div class="container">
${sectionHead({ eyebrow: "Performance", title: "Real measurements, with the conditions", text: "We publish only what we measured, on the machine we measured it on, and we say which machines we have not tested.", center: true })}
<div class="table-wrap reveal" role="region" aria-label="Measured performance" tabindex="0"><table>
<thead><tr><th scope="col">Measurement (Mac M4 Pro 24 GB, macOS 26, Metal GPU)</th><th scope="col">Standard pack</th><th scope="col">Lite pack</th></tr></thead>
<tbody>
<tr><th scope="row">Median (p50) delay: from the speaker finishing a sentence to the complete translation appearing</th><td>0.76–1.03 s</td><td>0.61–0.84 s</td></tr>
<tr><th scope="row">p90 delay</th><td>0.94–1.34 s</td><td>0.73–1.14 s</td></tr>
<tr><th scope="row">First translated word appears (p50)</th><td>0.63–0.69 s</td><td>0.52–0.57 s</td></tr>
<tr><th scope="row">RAM of the two engine processes</th><td>2.9 GiB</td><td>1.8–1.9 GiB</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${feature({ icon: "gauge", title: "Long sessions", text: "One continuous session of 5 h 23 min (a lecture video in English, on an ad-hoc-signed release build): 6,019 segments, no errors, median delay 0.48 s. In a 2-hour stability test, no process was restarted." })}
${feature({ icon: "languages", title: "Translation and recognition quality", text: "In an internal test on 320 sentences in five directions involving Vietnamese, Hy-MT2-1.8B scored 0.837 on COMET: clearly above MADLAD-3B (0.779) and NLLB-600M (0.736), and on par with HY-MT1.5-1.8B (0.833). We only compared open-source models with each other. On clean read speech, Vietnamese recognition in the Standard pack has a word error rate of 8.7%. That is read speech, not real meeting conversation." })}
</div>
${callout({ kind: "warn", title: "What we have not measured, and do not promise", text: "All the figures above were measured on a single Mac M4 Pro, with a 300&nbsp;ms pause to end a sentence (the app's current default is 50&nbsp;ms; the 5-hour session used the default). We have not measured: a base Mac M1, 8 GB computers, discrete Windows graphics cards, battery and power use, accuracy on real meeting conversation or over Bluetooth headsets, and translation quality for directions that do not involve Vietnamese (they work, but we have no quality score to publish). A preliminary test on one Windows laptop with integrated graphics showed that the Standard pack did not meet our latency target." })}
</div></section>

<section class="section" id="technology"><div class="container">
${sectionHead({ eyebrow: "Technology", title: "Built on open-source components, running on your computer", text: "AI Translator is a commercial product; the components below are third-party open-source projects, listed in full on the About screen of the app.", center: true })}
<div class="grid grid-3">
${feature({ icon: "mic", title: "Whisper + whisper.cpp", text: "OpenAI's multilingual speech recognition (MIT license), run through whisper.cpp." })}
${feature({ icon: "languages", title: "Hy-MT2-1.8B + llama.cpp", text: "Tencent's translation model (Apache 2.0 license) in GGUF format, run through llama.cpp." })}
${feature({ icon: "captions", title: "Silero VAD", text: "Detects speech so sentences can be cut at the right place. MIT license, runs in pure Rust inside the app." })}
${feature({ icon: "cpu", title: "Tauri 2, Rust, React", text: "A Rust core with a React interface. The two engines run in separate processes, so a GPU driver failure cannot take the app down." })}
${feature({ icon: "zap", title: "Metal and Vulkan", text: "GPU acceleration: Metal on macOS, Vulkan on Windows. It falls back to the CPU if the GPU fails." })}
${feature({ icon: "lock", title: "SQLCipher", text: "History, if you turn it on, is encrypted with SQLCipher; the random key is kept in your operating system's key store." })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "By plan", title: "Which feature is in which plan", center: true })}
<div class="table-wrap reveal" role="region" aria-label="Features by plan" tabindex="0"><table class="compare">
<thead><tr><th scope="col">Feature</th><th scope="col">Free (trial)</th><th scope="col">Monthly</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">Live translated subtitles, 5 languages</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Customizable subtitle bar, shortcuts, tray</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">View, search and copy the transcript</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Glossary (up to 500 terms)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Save session history</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Export to TXT, SRT, Markdown</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Translation time</th><td>30 min per day, for 10 days</td><td>50 hours per 30 days</td><td>Unlimited, for 365 days</td></tr>
<tr><th scope="row">Price (VND)</th><td>0 ₫</td><td>50,000 ₫</td><td>500,000 ₫</td></tr>
</tbody></table></div>
<p class="center-text reveal"><a class="btn btn-primary" href="/en/pricing/">See the full pricing details ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Try it on your real meetings", text: "A free 10-day trial with 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Get the beta" }, secondary: { href: "/en/guide/quick-start/", label: "Read the quick-start guide" } })}
`,
};
