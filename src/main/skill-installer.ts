import fs from 'fs'
import path from 'path'
import os from 'os'

export interface InstallResult {
  ok: boolean
  installed: string[]
  skipped: string[]
  error?: string
}

export interface UninstallResult {
  ok: boolean
  removed: string[]
  error?: string
}

interface PackInput {
  id: string
  skills: string[]
}

/**
 * Convert a human-readable skill name to a kebab-case filename slug.
 * Example: "Business Writing" -> "business-writing"
 *          "UI/UX"           -> "ui-ux"
 *          "3D Immersive"    -> "3d-immersive"
 */
function toKebabCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve the bundled marketplace-skills directory.
 * In dev: <cwd>/resources/marketplace-skills
 * In prod: <process.resourcesPath>/marketplace-skills
 *
 * We detect dev by NODE_ENV first, then fall back to checking whether the dev
 * path actually exists on disk (covers cases where NODE_ENV is unset).
 */
function resolveBundledDir(): string {
  const devPath = path.join(process.cwd(), 'resources', 'marketplace-skills')
  if (process.env.NODE_ENV === 'development') {
    return devPath
  }
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'marketplace-skills')
    if (fs.existsSync(prodPath)) {
      return prodPath
    }
  }
  // Fallback: dev path exists even when NODE_ENV is unset (e.g. tests)
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
 * Build the source and target paths for a single skill, given the bundled
 * directory and the agents directory. Returns a new object — no mutation.
 */
function resolveSkillPaths(
  skillName: string,
  bundledDir: string,
  agentsDir: string,
): { filename: string; sourcePath: string; targetPath: string } {
  const filename = `${toKebabCase(skillName)}.md`
  return {
    filename,
    sourcePath: path.join(bundledDir, filename),
    targetPath: path.join(agentsDir, filename),
  }
}

export async function installPack(pack: PackInput): Promise<InstallResult> {
  try {
    if (!pack || !Array.isArray(pack.skills)) {
      return {
        ok: false,
        installed: [],
        skipped: [],
        error: 'installPack requires a pack with a skills array',
      }
    }

    const bundledDir = resolveBundledDir()
    const agentsDir = resolveAgentsDir()

    const installed: string[] = []
    const skipped: string[] = []

    for (const skillName of pack.skills) {
      const { filename, sourcePath, targetPath } = resolveSkillPaths(
        skillName,
        bundledDir,
        agentsDir,
      )

      if (!fs.existsSync(sourcePath)) {
        skipped.push(filename)
        continue
      }

      try {
        fs.copyFileSync(sourcePath, targetPath)
        installed.push(filename)
      } catch (copyErr) {
        // A single bad copy shouldn't kill the whole install
        skipped.push(filename)
      }
    }

    return { ok: true, installed, skipped }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      installed: [],
      skipped: [],
      error: `installPack failed: ${message}`,
    }
  }
}

export async function uninstallPack(pack: PackInput): Promise<UninstallResult> {
  try {
    if (!pack || !Array.isArray(pack.skills)) {
      return {
        ok: false,
        removed: [],
        error: 'uninstallPack requires a pack with a skills array',
      }
    }

    const bundledDir = resolveBundledDir()
    const agentsDir = resolveAgentsDir()

    const removed: string[] = []

    for (const skillName of pack.skills) {
      const { filename, targetPath } = resolveSkillPaths(
        skillName,
        bundledDir,
        agentsDir,
      )

      if (!fs.existsSync(targetPath)) {
        continue
      }

      try {
        fs.unlinkSync(targetPath)
        removed.push(filename)
      } catch (unlinkErr) {
        // Don't fail hard if a single delete fails
      }
    }

    return { ok: true, removed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      removed: [],
      error: `uninstallPack failed: ${message}`,
    }
  }
}
