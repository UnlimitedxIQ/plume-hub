import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSettings } from './settings'
import { ensureWorkflowAgentsInstalled } from './workflow-installer'

export type WorkflowMode = 'think' | 'draft' | 'build' | 'study' | 'resume'

// Modes that have an associated workflow agent (everything except 'resume').
type InvocationMode = Exclude<WorkflowMode, 'resume'>

interface LaunchArgs {
  courseId: number
  assignmentId: number
  courseCode: string
  assignmentName: string
  htmlUrl: string
  dueAt: string | null
  mode: WorkflowMode
}

interface WorkflowModeMeta {
  label: string
  hint: string
  agent: string
}

const WORKFLOW_MODE_META: Record<InvocationMode, WorkflowModeMeta> = {
  think: {
    label: 'Think',
    hint: 'deep research — presents all facts, angles of attack, and sources so you can decide your approach',
    agent: 'plume-think-workflow',
  },
  draft: {
    label: 'Draft',
    hint: 'builds a structural template with section headers, bullets, and rubric-aligned content guides',
    agent: 'plume-draft-workflow',
  },
  build: {
    label: 'Build',
    hint: 'writes the COMPLETE submission with 3 critique passes, applies your writing style, aims for full marks',
    agent: 'plume-build-workflow',
  },
  study: {
    label: 'Study',
    hint: 'pulls ALL course content from Canvas, builds a practice exam, flashcards, and a full study presentation',
    agent: 'plume-study-workflow',
  },
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function makeProjectDir(courseCode: string, assignmentName: string, assignmentId: number): string {
  const base = path.join(os.homedir(), 'claude-projects')
  const slug = `${slugify(courseCode)}-${slugify(assignmentName)}`
  const dir = path.join(base, slug)

  // Detect slug collision with a different assignment
  if (fs.existsSync(dir)) {
    const metaPath = path.join(dir, '.plume', 'assignment.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { assignment_id?: number }
        if (meta.assignment_id && meta.assignment_id !== assignmentId) {
          return path.join(base, `${slug}-${assignmentId}`)
        }
      } catch {
        // continue with existing dir
      }
    }
  }

  return dir
}

function substituteTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/**
 * If there's an active writing-style profile and its skill file exists, return
 * a markdown block to append to the assignment's CLAUDE.md telling Claude to
 * draft in that voice. Returns null if no active profile or the skill file is
 * missing (e.g. user deleted it).
 */
function buildWritingStyleBlock(activeId: string | null): string | null {
  if (!activeId) return null
  const skillPath = path.join(os.homedir(), '.claude', 'agents', `writing-style-${activeId}.md`)
  if (!fs.existsSync(skillPath)) return null
  return [
    '---',
    '',
    '## Voice — match the student\'s writing style',
    '',
    'Before the Drafting Agent (Step 3) writes any prose, it must read the active writing style profile and match it.',
    '',
    `**Profile location:** \`~/.claude/agents/writing-style-${activeId}.md\``,
    '',
    'Steps for the Drafting Agent:',
    '1. Read the profile file in full.',
    '2. Internalize the voice summary, sentence rhythm, vocabulary fingerprint, punctuation habits, and rhetorical moves described there.',
    '3. When drafting, deliberately apply the imperatives in the profile\'s "When drafting in this voice" checklist.',
    '4. Avoid any phrase or pattern listed under "Avoided / never used".',
    '',
    'The Critique Agent (Step 4) must also score the draft against this profile and flag any sentences that sound off-voice.',
  ].join('\n')
}

export async function launchAssignment(args: LaunchArgs): Promise<{ projectDir: string }> {
  const settings = getSettings()

  // Ensure all 4 bundled workflow agents are installed (or upgraded) in
  // ~/.claude/agents/. Failures don't block launch — the user might already
  // have the file from a previous click and the new mode might still work.
  ensureWorkflowAgentsInstalled()

  const projectDir = makeProjectDir(args.courseCode, args.assignmentName, args.assignmentId)

  // Create .plume metadata directory
  const plumeDir = path.join(projectDir, '.plume')
  fs.mkdirSync(plumeDir, { recursive: true })

  const startedFlag = path.join(plumeDir, '.started')
  const isResume = args.mode === 'resume'
  const isFirstRun = !isResume && !fs.existsSync(startedFlag)

  // Read existing metadata (for preserving created_at + last_mode on resume)
  const metaPath = path.join(plumeDir, 'assignment.json')
  let createdAt = new Date().toISOString()
  let existingLastMode: string | undefined
  if (fs.existsSync(metaPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        created_at?: string
        last_mode?: string
      }
      if (existing.created_at) createdAt = existing.created_at
      existingLastMode = existing.last_mode
    } catch {
      /* ignore — overwrite with a fresh createdAt */
    }
  }

  // Write metadata. For resume, preserve the prior last_mode so metadata
  // keeps tracking the actual workflow the student was running; resume is
  // an action, not a workflow mode.
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        course_id: args.courseId,
        assignment_id: args.assignmentId,
        course_code: args.courseCode,
        name: args.assignmentName,
        due_at: args.dueAt,
        canvas_url: args.htmlUrl,
        created_at: createdAt,
        last_mode: isResume ? (existingLastMode ?? 'resume') : args.mode,
        last_launched_at: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  )

  // CLAUDE.md is only (re)written for workflow-mode clicks. Resume leaves it
  // alone because claude --continue doesn't re-read CLAUDE.md — and if the
  // student later does a clean restart, we want the file to reflect whatever
  // mode they last explicitly chose, not 'resume' (which isn't a workflow).
  let modeMeta: WorkflowModeMeta | null = null
  if (!isResume) {
    modeMeta = WORKFLOW_MODE_META[args.mode as InvocationMode]
    const baseTemplate = substituteTemplate(settings.claudeMdTemplate, {
      COURSE_ID: String(args.courseId),
      ASSIGNMENT_ID: String(args.assignmentId),
      HTML_URL: args.htmlUrl,
      ASSIGNMENT_NAME: args.assignmentName,
      COURSE_CODE: args.courseCode,
      DUE_AT: args.dueAt ?? 'No due date',
      WORKFLOW_AGENT: modeMeta.agent,
      WORKFLOW_MODE_LABEL: modeMeta.label,
      WORKFLOW_MODE_HINT: modeMeta.hint,
    })

    // If the user has an active writing-style profile and the skill file exists,
    // append a Voice block so the Drafting Agent and any prose generation step
    // matches the student's voice.
    const writingStyleBlock = buildWritingStyleBlock(settings.activeWritingStyleId)
    const claudeMdContent = writingStyleBlock
      ? `${baseTemplate}\n\n${writingStyleBlock}\n`
      : baseTemplate
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), claudeMdContent, 'utf-8')
  }

  // Build the PowerShell launcher. Three invocation shapes, chosen here at
  // generation time based on the mode + whether this is the first launch:
  //
  //   resume         →  claude --continue              (no prompt, quiet resume)
  //   first run      →  claude <prompt>                (creates .started + sends mode prompt)
  //   switch-mode    →  claude --continue <prompt>     (resumes existing session, auto-submits new mode prompt)
  //
  // Windows gotchas:
  //   • claude.cmd is an npm shim; the call operator `&` with an absolute
  //     path is the most reliable way to pass quoted args across the
  //     PS → cmd.exe → node boundary.
  //   • Single-quoted PS strings preserve `$` and backticks literally, which
  //     is what we want for the prompt body.
  //   • The PS1 is written with a UTF-8 BOM so PowerShell 5 parses it
  //     correctly (otherwise it defaults to Windows-1252 and mis-decodes).
  const launchScript = path.join(plumeDir, '_launch.ps1')

  // PowerShell single-quoted strings need `'` doubled to `''` to escape.
  const psEscape = (s: string) => s.replace(/'/g, "''")
  const safeAssignmentName = psEscape(args.assignmentName).replace(/`/g, '``')

  // Header label + prompt computation. For resume we skip the prompt block
  // entirely — the PS1 just prints a header and runs `claude --continue`.
  const headerLabel = isResume ? 'Resume' : modeMeta!.label
  const initialPrompt = isResume
    ? ''
    : psEscape(
        `Apply the ${modeMeta!.agent} agent to this assignment and start the full ${modeMeta!.label} workflow now. Use the metadata in CLAUDE.md as context.`
      )

  const activityMessage = isResume
    ? 'Resuming previous session...'
    : isFirstRun
      ? `Starting ${modeMeta!.label} workflow...`
      : `Resuming and switching to ${modeMeta!.label} workflow...`

  // The actual `claude ...` line that ends the script. Everything else is
  // identical across the three cases.
  const claudeInvocation = isResume
    ? '& $claudeCmd.Source --continue'
    : isFirstRun
      ? '& $claudeCmd.Source $prompt'
      : '& $claudeCmd.Source --continue $prompt'

  // Optional blocks: start-flag creation (first run only) and prompt display
  // (workflow-mode only, skipped for resume).
  const startedFlagCreate = isFirstRun
    ? 'New-Item -Path $startedFlag -ItemType File -Force | Out-Null'
    : ''

  const promptBlock = isResume
    ? ''
    : `    $prompt = '${initialPrompt}'
    try { Set-Clipboard -Value $prompt } catch { }
    Write-Host "  Initial prompt (copied to clipboard):" -ForegroundColor DarkGray
    Write-Host "  | $prompt" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Claude will auto-send this. If not, press Ctrl+V then Enter." -ForegroundColor DarkGray
    Write-Host ""`

  const ps1Content = `$Host.UI.RawUI.WindowTitle = 'Plume ${headerLabel} - ${safeAssignmentName}'
$ErrorActionPreference = 'Continue'

# Schedule a background job that waits for conhost/WT to finish laying
# itself out AND claude's TUI to render, THEN snaps the window. Doing this
# inline at script start races against conhost's initial geometry setup —
# conhost wins the race and our SetWindowPos gets overwritten. Deferring
# via Start-Job puts the snap AFTER everything has settled.
$parentPid = $PID
Start-Job -ArgumentList $parentPid -ScriptBlock {
    param($ppid)

    # Wait for the host + claude TUI to fully paint before moving anything.
    Start-Sleep -Seconds 2

    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class PlumeSnap {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

    # Resolve the host window:
    #   1) Check children of the PowerShell process for conhost.exe (classic console)
    #   2) Fall back to the most recent WindowsTerminal.exe (Win11 default)
    $hwnd = [IntPtr]::Zero
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ppid" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        if ($child.Name -ieq 'conhost.exe' -or $child.Name -ieq 'OpenConsole.exe') {
            $proc = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero -and [PlumeSnap]::IsWindowVisible($proc.MainWindowHandle)) {
                $hwnd = $proc.MainWindowHandle
                break
            }
        }
    }

    if ($hwnd -eq [IntPtr]::Zero) {
        $wt = Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue |
              Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
              Sort-Object StartTime -Descending |
              Select-Object -First 1
        if ($wt) { $hwnd = $wt.MainWindowHandle }
    }

    if ($hwnd -ne [IntPtr]::Zero) {
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
        $halfW = [int]($screen.Width / 2)
        # Windows 11 invisible resize border fudge. Native windows have ~7px
        # of invisible padding around the visible frame (resize-handle area).
        # Extending the window past the seam by this amount makes the VISIBLE
        # edges of the two halves meet cleanly instead of leaving a ~14px gap.
        $border = 7
        # Restore first so a maximized/minimized window doesn't eat the move.
        [PlumeSnap]::ShowWindow($hwnd, 9) | Out-Null
        Start-Sleep -Milliseconds 50
        # RIGHT half — x starts at the seam minus the invisible border so the
        # visible left edge aligns with the center, and width extends past the
        # screen's right edge by the same amount to absorb the right border.
        # Plume Hub snaps to the left half; together they tile the display.
        # SWP_SHOWWINDOW (0x40) | SWP_NOZORDER (0x04) = 0x44
        $posX = $screen.X + $halfW - $border
        $posW = ($screen.Width - $halfW) + $border * 2
        $posH = $screen.Height + $border
        for ($i = 0; $i -lt 3; $i++) {
            $ok = [PlumeSnap]::SetWindowPos($hwnd, [IntPtr]::Zero, $posX, $screen.Y, $posW, $posH, 0x44)
            if ($ok) { break }
            Start-Sleep -Milliseconds 200
        }
    }
} | Out-Null

Write-Host ""
Write-Host "  PLUME HUB" -ForegroundColor Magenta
Write-Host "  Mode:       ${headerLabel}" -ForegroundColor Yellow
Write-Host "  Assignment: ${safeAssignmentName}" -ForegroundColor White
Write-Host "  Project:    $PWD" -ForegroundColor DarkGray
Write-Host ""

# ── Locate the claude CLI ───────────────────────────────────────────────────
# Plume's IPC 'provider:detect' uses 'where claude' at the Electron side; we
# replicate that here so a broken PATH or missing install is immediately
# visible to the student, not silently swallowed.
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd) {
    Write-Host "  ERROR: 'claude' not found on PATH." -ForegroundColor Red
    Write-Host "  Plume spawned PowerShell but the Claude Code CLI isn't installed or isn't" -ForegroundColor Yellow
    Write-Host "  visible in this shell's PATH. Install from https://claude.ai/download and" -ForegroundColor Yellow
    Write-Host "  restart Plume Hub." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}
Write-Host "  Claude CLI: $($claudeCmd.Source)" -ForegroundColor DarkGray
Write-Host ""

$startedFlag = Join-Path $PWD ".plume\\.started"

Write-Host "  ${activityMessage}" -ForegroundColor Cyan
Write-Host ""

${startedFlagCreate}

${promptBlock}

# Invoke Claude. See launcher.ts for which of the three invocations is used
# (resume / first-run / switch-mode). All three end with a Read-Host so the
# window stays open after claude exits.
${claudeInvocation}

Write-Host ""
Read-Host "  Claude exited. Press Enter to close"
`
  // Write the PS1 with a UTF-8 BOM. PowerShell 5 (the built-in `powershell.exe`)
  // defaults to reading .ps1 files in the system ANSI codepage (Windows-1252)
  // unless a BOM is present. Without the BOM, multi-byte UTF-8 sequences like
  // em-dashes or arrows get mis-decoded — and occasionally land on a byte
  // (0x92) that PS 5 treats as a smart single-quote, opening an unterminated
  // string and cascading into confusing parse errors far from the real line.
  fs.writeFileSync(launchScript, '\uFEFF' + ps1Content, 'utf-8')

  // Spawn PowerShell in a NEW VISIBLE console window.
  //
  // Electron is a GUI process with no attached console, so a plain
  // `spawn('powershell.exe', ...)` with stdio:'ignore' runs PowerShell
  // *invisibly* — the window never appears. The reliable Windows fix is to
  // launch through `cmd /c start ""` which explicitly tells the Windows
  // shell to create a new console window for the child.
  //
  // The empty `""` after `start` is a title arg — without it, cmd's `start`
  // command misinterprets the next quoted value as the window title and
  // fails to find the executable.
  const child = spawn(
    'cmd.exe',
    [
      '/c',
      'start',
      '""',                               // title slot (empty)
      'powershell.exe',
      '-NoExit',
      '-NoLogo',
      '-ExecutionPolicy', 'Bypass',
      '-File', launchScript,
    ],
    {
      cwd: projectDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }
  )
  child.on('error', () => { /* ignore spawn failures silently */ })
  child.unref()

  return { projectDir }
}
