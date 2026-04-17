// CLI provider detection for claude and codex.
//
// Three-layer resolution:
//   1. Try `where` (Windows) / `command -v` (Mac/Linux) against the enriched
//      process.env.PATH. If found, return that path — it's what the shell
//      would resolve when the user types the command.
//   2. If the which/where command fails, walk a curated list of known install
//      locations and stat each one. This catches users whose PATH is broken
//      but who DID install the CLI via one of the standard installers.
//   3. Record every path we checked so the UI can show a diagnostic panel
//      telling the user what we looked for.

import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface DetectedProvider {
  detected: boolean
  path: string | null
  checkedPaths: string[]
}

export interface ProviderDetection {
  claude: DetectedProvider
  codex: DetectedProvider
}

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

function tryWhich(cmd: string): string | null {
  try {
    // `where` on Windows, `command -v` on POSIX. Both print the resolved
    // path on stdout when found, and return non-zero when not.
    const invocation = isWin ? `where ${cmd}` : `command -v ${cmd}`
    const out = execSync(invocation, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
      // On Windows, `where` is a PE executable so spawn works. On POSIX,
      // `command -v` is a shell builtin so we must go through /bin/sh.
      shell: isWin ? undefined : '/bin/sh',
    })
    const firstLine = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
    return firstLine || null
  } catch {
    return null
  }
}

function knownInstallPaths(cmd: 'claude' | 'codex'): string[] {
  const home = os.homedir()
  const paths: string[] = []

  if (isWin) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    // npm global shim location — most common install path on Windows.
    paths.push(
      path.join(appData, 'npm', `${cmd}.cmd`),
      path.join(appData, 'npm', `${cmd}.ps1`),
      path.join(appData, 'npm', cmd),
    )
    // Official Claude installer puts claude.exe under %LOCALAPPDATA%\Programs\.
    if (cmd === 'claude') {
      paths.push(path.join(localAppData, 'Programs', 'claude', 'claude.exe'))
    }
    // ~/.claude/local for some install variants.
    paths.push(path.join(home, '.claude', 'local', `${cmd}.cmd`))
    paths.push(path.join(home, '.claude', 'local', cmd))
    return paths
  }

  // Mac + Linux
  const baseDirs = [
    '/usr/local/bin',
    '/usr/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.yarn', 'bin'),
    path.join(home, '.claude', 'local'),
  ]
  if (isMac) {
    baseDirs.unshift('/opt/homebrew/bin')
  }
  for (const dir of baseDirs) {
    paths.push(path.join(dir, cmd))
  }
  return paths
}

function detectOne(cmd: 'claude' | 'codex'): DetectedProvider {
  const checkedPaths: string[] = []

  // Layer 1: which / where on PATH
  const viaPath = tryWhich(cmd)
  if (viaPath && fs.existsSync(viaPath)) {
    return { detected: true, path: viaPath, checkedPaths: [`${isWin ? 'where' : 'command -v'} ${cmd} → ${viaPath}`] }
  }
  checkedPaths.push(`${isWin ? 'where' : 'command -v'} ${cmd} → not found on PATH`)

  // Layer 2: known install-path fallback
  for (const p of knownInstallPaths(cmd)) {
    checkedPaths.push(p)
    if (fs.existsSync(p)) {
      return { detected: true, path: p, checkedPaths }
    }
  }

  return { detected: false, path: null, checkedPaths }
}

export function detectProviders(): ProviderDetection {
  return {
    claude: detectOne('claude'),
    codex: detectOne('codex'),
  }
}
