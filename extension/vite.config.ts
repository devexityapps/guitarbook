import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const shared = fileURLToPath(new URL('../shared/src', import.meta.url))

// Multi-page build: popup.html now; offscreen.html and the background worker join in step 3.
// `base: './'` keeps asset URLs relative, which extension pages need.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { popup: fileURLToPath(new URL('popup.html', import.meta.url)) } },
  },
})
