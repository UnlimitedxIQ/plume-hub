import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface StyleSampleInput {
  filename: string
  content: string
}

export interface AnalyzeArgs {
  name: string
  samples: StyleSampleInput[]
}

export interface AnalyzeResult {
  ok: boolean
  profileId?: string
  profileMarkdown?: string
  error?: string
}

const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000

const ANALYSIS_PROMPT_TEMPLATE = `# Writing Style Analysis Task

You are analyzing a student's writing samples to build a rich voice profile that future Claude sessions will use to draft in the student's exact voice.

## Samples

The samples are in \`./samples/\`. There are {{COUNT}} files. **Read every single one in full** before doing any analysis. Use the Read tool on each \`samples/*\` file.

## Analysis approach — be thorough

Perform a multi-pass deep analysis. Take your time. The goal is a profile so detailed that another Claude reading just the output file could write a brand new piece in this voice and it would pass for the student's own work.

### Pass 1 — Sentence rhythm
- Average sentence length (words)
- Variance: do they mix short and long, or stay consistent?
- Typical openers: how do their sentences start? (subject-first, dependent clauses, transitions)
- Paragraph length and structure

### Pass 2 — Vocabulary fingerprint
- Words and phrases that appear across MULTIPLE samples (these are signature markers)
- Preferred phrasing patterns ("In contrast," vs "However," vs "On the other hand")
- Hedge words: "perhaps", "arguably", "it seems"
- Strong assertion words: "clearly", "undoubtedly", "must"
- Vocabulary register: simple / moderate / advanced / academic
- Words they NOTABLY avoid (e.g. never uses contractions, never uses "very")

### Pass 3 — Punctuation habits
- Em-dash frequency (high, medium, low)
- Semicolon usage
- Oxford comma yes/no
- Colon use
- Parenthetical asides
- Comma splices, run-ons, fragments — intentional or accidental?

### Pass 4 — Rhetorical moves
- How do paragraphs open?
- How do they transition between ideas?
- How do they conclude?
- Do they use rhetorical questions?
- First person, second person, or third person?
- Active vs passive voice ratio

### Pass 5 — Voice & tone
- Formal / casual axis
- Warmth (cold-academic vs personable)
- Confidence level
- Humor present?
- Irony or understatement?

### Pass 6 — Quirks
Anything unique: a habit, a tic, a structural pattern, an unusual word choice that recurs

## Output

Save your full analysis to \`./profile.md\` using the Write tool. Use this exact structure:

\`\`\`
---
name: {{NAME}}
description: Writing style profile for {{NAME}} — use this voice when drafting any prose for the student
---

# Writing Style — {{NAME}}

## Quick voice summary
[2-3 sentence summary of how this person sounds]

## Sentence rhythm
[detailed findings + 3 example sentences pulled verbatim from the samples]

## Vocabulary fingerprint
**Signature phrases (use these):**
- [phrase 1]
- [phrase 2]
- ...

**Preferred patterns:**
- [pattern 1 with example]
- ...

**Avoided / never used:**
- [word/pattern]
- ...

## Punctuation habits
[concrete rules with frequencies]

## Rhetorical moves
[detailed bullet list of how paragraphs open, transition, and close]

## Voice & tone
[register, warmth, confidence, etc]

## Quirks and signatures
[the recognizable tics]

## When drafting in this voice
[a 5-10 item checklist of concrete rules a future Claude session must follow when writing for this student — phrased as imperatives. Include 3-5 example sentences in the student's voice that you generated as test cases.]
\`\`\`

**Substitute \`{{COUNT}}\` and \`{{NAME}}\`** before writing the file with actual values.

## Important
- Do NOT just summarize the samples. Analyze patterns ACROSS samples.
- Quote actual phrases from the samples — the more specific, the better.
- The output must be self-contained: a future Claude reading just \`profile.md\` (without access to the samples) must be able to write in the voice.
- When done, stop. Do not ask any questions. Do not produce conversational output. Just write the file and exit.
`

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'profile'
}

function randomSuffix(): string {
  return crypto.randomBytes(2).toString('hex')
}

function sanitizeFilename(name: string): string {
  // path.basename strips directory components to prevent traversal (e.g. "../../../evil.md")
  // then the regex strips any remaining special chars
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function substituteAnalysisPrompt(name: string, count: number): string {
  return ANALYSIS_PROMPT_TEMPLATE
    .replace(/\{\{COUNT\}\}/g, String(count))
    .replace(/\{\{NAME\}\}/g, name)
}

function resolvePlumeStylesDir(): string {
  return path.join(os.homedir(), '.claude', 'plume-styles')
}

function resolveAgentsDir(): string {
  return path.join(os.homedir(), '.claude', 'agents')
}

interface WriteProfileSkeletonArgs {
  profileId: string
  name: string
  samples: StyleSampleInput[]
}

interface ProfileSkeleton {
  profileDir: string
  metadataPath: string
}

function writeProfileSkeleton(args: WriteProfileSkeletonArgs): ProfileSkeleton {
  const profileDir = path.join(resolvePlumeStylesDir(), args.profileId)
  const samplesDir = path.join(profileDir, 'samples')

  fs.mkdirSync(samplesDir, { recursive: true })

  for (const sample of args.samples) {
    const safeName = sanitizeFilename(sample.filename)
    const samplePath = path.join(samplesDir, safeName)
    fs.writeFileSync(samplePath, sample.content, 'utf-8')
  }

  const metadata = {
    id: args.profileId,
    name: args.name,
    sampleCount: args.samples.length,
    createdAt: Date.now(),
    analyzedAt: null as number | null,
  }
  const metadataPath = path.join(profileDir, 'metadata.json')
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')

  const claudeMdContent = substituteAnalysisPrompt(args.name, args.samples.length)
  fs.writeFileSync(path.join(profileDir, 'CLAUDE.md'), claudeMdContent, 'utf-8')

  return { profileDir, metadataPath }
}

interface RunClaudeArgs {
  cwd: string
  onProgress?: (line: string) => void
}

function runClaudeAnalysis(args: RunClaudeArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      ['--print', 'Begin the writing style analysis as described in CLAUDE.md.'],
      {
        cwd: args.cwd,
      }
    )

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      try {
        proc.kill('SIGKILL')
      } catch {
        // ignore
      }
      reject(new Error('Claude analysis timed out after 5 minutes'))
    }, ANALYSIS_TIMEOUT_MS)

    const emitLines = (chunk: Buffer, prefix: string) => {
      if (!args.onProgress) return
      const text = chunk.toString()
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        if (line.trim().length === 0) continue
        args.onProgress(prefix ? `${prefix}${line}` : line)
      }
    }

    proc.stdout.on('data', (chunk: Buffer) => emitLines(chunk, ''))
    proc.stderr.on('data', (chunk: Buffer) => emitLines(chunk, '[stderr] '))

    proc.on('error', (err) => {
      if (timedOut) return
      clearTimeout(timeout)
      reject(err instanceof Error ? err : new Error(String(err)))
    })

    proc.on('close', (code) => {
      if (timedOut) return
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`claude exited with code ${code ?? 'null'}`))
      }
    })
  })
}

function finalizeProfile(
  profileDir: string,
  profileId: string,
  metadataPath: string
): { profileMarkdown: string } {
  const profileMdPath = path.join(profileDir, 'profile.md')
  if (!fs.existsSync(profileMdPath)) {
    throw new Error('Claude did not produce profile.md')
  }
  const profileMarkdown = fs.readFileSync(profileMdPath, 'utf-8')

  // Update metadata with analyzedAt timestamp (immutable update)
  const existingMeta = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Record<string, unknown>
  const updatedMeta = {
    ...existingMeta,
    analyzedAt: Date.now(),
  }
  fs.writeFileSync(metadataPath, JSON.stringify(updatedMeta, null, 2), 'utf-8')

  // Copy profile.md into ~/.claude/agents/ so future Claude sessions auto-load it
  const agentsDir = resolveAgentsDir()
  fs.mkdirSync(agentsDir, { recursive: true })
  const agentPath = path.join(agentsDir, `writing-style-${profileId}.md`)
  fs.writeFileSync(agentPath, profileMarkdown, 'utf-8')

  return { profileMarkdown }
}

export async function analyzeSamples(
  args: AnalyzeArgs,
  onProgress?: (line: string) => void
): Promise<AnalyzeResult> {
  try {
    if (!args || typeof args.name !== 'string' || args.name.trim().length === 0) {
      return { ok: false, error: 'analyzeSamples requires a non-empty name' }
    }
    if (!Array.isArray(args.samples) || args.samples.length === 0) {
      return { ok: false, error: 'analyzeSamples requires at least one sample' }
    }

    const profileId = `${slugify(args.name)}-${randomSuffix()}`
    const { profileDir, metadataPath } = writeProfileSkeleton({
      profileId,
      name: args.name,
      samples: args.samples,
    })

    await runClaudeAnalysis({ cwd: profileDir, onProgress })

    const { profileMarkdown } = finalizeProfile(profileDir, profileId, metadataPath)

    return { ok: true, profileId, profileMarkdown }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
