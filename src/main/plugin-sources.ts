import fs from 'fs'
import path from 'path'
import os from 'os'

// Enumerates installed Claude Code plugins by reading
// ~/.claude/plugins/installed_plugins.json. Each entry points at a
// directory that may contain:
//   • agents/*.md
//   • skills/<name>/SKILL.md  (or SKILL.md files at the top level)
//   • .mcp.json               (plugin-provided MCP servers)
// ...and other things we don't care about here (commands, hooks, scripts).
//
// The `installed_plugins.json` file has the shape:
//   {
//     "version": 2,
//     "plugins": {
//       "<plugin>@<marketplace>": [
//         { "scope": "project", "installPath": "...", "version": "...", ... }
//       ]
//     }
//   }
//
// Multiple entries per plugin key are possible (e.g. installed at different
// scopes). We take the first (most-recent) one per key — scanners just need
// a path to read from.

const PLUGINS_JSON = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')

export interface InstalledPlugin {
  id: string          // "plugin@marketplace"
  plugin: string
  marketplace: string
  version: string
  installPath: string
}

interface RawEntry {
  scope?: string
  projectPath?: string
  installPath?: string
  version?: string
  installedAt?: string
  lastUpdated?: string
  gitCommitSha?: string
}

interface RawFile {
  version?: number
  plugins?: Record<string, RawEntry[]>
}

export function listInstalledPlugins(): InstalledPlugin[] {
  if (!fs.existsSync(PLUGINS_JSON)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(PLUGINS_JSON, 'utf-8')) as RawFile
    const plugins = raw.plugins ?? {}
    const out: InstalledPlugin[] = []
    for (const [key, entries] of Object.entries(plugins)) {
      if (!entries || entries.length === 0) continue
      // Pick the most recently updated install if multiple.
      const entry = entries.reduce(
        (best, cur) =>
          !best || (cur.lastUpdated && cur.lastUpdated > (best.lastUpdated ?? '')) ? cur : best,
        entries[0]
      )
      if (!entry?.installPath || !fs.existsSync(entry.installPath)) continue
      const [pluginName, marketplace] = key.split('@')
      out.push({
        id: key,
        plugin: pluginName ?? key,
        marketplace: marketplace ?? '',
        version: entry.version ?? 'unknown',
        installPath: entry.installPath,
      })
    }
    return out
  } catch {
    return []
  }
}
