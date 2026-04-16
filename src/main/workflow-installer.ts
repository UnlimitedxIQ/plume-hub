import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Ensures `~/.claude/agents/plume-assignment-workflow.md` is up to date with
 * the version bundled inside the Plume Hub app.
 *
 * Update strategy: version-stamped overwrite. The bundled file carries a
 * `# version: N` line on its own (after the YAML frontmatter). On every call
 * we read the installed version and copy the bundled file over only when the
 * bundled version is strictly greater. This propagates plume releases
 * automatically while still allowing the user to hand-edit between releases —
 * hand edits are temporary scratch and will be overwritten on the next bump.
 *
 * Failures never throw — the launcher must continue even if the workflow
 * agent file can't be written (e.g. read-only home dir on a managed machine).
 */

/**
 * The bundled workflow agent files. Each one is a self-contained Claude Code
 * subagent that handles a different shape of student work. The launcher picks
 * which one to delegate to based on the WorkflowMode the user clicked.
 */
export const WORKFLOW_FILENAMES = [
  'plume-think-workflow.md',
  'plume-draft-workflow.md',
  'plume-build-workflow.md',
  'plume-study-workflow.md',
  'optimize-skills.md',
] as const

const VERSION_REGEX = /^# version:\s*(\d+)/m

export interface FileInstallResult {
  filename: string
  ok: boolean
  installedVersion?: number
  /** True if the file was copied (cold install or upgrade), false if no-op. */
  wrote?: boolean
  error?: string
}

export interface InstallAllResult {
  ok: boolean
  results: FileInstallResult[]
}

/**
 * Resolve the bundled plume-skills directory.
 * Mirrors the dev/prod fallback ladder used in `skill-installer.ts`.
 *
 * In dev: <cwd>/resources/plume-skills
 * In prod: <process.resourcesPath>/plume-skills
 */
function resolveBundledDir(): string {
  const devPath = path.join(process.cwd(), 'resources', 'plume-skills')
  if (process.env.NODE_ENV === 'development') {
    return devPath
  }
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'plume-skills')
    if (fs.existsSync(prodPath)) {
      return prodPath
    }
  }
  if (fs.existsSync(devPath)) {
    return devPath
  }
  return devPath
}

/**
 * Resolve the user's Claude agents directory and ensure it exists.
 */
function resolveAgentsDir(): string {
  const agentsDir = path.join(os.homedir(), '.claude', 'agents')
  fs.mkdirSync(agentsDir, { recursive: true })
  return agentsDir
}

/**
 * Parse the `# version: N` line out of an agent file body.
 * Returns 0 when the line is missing or unparseable — that's intentional, it
 * means any older hand-rolled file gets upgraded by the first bundled version.
 */
function parseVersion(content: string): number {
  const match = content.match(VERSION_REGEX)
  if (!match) return 0
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Install (or upgrade) a single workflow agent file.
 * Cold install copies unconditionally. Upgrade copies only when bundled version
 * is strictly greater than installed version.
 */
function installOne(filename: string, bundledDir: string, agentsDir: string): FileInstallResult {
  try {
    const bundledPath = path.join(bundledDir, filename)
    if (!fs.existsSync(bundledPath)) {
      return { filename, ok: false, error: `Bundled file missing at ${bundledPath}` }
    }

    const bundledContent = fs.readFileSync(bundledPath, 'utf-8')
    const bundledVersion = parseVersion(bundledContent)

    const installedPath = path.join(agentsDir, filename)

    // Cold install
    if (!fs.existsSync(installedPath)) {
      fs.writeFileSync(installedPath, bundledContent, 'utf-8')
      return { filename, ok: true, installedVersion: bundledVersion, wrote: true }
    }

    // Upgrade decision
    const installedContent = fs.readFileSync(installedPath, 'utf-8')
    const installedVersion = parseVersion(installedContent)

    if (bundledVersion > installedVersion) {
      fs.writeFileSync(installedPath, bundledContent, 'utf-8')
      return { filename, ok: true, installedVersion: bundledVersion, wrote: true }
    }

    // No-op: installed is current (or newer — leave hand-edits alone)
    return { filename, ok: true, installedVersion, wrote: false }
  } catch (error) {
    return { filename, ok: false, error: (error as Error).message }
  }
}

/**
 * Ensure all bundled workflow agents are installed and up to date.
 * One bad file does not block the others — each is independent.
 */
export function ensureWorkflowAgentsInstalled(): InstallAllResult {
  const bundledDir = resolveBundledDir()
  let agentsDir: string
  try {
    agentsDir = resolveAgentsDir()
  } catch (error) {
    return {
      ok: false,
      results: WORKFLOW_FILENAMES.map((filename) => ({
        filename,
        ok: false,
        error: `Could not create agents dir: ${(error as Error).message}`,
      })),
    }
  }

  const results = WORKFLOW_FILENAMES.map((filename) => installOne(filename, bundledDir, agentsDir))

  // Independently: ensure the author's bundled library (personal agents, skills,
  // group config) is seeded on first launch. Never blocks — failures are logged
  // to the result but don't kill the overall ok flag (the library is a
  // convenience, not a correctness requirement like the workflow agents).
  ensureBundledLibraryInstalled()

  const ok = results.every((r) => r.ok)
  return { ok, results }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundled library: seed the author's personal agents + skills on first launch.
// See scripts/bundle-user-library.mjs for what gets captured into
// resources/bundled-library/ at build time.
//
// Strategy: versioned sentinel. We write
// `~/.claude/.plume-bundled-library-v<BUNDLE_VERSION>` once the first-run seed
// is complete. Subsequent launches short-circuit. Bumping BUNDLE_VERSION in
// the source re-runs seeding for everyone, installing only items that aren't
// already present (so intentional deletions/disables are respected).
// ─────────────────────────────────────────────────────────────────────────────

const BUNDLE_VERSION = 1

function resolveBundledLibraryDir(): string {
  const devPath = path.join(process.cwd(), 'resources', 'bundled-library')
  if (process.env.NODE_ENV === 'development') return devPath
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'bundled-library')
    if (fs.existsSync(prodPath)) return prodPath
  }
  return devPath
}

function ensureBundledLibraryInstalled(): void {
  try {
    const bundleDir = resolveBundledLibraryDir()
    if (!fs.existsSync(bundleDir)) return // no bundle in this build

    const home = os.homedir()
    const sentinel = path.join(home, '.claude', `.plume-bundled-library-v${BUNDLE_VERSION}`)
    if (fs.existsSync(sentinel)) return // already seeded for this bundle version

    const agentsDir = path.join(home, '.claude', 'agents')
    const disabledAgentsDir = path.join(home, '.claude', 'plume-disabled-agents')
    const skillsDir = path.join(home, '.claude', 'skills')
    const disabledSkillsDir = path.join(home, '.claude', 'plume-disabled-skills')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.mkdirSync(skillsDir, { recursive: true })

    // 1. Agents — skip if already present in either enabled or disabled dir
    const bundledAgentsDir = path.join(bundleDir, 'agents')
    if (fs.existsSync(bundledAgentsDir)) {
      for (const file of fs.readdirSync(bundledAgentsDir)) {
        if (!file.endsWith('.md')) continue
        const inEnabled = fs.existsSync(path.join(agentsDir, file))
        const inDisabled = fs.existsSync(path.join(disabledAgentsDir, file))
        if (inEnabled || inDisabled) continue
        try {
          fs.copyFileSync(path.join(bundledAgentsDir, file), path.join(agentsDir, file))
        } catch {
          /* per-file failures are non-fatal */
        }
      }
    }

    // 2. Skills — same logic, but each skill is a top-level entry (dir or .md)
    const bundledSkillsDir = path.join(bundleDir, 'skills')
    if (fs.existsSync(bundledSkillsDir)) {
      for (const entry of fs.readdirSync(bundledSkillsDir, { withFileTypes: true })) {
        const name = entry.name
        const inEnabled = fs.existsSync(path.join(skillsDir, name))
        const inDisabled = fs.existsSync(path.join(disabledSkillsDir, name))
        if (inEnabled || inDisabled) continue
        const src = path.join(bundledSkillsDir, name)
        const dst = path.join(skillsDir, name)
        try {
          if (entry.isDirectory()) {
            fs.cpSync(src, dst, { recursive: true })
          } else if (entry.isFile()) {
            fs.copyFileSync(src, dst)
          }
        } catch {
          /* skip */
        }
      }
    }

    // 3. Groups — only if user doesn't already have their own plume-groups.json
    const bundledGroups = path.join(bundleDir, 'plume-groups.json')
    const userGroups = path.join(home, '.claude', 'plume-groups.json')
    if (fs.existsSync(bundledGroups) && !fs.existsSync(userGroups)) {
      try {
        fs.copyFileSync(bundledGroups, userGroups)
      } catch {
        /* skip */
      }
    }

    // 4. MCP templates — merge into ~/.claude.json mcpServers, never overwrite
    //    an existing entry by the same name (user's config always wins).
    const bundledMcpTemplates = path.join(bundleDir, 'mcp-templates.json')
    if (fs.existsSync(bundledMcpTemplates)) {
      mergeBundledMcpTemplates(bundledMcpTemplates, home)
    }

    // Mark this bundle version as seeded
    try {
      fs.writeFileSync(sentinel, new Date().toISOString(), 'utf-8')
    } catch {
      /* non-fatal — we'll just re-seed next time */
    }
  } catch {
    /* entire seeding is best-effort; never crash the launcher */
  }
}

/**
 * Merge bundled MCP templates into the user's top-level ~/.claude.json
 * mcpServers map. Only adds entries that DON'T already exist — the user's
 * existing config (including edits, credential values they've added) is
 * never touched.
 *
 * Writes via a .tmp rename so a crash can't leave ~/.claude.json corrupt.
 */
function mergeBundledMcpTemplates(templatesPath: string, home: string): void {
  try {
    const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf-8')) as Record<
      string,
      { type?: string; command?: string; args?: string[]; env?: Record<string, string> }
    >
    const configPath = path.join(home, '.claude.json')
    if (!fs.existsSync(configPath)) return // user hasn't launched Claude Code at all yet; skip

    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>
      [key: string]: unknown
    }
    if (!config.mcpServers) config.mcpServers = {}

    let added = 0
    for (const [name, tpl] of Object.entries(templates)) {
      if (config.mcpServers[name]) continue // user already has it — respect
      config.mcpServers[name] = tpl
      added++
    }
    if (added === 0) return // nothing to do

    const tmp = configPath + '.plume-tmp'
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
    fs.renameSync(tmp, configPath)
  } catch {
    /* best-effort; never crash launcher */
  }
}
