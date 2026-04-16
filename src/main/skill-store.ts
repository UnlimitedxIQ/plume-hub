import fs from 'fs'
import path from 'path'
import os from 'os'
import { listInstalledPlugins } from './plugin-sources'

// Skills live in two kinds of locations:
//   1. ~/.claude/skills/           (user-local, editable)
//      Disabled ones are moved to ~/.claude/plume-disabled-skills/.
//   2. <plugin>/skills/            (read-only, provided by installed plugins)
//
// Each skill is either a directory containing SKILL.md, or a flat .md file.

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills')
const DISABLED_DIR = path.join(os.homedir(), '.claude', 'plume-disabled-skills')

export type SkillOrigin =
  | { type: 'local' }
  | { type: 'plugin'; plugin: string; marketplace: string }

export interface SkillEntry {
  id: string              // filename or dirname (unique per origin)
  name: string            // display name from frontmatter
  description: string     // from frontmatter
  isDirectory: boolean    // true = directory skill (SKILL.md inside)
  enabled: boolean        // plugin skills are always "enabled" from Claude's view
  origin: SkillOrigin
}

interface ParsedFrontmatter {
  name?: string
  description?: string
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}
  const out: ParsedFrontmatter = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key === 'name') out.name = val
    else if (key === 'description') out.description = val
  }
  return out
}

function readSkillMeta(
  skillPath: string,
  id: string,
  isDirectory: boolean,
  enabled: boolean,
  origin: SkillOrigin
): SkillEntry | null {
  try {
    let mdPath: string
    if (isDirectory) {
      mdPath = path.join(skillPath, 'SKILL.md')
      if (!fs.existsSync(mdPath)) {
        const lower = path.join(skillPath, 'skill.md')
        if (fs.existsSync(lower)) mdPath = lower
        else return null
      }
    } else {
      mdPath = skillPath
    }
    const raw = fs.readFileSync(mdPath, 'utf-8')
    const fm = parseFrontmatter(raw)
    return {
      id,
      name: fm.name ?? id.replace(/\.md$/, ''),
      description: fm.description ?? '',
      isDirectory,
      enabled,
      origin,
    }
  } catch {
    return null
  }
}

function enumerateDir(dir: string, enabled: boolean, origin: SkillOrigin): SkillEntry[] {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const out: SkillEntry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const meta = readSkillMeta(full, entry.name, true, enabled, origin)
      if (meta) out.push(meta)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const meta = readSkillMeta(full, entry.name, false, enabled, origin)
      if (meta) out.push(meta)
    }
  }
  return out
}

export function scanSkills(): {
  enabled: SkillEntry[]
  disabled: SkillEntry[]
  plugin: SkillEntry[]
} {
  const plugin: SkillEntry[] = []
  for (const p of listInstalledPlugins()) {
    const skillsDir = path.join(p.installPath, 'skills')
    if (fs.existsSync(skillsDir)) {
      plugin.push(
        ...enumerateDir(skillsDir, true, {
          type: 'plugin',
          plugin: p.plugin,
          marketplace: p.marketplace,
        })
      )
    }
  }
  return {
    enabled: enumerateDir(SKILLS_DIR, true, { type: 'local' }),
    disabled: enumerateDir(DISABLED_DIR, false, { type: 'local' }),
    plugin,
  }
}

export function toggleSkill(id: string, enable: boolean): { ok: boolean; error?: string } {
  try {
    const fromDir = enable ? DISABLED_DIR : SKILLS_DIR
    const toDir = enable ? SKILLS_DIR : DISABLED_DIR
    if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true })
    const from = path.join(fromDir, id)
    const to = path.join(toDir, id)
    if (!fs.existsSync(from)) {
      return { ok: false, error: `Skill not found: ${id}` }
    }
    if (fs.existsSync(to)) {
      return { ok: false, error: `Target already exists: ${id}` }
    }
    fs.renameSync(from, to)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
