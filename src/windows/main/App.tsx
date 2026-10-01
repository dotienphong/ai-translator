import { useApp } from "./appStore";
import { Onboarding } from "./onboarding/Onboarding";
import { Shell } from "./Shell";

export function App() {
  const ready = useApp((s) => s.settings !== null && s.status !== null && s.info !== null);
  const onboardingDone = useApp((s) => s.settings?.onboardingDone ?? false);
  if (!ready) return null;
  return onboardingDone ? <Shell /> : <Onboarding />;
}
