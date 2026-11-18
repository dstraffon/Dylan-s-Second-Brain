import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The GitHub Pages workflow sets BASE_PATH to the repo's sub-path
// (/Dylan-s-Second-Brain/). Without it, base './' keeps the build portable
// for local preview or any other static host.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react()],
})
