import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Spawns a Claude Code session in ~/.claude/agents/ and triggers the
// optimize-skills agent. The PS1 and snap logic mirror launcher.ts's
// assignment launcher — same RIGHT-half tile, same Windows-11 border fudge,
// same UTF-8 BOM — but with no project directory, no CLAUDE.md, no mode.

const TRIGGER_PROMPT =
  'Use the optimize-skills agent to audit every skill file in ~/.claude/agents/ and ~/.claude/plume-disabled-agents/. ' +
  'Dispatch parallel Task agents (batches of 8) to rate each skill on purpose, trigger, and body quality. ' +
  'Cluster overlaps, then write the final report to ~/plume-skills-audit.md and open it with `start`.'

export async function launchSkillOptimizer(): Promise<{ workingDir: string }> {
  const workingDir = path.join(os.homedir(), '.claude', 'agents')
  if (!fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, { recursive: true })
  }

  // Stash the script under ~/.claude/ (not ~/.claude/agents/) so it doesn't
  // look like a skill file to Claude's own scans.
  const scriptDir = path.join(os.homedir(), '.claude', 'plume-launcher')
  fs.mkdirSync(scriptDir, { recursive: true })
  const launchScript = path.join(scriptDir, '_optimize-skills.ps1')

  // PS single-quote escape for the prompt body.
  const psEscape = (s: string) => s.replace(/'/g, "''")
  const prompt = psEscape(TRIGGER_PROMPT)

  const ps1Content = `$Host.UI.RawUI.WindowTitle = 'Plume - Optimize Skills'
$ErrorActionPreference = 'Continue'

# Defer the split-snap until conhost + claude's TUI have painted. See
# launcher.ts for why Start-Job instead of an inline SetWindowPos call.
$parentPid = $PID
Start-Job -ArgumentList $parentPid -ScriptBlock {
    param($ppid)

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
        $border = 7
        [PlumeSnap]::ShowWindow($hwnd, 9) | Out-Null
        Start-Sleep -Milliseconds 50
        # RIGHT half — mirrors assignment launcher.
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
Write-Host "  PLUME HUB - OPTIMIZE SKILLS" -ForegroundColor Magenta
Write-Host "  Scanning:   ~/.claude/agents/" -ForegroundColor White
Write-Host "  Report to:  ~/plume-skills-audit.md" -ForegroundColor DarkGray
Write-Host ""

$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd) {
    Write-Host "  ERROR: 'claude' not found on PATH." -ForegroundColor Red
    Write-Host "  Install Claude Code CLI and restart Plume Hub." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}

Write-Host "  Claude CLI: $($claudeCmd.Source)" -ForegroundColor DarkGray
Write-Host ""

$prompt = '${prompt}'
try { Set-Clipboard -Value $prompt } catch { }
Write-Host "  Launching optimize-skills agent..." -ForegroundColor Cyan
Write-Host ""

& $claudeCmd.Source $prompt

Write-Host ""
Read-Host "  Claude exited. Press Enter to close"
`

  fs.writeFileSync(launchScript, '\uFEFF' + ps1Content, 'utf-8')

  const child = spawn(
    'cmd.exe',
    [
      '/c',
      'start',
      '""',
      'powershell.exe',
      '-NoExit',
      '-NoLogo',
      '-ExecutionPolicy', 'Bypass',
      '-File', launchScript,
    ],
    {
      cwd: workingDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }
  )
  child.on('error', () => { /* ignore */ })
  child.unref()

  return { workingDir }
}
