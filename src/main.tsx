import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/auth/AuthProvider.tsx";
import { AppErrorBoundary } from "./app/components/AppErrorBoundary.tsx";
import { initAnalytics } from "./app/lib/analytics.ts";
import { initFx } from "./app/lib/fx.ts";
import { hydrateStorage } from "./app/lib/storage.ts";
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

// App.tsx reads settings, transactions and categories synchronously in its
// useState initialisers, so the durable store has to be in memory before the
// first render. On the web this resolves in the same microtask (localStorage is
// already synchronous); only the native shell actually waits, for the few
// milliseconds it takes to read UserDefaults.
// The .catch is belt-and-braces: hydrateStorage never rejects today, but a
// storage fault must degrade to localStorage, never white-screen the app.
void hydrateStorage().catch(() => {}).then(() => {
  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  );
});
