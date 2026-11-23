import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const shared = fileURLToPath(new URL('../shared/src', import.meta.url))
const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

// SPEC §2 / step 7: installable, and the app shell is cached so it opens offline (the data comes from Firestore's own cache).
const pwa = VitePWA({
  registerType: 'autoUpdate', // a new deploy takes over on the next load, no prompt
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Guitarbook',
    short_name: 'Guitarbook',
    description: 'Your guitar songs, lessons and charts, and when you last opened each.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#121417',
    theme_color: '#121417',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webp}'],
    // The extension's sign-in page is always fetched fresh (and never stands in for other pages).
    globIgnores: ['extension-auth.html'],
    navigateFallback: '/index.html',
    // Firebase Auth's own pages (/__/auth/...) and the extension's sign-in page must reach the network.
    navigateFallbackDenylist: [/^\/__\//, /^\/extension-auth\.html/],
    // The fonts, so the app looks right offline too.
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
      },
    ],
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pwa],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } }, // shared/ lives outside app/
  // Second page: the hosted sign-in page for the Chrome extension, served at /extension-auth.html.
  build: { rollupOptions: { input: { main: page('index.html'), 'extension-auth': page('extension-auth.html') } } },
})
