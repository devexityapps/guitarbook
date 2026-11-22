import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const shared = fileURLToPath(new URL('../shared/src', import.meta.url))
const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } }, // shared/ lives outside app/
  // Second page: the hosted sign-in page for the Chrome extension, served at /extension-auth.html.
  build: { rollupOptions: { input: { main: page('index.html'), 'extension-auth': page('extension-auth.html') } } },
})
