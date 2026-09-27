import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 👇 GitHub Pages base path — MUST match your repo name
  base: '/gift/',
})