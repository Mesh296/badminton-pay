// The home screen app on iPhone colours its status bar from the page once, at
// launch, and keeps that colour when the phone switches between light and
// dark. So when the appearance changes, the app reloads (staying on the same
// screen) and the bar is coloured again. Only there: browsers and Android
// follow the change on their own. Not while someone is typing, so nothing
// typed is lost; the next change or launch catches up.

const dark = window.matchMedia("(prefers-color-scheme: dark)");

/** True only in an app opened from the iPhone home screen (navigator.standalone is iOS-only). */
const isHomeScreenApp = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
};

export function followAppearance() {
  if (!isHomeScreenApp()) return;
  const startedDark = dark.matches;
  const check = () => {
    if (dark.matches !== startedDark && document.visibilityState === "visible" && !typing()) window.location.reload();
  };
  dark.addEventListener("change", check);
  // Switched while the app was in the background (e.g. automatic dark mode at sunset)
  document.addEventListener("visibilitychange", check);
}
