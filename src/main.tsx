import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { setStorageAdapter } from './lib/storage'
import { syncConfigured } from './lib/sync/config'
import { syncEngine } from './lib/sync/engine'

// Cross-device sync (see src/lib/sync). Without a Supabase project configured,
// the app keeps everything in this browser only, as before.
if (syncConfigured()) {
  setStorageAdapter(syncEngine.adapter)
  void syncEngine.init()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
