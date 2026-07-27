import type { CapacitorConfig } from '@capacitor/cli';

// Native (iOS) shell around the same web build that ships as the PWA.
// The PWA build is unaffected by this file — it is only read by the Capacitor
// CLI (`npx cap sync` / `npx cap open ios`).
//
// Build for native with:  pnpm build:native && npx cap sync
// (build:native skips the service worker, which is pointless when the assets
// are bundled inside the app.)
const config: CapacitorConfig = {
  appId: 'com.tracklylab.trackly',
  appName: 'Trackly',
  webDir: 'dist',
  ios: {
    // Let the web app own the full screen; we already handle safe-area insets
    // in CSS (env(safe-area-inset-*)).
    contentInset: 'never',
    backgroundColor: '#F5F5F7',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 400,
      backgroundColor: '#F5F5F7',
    },
  },
};

export default config;
