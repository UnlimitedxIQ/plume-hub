// Enrich `process.env.PATH` so child_process can find CLIs installed in the
// user's interactive shell environment.
//
// Why this exists:
//   • GUI-launched Electron apps inherit a STRIPPED PATH from the parent
//     process (Explorer on Windows, launchd on Mac).
//   • Mac from Finder/Launchpad: PATH is usually `/usr/bin:/bin:/usr/sbin:/sbin`
//     — no Homebrew, no npm global, no nvm/fnm/volta shims.
//   • Windows from Start Menu: PATH is Explorer's PATH, which often lacks
//     `%APPDATA%\npm` (where `claude.cmd` lives after `npm i -g`).
//
// Strategy:
//   • Mac/Linux: spawn `$SHELL -ilc 'echo $PATH'` to get the user's real
//     interactive shell PATH, merge into process.env.PATH. This is what
//     `fix-path` does but inlined so we don't take a dep on an ESM-only v4
//     or the abandoned v3.
//   • Windows: read HKCU\Environment!Path and HKLM\...Environment!Path from
//     the registry (where "Set for your account" vs "Set for the system" live),
//     merge with a curated list of common install dirs (%APPDATA%\npm, etc.).
//
// All operations are best-effort — if any step fails we leave PATH alone
// rather than crashing startup. The launcher fallback (`Get-Command claude`
// inside PowerShell) still works in the degraded case.

import { execSync } from 'child_process'
import os from 'os'
import path from 'path'

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

function dedupe(entries: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of entries) {
    if (!e) continue
    // Normalize trailing slashes and case on Windows (case-insensitive paths).
    const key = isWin ? e.toLowerCase().replace(/[\\/]+$/, '') : e.replace(/\/+$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

function readShellPath(): string | null {
  // $SHELL gives the user's login shell (/bin/zsh on modern macOS, /bin/bash
  // on most Linux). `-ilc` = interactive + login, so the shell sources
  // /etc/profile, ~/.zprofile, ~/.zshrc, etc. Sentinel brackets the echo so
  // we can reliably extract PATH even if the shell prints MOTDs or greetings.
  const shell = process.env.SHELL || '/bin/bash'
  try {
    const out = execSync(`${shell} -ilc 'echo "__PLUME_PATH_START__$PATH__PLUME_PATH_END__"'`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const m = out.match(/__PLUME_PATH_START__(.*)__PLUME_PATH_END__/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

function readWindowsRegistryPath(hive: 'HKCU' | 'HKLM'): string | null {
  const key =
    hive === 'HKCU'
      ? 'HKCU\\Environment'
      : 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
  try {
    const out = execSync(`reg query "${key}" /v Path`, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    // Output looks like:
    //   HKEY_CURRENT_USER\Environment
    //       Path    REG_EXPAND_SZ    C:\foo;C:\bar
    const m = out.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/)
    if (!m) return null
    // Expand %VAR% references.
    return m[1].replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? '')
  } catch {
    return null
  }
}

function commonNpmDirs(): string[] {
  const home = os.homedir()
  if (isWin) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    return [
      path.join(appData, 'npm'),
      path.join(localAppData, 'Programs', 'claude'),
      path.join(home, '.claude', 'local'),
    ]
  }
  // Mac + Linux
  const dirs = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.yarn', 'bin'),
    path.join(home, '.nvm', 'versions', 'node'),
    path.join(home, '.claude', 'local'),
  ]
  if (isMac) {
    dirs.unshift('/opt/homebrew/bin', '/opt/homebrew/sbin')
  }
  return dirs
}

/**
 * Enrich process.env.PATH with entries from the user's interactive shell
 * (Mac/Linux) or Windows registry, plus a curated list of common install
 * dirs. Safe to call multiple times — dedupes entries.
 */
export function enrichProcessPath(): void {
  const sep = path.delimiter
  const current = (process.env.PATH || '').split(sep).filter(Boolean)

  const additions: string[] = []

  if (isWin) {
    const userPath = readWindowsRegistryPath('HKCU')
    const systemPath = readWindowsRegistryPath('HKLM')
    if (userPath) additions.push(...userPath.split(sep))
    if (systemPath) additions.push(...systemPath.split(sep))
  } else {
    const shellPath = readShellPath()
    if (shellPath) additions.push(...shellPath.split(sep))
  }

  additions.push(...commonNpmDirs())

  const merged = dedupe([...current, ...additions])
  process.env.PATH = merged.join(sep)
}
