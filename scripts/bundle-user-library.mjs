#!/usr/bin/env node
// Pre-build step: snapshot the author's ~/.claude/{agents, skills, plume-groups.json}
// into resources/bundled-library/ so the installer can ship them to new users.
//
// Filtering:
//   • writing-style-*.md agents are EXCLUDED (personal voice profiles; shipping
//     them would make other users draft in the author's voice by default)
//   • Plume-owned agents (plume-*-workflow.md, optimize-skills.md) are EXCLUDED —
//     they ship separately via resources/plume-skills/ with version-stamped overwrite
//   • dotfile dirs in skills/ are skipped (e.g. .stfolder)
//
// Idempotent: wipes the output dir first, then re-copies from scratch.
// Safe on a fresh clone with no ~/.claude — produces an empty bundle.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HOME = os.homedir()

const SRC_AGENTS = path.join(HOME, '.claude', 'agents')
const SRC_SKILLS = path.join(HOME, '.claude', 'skills')
const SRC_GROUPS = path.join(HOME, '.claude', 'plume-groups.json')
const SRC_CLAUDE_JSON = path.join(HOME, '.claude.json')
const SRC_INSTALLED_PLUGINS = path.join(HOME, '.claude', 'plugins', 'installed_plugins.json')

const OUT_ROOT = path.join(ROOT, 'resources', 'bundled-library')
const OUT_AGENTS = path.join(OUT_ROOT, 'agents')
const OUT_SKILLS = path.join(OUT_ROOT, 'skills')
const OUT_GROUPS = path.join(OUT_ROOT, 'plume-groups.json')
const OUT_MCP_TEMPLATES = path.join(OUT_ROOT, 'mcp-templates.json')
const OUT_RECOMMENDED_PLUGINS = path.join(OUT_ROOT, 'recommended-plugins.json')

// MCP names safe to ship as templates. Others either need credentials, reference
// local machine paths, or are personal (e.g. obsidian-vault pointing to author's
// local vault dir, gdrive pointing to a local MCP server binary).
const BUNDLE_MCP_NAMES = new Set(['jcodemunch', 'chrome-devtools'])

// ── Filters ──────────────────────────────────────────────────────────────────

// Agents to skip: personal voice profiles, plume-owned workflows
const EXCLUDE_AGENT_PATTERNS = [
  /^writing-style-/,
  /^plume-.*-workflow\.md$/,
  /^optimize-skills\.md$/,
]

function shouldExcludeAgent(filename) {
  return EXCLUDE_AGENT_PATTERNS.some((p) => p.test(filename))
}

// Skills to skip: any skill that is tightly coupled to the author's personal
// machine, projects, credentials, or school. A shipped copy of one of these
// would either expose personal info, break with missing absolute paths, or
// only be useful to the author. Audited 2026-04-15.
const EXCLUDE_SKILL_NAMES = new Set([
  // Broken absolute paths / author-specific projects
  'ai-atlas',
  'gmail',
  'gumroad',
  'higgsfield',
  'post-linkedin',
  // Security-sensitive — exposes Tailscale IP, SSH config, hostname
  'mac-do-it',
  // School-specific — hard-coded to canvas.uoregon.edu and UO context
  'canvas',
  // References a custom MCP server path on the author's machine
  'gdrive',
  // Borderline: mentions author's browser profiles / UO business school
  'chrome-browser',
  'humanize-writing',
])

function shouldExcludeSkill(name) {
  return EXCLUDE_SKILL_NAMES.has(name)
}

// ── Wipe + recreate output ───────────────────────────────────────────────────
//
// Windows holds directory handles aggressively (Syncthing, Defender, a recent
// Electron build picking up the dir for extraResources) so a blanket rmSync
// on OUT_ROOT can EPERM even when contents are already gone. Strategy:
// nuke per-file contents INSIDE the subdirs (always possible), don't try to
// remove the top-level dir itself.

function clearDir(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry)
    try {
      fs.rmSync(p, { recursive: true, force: true })
    } catch (e) {
      // If a lock keeps us from deleting a stale file, warn and move on —
      // we'll just overwrite what we can.
      console.warn(`[bundle] could not remove ${p}: ${e.code ?? e.message}`)
    }
  }
}

fs.mkdirSync(OUT_AGENTS, { recursive: true })
fs.mkdirSync(OUT_SKILLS, { recursive: true })
clearDir(OUT_AGENTS)
clearDir(OUT_SKILLS)
// Also drop a stale groups file if it exists
try { fs.rmSync(OUT_GROUPS, { force: true }) } catch { /* ignore */ }

// ── Copy agents ──────────────────────────────────────────────────────────────

let agentCount = 0
let agentSkipped = 0
if (fs.existsSync(SRC_AGENTS)) {
  for (const file of fs.readdirSync(SRC_AGENTS)) {
    if (!file.endsWith('.md')) continue
    if (file.includes('.sync-conflict')) continue // Syncthing duplicates
    if (shouldExcludeAgent(file)) {
      agentSkipped++
      continue
    }
    fs.copyFileSync(path.join(SRC_AGENTS, file), path.join(OUT_AGENTS, file))
    agentCount++
  }
}

// ── Copy skills (recursive per top-level entry) ──────────────────────────────

let skillCount = 0
let skillSkipped = 0
if (fs.existsSync(SRC_SKILLS)) {
  for (const entry of fs.readdirSync(SRC_SKILLS, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // .stfolder etc.
    // Each skill's "name" is its top-level directory or flat-.md basename
    // (stripped of .md). That name is what the exclusion set checks.
    const skillName = entry.name.endsWith('.md') ? entry.name.slice(0, -3) : entry.name
    if (shouldExcludeSkill(skillName)) {
      skillSkipped++
      continue
    }
    const src = path.join(SRC_SKILLS, entry.name)
    const dst = path.join(OUT_SKILLS, entry.name)
    if (entry.isDirectory()) {
      fs.cpSync(src, dst, { recursive: true })
      skillCount++
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      fs.copyFileSync(src, dst)
      skillCount++
    }
  }
}

// ── Copy groups config ───────────────────────────────────────────────────────

let groupsCopied = false
if (fs.existsSync(SRC_GROUPS)) {
  fs.copyFileSync(SRC_GROUPS, OUT_GROUPS)
  groupsCopied = true
}

// ── Extract MCP templates ────────────────────────────────────────────────────

let mcpCount = 0
if (fs.existsSync(SRC_CLAUDE_JSON)) {
  try {
    const config = JSON.parse(fs.readFileSync(SRC_CLAUDE_JSON, 'utf-8'))
    const servers = config.mcpServers ?? {}
    const templates = {}
    for (const [name, cfg] of Object.entries(servers)) {
      if (!BUNDLE_MCP_NAMES.has(name)) continue
      // Strip env values (credentials) but keep keys so the user sees what
      // variables to fill in. These 2 MCPs have empty or no env anyway.
      const strippedEnv = {}
      if (cfg.env) {
        for (const k of Object.keys(cfg.env)) strippedEnv[k] = ''
      }
      templates[name] = {
        type: cfg.type ?? 'stdio',
        command: cfg.command,
        args: cfg.args ?? [],
        env: strippedEnv,
      }
      mcpCount++
    }
    fs.writeFileSync(OUT_MCP_TEMPLATES, JSON.stringify(templates, null, 2), 'utf-8')
  } catch (e) {
    console.warn(`[bundle] could not parse ~/.claude.json: ${e.message}`)
  }
}

// ── Extract recommended plugin manifest ──────────────────────────────────────

let pluginCount = 0
if (fs.existsSync(SRC_INSTALLED_PLUGINS)) {
  try {
    const raw = JSON.parse(fs.readFileSync(SRC_INSTALLED_PLUGINS, 'utf-8'))
    const plugins = Object.keys(raw.plugins ?? {}).sort()
    const manifest = {
      version: 1,
      // Each entry is "<plugin-name>@<marketplace>" — the same string shape
      // the `claude plugins install` CLI accepts.
      plugins,
    }
    fs.writeFileSync(OUT_RECOMMENDED_PLUGINS, JSON.stringify(manifest, null, 2), 'utf-8')
    pluginCount = plugins.length
  } catch (e) {
    console.warn(`[bundle] could not parse installed_plugins.json: ${e.message}`)
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`[bundle-user-library] wrote ${OUT_ROOT}`)
console.log(`  agents:   ${agentCount} bundled, ${agentSkipped} skipped (voice profiles / plume-owned)`)
console.log(`  skills:   ${skillCount} bundled, ${skillSkipped} skipped (author-specific, see EXCLUDE_SKILL_NAMES)`)
console.log(`  groups:   ${groupsCopied ? 'yes' : 'no (not present in ~/.claude/)'}`)
console.log(`  mcps:     ${mcpCount} templates (whitelist: ${[...BUNDLE_MCP_NAMES].join(', ')})`)
console.log(`  plugins:  ${pluginCount} recommended`)
