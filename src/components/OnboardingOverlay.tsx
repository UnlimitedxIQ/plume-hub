import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { detectProviders, validateCanvasToken, getSettings, saveSettings } from '../lib/bridge'

interface Props {
  onComplete: () => void
}

type Provider = 'claude' | 'codex'

interface ProviderStatus {
  detected: boolean
  loading: boolean
}

export function OnboardingOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  // Step 0 — provider detection
  const [providers, setProviders] = useState<Record<Provider, ProviderStatus>>({
    claude: { detected: false, loading: true },
    codex: { detected: false, loading: true },
  })
  const [selected, setSelected] = useState<Provider | null>(null)

  // Step 1 — Canvas setup. User enters their institution's URL (e.g.
  // https://canvas.yourschool.edu) during onboarding.
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenUser, setTokenUser] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [canvasSkipped, setCanvasSkipped] = useState(false)

  useEffect(() => {
    // Pre-fill base URL from saved settings
    getSettings().then((s) => {
      const settings = s as { canvasBaseUrl?: string; canvasToken?: string }
      if (settings.canvasBaseUrl) setBaseUrl(settings.canvasBaseUrl)
      if (settings.canvasToken) setToken(settings.canvasToken)
    })

    // Detect providers
    detectProviders().then((result) => {
      setProviders({
        claude: { detected: result.claude, loading: false },
        codex: { detected: result.codex, loading: false },
      })
      // Auto-select first detected provider
      if (result.claude) setSelected('claude')
      else if (result.codex) setSelected('codex')
    })
  }, [])

  function goTo(next: number) {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  async function testToken() {
    setTokenStatus('testing')
    setTokenError('')
    setTokenUser('')
    await saveSettings({ canvasBaseUrl: baseUrl, canvasToken: token } as Record<string, unknown>)
    const result = await validateCanvasToken()
    if (result.ok && result.user) {
      setTokenStatus('ok')
      setTokenUser((result.user as { name: string }).name)
    } else {
      setTokenStatus('error')
      setTokenError((result.error as string) ?? 'Invalid token')
    }
  }

  async function handleComplete() {
    await saveSettings({
      preferredProvider: selected,
      onboardingComplete: true,
      canvasBaseUrl: baseUrl,
      canvasToken: token,
    } as Record<string, unknown>)
    onComplete()
  }

  const anyDetected = providers.claude.detected || providers.codex.detected
  const canContinueStep0 = selected !== null
  const canContinueStep1 = tokenStatus === 'ok' || canvasSkipped

  const PROVIDERS: { id: Provider; label: string; installUrl: string }[] = [
    { id: 'claude', label: 'Claude CLI', installUrl: 'https://claude.ai/download' },
    { id: 'codex', label: 'Codex CLI', installUrl: 'https://github.com/openai/codex' },
  ]

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-zinc-950/60 backdrop-blur-sm">
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 shadow-xl backdrop-blur-md"
        style={{ height: 580 }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-1 pt-10 pb-4">
          <span className="text-lg font-bold tracking-tight text-white">Plume Hub</span>
          <span className="text-xs text-zinc-500">Let's get you set up</span>

          {/* Step dots */}
          <div className="mt-4 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-5 bg-plume-500' : i < step ? 'w-1.5 bg-plume-500/40' : 'w-1.5 bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex flex-1 flex-col overflow-hidden px-5">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -20 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col"
            >
              {step === 0 && (
                <div className="flex flex-1 flex-col gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Detect AI provider</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Plume launches your AI tool for each assignment. Select which one you use.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {PROVIDERS.map(({ id, label, installUrl }) => {
                      const status = providers[id]
                      return (
                        <button
                          key={id}
                          onClick={() => status.detected && setSelected(id)}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                            selected === id
                              ? 'border-plume-500/60 bg-plume-500/10'
                              : 'border-white/8 bg-zinc-900/60 hover:border-white/15'
                          } ${!status.detected ? 'opacity-50' : ''}`}
                        >
                          {/* Radio dot */}
                          <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                            selected === id ? 'border-plume-500 bg-plume-500' : 'border-zinc-600'
                          }`}>
                            {selected === id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>

                          <span className="flex-1 text-sm font-medium text-zinc-200">{label}</span>

                          {status.loading ? (
                            <Loader2 size={14} className="animate-spin text-zinc-500" />
                          ) : status.detected ? (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                              <CheckCircle2 size={12} /> Detected
                            </span>
                          ) : (
                            <a
                              href={installUrl}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-plume-400 hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Install →
                            </a>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {!anyDetected && !providers.claude.loading && !providers.codex.loading && (
                    <p className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
                      No AI provider detected. Install Claude CLI to use Plume's assignment launcher.
                    </p>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-1 flex-col gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Connect Canvas</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Plume reads your upcoming assignments from Canvas LMS.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-zinc-400">Canvas URL</span>
                      <input
                        className="input-field"
                        placeholder="https://canvas.yourschool.edu"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-zinc-400">API Token</span>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          className="input-field flex-1"
                          value={token}
                          placeholder="your-canvas-token"
                          onChange={(e) => { setToken(e.target.value); setTokenStatus('idle') }}
                        />
                        <button
                          onClick={testToken}
                          disabled={tokenStatus === 'testing' || !token}
                          className="btn-secondary flex items-center gap-1"
                        >
                          {tokenStatus === 'testing' ? <Loader2 size={11} className="animate-spin" /> : 'Test'}
                        </button>
                      </div>
                      {tokenStatus === 'ok' && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 size={11} /> Connected as {tokenUser}
                        </span>
                      )}
                      {tokenStatus === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <XCircle size={11} /> {tokenError}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-600">
                      Generate a token in Canvas → Account → Settings → New Access Token
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-1 flex-col gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">You're all set!</p>
                    <p className="mt-1 text-xs text-zinc-500">Here's what Plume found:</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <SummaryRow
                      label="AI Provider"
                      value={selected ? (selected === 'claude' ? 'Claude CLI' : 'Codex CLI') : 'None selected'}
                      ok={selected !== null}
                    />
                    <SummaryRow
                      label="Canvas"
                      value={canvasSkipped ? 'Skipped' : tokenStatus === 'ok' ? `Connected as ${tokenUser}` : 'Not connected'}
                      ok={tokenStatus === 'ok'}
                      warn={canvasSkipped}
                    />
                  </div>

                  <p className="rounded-xl border border-white/8 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
                    Click an assignment in the Canvas tab and hit <span className="font-medium text-white">Start</span> — Plume will open a terminal session and guide you through the work.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer buttons */}
        <div className="flex flex-col gap-2 p-5 pt-3">
          {step === 0 && (
            <button
              onClick={() => goTo(1)}
              disabled={!canContinueStep0}
              className="btn-primary w-full disabled:opacity-40"
            >
              Continue
            </button>
          )}

          {step === 1 && (
            <>
              <button
                onClick={() => goTo(2)}
                disabled={!canContinueStep1}
                className="btn-primary w-full disabled:opacity-40"
              >
                Continue
              </button>
              <button
                onClick={() => { setCanvasSkipped(true); goTo(2) }}
                className="text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Skip for now
              </button>
            </>
          )}

          {step === 2 && (
            <button onClick={handleComplete} className="btn-primary w-full">
              Open Plume Hub
            </button>
          )}

          {step > 0 && step < 2 && (
            <button
              onClick={() => goTo(step - 1)}
              className="text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, ok, warn }: { label: string; value: string; ok: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-zinc-900/60 px-3 py-2.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${
        ok ? 'text-green-400' : warn ? 'text-yellow-500' : 'text-zinc-500'
      }`}>
        {ok ? <CheckCircle2 size={12} /> : warn ? null : <XCircle size={12} />}
        {value}
      </span>
    </div>
  )
}
