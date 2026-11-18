import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// A unique id for each build. The app compares it with dist/version.json to
// spot a newer deploy (see src/lib/useNewVersion.ts).
const BUILD_ID = `${process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'}-${Date.now().toString(36)}`

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
    },
  }
}

// The GitHub Pages workflow sets BASE_PATH to the repo's sub-path
// (/Dylan-s-Second-Brain/). Without it, base './' keeps the build portable
// for local preview or any other static host.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile()],
})
