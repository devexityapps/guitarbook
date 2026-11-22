import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const shared = fileURLToPath(new URL('../shared/src', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } }, // shared/ lives outside app/
})
