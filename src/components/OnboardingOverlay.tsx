import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, ArrowRight, Sparkles,
} from 'lucide-react'
import {
  detectProviders,
  validateCanvasToken,
  getSettings,
  saveSettings,
  listUpcoming,
  listCourses,
} from '../lib/bridge'
import type { Assignment } from '../lib/canvas-types'
import { AssignmentRow } from './ui'
import { bucketAssignments, formatDueLabel } from '../panels/canvas/timeline'
import iconUrl from '../../assets/icon.png'

interface Props {
  onComplete: () => void
}

type Provider = 'claude' | 'codex'

interface ProviderStatus {
  detected: boolean
  path: string | null
  checkedPaths: string[]
  loading: boolean
}

interface Course {
  id: number
  name: string
  courseCode: string
}

interface TeaserItem {
  assignment: Assignment
  courseCode: string
  dueLabel: string
}

// The two-step welcome experience:
//   1. "Where does Claude Code live?" with auto-detect. If detected, silent
//      green check then auto-advance after 600ms.
//   2. "Show me what's due" with Canvas URL + token. On Test success we
//      preview the student's actual next two assignments inline. The
//      reveal IS the payoff. CTA is "Let's go".
export function OnboardingOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const [providers, setProviders] = useState<Record<Provider, ProviderStatus>>({
    claude: { detected: false, path: null, checkedPaths: [], loading: true },
    codex: { detected: false, path: null, checkedPaths: [], loading: true },
  })
  const [selected, setSelected] = useState<Provider | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const autoAdvanced = useRef(false)

  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenUser, setTokenUser] = useState('')
  const [tokenError, setTokenError] = useState('')

  const [teaserLoading, setTeaserLoading] = useState(false)
  const [teaser, setTeaser] = useState<TeaserItem[] | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      const settings = s as { canvasBaseUrl?: string; canvasToken?: string }
      if (settings.canvasBaseUrl) setBaseUrl(settings.canvasBaseUrl)
      if (settings.canvasToken) setToken(settings.canvasToken)
    })
    runDetection()
  }, [])

  // Auto-advance from step 0 once a provider is detected and selected,
  // unless the user has already manually picked or moved on.
  useEffect(() => {
    if (autoAdvanced.current) return
    if (step !== 0) return
    if (!selected) return
    if (providers[selected].loading) return
    if (!providers[selected].detected) return
    autoAdvanced.current = true
    const t = setTimeout(() => goTo(1), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, providers, step])

  function runDetection() {
    setProviders((p) => ({
      claude: { ...p.claude, loading: true },
      codex: { ...p.codex, loading: true },
    }))
    detectProviders().then((result) => {
      setProviders({
        claude: { ...result.claude, loading: false },
        codex: { ...result.codex, loading: false },
      })
      setSelected((prev) => {
        if (prev) return prev
        if (result.claude.detected) return 'claude'
        if (result.codex.detected) return 'codex'
        return null
      })
    })
  }

  function goTo(next: number) {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  async function testToken() {
    setTokenStatus('testing')
    setTokenError('')
    setTokenUser('')
    setTeaser(null)
    await saveSettings({ canvasBaseUrl: baseUrl, canvasToken: token } as Record<string, unknown>)
    const result = await validateCanvasToken()
    if (result.ok && result.user) {
      setTokenStatus('ok')
      setTokenUser((result.user as { name: string }).name)
      // Pull a teaser of the next two assignments. Best-effort: don't block
      // the success state if it fails.
      void loadTeaser()
    } else {
      setTokenStatus('error')
      setTokenError((result.error as string) ?? 'That token did not work. Double-check it and try again.')
    }
  }

  async function loadTeaser() {
    setTeaserLoading(true)
    try {
      const [coursesResult, upcomingResult] = await Promise.all([listCourses(), listUpcoming()])
      if (!upcomingResult.ok) return
      const courses = (coursesResult.ok ? coursesResult.courses : []) as Course[]
      const courseByCode = new Map(courses.map((c) => [c.id, c.courseCode]))
      const assignments = (upcomingResult.assignments ?? []) as Assignment[]
      const buckets = bucketAssignments(assignments)
      const flat: Assignment[] = []
      for (const b of buckets) {
        for (const a of b.assignments) {
          flat.push(a)
          if (flat.length >= 2) break
        }
        if (flat.length >= 2) break
      }
      setTeaser(
        flat.map((a) => ({
          assignment: a,
          courseCode: courseByCode.get(a.courseId) ?? '—',
          dueLabel: formatDueLabel(a.dueAt) || '',
        })),
      )
    } finally {
      setTeaserLoading(false)
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

  const PROVIDERS: { id: Provider; label: string; installUrl: string }[] = [
    { id: 'claude', label: 'Claude CLI', installUrl: 'https://claude.ai/download' },
    { id: 'codex', label: 'Codex CLI', installUrl: 'https://github.com/openai/codex' },
  ]

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ink-950">
      {/* Brand bar */}
      <header className="flex items-center justify-between px-10 pt-8">
        <div className="flex items-center gap-3">
          <img src={iconUrl} alt="" className="brand-mark h-9 w-9 rounded-xl" draggable={false} />
          <span className="text-sm font-bold tracking-tight text-stone-100">Plume Hub</span>
        </div>
        <div className="progress-segment">
          {[0, 1].map((i) => (
            <span key={i} className={i <= step ? 'is-filled' : ''} />
          ))}
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-10 py-10">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl"
          >
            {step === 0 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h1 className="text-display text-stone-50">Where does Claude Code live?</h1>
                  <p className="mt-3 text-sm text-stone-400">
                    Plume launches the CLI you already have. We'll find it for you.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {PROVIDERS.map(({ id, label, installUrl }) => {
                    const status = providers[id]
                    const isSelected = selected === id
                    return (
                      <button
                        key={id}
                        onClick={() => status.detected && setSelected(id)}
                        className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors duration-mid ease-quiet ${
                          isSelected
                            ? 'border-plume-500/60 bg-plume-700/30'
                            : 'border-subtle surface-2 hover:border-strong'
                        } ${!status.detected ? 'opacity-60' : ''}`}
                      >
                        <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected ? 'border-plume-500 bg-plume-500' : 'border-stone-600'
                        }`}>
                          {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>

                        <span className="flex-1 text-sm font-semibold text-stone-100">{label}</span>

                        {status.loading ? (
                          <Loader2 size={14} className="animate-spin text-stone-500" />
                        ) : status.detected ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 size={12} /> Found it
                          </span>
                        ) : (
                          <a
                            href={installUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-semibold text-plume-300 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Install
                          </a>
                        )}
                      </button>
                    )
                  })}
                </div>

                {!anyDetected && !providers.claude.loading && !providers.codex.loading && (
                  <div className="flex flex-col gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                    <p>Couldn't find either CLI. Install Claude Code, then re-check.</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={runDetection}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-micro font-semibold text-amber-200 hover:bg-amber-500/20"
                      >
                        <RefreshCw size={11} /> Re-check
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDiagnostics((v) => !v)}
                        className="text-micro text-amber-300/80 underline hover:text-amber-200"
                      >
                        {showDiagnostics ? 'Hide' : 'Show'} paths checked
                      </button>
                    </div>
                    {showDiagnostics && (
                      <div className="mt-1 max-h-32 overflow-y-auto rounded bg-black/30 p-2 font-mono text-micro leading-relaxed text-amber-200/70">
                        <div className="mb-1 font-semibold">claude:</div>
                        {providers.claude.checkedPaths.map((p, i) => <div key={`c-${i}`}>{p}</div>)}
                        <div className="mt-2 mb-1 font-semibold">codex:</div>
                        {providers.codex.checkedPaths.map((p, i) => <div key={`x-${i}`}>{p}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h1 className="text-display text-stone-50">Show me what's due</h1>
                  <p className="mt-3 text-sm text-stone-400">
                    Plume reads your Canvas assignments. Skip if you'd rather wire this up later.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="label-field">Canvas URL</label>
                    <input
                      className="input-field"
                      placeholder="https://canvas.yourschool.edu"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="label-field">API Token</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="input-field flex-1"
                        value={token}
                        placeholder="paste-your-token"
                        onChange={(e) => { setToken(e.target.value); setTokenStatus('idle'); setTeaser(null) }}
                      />
                      <button
                        onClick={testToken}
                        disabled={tokenStatus === 'testing' || !token}
                        className="btn-secondary flex items-center gap-1 px-4"
                      >
                        {tokenStatus === 'testing' ? <Loader2 size={11} className="animate-spin" /> : 'Test'}
                      </button>
                    </div>
                    {tokenStatus === 'ok' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 size={12} /> Connected as {tokenUser}
                      </span>
                    )}
                    {tokenStatus === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-rose-400">
                        <XCircle size={12} /> {tokenError}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-stone-500">
                    Generate a token in Canvas, Account, Settings, New Access Token.
                  </p>
                </div>

                {/* Teaser: a real preview of the student's next two assignments. */}
                <AnimatePresence initial={false}>
                  {(teaserLoading || (teaser && teaser.length > 0)) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden rounded-xl border border-plume-500/30"
                    >
                      <div className="flex items-center gap-2 border-b border-subtle bg-plume-700/30 px-4 py-2">
                        <Sparkles size={12} className="text-plumeyellow-400" />
                        <span className="text-micro font-bold uppercase tracking-wide text-white">
                          Here's what you have ahead
                        </span>
                      </div>
                      <div className="surface-1">
                        {teaserLoading ? (
                          <div className="flex items-center gap-2 p-4 text-xs text-stone-500">
                            <Loader2 size={12} className="animate-spin" /> Reading your Canvas...
                          </div>
                        ) : teaser && teaser.length > 0 ? (
                          teaser.map((t) => (
                            <AssignmentRow
                              key={t.assignment.id}
                              assignment={t.assignment}
                              courseCode={t.courseCode}
                              dueLabel={t.dueLabel}
                              interactive={false}
                            />
                          ))
                        ) : (
                          <div className="p-4 text-xs italic text-stone-500">
                            Nothing currently due.
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-10 pb-8">
        <button
          onClick={() => goTo(step - 1)}
          disabled={step === 0}
          className="btn-ghost disabled:opacity-0"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          {step === 0 && (
            <button
              onClick={() => goTo(1)}
              disabled={selected === null}
              className="btn-yellow px-5 py-2 text-sm disabled:opacity-40"
            >
              Continue <ArrowRight size={14} />
            </button>
          )}
          {step === 1 && (
            <>
              <button onClick={handleComplete} className="btn-ghost text-sm">
                Skip for now
              </button>
              <button
                onClick={handleComplete}
                disabled={tokenStatus !== 'ok'}
                className="btn-yellow px-5 py-2 text-sm disabled:opacity-40"
              >
                Let's go <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}
