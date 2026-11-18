import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' keeps the build portable: it works on Vercel, Netlify,
// GitHub Pages (project sub-path) or any static file host.
export default defineConfig({
  base: './',
  plugins: [react()],
})
