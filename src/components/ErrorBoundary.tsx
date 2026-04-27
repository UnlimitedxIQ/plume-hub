import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { clearAllData } from '../lib/bridge'

// Top-level React error boundary. Catches rendering / lifecycle errors
// anywhere in the tree and swaps in a simple recovery screen instead of a
// white/blank window. Keeps the app recoverable via a reload button instead
// of requiring the user to close and reopen Plume Hub.

interface State {
  error: Error | null
  info: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to console so the user can grab a stack trace from DevTools.
    console.error('[Plume Hub] UI crash:', error, info)
    this.setState({ error, info })
  }

  handleReload = (): void => {
    // Full reload is safer than a soft reset — clears any mid-render state
    // from the broken subtree. In Electron this reloads the renderer
    // process; the main process stays up so window position, vault, etc.
    // all survive.
    window.location.reload()
  }

  handleClearData = async (): Promise<void> => {
    // Escape hatch when reload loops on corrupted persisted state. Wipes
    // settings + vault and relaunches the app from scratch.
    await clearAllData()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-200">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm">
          <AlertTriangle size={26} className="mb-3 text-red-400" />
          <div className="mb-2 text-base font-semibold text-zinc-100">
            Something went wrong
          </div>
          <div className="mb-4 text-zinc-400">
            Plume Hub hit an unexpected error in the UI. Your data is safe —
            reloading usually clears it. If the problem keeps happening,
            please{' '}
            <a
              href="https://github.com/UnlimitedxIQ/plume-hub/issues/new"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-plume-400 hover:text-plume-300"
            >
              file an issue
            </a>{' '}
            with the message below.
          </div>

          <div className="mb-4 rounded-xl border border-red-500/20 bg-black/40">
            <div className="border-b border-red-500/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Error details
            </div>
            <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-[11px] text-red-300">
              {String(this.state.error.stack ?? this.state.error.message)}
            </pre>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={this.handleReload}
              className="flex-1 rounded-lg bg-plume-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-plume-600"
            >
              Reload Plume Hub
            </button>
            <button
              onClick={this.handleClearData}
              className="flex-1 rounded-lg border border-red-500/30 px-4 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
            >
              Clear data and restart
            </button>
          </div>
        </div>
      </div>
    )
  }
}
