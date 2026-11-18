import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

// To swap in a synced backend later:
//   import { setStorageAdapter } from './lib/storage'
//   setStorageAdapter(mySupabaseAdapter)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
