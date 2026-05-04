import React, { useState } from 'react'
import { Loader2, Plus, Check } from 'lucide-react'
import type { UseCase } from '../../lib/marketplace-data'
import type { LivePack, LiveMcp } from '../../lib/store'

interface Props {
  useCase: UseCase
  packs: LivePack[]
  mcps: LiveMcp[]
  onInstallPack: (id: string) => Promise<void> | void
  onInstallMcp?: (id: string) => Promise<void> | void
}

/**
 * One use-case block. Top: headline + one-sentence body, plus an "Install
 * what's needed" CTA that bulk-installs everything not already present.
 * Expand to see the items individually with per-item install status.
 */
export function UseCaseCard({ useCase, packs, mcps, onInstallPack, onInstallMcp }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  const matchingPacks = useCase.packIds
    .map((id) => packs.find((p) => p.id === id))
    .filter((p): p is LivePack => Boolean(p))
  const matchingMcps = useCase.mcpIds
    .map((id) => mcps.find((m) => m.id === id))
    .filter((m): m is LiveMcp => Boolean(m))

  const missingPacks = matchingPacks.filter((p) => !p.installed && !p.preInstalled)
  const missingMcps = matchingMcps.filter((m) => !m.installed && !m.preInstalled && (m.requiredCredentials?.length ?? 0) === 0)
  const totalItems = matchingPacks.length + matchingMcps.length
  const installedItems = totalItems - missingPacks.length - missingMcps.length
  const missingCount = missingPacks.length + missingMcps.length
  const allInstalled = missingCount === 0

  async function handleBulkInstall() {
    if (busy || allInstalled) return
    setBusy(true)
    for (const p of missingPacks) {
      await onInstallPack(p.id)
    }
    for (const m of missingMcps) {
      if (onInstallMcp) await onInstallMcp(m.id)
    }
    setBusy(false)
  }

  const Icon = useCase.Icon

  return (
    <article className="overflow-hidden rounded-xl border border-subtle surface-2">
      <header className="flex items-start gap-3 p-5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-plume-700/40 text-plumeyellow-400">
          <Icon size={18} />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-bold text-stone-50">{useCase.headline}</h3>
          <p className="mt-1 text-sm text-stone-400">{useCase.body}</p>
        </div>
        {allInstalled ? (
          <span className="pill pill-success"><Check size={11} /> Ready</span>
        ) : (
          <button
            onClick={handleBulkInstall}
            disabled={busy}
            className="btn-yellow px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {busy ? 'Installing' : `Install ${missingCount}`}
          </button>
        )}
      </header>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 border-t border-faint px-5 py-2 text-left text-micro text-stone-500 transition-colors duration-quick ease-quiet hover:bg-white/[0.03]"
      >
        <span>{installedItems} of {totalItems} ready</span>
        <span className="text-stone-700">·</span>
        <span>{matchingPacks.length} packs, {matchingMcps.length} MCPs</span>
        <div className="flex-1" />
        <span>{expanded ? 'Hide' : 'See what\'s in it'}</span>
      </button>

      <div className={expanded ? 'row-expanded' : 'row-collapsed'}>
        <div>
          <div className="border-t border-faint p-4">
            <div className="mb-2 text-micro font-bold uppercase tracking-wide text-stone-500">Skill packs</div>
            <ul className="space-y-1.5">
              {matchingPacks.map((p) => (
                <ItemRow
                  key={p.id}
                  name={p.name}
                  description={p.description}
                  status={p.preInstalled ? 'built-in' : p.installed ? 'installed' : 'missing'}
                  installing={p.installing === true}
                  onInstall={p.preInstalled || p.installed ? undefined : () => onInstallPack(p.id)}
                />
              ))}
            </ul>
            <div className="mt-4 mb-2 text-micro font-bold uppercase tracking-wide text-stone-500">MCP servers</div>
            <ul className="space-y-1.5">
              {matchingMcps.map((m) => (
                <ItemRow
                  key={m.id}
                  name={m.name}
                  description={m.description}
                  status={m.preInstalled ? 'built-in' : m.installed ? 'installed' : (m.requiredCredentials?.length ?? 0) > 0 ? 'needs-credentials' : 'missing'}
                  installing={m.installing === true}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </article>
  )
}

function ItemRow({
  name,
  description,
  status,
  installing,
  onInstall,
}: {
  name: string
  description: string
  status: 'built-in' | 'installed' | 'missing' | 'needs-credentials'
  installing?: boolean
  onInstall?: () => void
}) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="mt-1 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stone-600" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-stone-200">{name}</div>
        <div className="text-micro text-stone-500">{description}</div>
      </div>
      {status === 'built-in' && <span className="pill pill-success">Built-in</span>}
      {status === 'installed' && <span className="pill pill-success">Installed</span>}
      {status === 'needs-credentials' && <span className="pill pill-warn">Needs key</span>}
      {status === 'missing' && (
        installing ? (
          <span className="pill pill-plume"><Loader2 size={10} className="animate-spin" /> Installing</span>
        ) : onInstall ? (
          <button
            onClick={onInstall}
            className="pill pill-plume hover:bg-plume-500/25"
          >
            <Plus size={10} /> Add
          </button>
        ) : null
      )}
    </li>
  )
}
