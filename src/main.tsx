import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'

// Hide the pre-React splash (defined in index.html) after hydration.
// We fade it out via CSS transition, then remove the node once the
// transition finishes so it never intercepts clicks.
function hideSplash(): void {
  const splash = document.getElementById('plume-splash')
  if (!splash) return
  splash.classList.add('hidden')
  setTimeout(() => splash.remove(), 400)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Give React one frame to paint the first non-suspended content, then
// fade the splash out on top of the real UI.
requestAnimationFrame(hideSplash)
