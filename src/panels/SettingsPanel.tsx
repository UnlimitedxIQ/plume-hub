import React, { useEffect, useState } from 'react'
import {
  CheckCircle2, XCircle, Loader2, Settings as SettingsIcon,
  Zap, GraduationCap, Monitor, Info, RefreshCw, Key, Trash2,
  AlertTriangle, Plus, Download, Package, Check,
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

interface Settings {
  canvasBaseUrl: string
  canvasToken: string
  canvasCourseIds: number[]
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  refreshIntervalMinutes: number
  clickAwayToHide: boolean
  claudeMdTemplate: string
  preferredProvider: 'claude' | 'codex' | null
  onboardingComplete: boolean
}

type TokenStatus = 'idle' | 'testing' | 'ok' | 'error'

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('idle')
  const [tokenUser, setTokenUser] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [courseInput, setCourseInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [providers, setProviders] = useState<{ claude: boolean; codex: boolean } | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s as Settings)
      setCourseInput((s.canvasCourseIds as number[]).join(', '))
    })
    detectProviders().then(setProviders)
  }, [])

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
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
      setTokenError((result.error as string) ?? 'Invalid token')
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

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    const ids = courseInput
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
    const toSave = { ...settings, canvasCourseIds: ids }
    await saveSettings(toSave as unknown as Record<string, unknown>)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function rerunOnboarding() {
    await saveSettings({ onboardingComplete: false } as Record<string, unknown>)
    window.location.reload()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
          <SettingsIcon size={16} className="text-plume-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-zinc-100">Settings</h2>
          <p className="text-xs text-zinc-500">Configure Plume Hub and connected services</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-plume-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-plume-600 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={12} />
          ) : null}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
          {/* ── AI Providers ─────────────────────────────────────────────── */}
          <Section icon={<Zap size={14} />} title="AI Providers" description="Plume launches your terminal AI tool for each assignment">
            <div className="flex flex-col gap-2">
              <ProviderRow
                name="Claude CLI"
                detected={providers?.claude ?? false}
                active={settings.preferredProvider === 'claude'}
                onSetActive={() => update('preferredProvider', 'claude')}
                installUrl="https://claude.ai/download"
              />
              <ProviderRow
                name="Codex CLI"
                detected={providers?.codex ?? false}
                active={settings.preferredProvider === 'codex'}
                onSetActive={() => update('preferredProvider', 'codex')}
                installUrl="https://github.com/openai/codex"
              />
            </div>
          </Section>

          {/* ── Canvas ───────────────────────────────────────────────────── */}
          <Section icon={<GraduationCap size={14} />} title="Canvas LMS" description="Connect your Canvas account to see upcoming assignments">
            <div className="flex flex-col gap-4">
              <Field label="Base URL">
                <input
                  className="input-field"
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
                    placeholder="your-canvas-token"
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
                    {tokenStatus === 'testing' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </button>
                </div>
                {tokenStatus === 'ok' && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={11} /> Connected as {tokenUser}
                  </span>
                )}
                {tokenStatus === 'error' && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-red-400">
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
                <span className="mt-1 text-xs text-zinc-600">
                  Comma-separated Canvas course IDs
                </span>
              </Field>

              <Field label="Refresh interval">
                <select
                  className="input-field"
                  value={settings.refreshIntervalMinutes}
                  onChange={(e) => update('refreshIntervalMinutes', Number(e.target.value))}
                >
                  {[5, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      Every {m} minutes
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          {/* ── Appearance ───────────────────────────────────────────────── */}
          <Section icon={<Monitor size={14} />} title="Appearance" description="How Plume's icon behaves on your desktop">
            <div className="flex flex-col gap-4">
              <Field label="Icon corner">
                <select
                  className="input-field"
                  value={settings.corner}
                  onChange={(e) => update('corner', e.target.value as Settings['corner'])}
                >
                  <option value="top-right">Top right</option>
                  <option value="top-left">Top left</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </select>
              </Field>

              <ToggleRow
                label="Collapse on click-away"
                description="Close the panel or dropdown when you click outside of it"
                checked={settings.clickAwayToHide}
                onChange={(v) => update('clickAwayToHide', v)}
              />
            </div>
          </Section>

          {/* ── Vault ────────────────────────────────────────────────────── */}
          <Section
            icon={<Key size={14} />}
            title="Vault"
            description="Encrypted local storage for API tokens and credentials. Values are encrypted via your OS keychain."
          >
            <VaultManager />
          </Section>

          {/* ── Recommended plugins ─────────────────────────────────────── */}
          <Section
            icon={<Package size={14} />}
            title="Recommended plugins"
            description="Install the Claude Code plugins bundled with Plume. Each one is fetched fresh from its marketplace via `claude plugin install` — you can skip any you don't want."
          >
            <RecommendedPluginsManager />
          </Section>

          {/* ── Data management ──────────────────────────────────────────── */}
          <Section icon={<Trash2 size={14} />} title="Data Management">
            <DataManagement />
          </Section>

          {/* ── Advanced ─────────────────────────────────────────────────── */}
          <Section icon={<Info size={14} />} title="Advanced">
            <button
              onClick={rerunOnboarding}
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:border-white/20"
            >
              <RefreshCw size={14} className="text-zinc-400" />
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-200">Re-run onboarding</div>
                <div className="text-xs text-zinc-500">Go through the setup wizard again</div>
              </div>
            </button>
          </Section>
        </div>
      </div>
    </div>
  )
}

// ── Vault manager ─────────────────────────────────────────────────────────────

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
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <Loader2 size={14} className="animate-spin text-zinc-500" />
        <span className="text-xs text-zinc-500">Loading vault…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {entries && entries.length > 0 ? (
        entries.map((entry) => (
          <div
            key={entry.key}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-200">{entry.label}</div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-zinc-500">
                <span>{entry.key}</span>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-400">{entry.maskedValue}</span>
              </div>
            </div>
            <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              {entry.category}
            </span>
            <button
              onClick={() => handleDelete(entry.key)}
              title="Delete"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 px-4 py-6 text-center">
          <Key size={20} className="mx-auto mb-2 text-zinc-600" />
          <p className="text-xs text-zinc-500">No entries yet. Add credentials to use them with MCP servers.</p>
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
              className="rounded-lg bg-plume-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-plume-600 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 bg-zinc-900/40 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:border-plume-500/40 hover:bg-plume-500/5 hover:text-plume-300"
        >
          <Plus size={12} /> Add entry
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
      }))
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
          : row
      )
    )
  }

  async function installAllMissing() {
    if (busy) return
    setBusy(true)
    setMarketplaceMsg('Registering marketplaces…')
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
    // Refresh once more to pick up any state changes the installer itself wrote.
    refresh()
  }

  const doneCount = rows.filter((r) => r.status === 'done').length
  const installingCount = rows.filter((r) => r.status === 'installing').length
  const failedCount = rows.filter((r) => r.status === 'failed').length
  const pendingCount = rows.length - doneCount

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-zinc-500">
        <Loader2 size={14} className="animate-spin" /> Loading recommended plugins…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-500">
        No recommended plugins bundled with this Plume Hub build.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary + bulk action */}
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <div className="flex-1 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-200">
            {doneCount} / {rows.length}
          </span>
          {' '}installed
          {failedCount > 0 && <span className="ml-2 text-red-400">· {failedCount} failed</span>}
          {installingCount > 0 && <span className="ml-2 text-plume-300">· {installingCount} running</span>}
          {marketplaceMsg && <div className="mt-1 text-[11px] text-amber-400">{marketplaceMsg}</div>}
        </div>
        <button
          onClick={installAllMissing}
          disabled={busy || pendingCount === 0}
          className="flex items-center gap-1.5 rounded-lg bg-plume-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-plume-600 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {busy ? 'Installing…' : pendingCount === 0 ? 'All installed' : `Install ${pendingCount} missing`}
        </button>
      </div>

      {/* Per-plugin list */}
      <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/40">
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
  // Split "plugin@marketplace" for cleaner display
  const [name, marketplace] = row.id.split('@')

  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2 last:border-b-0">
      <Package size={12} className="text-zinc-500" />
      <div className="flex-1 min-w-0">
        <div className="truncate text-xs font-medium text-zinc-200">{name}</div>
        <div className="truncate text-[10px] text-zinc-600">
          {marketplace}
          {row.error && <span className="ml-2 text-red-400">· {row.error}</span>}
        </div>
      </div>
      {row.status === 'done' ? (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-plume-300">
          <Check size={11} /> installed
        </span>
      ) : row.status === 'installing' ? (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-plume-300">
          <Loader2 size={11} className="animate-spin" /> installing
        </span>
      ) : (
        <button
          onClick={onInstall}
          disabled={disabled}
          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
            row.status === 'failed'
              ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
              : 'border-plume-500/40 bg-plume-500/10 text-plume-300 hover:bg-plume-500/20'
          } disabled:opacity-50`}
        >
          {row.status === 'failed' ? 'Retry' : 'Install'}
        </button>
      )}
    </div>
  )
}

// ── Data management ───────────────────────────────────────────────────────────

function DataManagement() {
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  async function handleCheckUpdates() {
    setChecking(true)
    setUpdateMsg('')
    const result = await checkForUpdates()
    setChecking(false)
    if (result.ok) {
      setUpdateMsg(result.upToDate ? `Up to date (v${result.latestVersion})` : `Update available: v${result.latestVersion}`)
      setTimeout(() => setUpdateMsg(''), 4000)
    }
  }

  async function handleClearAll() {
    setClearing(true)
    await clearAllData()
    // App will relaunch; this line rarely reached
    setClearing(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleCheckUpdates}
        disabled={checking}
        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:border-white/20 disabled:opacity-50"
      >
        {checking ? (
          <Loader2 size={14} className="animate-spin text-zinc-400" />
        ) : (
          <Download size={14} className="text-zinc-400" />
        )}
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-200">Check for updates</div>
          <div className="text-xs text-zinc-500">{updateMsg || 'See if a newer version of Plume Hub is available'}</div>
        </div>
      </button>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-400" />
            <div className="text-xs text-zinc-300">
              This will delete all Plume Hub settings and vault entries. Your Canvas connection, provider choice, installed skills, and saved credentials will be wiped. The app will restart.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {clearing ? <Loader2 size={12} className="animate-spin" /> : 'Yes, wipe everything'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
        >
          <Trash2 size={14} />
          <div className="flex-1">
            <div className="text-sm font-medium">Clear all data</div>
            <div className="text-xs text-red-400/70">Wipe settings, vault, and installed skills</div>
          </div>
        </button>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-plume-400">{icon}</span>
        <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
      </div>
      {description && (
        <p className="mb-3 text-xs text-zinc-500">{description}</p>
      )}
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

// ── Provider Row ──────────────────────────────────────────────────────────────

function ProviderRow({
  name,
  detected,
  active,
  onSetActive,
  installUrl,
}: {
  name: string
  detected: boolean
  active: boolean
  onSetActive: () => void
  installUrl: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
        detected ? 'bg-emerald-500/15' : 'bg-zinc-800/50'
      }`}>
        {detected ? (
          <CheckCircle2 size={14} className="text-emerald-400" />
        ) : (
          <XCircle size={14} className="text-zinc-600" />
        )}
      </div>

      <div className="flex-1">
        <div className="text-sm font-semibold text-zinc-100">{name}</div>
        <div className={`text-xs ${detected ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {detected ? 'Installed and ready' : 'Not detected'}
        </div>
      </div>

      {detected ? (
        <button
          onClick={onSetActive}
          disabled={active}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            active
              ? 'bg-plume-500/20 text-plume-300'
              : 'border border-white/10 text-zinc-400 hover:bg-white/5'
          }`}
        >
          {active ? 'ACTIVE' : 'Use this'}
        </button>
      ) : (
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-plume-400 hover:underline"
        >
          Install →
        </a>
      )}
    </div>
  )
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        {description && <div className="text-xs text-zinc-500">{description}</div>}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-plume-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
