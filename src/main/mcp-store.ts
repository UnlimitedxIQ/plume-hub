import fs from 'fs'
import path from 'path'
import os from 'os'
import { listInstalledPlugins } from './plugin-sources'

// MCP servers come from two kinds of sources:
//   1. ~/.claude.json top-level `mcpServers` (user-scope, editable)
//   2. <plugin>/.mcp.json bundled with installed plugins (read-only)
//
// Plugin MCPs are surfaced for visibility — user edits are still constrained
// to the user-scope entries. Writes on user-scope go through a .tmp rename so
// a crash can't leave ~/.claude.json corrupt.

const CONFIG_PATH = path.join(os.homedir(), '.claude.json')

export type McpOrigin =
  | { type: 'user' }
  | { type: 'plugin'; plugin: string; marketplace: string }

export interface McpEntry {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  type?: string        // e.g. 'stdio', optional
  origin: McpOrigin
}

interface McpServerConfig {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

interface ClaudeConfig {
  mcpServers?: Record<string, McpServerConfig>
  [key: string]: unknown
}

function readConfig(): ClaudeConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {}
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
  return JSON.parse(raw) as ClaudeConfig
}

function writeConfig(config: ClaudeConfig): void {
  const serialized = JSON.stringify(config, null, 2)
  const tmp = CONFIG_PATH + '.plume-tmp'
  fs.writeFileSync(tmp, serialized, 'utf-8')
  fs.renameSync(tmp, CONFIG_PATH)
}

export function scanMcps(): McpEntry[] {
  const out: McpEntry[] = []

  // 1. User-scope MCPs from ~/.claude.json
  const config = readConfig()
  const servers = config.mcpServers ?? {}
  for (const [name, cfg] of Object.entries(servers)) {
    out.push({
      name,
      command: cfg.command ?? '',
      args: cfg.args ?? [],
      env: cfg.env ?? {},
      type: cfg.type,
      origin: { type: 'user' },
    })
  }

  // 2. Plugin-provided MCPs from each installed plugin's .mcp.json
  for (const p of listInstalledPlugins()) {
    const mcpJsonPath = path.join(p.installPath, '.mcp.json')
    if (!fs.existsSync(mcpJsonPath)) continue
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf-8')
      // Plugin .mcp.json is usually a flat map {name: {...}} but some wrap
      // it under "mcpServers" like the root config. Handle both.
      const parsed = JSON.parse(raw) as Record<string, McpServerConfig | Record<string, McpServerConfig>>
      const entries: Record<string, McpServerConfig> =
        'mcpServers' in parsed && typeof parsed.mcpServers === 'object'
          ? (parsed.mcpServers as Record<string, McpServerConfig>)
          : (parsed as Record<string, McpServerConfig>)
      for (const [name, cfg] of Object.entries(entries)) {
        if (typeof cfg !== 'object' || cfg === null) continue
        out.push({
          name,
          command: cfg.command ?? '',
          args: cfg.args ?? [],
          env: cfg.env ?? {},
          type: cfg.type,
          origin: { type: 'plugin', plugin: p.plugin, marketplace: p.marketplace },
        })
      }
    } catch {
      // Skip plugins with malformed .mcp.json
    }
  }

  return out
}

export type McpWriteInput = Omit<McpEntry, 'origin'>

export function addMcp(entry: McpWriteInput): { ok: boolean; error?: string } {
  try {
    if (!entry.name.trim()) return { ok: false, error: 'Name is required' }
    if (!entry.command.trim()) return { ok: false, error: 'Command is required' }
    const config = readConfig()
    if (!config.mcpServers) config.mcpServers = {}
    if (config.mcpServers[entry.name]) {
      return { ok: false, error: `MCP "${entry.name}" already exists` }
    }
    config.mcpServers[entry.name] = {
      type: entry.type ?? 'stdio',
      command: entry.command,
      args: entry.args ?? [],
      env: entry.env ?? {},
    }
    writeConfig(config)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function updateMcp(
  originalName: string,
  entry: McpWriteInput
): { ok: boolean; error?: string } {
  try {
    const config = readConfig()
    if (!config.mcpServers?.[originalName]) {
      return { ok: false, error: `MCP "${originalName}" not found` }
    }
    // Renaming? Remove old key first, fail if new name collides with another.
    if (originalName !== entry.name) {
      if (config.mcpServers[entry.name]) {
        return { ok: false, error: `MCP "${entry.name}" already exists` }
      }
      delete config.mcpServers[originalName]
    }
    config.mcpServers[entry.name] = {
      type: entry.type ?? 'stdio',
      command: entry.command,
      args: entry.args ?? [],
      env: entry.env ?? {},
    }
    writeConfig(config)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function removeMcp(name: string): { ok: boolean; error?: string } {
  try {
    const config = readConfig()
    if (!config.mcpServers?.[name]) {
      return { ok: false, error: `MCP "${name}" not found` }
    }
    delete config.mcpServers[name]
    writeConfig(config)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
