import { legalPage } from "../legal.mjs";

export default legalPage({
  id: "privacy",
  lang: "en",
  path: "/en/privacy/",
  file: "privacy.en.md",
  title: "Privacy Policy of AI Translator",
  description: "AI Translator processes audio entirely on your computer. This policy lists what stays on your device, what our server stores, how long, and how to request deletion.",
  crumbs: [{ name: "Home", path: "/en/" }, { name: "Privacy policy", path: "/en/privacy/" }],
  heroLead: "Meeting audio is processed entirely on your computer. Below is all the data that remains: what stays on your device and what is stored on our server.",
  inAppNote: { title: "This text is also inside the app", text: "The policy is shown at the Terms step on first launch, on the purchase screen, and under About › Terms and privacy." },
  versionLabel: "Version",
  llm: "Privacy policy: data that stays on your device, data stored on our server, retention, processors and how to request deletion.",
});
