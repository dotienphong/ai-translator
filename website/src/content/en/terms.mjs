import { legalPage } from "../legal.mjs";

export default legalPage({
  id: "terms",
  lang: "en",
  path: "/en/terms/",
  file: "eula.en.md",
  title: "Terms of Use (EULA) for AI Translator",
  description: "AI Translator's End User License Agreement: usage rights, plans and payment, one device per key, refunds and limitation of liability. The Vietnamese version prevails.",
  crumbs: [{ name: "Home", path: "/en/" }, { name: "Terms of use", path: "/en/terms/" }],
  heroLead: "The agreement between you and the provider when you install or use AI Translator. The Vietnamese version is the original.",
  inAppNote: { title: "This text is also inside the app", text: "You read and accept it at the Terms step the first time you open the app, and can read it again under About › Terms and privacy." },
  versionLabel: "Version",
  llm: "End User License Agreement (EULA): usage rights, plans and payment, one device per key, refunds and limitation of liability.",
});
