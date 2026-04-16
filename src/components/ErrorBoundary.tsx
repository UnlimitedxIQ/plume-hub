import React from 'react'

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

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-200">
        <div className="max-w-lg rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm">
          <div className="mb-2 text-base font-semibold text-red-300">
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
              className="text-plume-400 underline hover:text-plume-300"
            >
              file an issue
            </a>{' '}
            with the message below.
          </div>
          <pre className="mb-4 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] font-mono text-red-300">
            {String(this.state.error.stack ?? this.state.error.message)}
          </pre>
          <button
            onClick={this.handleReload}
            className="rounded-lg bg-plume-500 px-4 py-2 text-xs font-semibold text-white hover:bg-plume-600"
          >
            Reload Plume Hub
          </button>
        </div>
      </div>
    )
  }
}
