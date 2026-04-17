import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { screen } from 'electron'
import { getSettings } from './settings'
import { ensureWorkflowAgentsInstalled } from './workflow-installer'
import { isMac, shEscapeSingle, applescriptEscape } from './platform'
import { detectProviders } from './provider-detect'

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

// Shared inputs passed to the platform-specific script-writing helpers.
// Keeps the branches inside launchAssignment() shaped as data so each side
// (Windows PS1, Mac bash) can render them into its own script idiom.
interface LaunchScriptContext {
  plumeDir: string
  projectDir: string
  assignmentName: string
  headerLabel: string     // "Think" / "Build" / "Resume" / …
  rawPrompt: string       // unescaped; helpers escape per-shell
  activityMessage: string
  isResume: boolean
  isFirstRun: boolean
  /**
   * Absolute path to the claude CLI resolved by provider-detect at launch
   * time. If null, the spawned script falls back to PATH lookup
   * (Get-Command on Windows / command -v on Mac). Injecting the resolved
   * path avoids the class of bugs where Electron's detection succeeds but
   * the spawned shell's PATH is different.
   */
  resolvedClaudePath: string | null
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

  // Shape inputs shared by both platforms. The raw prompt text gets escaped
  // per-platform inside the helpers — single-quote-for-PS on Windows,
  // bash-safe on Mac.
  const headerLabel = isResume ? 'Resume' : modeMeta!.label
  const rawInitialPrompt = isResume
    ? ''
    : `Apply the ${modeMeta!.agent} agent to this assignment and start the full ${modeMeta!.label} workflow now. Use the metadata in CLAUDE.md as context.`
  const activityMessage = isResume
    ? 'Resuming previous session...'
    : isFirstRun
      ? `Starting ${modeMeta!.label} workflow...`
      : `Resuming and switching to ${modeMeta!.label} workflow...`

  // Resolve claude's absolute path now so the spawned shell doesn't need a
  // working PATH to find it. detectProviders() walks PATH + known install
  // locations; if it comes up empty we leave resolvedClaudePath null and
  // let the script fall back to its own PATH lookup.
  const detected = detectProviders()
  const resolvedClaudePath = detected.claude.path

  const scriptCtx: LaunchScriptContext = {
    plumeDir,
    projectDir,
    assignmentName: args.assignmentName,
    headerLabel,
    rawPrompt: rawInitialPrompt,
    activityMessage,
    isResume,
    isFirstRun,
    resolvedClaudePath,
  }

  if (isMac) {
    const launchScript = path.join(plumeDir, '_launch.sh')
    writeMacLaunchScript(launchScript, scriptCtx)
    spawnMacTerminal(launchScript, projectDir)
    return { projectDir }
  }

  // ── Windows path (existing behaviour) ─────────────────────────────────────
  // PS1 launcher — three invocation shapes chosen at generation time:
  //   resume         →  claude --continue              (quiet resume, no prompt)
  //   first run      →  claude <prompt>                (creates .started + sends mode prompt)
  //   switch-mode    →  claude --continue <prompt>     (resume + auto-submit new mode prompt)
  //
  // Gotchas baked into this path:
  //   • claude.cmd is an npm shim; the call operator `&` with an absolute path
  //     is the most reliable way to pass quoted args across PS → cmd.exe → node.
  //   • Single-quoted PS strings preserve `$` and backticks literally.
  //   • The PS1 is written with a UTF-8 BOM so PowerShell 5 parses it correctly.
  const launchScript = path.join(plumeDir, '_launch.ps1')

  // PowerShell single-quoted strings need `'` doubled to `''` to escape.
  const psEscape = (s: string) => s.replace(/'/g, "''")
  const safeAssignmentName = psEscape(args.assignmentName).replace(/`/g, '``')
  const initialPrompt = psEscape(rawInitialPrompt)

  const claudeInvocation = isResume
    ? '& $claudeExe --continue'
    : isFirstRun
      ? '& $claudeExe $prompt'
      : '& $claudeExe --continue $prompt'

  // Escape for a PowerShell single-quoted literal.
  const resolvedClaudeForPs = resolvedClaudePath
    ? resolvedClaudePath.replace(/'/g, "''")
    : ''

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
# Plume resolved claude's absolute path at launch time via provider-detect.
# Prefer that path; fall back to a PATH lookup here if Plume couldn't find
# one (e.g. student installed claude AFTER opening Plume Hub).
$plumeResolvedClaude = '${resolvedClaudeForPs}'
if ($plumeResolvedClaude -and (Test-Path -LiteralPath $plumeResolvedClaude)) {
    $claudeExe = $plumeResolvedClaude
} else {
    $fallback = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $fallback) {
        Write-Host "  ERROR: 'claude' not found." -ForegroundColor Red
        Write-Host "  Plume Hub could not locate the Claude Code CLI. Install from" -ForegroundColor Yellow
        Write-Host "  https://claude.ai/download and restart Plume Hub." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "  Press Enter to close"
        exit 1
    }
    $claudeExe = $fallback.Source
}
Write-Host "  Claude CLI: $claudeExe" -ForegroundColor DarkGray
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

// ─────────────────────────────────────────────────────────────────────────────
// macOS launcher — bash script + osascript Terminal spawn
// ─────────────────────────────────────────────────────────────────────────────
//
// Behaviour parity with the Windows PS1:
//   • Print header (mode, assignment, project)
//   • Check `claude` is on PATH, fail fast with a clear message if not
//   • Schedule a delayed window-snap to the right half via AppleScript
//   • Run one of three `claude …` invocations (resume / first / switch-mode)
//   • Leave the Terminal window open after claude exits (wait for Enter)

function writeMacLaunchScript(launchScript: string, ctx: LaunchScriptContext): void {
  const safeName = shEscapeSingle(ctx.assignmentName)
  const prompt = shEscapeSingle(ctx.rawPrompt)
  const activity = shEscapeSingle(ctx.activityMessage)

  // Pre-compute the right-half snap rectangle from the display the Plume Hub
  // window is currently on (or the primary display as a fallback). Embedding
  // at script-write time keeps the bash script free of screen-query logic.
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  const halfW = Math.floor(workArea.width / 2)
  const posX1 = workArea.x + halfW
  const posY1 = workArea.y
  const posX2 = workArea.x + workArea.width
  const posY2 = workArea.y + workArea.height

  // Three invocation shapes. We intentionally do NOT exec claude with --
  // redirection here — we want the user to see its TUI in the foreground.
  // `$CLAUDE_EXE` is resolved inside the script (see scriptBody below):
  // prefers Plume's detected absolute path, falls back to PATH.
  const claudeInvocation = ctx.isResume
    ? `"$CLAUDE_EXE" --continue`
    : ctx.isFirstRun
      ? `"$CLAUDE_EXE" "$PROMPT"`
      : `"$CLAUDE_EXE" --continue "$PROMPT"`

  const resolvedClaudeForSh = ctx.resolvedClaudePath
    ? shEscapeSingle(ctx.resolvedClaudePath)
    : ''

  // Optional sections — parallel structure to the Windows script.
  const startedFlagCreate = ctx.isFirstRun
    ? `touch "$PWD/.plume/.started"`
    : ''

  const promptBlock = ctx.isResume
    ? ''
    : `PROMPT='${prompt}'
# Copy the initial prompt to the clipboard so the user can paste it manually
# if Claude's auto-send path ever fails.
printf '%s' "$PROMPT" | pbcopy 2>/dev/null || true
echo "  Initial prompt (copied to clipboard):"
echo "  | $PROMPT"
echo ""
echo "  Claude will auto-send this. If not, press Cmd+V then Return."
echo ""`

  // AppleScript snap — fires after a 2s delay in a backgrounded subshell so
  // Terminal + the claude TUI have time to paint before we move the window.
  const snapBlock = `(sleep 2 && osascript <<'APPLESCRIPT'
tell application "Terminal"
  if (count of windows) is 0 then return
  try
    set bounds of front window to {${posX1}, ${posY1}, ${posX2}, ${posY2}}
  end try
end tell
APPLESCRIPT
) &`

  const scriptBody = `#!/bin/bash
# Auto-generated by Plume Hub — do not edit by hand.
# Mode:       ${ctx.headerLabel}
# Assignment: ${ctx.assignmentName}
set -u

${snapBlock}

echo ""
echo "  PLUME HUB"
echo "  Mode:       ${ctx.headerLabel}"
echo "  Assignment: ${safeName}"
echo "  Project:    $PWD"
echo ""

# ── Locate the claude CLI ───────────────────────────────────────────────────
# Prefer the absolute path Plume resolved at launch time; fall back to PATH
# lookup if empty (e.g. student installed claude AFTER opening Plume Hub).
PLUME_RESOLVED_CLAUDE='${resolvedClaudeForSh}'
if [ -n "$PLUME_RESOLVED_CLAUDE" ] && [ -x "$PLUME_RESOLVED_CLAUDE" ]; then
  CLAUDE_EXE="$PLUME_RESOLVED_CLAUDE"
elif command -v claude >/dev/null 2>&1; then
  CLAUDE_EXE="$(command -v claude)"
else
  echo "  ERROR: 'claude' not found."
  echo "  Plume Hub could not locate the Claude Code CLI. Install it from"
  echo "  https://claude.com/download and restart Plume Hub."
  echo ""
  read -n 1 -s -r -p "  Press any key to close" _
  exit 1
fi
export CLAUDE_EXE
echo "  Claude CLI: $CLAUDE_EXE"
echo ""

echo "  ${activity}"
echo ""

${startedFlagCreate}

${promptBlock}

# Invoke Claude (resume / first-run / switch-mode — see launcher.ts).
${claudeInvocation}

echo ""
read -n 1 -s -r -p "  Claude exited. Press any key to close" _
`

  fs.writeFileSync(launchScript, scriptBody, 'utf-8')
  // Make it executable. `bash <script>` works either way, but an executable
  // bit signals intent and keeps future shell integrations happy.
  try { fs.chmodSync(launchScript, 0o755) } catch { /* best-effort */ }
}

function spawnMacTerminal(launchScript: string, projectDir: string): void {
  // `osascript -e "tell application \"Terminal\" to do script …"` pops open
  // a new Terminal window running our script. Using `bash <script>` rather
  // than relying on the shebang means users don't need a +x bit or the
  // `.command` extension → `Terminal` association trick.
  //
  // We `cd` into projectDir first so `$PWD` inside the script is the
  // assignment folder — same invariant the Windows launcher has via `cwd:`.
  const quotedDir = shEscapeSingle(projectDir)
  const quotedScript = shEscapeSingle(launchScript)
  const innerCmd = `cd '${quotedDir}' && bash '${quotedScript}'`
  const applescript = `tell application "Terminal" to do script "${applescriptEscape(innerCmd)}"`

  const child = spawn('osascript', ['-e', applescript], {
    detached: true,
    stdio: 'ignore',
  })
  child.on('error', () => { /* ignore — never block launch */ })
  child.unref()
}
