import fs from 'fs'
import os from 'os'
import path from 'path'

export interface StyleProfileMeta {
  id: string
  name: string
  sampleCount: number
  createdAt: number
  analyzedAt: number | null
}

function resolvePlumeStylesDir(): string {
  return path.join(os.homedir(), '.claude', 'plume-styles')
}

function resolveAgentsDir(): string {
  return path.join(os.homedir(), '.claude', 'agents')
}

function agentMarkdownPath(id: string): string {
  return path.join(resolveAgentsDir(), `writing-style-${id}.md`)
}

function isStyleProfileMeta(value: unknown): value is StyleProfileMeta {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.sampleCount === 'number' &&
    typeof v.createdAt === 'number' &&
    (v.analyzedAt === null || typeof v.analyzedAt === 'number')
  )
}

function readMetadataFile(metadataPath: string): StyleProfileMeta | null {
  try {
    if (!fs.existsSync(metadataPath)) return null
    const raw = fs.readFileSync(metadataPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!isStyleProfileMeta(parsed)) return null
    // Return a fresh object (no mutation of parsed JSON)
    return {
      id: parsed.id,
      name: parsed.name,
      sampleCount: parsed.sampleCount,
      createdAt: parsed.createdAt,
      analyzedAt: parsed.analyzedAt,
    }
  } catch {
    return null
  }
}

export function listStyleProfiles(): StyleProfileMeta[] {
  const stylesDir = resolvePlumeStylesDir()
  if (!fs.existsSync(stylesDir)) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(stylesDir, { withFileTypes: true })
  } catch {
    return []
  }

  const profiles: StyleProfileMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metadataPath = path.join(stylesDir, entry.name, 'metadata.json')
    const meta = readMetadataFile(metadataPath)
    if (meta) {
      profiles.push(meta)
    }
  }

  // Sort by createdAt descending (newest first) without mutating inputs
  return [...profiles].sort((a, b) => b.createdAt - a.createdAt)
}

export function getStyleProfile(
  id: string
): { profile: StyleProfileMeta; markdown: string } | null {
  if (typeof id !== 'string' || id.length === 0) return null

  const metadataPath = path.join(resolvePlumeStylesDir(), id, 'metadata.json')
  const profile = readMetadataFile(metadataPath)
  if (!profile) return null

  const markdownPath = agentMarkdownPath(id)
  if (!fs.existsSync(markdownPath)) return null

  let markdown: string
  try {
    markdown = fs.readFileSync(markdownPath, 'utf-8')
  } catch {
    return null
  }

  return { profile, markdown }
}

export function deleteStyleProfile(id: string): { ok: boolean; error?: string } {
  try {
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, error: 'deleteStyleProfile requires a non-empty id' }
    }

    const profileDir = path.join(resolvePlumeStylesDir(), id)
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true })
    }

    const markdownPath = agentMarkdownPath(id)
    if (fs.existsSync(markdownPath)) {
      fs.unlinkSync(markdownPath)
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `deleteStyleProfile failed: ${message}` }
  }
}
