import fs from 'fs'
import path from 'path'
import os from 'os'
import { listInstalledPlugins } from './plugin-sources'

/**
 * Plume Skill Groups — manages user-defined groupings of Claude Code agent
 * skills, plus their enabled/disabled state.
 *
 * Storage:
 *   ~/.claude/agents/<skill>.md             — enabled skills (Claude sees these)
 *   ~/.claude/plume-disabled-agents/<skill>.md — disabled skills (hidden from Claude)
 *   ~/.claude/plume-groups.json             — group definitions + assignments
 *
 * The filesystem is always flat: no subdirectories, no per-group folders.
 * Grouping is purely a Plume-side metadata concern. Enable/disable is the
 * only action that actually moves files; everything else edits JSON.
 */

export interface SkillMeta {
  filename: string         // e.g. 'my-skill.md' (unique across agents + disabled)
  name: string             // from YAML frontmatter
  description: string      // from YAML frontmatter
  enabled: boolean
}

export interface GroupDef {
  id: string               // slugified
  name: string             // display
  order: number            // sort order
}

export interface PlumeGroupsConfig {
  version: 1
  groups: GroupDef[]
  assignments: Record<string, string>  // filename → groupId
}

// Agents installed via plugins live under their plugin's install path and are
// read-only from Plume's perspective. We group them by plugin for display.
export interface PluginAgent {
  filename: string
  name: string
  description: string
  plugin: string
  marketplace: string
}

export interface PluginAgentGroup {
  plugin: string
  marketplace: string
  agents: PluginAgent[]
}

export interface GroupedSkills {
  groups: Array<{
    id: string
    name: string
    skills: SkillMeta[]
  }>
  ungrouped: SkillMeta[]
  pluginAgents: PluginAgentGroup[]
}

// ── Paths ────────────────────────────────────────────────────────────────────

function home(): string {
  return os.homedir()
}

function enabledDir(): string {
  return path.join(home(), '.claude', 'agents')
}

function disabledDir(): string {
  return path.join(home(), '.claude', 'plume-disabled-agents')
}

function configPath(): string {
  return path.join(home(), '.claude', 'plume-groups.json')
}

function ensureDirs(): void {
  fs.mkdirSync(enabledDir(), { recursive: true })
  fs.mkdirSync(disabledDir(), { recursive: true })
}

// ── Config I/O ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: PlumeGroupsConfig = { version: 1, groups: [], assignments: {} }

function readConfig(): PlumeGroupsConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PlumeGroupsConfig>
    if (parsed && parsed.version === 1 && Array.isArray(parsed.groups)) {
      return {
        version: 1,
        groups: parsed.groups,
        assignments: parsed.assignments ?? {},
      }
    }
  } catch {
    /* fall through to default */
  }
  return { ...DEFAULT_CONFIG }
}

function writeConfig(config: PlumeGroupsConfig): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  const tmp = configPath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
  fs.renameSync(tmp, configPath())
}

// ── Frontmatter parser ───────────────────────────────────────────────────────

function parseFrontmatter(filePath: string, filename: string): { name: string; description: string } {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const match = raw.match(/^---\n([\s\S]*?)\n---/)
    const fm: Record<string, string> = {}
    if (match) {
      match[1].split('\n').forEach((line) => {
        const idx = line.indexOf(': ')
        if (idx !== -1) fm[line.slice(0, idx).trim()] = line.slice(idx + 2).trim()
      })
    }
    return {
      name: fm['name'] ?? filename.replace('.md', ''),
      description: fm['description'] ?? '',
    }
  } catch {
    return { name: filename.replace('.md', ''), description: '' }
  }
}

// ── Skill discovery ──────────────────────────────────────────────────────────

function listMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.includes('.sync-conflict'))
}

function allSkills(): SkillMeta[] {
  ensureDirs()
  const seen = new Set<string>()
  const skills: SkillMeta[] = []

  for (const f of listMdFiles(enabledDir())) {
    seen.add(f)
    const { name, description } = parseFrontmatter(path.join(enabledDir(), f), f)
    skills.push({ filename: f, name, description, enabled: true })
  }

  for (const f of listMdFiles(disabledDir())) {
    if (seen.has(f)) continue  // enabled wins if somehow both exist
    const { name, description } = parseFrontmatter(path.join(disabledDir(), f), f)
    skills.push({ filename: f, name, description, enabled: false })
  }

  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

// ── Public API ───────────────────────────────────────────────────────────────

function scanPluginAgents(): PluginAgentGroup[] {
  const out: PluginAgentGroup[] = []
  for (const p of listInstalledPlugins()) {
    const agentsDir = path.join(p.installPath, 'agents')
    if (!fs.existsSync(agentsDir)) continue
    const files = listMdFiles(agentsDir)
    if (files.length === 0) continue
    const agents: PluginAgent[] = files.map((filename) => {
      const { name, description } = parseFrontmatter(path.join(agentsDir, filename), filename)
      return {
        filename,
        name,
        description,
        plugin: p.plugin,
        marketplace: p.marketplace,
      }
    })
    agents.sort((a, b) => a.name.localeCompare(b.name))
    out.push({ plugin: p.plugin, marketplace: p.marketplace, agents })
  }
  out.sort((a, b) => a.plugin.localeCompare(b.plugin))
  return out
}

export function scanAgents(): GroupedSkills {
  const config = readConfig()
  const skills = allSkills()

  // Build groups in the order defined in config
  const orderedGroups = [...config.groups].sort((a, b) => a.order - b.order)
  const groups = orderedGroups.map((g) => ({
    id: g.id,
    name: g.name,
    skills: skills.filter((s) => config.assignments[s.filename] === g.id),
  }))

  // Ungrouped = skills whose filename has no assignment, OR whose assignment
  // points to a non-existent group (orphaned from a deleted group)
  const validGroupIds = new Set(orderedGroups.map((g) => g.id))
  const ungrouped = skills.filter(
    (s) => !config.assignments[s.filename] || !validGroupIds.has(config.assignments[s.filename])
  )

  return { groups, ungrouped, pluginAgents: scanPluginAgents() }
}

export function toggleSkill(filename: string, enabled: boolean): { ok: boolean; error?: string } {
  try {
    ensureDirs()
    const fromDir = enabled ? disabledDir() : enabledDir()
    const toDir = enabled ? enabledDir() : disabledDir()
    const fromPath = path.join(fromDir, filename)
    const toPath = path.join(toDir, filename)
    if (!fs.existsSync(fromPath)) {
      // Maybe it's already in the target state — idempotent success
      if (fs.existsSync(toPath)) return { ok: true }
      return { ok: false, error: `Skill ${filename} not found` }
    }
    fs.renameSync(fromPath, toPath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function toggleGroup(groupId: string, enabled: boolean): { ok: boolean; moved: number; error?: string } {
  try {
    const config = readConfig()
    const targetSkills = Object.entries(config.assignments)
      .filter(([, gId]) => gId === groupId)
      .map(([filename]) => filename)

    let moved = 0
    for (const filename of targetSkills) {
      const result = toggleSkill(filename, enabled)
      if (result.ok) moved++
    }
    return { ok: true, moved }
  } catch (e) {
    return { ok: false, moved: 0, error: (e as Error).message }
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'group'
}

export function createGroup(name: string): { ok: boolean; group?: GroupDef; error?: string } {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Group name required' }
    const config = readConfig()
    const baseId = slugify(trimmed)
    // Ensure unique id
    let id = baseId
    let n = 2
    while (config.groups.some((g) => g.id === id)) {
      id = `${baseId}-${n++}`
    }
    const order = config.groups.length > 0 ? Math.max(...config.groups.map((g) => g.order)) + 1 : 0
    const group: GroupDef = { id, name: trimmed, order }
    config.groups.push(group)
    writeConfig(config)
    return { ok: true, group }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function renameGroup(groupId: string, newName: string): { ok: boolean; error?: string } {
  try {
    const trimmed = newName.trim()
    if (!trimmed) return { ok: false, error: 'New name required' }
    const config = readConfig()
    const group = config.groups.find((g) => g.id === groupId)
    if (!group) return { ok: false, error: 'Group not found' }
    group.name = trimmed
    writeConfig(config)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function deleteGroup(groupId: string): { ok: boolean; orphaned: number; error?: string } {
  try {
    const config = readConfig()
    const before = config.groups.length
    config.groups = config.groups.filter((g) => g.id !== groupId)
    if (config.groups.length === before) return { ok: false, orphaned: 0, error: 'Group not found' }

    // Skills assigned to the deleted group become ungrouped
    let orphaned = 0
    for (const [filename, gId] of Object.entries(config.assignments)) {
      if (gId === groupId) {
        delete config.assignments[filename]
        orphaned++
      }
    }
    writeConfig(config)
    return { ok: true, orphaned }
  } catch (e) {
    return { ok: false, orphaned: 0, error: (e as Error).message }
  }
}

export function assignSkill(filename: string, groupId: string | null): { ok: boolean; error?: string } {
  try {
    const config = readConfig()
    if (groupId === null) {
      delete config.assignments[filename]
    } else {
      const groupExists = config.groups.some((g) => g.id === groupId)
      if (!groupExists) return { ok: false, error: 'Target group not found' }
      config.assignments[filename] = groupId
    }
    writeConfig(config)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
