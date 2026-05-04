import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, XCircle, Loader2, Settings as SettingsIcon,
  Zap, GraduationCap, RefreshCw, Key, Trash2,
  AlertTriangle, Plus, Download, Package, Check, Database,
} from 'lucide-react'
import {
  getSettings,
  saveSettings,
  validateCanvasToken,
  listCourses,
  detectProviders,
  vaultGetAll,
  vaultSet,
  vaultDelete,
  clearAllData,
  checkForUpdates,
  listRecommendedPlugins,
  ensurePluginMarketplaces,
  installRecommendedPlugin,
  type MaskedVaultEntry,
} from '../lib/bridge'
import { IconBadge, StatusPill, Hero } from '../components/ui'

interface Settings {
  canvasBaseUrl: string
  canvasToken: string
  canvasCourseIds: number[]
  claudeMdTemplate: string
  preferredProvider: 'claude' | 'codex' | null
  onboardingComplete: boolean
}

type TokenStatus = 'idle' | 'testing' | 'ok' | 'error'
type SaveStatus = 'idle' | 'pending' | 'saved'

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('idle')
  const [tokenUser, setTokenUser] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [courseInput, setCourseInput] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [providers, setProviders] = useState<{
    claude: { detected: boolean; path: string | null }
    codex: { detected: boolean; path: string | null }
  } | null>(null)

  const initialLoadRef = useRef(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s as Settings)
      setCourseInput((s.canvasCourseIds as number[]).join(', '))
    })
    detectProviders().then(setProviders)
  }, [])

  // Auto-save: 600ms after the last change. The first effect run is the
  // initial load, which we skip so we don't write back what we just read.
  useEffect(() => {
    if (!settings) return
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    setSaveStatus('pending')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const ids = courseInput
        .split(/[,\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
      await saveSettings({ ...settings, canvasCourseIds: ids } as unknown as Record<string, unknown>)
      setSaveStatus('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }, 600)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [settings, courseInput])

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-stone-500">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  async function testToken() {
    setTokenStatus('testing')
    setTokenError('')
    setTokenUser('')
    await saveSettings({
      canvasBaseUrl: settings!.canvasBaseUrl,
      canvasToken: settings!.canvasToken,
    } as Record<string, unknown>)
    const result = await validateCanvasToken()
    if (result.ok && result.user) {
      setTokenStatus('ok')
      setTokenUser((result.user as { name: string }).name)
    } else {
      setTokenStatus('error')
      setTokenError((result.error as string) ?? 'That token did not work.')
    }
  }

  async function handleAutoDiscover() {
    const result = await listCourses()
    if (result.ok && result.courses) {
      const ids = (result.courses as { id: number }[]).map((c) => c.id)
      setCourseInput(ids.join(', '))
      update('canvasCourseIds', ids)
    }
  }

  async function rerunOnboarding() {
    await saveSettings({ onboardingComplete: false } as Record<string, unknown>)
    window.location.reload()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Hero>
        <div className="flex items-center gap-3">
          <h1 className="text-display text-white">Settings</h1>
          <div className="flex-1" />
          <SaveBadge status={saveStatus} />
        </div>
        <p className="text-sm text-white/80">Tune what Plume reads, what AI it launches, and where it stores secrets.</p>
      </Hero>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
          <PersonaCard
            icon={<GraduationCap size={16} />}
            title="Canvas"
            blurb="Where Plume reads your assignments from."
          >
            <div className="flex flex-col gap-4">
              <Field label="Canvas URL">
                <input
                  className="input-field"
                  placeholder="https://canvas.yourschool.edu"
                  value={settings.canvasBaseUrl}
                  onChange={(e) => update('canvasBaseUrl', e.target.value)}
                />
              </Field>

              <Field label="API Token">
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="input-field flex-1"
                    value={settings.canvasToken}
                    placeholder="paste-your-token"
                    onChange={(e) => {
                      update('canvasToken', e.target.value)
                      setTokenStatus('idle')
                    }}
                  />
                  <button
                    onClick={testToken}
                    disabled={tokenStatus === 'testing' || !settings.canvasToken}
                    className="btn-secondary flex items-center gap-1 px-4"
                  >
                    {tokenStatus === 'testing' ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                  </button>
                </div>
                {tokenStatus === 'ok' && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={11} /> Connected as {tokenUser}
                  </span>
                )}
                {tokenStatus === 'error' && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-rose-400">
                    <XCircle size={11} /> {tokenError}
                  </span>
                )}
              </Field>

              <Field label="Tracked courses">
                <div className="flex gap-2">
                  <input
                    className="input-field flex-1"
                    placeholder="Empty = auto-detect all"
                    value={courseInput}
                    onChange={(e) => setCourseInput(e.target.value)}
                  />
                  <button
                    onClick={handleAutoDiscover}
                    className="btn-secondary whitespace-nowrap px-4"
                  >
                    Auto-detect
                  </button>
                </div>
                <span className="mt-1 text-xs text-stone-500">
                  Comma-separated Canvas course IDs.
                </span>
              </Field>
            </div>
          </PersonaCard>

          <PersonaCard
            icon={<Zap size={16} />}
            title="AI tools"
            blurb="Pick the CLI Plume launches and the plugins that travel with it."
          >
            <div className="flex flex-col gap-3">
              <ProviderRow
                name="Claude CLI"
                detected={providers?.claude.detected ?? false}
                resolvedPath={providers?.claude.path ?? null}
                active={settings.preferredProvider === 'claude'}
                onSetActive={() => update('preferredProvider', 'claude')}
                installUrl="https://claude.ai/download"
              />
              <ProviderRow
                name="Codex CLI"
                detected={providers?.codex.detected ?? false}
                resolvedPath={providers?.codex.path ?? null}
                active={settings.preferredProvider === 'codex'}
                onSetActive={() => update('preferredProvider', 'codex')}
                installUrl="https://github.com/openai/codex"
              />
            </div>

            <div className="mt-5 flex items-center gap-2">
              <Package size={13} className="text-stone-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-stone-400">Recommended plugins</span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Bundled with this Plume Hub build. Each one is fetched fresh via <code className="rounded bg-ink-700 px-1 text-micro">claude plugin install</code>.
            </p>
            <div className="mt-3">
              <RecommendedPluginsManager />
            </div>
          </PersonaCard>

          <PersonaCard
            icon={<Key size={16} />}
            title="Vault and data"
            blurb="Encrypted local credentials, plus the nuclear options."
          >
            <VaultManager />
            <div className="mt-5">
              <DataManagement onRerunOnboarding={rerunOnboarding} />
            </div>
          </PersonaCard>

          <UpdateRow />
        </div>
      </div>
    </div>
  )
}

// ── Persona card ─────────────────────────────────────────────────────────────

function PersonaCard({
  icon,
  title,
  blurb,
  children,
}: {
  icon: React.ReactNode
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-subtle surface-1 p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-plume-700/40 text-plumeyellow-400">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-bold text-stone-50">{title}</h2>
          <p className="mt-0.5 text-xs text-stone-500">{blurb}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  if (status === 'pending') {
    return (
      <span className="pill pill-zinc"><Loader2 size={11} className="animate-spin" /> Saving</span>
    )
  }
  return <span className="pill pill-success"><Check size={11} /> Saved</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-field">{label}</span>
      {children}
    </div>
  )
}

// ── Provider row ─────────────────────────────────────────────────────────────

function ProviderRow({
  name,
  detected,
  resolvedPath,
  active,
  onSetActive,
  installUrl,
}: {
  name: string
  detected: boolean
  resolvedPath: string | null
  active: boolean
  onSetActive: () => void
  installUrl: string
}) {
  return (
    <div className="card flex items-center gap-3">
      <IconBadge size="sm" tone={detected ? 'emerald' : 'zinc'}>
        {detected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      </IconBadge>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-stone-100">{name}</div>
        <div className={`text-xs ${detected ? 'text-emerald-400' : 'text-stone-500'}`}>
          {detected ? 'Installed and ready' : 'Not detected'}
        </div>
        {detected && resolvedPath && (
          <div className="mt-0.5 truncate font-mono text-xs text-stone-500" title={resolvedPath}>
            {resolvedPath}
          </div>
        )}
      </div>

      {detected ? (
        <button
          onClick={onSetActive}
          disabled={active}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-quick ease-quiet ${
            active
              ? 'bg-plume-500/20 text-plume-300'
              : 'border border-subtle text-stone-400 hover:bg-white/5'
          }`}
        >
          {active ? 'Active' : 'Use this'}
        </button>
      ) : (
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-plume-300 hover:text-plume-200 hover:underline"
        >
          Install
        </a>
      )}
    </div>
  )
}

// ── Vault manager ────────────────────────────────────────────────────────────

function VaultManager() {
  const [entries, setEntries] = useState<MaskedVaultEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState('token')
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    const result = await vaultGetAll()
    setEntries(result.ok ? result.entries : [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim() || !newLabel.trim()) return
    setSaving(true)
    const result = await vaultSet({
      key: newKey.trim(),
      value: newValue.trim(),
      label: newLabel.trim(),
      category: newCategory,
    })
    setSaving(false)
    if (result.ok) {
      setNewKey('')
      setNewValue('')
      setNewLabel('')
      setNewCategory('token')
      setAdding(false)
      await refresh()
    }
  }

  async function handleDelete(key: string) {
    const result = await vaultDelete(key)
    if (result.ok) await refresh()
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-stone-500" />
        <span className="text-xs text-stone-500">Loading vault...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Database size={13} className="text-stone-500" />
        <span className="text-xs font-bold uppercase tracking-wide text-stone-400">Stored credentials</span>
        <span className="text-micro text-stone-500">{entries?.length ?? 0} entries</span>
      </div>
      <p className="text-xs text-stone-500">
        Encrypted via your OS keychain. Used by MCP servers that need API keys.
      </p>

      {entries && entries.length > 0 ? (
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <div key={entry.key} className="card flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-200">{entry.label}</div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-stone-500">
                  <span>{entry.key}</span>
                  <span className="text-stone-700">·</span>
                  <span className="text-stone-400">{entry.maskedValue}</span>
                </div>
              </div>
              <StatusPill tone="zinc" className="uppercase">
                {entry.category}
              </StatusPill>
              <button
                onClick={() => handleDelete(entry.key)}
                aria-label="Delete"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors duration-quick ease-quiet hover:bg-rose-500/10 hover:text-rose-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-subtle surface-1 px-4 py-5 text-center">
          <Key size={20} className="mx-auto mb-2 text-stone-600" />
          <p className="text-xs text-stone-500">No credentials stored yet.</p>
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-plume-500/40 bg-plume-500/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Key (e.g. github-pat)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="input-field font-mono"
            />
            <input
              placeholder="Label (e.g. GitHub PAT)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="input-field"
            />
          </div>
          <input
            type="password"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="input-field"
          />
          <div className="flex items-center gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="input-field flex-1"
            >
              <option value="token">Token</option>
              <option value="api_key">API Key</option>
              <option value="oauth">OAuth</option>
              <option value="password">Password</option>
              <option value="other">Other</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={saving || !newKey.trim() || !newValue.trim() || !newLabel.trim()}
              className="btn-primary-inline px-4 py-2"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="btn-ghost px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-subtle surface-1 py-2.5 text-xs font-medium text-stone-400 transition-colors duration-quick ease-quiet hover:border-plume-500/40 hover:bg-plume-500/5 hover:text-plume-300"
        >
          <Plus size={12} /> Add credential
        </button>
      )}
    </div>
  )
}

// ── Recommended plugins ─────────────────────────────────────────────────────

type PluginStatus = 'idle' | 'installing' | 'done' | 'failed'

interface PluginRowState {
  id: string
  status: PluginStatus
  error?: string
}

function RecommendedPluginsManager() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<PluginRowState[]>([])
  const [busy, setBusy] = useState(false)
  const [marketplaceMsg, setMarketplaceMsg] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const { recommended, installed } = await listRecommendedPlugins()
    const installedSet = new Set(installed)
    setRows(
      recommended.map((id) => ({
        id,
        status: installedSet.has(id) ? 'done' : 'idle',
      })),
    )
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  async function installOne(id: string) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, status: 'installing', error: undefined } : row)))
    const res = await installRecommendedPlugin(id)
    setRows((r) =>
      r.map((row) =>
        row.id === id
          ? { ...row, status: res.ok ? 'done' : 'failed', error: res.ok ? undefined : (res.stderr || res.stdout || `exit ${res.exitCode}`).slice(0, 200) }
          : row,
      ),
    )
  }

  async function installAllMissing() {
    if (busy) return
    setBusy(true)
    setMarketplaceMsg('Registering marketplaces...')
    const mktResult = await ensurePluginMarketplaces()
    const mktErrors = mktResult.results.filter((r) => !r.ok)
    if (mktErrors.length > 0) {
      setMarketplaceMsg(`Marketplace issue: ${mktErrors.map((e) => e.source).join(', ')}`)
    } else {
      setMarketplaceMsg(null)
    }
    const pending = rows.filter((r) => r.status === 'idle' || r.status === 'failed')
    for (const row of pending) {
      await installOne(row.id)
    }
    setBusy(false)
    refresh()
  }

  const doneCount = rows.filter((r) => r.status === 'done').length
  const installingCount = rows.filter((r) => r.status === 'installing').length
  const failedCount = rows.filter((r) => r.status === 'failed').length
  const pendingCount = rows.length - doneCount

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Loader2 size={14} className="animate-spin" /> Loading recommended plugins...
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="card text-xs text-stone-500">
        No recommended plugins bundled with this build.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-300">
          <span className="font-semibold text-stone-100">{doneCount}</span>
          <span className="text-stone-500"> of {rows.length} installed</span>
        </span>
        {failedCount > 0 && <StatusPill tone="danger">{failedCount} failed</StatusPill>}
        {installingCount > 0 && <StatusPill tone="plume">{installingCount} running</StatusPill>}
        {marketplaceMsg && <StatusPill tone="warn">{marketplaceMsg}</StatusPill>}
        <div className="flex-1" />
        <button
          onClick={installAllMissing}
          disabled={busy || pendingCount === 0}
          className="btn-primary-inline disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {busy ? 'Installing...' : pendingCount === 0 ? 'All installed' : `Install ${pendingCount} missing`}
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-subtle surface-2">
        {rows.map((row) => (
          <PluginRow key={row.id} row={row} onInstall={() => installOne(row.id)} disabled={busy} />
        ))}
      </div>
    </div>
  )
}

function PluginRow({
  row,
  onInstall,
  disabled,
}: {
  row: PluginRowState
  onInstall: () => void
  disabled: boolean
}) {
  const [name, marketplace] = row.id.split('@')
  return (
    <div className="flex items-center gap-3 border-b border-faint px-4 py-2 last:border-b-0">
      <Package size={12} className="text-stone-500" />
      <div className="flex-1 min-w-0">
        <div className="truncate text-xs font-medium text-stone-200">{name}</div>
        <div className="truncate text-xs text-stone-500">
          {marketplace}
          {row.error && <span className="ml-2 text-rose-400">· {row.error}</span>}
        </div>
      </div>
      {row.status === 'done' ? (
        <StatusPill tone="success" icon={<Check size={11} />}>installed</StatusPill>
      ) : row.status === 'installing' ? (
        <StatusPill tone="plume" icon={<Loader2 size={11} className="animate-spin" />}>installing</StatusPill>
      ) : (
        <button
          onClick={onInstall}
          disabled={disabled}
          className={`rounded-lg border px-2 py-1 text-micro font-semibold transition-colors duration-quick ease-quiet disabled:opacity-50 ${
            row.status === 'failed'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
              : 'border-plume-500/40 bg-plume-500/10 text-plume-300 hover:bg-plume-500/20'
          }`}
        >
          {row.status === 'failed' ? 'Retry' : 'Install'}
        </button>
      )}
    </div>
  )
}

// ── Data management ──────────────────────────────────────────────────────────

function DataManagement({ onRerunOnboarding }: { onRerunOnboarding: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function handleClearAll() {
    setClearing(true)
    await clearAllData()
    setClearing(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Trash2 size={13} className="text-stone-500" />
        <span className="text-xs font-bold uppercase tracking-wide text-stone-400">Reset</span>
      </div>

      <button
        onClick={onRerunOnboarding}
        className="card-interactive flex w-full items-center gap-3 text-left"
      >
        <IconBadge size="sm" tone="zinc">
          <RefreshCw size={14} className="text-stone-300" />
        </IconBadge>
        <div className="flex-1">
          <div className="text-sm font-medium text-stone-200">Re-run setup</div>
          <div className="text-xs text-stone-500">Walks you through provider + Canvas again.</div>
        </div>
      </button>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-rose-400" />
            <div className="text-xs text-stone-300">
              Wipes all Plume Hub settings and vault entries. Your Canvas connection, provider choice, installed skills, and saved credentials all go. The app restarts.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="flex-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-quick ease-quiet hover:bg-rose-600 disabled:opacity-50"
            >
              {clearing ? <Loader2 size={12} className="animate-spin" /> : 'Yes, wipe everything'}
            </button>
            <button onClick={() => setConfirming(false)} className="btn-ghost px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-left text-rose-300 transition-colors duration-quick ease-quiet hover:border-rose-500/40 hover:bg-rose-500/10"
        >
          <IconBadge size="sm" tone="rose">
            <Trash2 size={14} />
          </IconBadge>
          <div className="flex-1">
            <div className="text-sm font-medium">Clear all data</div>
            <div className="text-xs text-rose-300/70">Settings, vault, installed skills.</div>
          </div>
        </button>
      )}
    </div>
  )
}

// ── Update row (slim, lives at the bottom) ──────────────────────────────────

function UpdateRow() {
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState<string>('')

  async function handleCheck() {
    setChecking(true)
    setMsg('')
    const result = await checkForUpdates()
    setChecking(false)
    if (result.ok) {
      setMsg(result.upToDate ? `Up to date (v${result.latestVersion})` : `Update available: v${result.latestVersion}`)
      setTimeout(() => setMsg(''), 6000)
    }
  }

  return (
    <div className="flex items-center gap-3 px-1 text-xs text-stone-500">
      <span>Plume Hub</span>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="font-semibold text-plume-300 hover:text-plume-200 disabled:opacity-50"
      >
        {checking ? 'Checking...' : 'Check for updates'}
      </button>
      {msg && <span className="text-stone-400">{msg}</span>}
    </div>
  )
}
