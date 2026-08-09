import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { LEGAL_DOCS } from './src/app/lib/legalContent'
import { renderLegalHtml } from './src/app/lib/legalHtml'
import pkg from './package.json'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Emit the Privacy Policy and Terms as standalone pages alongside the app, so
// they have real URLs to give App Store Connect. Generated from the same module
// the in-app screens render, which keeps the two versions identical.
function legalPages() {
  return {
    name: 'legal-pages',
    generateBundle() {
      for (const doc of LEGAL_DOCS) {
        this.emitFile({ type: 'asset', fileName: `${doc.slug}.html`, source: renderLegalHtml(doc) })
      }
    },
  }
}

// The native (Capacitor) build serves its assets from inside the app bundle, so
// a service worker adds nothing and only complicates updates. `pnpm build:native`
// sets CAP_BUILD=1 to skip it. The default (PWA) build is unaffected.
const isNativeBuild = process.env.CAP_BUILD === '1';

export default defineConfig({
  // Relative base so the build works both at the domain root and under a
  // subpath (GitHub Pages serves at /expense-tracker/)
  base: './',
  plugins: [
    figmaAssetResolver(),
    legalPages(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react({
      fastRefresh: true,
    }),
    tailwindcss(),
    ...(isNativeBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'TracklyLab - Your Expense Lens',
        short_name: 'TracklyLab',
        description: 'Your Expense Lens - track every expense in seconds',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    })]),
  ],
  define: {
    // Baked into the bundle at build time and shown in Settings > About, so
    // "which build is this device actually running?" is a glance instead of a
    // guess - stale service-worker bundles have twice masqueraded as sync bugs.
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    // package.json is the only place the version is written. It used to be
    // typed by hand in two screens, which is exactly how About came to claim
    // 1.0 while the footer three screens down still said 0.1.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
})
