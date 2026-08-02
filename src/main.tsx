import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/auth/AuthProvider.tsx";
import { AppErrorBoundary } from "./app/components/AppErrorBoundary.tsx";
import { initAnalytics } from "./app/lib/analytics.ts";
import { initFx } from "./app/lib/fx.ts";
import "./styles/index.css";

initAnalytics();
initFx();
// One line per launch: lets a console (or a screenshot of it) say which build
// a misbehaving device is really on.
console.info(`TracklyLab build ${__BUILD_STAMP__}`);

// The PWA's registerSW.js only *registers* the service worker: a new deploy
// installed and took control in the background, but the running page kept
// executing the old bundle - so every deploy was one full app-relaunch behind
// (verified: launch on build A, deploy B, relaunch still runs A; only the
// second relaunch gets B). One device on last week's sync code can quietly
// undo what the fixed devices do, which is how "cross-device sync is broken
// again" kept coming back.
//
// Reload the moment a NEW worker takes control - that happens seconds after
// launch, before the user is deep in anything. The first-ever install also
// fires controllerchange (clients.claim on a page that had no controller);
// that one must not reload. And while the app is hidden, ask for updates -
// found ones then activate and reload while nobody is watching, so the next
// foreground is already current. No virtual:pwa-register import: the native
// (Capacitor) build strips the PWA plugin, and this stays inert there.
if ('serviceWorker' in navigator) {
  let wasControlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled) {
      wasControlled = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  void navigator.serviceWorker.ready.then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void reg.update().catch(() => {});
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>
);
