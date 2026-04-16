import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * MCP server installer for Plume Hub.
 *
 * Reads and writes ~/.claude.json to register or unregister MCP servers under
 * the `mcpServers` key. Credential placeholders of the form `${vault:keyName}`
 * inside config template env values are resolved against a caller-provided
 * credentials map. The vault itself is NOT touched here — the IPC layer is
 * responsible for fetching credentials from the Plume vault and passing them
 * in before invoking installMcp.
 */

export interface McpConfigTemplateInput {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface InstallMcpArgs {
  id: string                              // the MCP id (e.g. 'github')
  configTemplate: McpConfigTemplateInput  // passed in from the caller
  credentials: Record<string, string>     // resolved credentials: { 'github-pat': 'ghp_actual_value' }
}

export interface McpInstallResult {
  ok: boolean
  error?: string
}

interface ResolvedConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

const CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json')
const TMP_PATH = `${CLAUDE_JSON_PATH}.tmp`
const PLACEHOLDER_REGEX = /\$\{vault:([a-zA-Z0-9-]+)\}/g

/**
 * Read ~/.claude.json. If the file doesn't exist, return an empty object.
 * If the file exists but cannot be parsed, return an error.
 */
function readClaudeJson(): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!existsSync(CLAUDE_JSON_PATH)) {
    return { ok: true, data: {} }
  }
  try {
    const raw = readFileSync(CLAUDE_JSON_PATH, 'utf-8')
    if (raw.trim() === '') {
      return { ok: true, data: {} }
    }
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'claude.json is corrupt' }
    }
    return { ok: true, data: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, error: 'claude.json is corrupt' }
  }
}

/**
 * Write the given object back to ~/.claude.json atomically by writing to a
 * .tmp sibling file first and then renaming over the destination.
 */
function writeClaudeJsonAtomic(data: Record<string, unknown>): void {
  const serialized = `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(TMP_PATH, serialized, 'utf-8')
  renameSync(TMP_PATH, CLAUDE_JSON_PATH)
}

/**
 * Resolve `${vault:KEY}` placeholders in env values using the credentials map.
 * Returns the resolved env, or the missing key on the first lookup failure.
 */
function resolvePlaceholders(
  env: Record<string, string> | undefined,
  credentials: Record<string, string>
): { ok: true; env: Record<string, string> | undefined } | { ok: false; missingKey: string } {
  if (!env) {
    return { ok: true, env: undefined }
  }

  const resolved: Record<string, string> = {}
  for (const [envKey, envValue] of Object.entries(env)) {
    let missing: string | null = null
    const next = envValue.replace(PLACEHOLDER_REGEX, (_match, key: string) => {
      if (!(key in credentials)) {
        if (missing === null) missing = key
        return ''
      }
      return credentials[key]
    })
    if (missing !== null) {
      return { ok: false, missingKey: missing }
    }
    resolved[envKey] = next
  }
  return { ok: true, env: resolved }
}

/**
 * Install (or upgrade) an MCP server entry in ~/.claude.json. The existing
 * top-level keys and any other mcpServers entries are preserved.
 */
export async function installMcp(args: InstallMcpArgs): Promise<McpInstallResult> {
  try {
    const read = readClaudeJson()
    if (!read.ok) {
      return { ok: false, error: read.error }
    }
    const existing = read.data

    const resolvedEnv = resolvePlaceholders(args.configTemplate.env, args.credentials)
    if (!resolvedEnv.ok) {
      return { ok: false, error: `Missing credential: ${resolvedEnv.missingKey}` }
    }

    const substituted: ResolvedConfig = {
      command: args.configTemplate.command,
      args: [...args.configTemplate.args],
    }
    if (resolvedEnv.env !== undefined) {
      substituted.env = resolvedEnv.env
    }

    const existingMcpServers =
      existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
        ? (existing.mcpServers as Record<string, unknown>)
        : {}

    const next: Record<string, unknown> = {
      ...existing,
      mcpServers: {
        ...existingMcpServers,
        [args.id]: substituted,
      },
    }

    writeClaudeJsonAtomic(next)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

/**
 * Remove an MCP server entry from ~/.claude.json. No-op (still ok) if the id
 * is not present in the existing mcpServers map.
 */
export async function uninstallMcp(id: string): Promise<McpInstallResult> {
  try {
    const read = readClaudeJson()
    if (!read.ok) {
      return { ok: false, error: read.error }
    }
    const existing = read.data

    const existingMcpServers =
      existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
        ? (existing.mcpServers as Record<string, unknown>)
        : {}

    if (!(id in existingMcpServers)) {
      // No-op: still write nothing if the file did not exist, otherwise leave alone.
      // Returning ok lets callers treat uninstall as idempotent.
      return { ok: true }
    }

    const nextMcpServers: Record<string, unknown> = { ...existingMcpServers }
    delete nextMcpServers[id]

    const next: Record<string, unknown> = {
      ...existing,
      mcpServers: nextMcpServers,
    }

    writeClaudeJsonAtomic(next)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
