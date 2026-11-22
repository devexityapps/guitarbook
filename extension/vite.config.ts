import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const shared = fileURLToPath(new URL('../shared/src', import.meta.url))
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))

// Multi-page build: popup.html, offscreen.html and the background service worker.
// `base: './'` keeps asset URLs relative, which extension pages need.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: here('popup.html'), offscreen: here('offscreen.html'), background: here('src/background.ts') },
      // The manifest names the service worker, so it can't have a hashed filename.
      output: { entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js') },
    },
  },
})
