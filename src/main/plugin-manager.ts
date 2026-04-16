import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Small wrapper around the `claude plugin` CLI. Plume Hub uses this to:
//   • surface the author's recommended plugin list to new users
//   • detect which of those plugins the user already has installed
//   • run `claude plugin install <id>` on demand from the Settings panel
//
// Shell-out boundary: every subprocess is launched via cmd.exe /c so that
// %PATH% resolution uses the user's shell, matching how interactive Claude
// Code runs. Failures are captured and surfaced — we never silently swallow.

export interface PluginInstallResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}

interface InstalledPluginsFile {
  plugins?: Record<string, unknown>
}

// ── Paths ────────────────────────────────────────────────────────────────────

export function resolveBundledLibraryDir(): string {
  const devPath = path.join(process.cwd(), 'resources', 'bundled-library')
  if (process.env.NODE_ENV === 'development') return devPath
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'bundled-library')
    if (fs.existsSync(prodPath)) return prodPath
  }
  return devPath
}

function recommendedManifestPath(): string {
  return path.join(resolveBundledLibraryDir(), 'recommended-plugins.json')
}

function installedPluginsPath(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read the bundled list of recommended plugin IDs. Each entry is in
 * "<plugin>@<marketplace>" form — the same shape `claude plugin install`
 * accepts. Returns [] if the manifest is missing (dev mode with no bundle,
 * or a build that skipped the bundle step).
 */
export function listRecommendedPlugins(): string[] {
  try {
    const raw = fs.readFileSync(recommendedManifestPath(), 'utf-8')
    const parsed = JSON.parse(raw) as { plugins?: string[] }
    return Array.isArray(parsed.plugins) ? parsed.plugins : []
  } catch {
    return []
  }
}

/**
 * Read the set of plugin IDs the user already has installed, by parsing
 * ~/.claude/plugins/installed_plugins.json. Returns an empty Set if the
 * file doesn't exist yet (Claude Code hasn't touched plugins).
 */
export function listInstalledPluginIds(): Set<string> {
  try {
    const raw = fs.readFileSync(installedPluginsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as InstalledPluginsFile
    return new Set(Object.keys(parsed.plugins ?? {}))
  } catch {
    return new Set()
  }
}

/**
 * Ensure both marketplaces the recommended plugins live in are registered
 * with the user's claude CLI. `claude plugin marketplace add` is idempotent —
 * rerunning on an already-registered source is a fast no-op.
 *
 * Returns per-marketplace results so the UI can surface specific failures
 * (e.g. rate-limited GitHub, no network).
 */
export async function ensureMarketplacesRegistered(): Promise<{
  results: Array<{ source: string; ok: boolean; error?: string }>
}> {
  const sources = [
    'anthropics/claude-plugins-official',
    'anthropics/skills',
  ]
  const results: Array<{ source: string; ok: boolean; error?: string }> = []
  for (const source of sources) {
    const res = await runClaudeCli(['plugin', 'marketplace', 'add', source])
    results.push({
      source,
      ok: res.ok,
      error: res.ok ? undefined : (res.stderr || res.stdout || 'unknown error').slice(0, 500),
    })
  }
  return { results }
}

/**
 * Install one plugin via `claude plugin install <id>`. The id is expected in
 * "<plugin>@<marketplace>" form.
 */
export async function installPlugin(id: string): Promise<PluginInstallResult> {
  return runClaudeCli(['plugin', 'install', id])
}

// ── Shell-out helper ─────────────────────────────────────────────────────────

function runClaudeCli(args: string[]): Promise<PluginInstallResult> {
  return new Promise((resolve) => {
    // cmd.exe /c lets PATH resolve the same way the user's interactive shell
    // does. Electron's env PATH on Windows can differ from the user shell's,
    // so this bridges the gap.
    const child = spawn('cmd.exe', ['/c', 'claude', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('error', (err) => {
      resolve({ ok: false, stdout, stderr: stderr + '\n' + err.message, exitCode: null })
    })
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
      })
    })
  })
}
