import { app, BrowserWindow, screen, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from './ipc-handlers'
import { loadSettings, getSettings, saveSettings } from './settings'
import { enrichProcessPath } from './path-fix'

// Enrich PATH BEFORE anything else so detection + launcher spawns inherit
// the user's real shell PATH. GUI-launched Electron apps get a stripped PATH
// from Explorer/launchd; without this, `where claude` / `command -v claude`
// fails even when the CLI is installed.
enrichProcessPath()

const isDev = process.env.NODE_ENV === 'development'

// Remove the default File / Edit / View / Window / Help menu bar.
// This is a native Electron menu that Electron adds automatically on
// Windows/Linux when a framed window is created. Plume doesn't need it.
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null

// Single instance lock — second launch focuses existing window instead
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function assetsDir(): string {
  if (isDev) return path.join(__dirname, '../../assets')
  if (app.isPackaged) return path.join(process.resourcesPath, 'assets')
  return path.join(__dirname, '../../assets')
}

function resolveWindowIcon(): string | undefined {
  // Prefer the high-resolution master icon; fall back to the tray PNG
  // only if the master doesn't exist yet (e.g. running pre-icon-gen commit).
  const hires = path.join(assetsDir(), 'icon.png')
  if (fs.existsSync(hires)) return hires
  const tray = path.join(assetsDir(), 'tray-icon.png')
  return fs.existsSync(tray) ? tray : undefined
}

// Clamp saved bounds to the current primary display so unplugging a monitor
// doesn't leave the window off-screen. Electron also has internal clamping but
// being explicit about it makes the intent obvious.
function validatedBounds(
  bounds: { x: number; y: number; width: number; height: number } | undefined
): { x?: number; y?: number; width: number; height: number } {
  const defaults = { width: 1280, height: 840 }
  if (!bounds) return defaults
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.max(400, Math.min(bounds.width, workArea.width))
  const height = Math.max(300, Math.min(bounds.height, workArea.height))
  const x = Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width))
  const y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))
  return { x, y, width, height }
}

function createWindow(): BrowserWindow {
  const saved = getSettings().windowBounds
  const initial = validatedBounds(saved)

  // Plain resizable/maximizable/fullscreenable window — no acrylic or vibrancy.
  // The Win11 Fluent translucent backdrop was visually nice but interfered
  // with maximize/fullscreen and had inconsistent behavior across monitors,
  // so we dropped it in favor of a dependable native window.
  const win = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.x,
    y: initial.y,
    minWidth: 400,
    minHeight: 300,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    show: false,
    title: 'Plume Hub',
    backgroundColor: '#09090b',  // zinc-950, matches the shell bg
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Show once the renderer has committed its first frame — avoids the white flash
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  // Persist window bounds on close so size/position restore across launches
  win.on('close', () => {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    saveSettings({ windowBounds: bounds })
  })

  return win
}

app.whenReady().then(async () => {
  await loadSettings()

  mainWindow = createWindow()

  setupIpcHandlers(mainWindow)

  // Auto-update: on packaged builds only, check GitHub Releases on startup
  // and surface an OS notification when a newer version is available. The
  // electron-updater defaults (silent download, "install on quit") match the
  // expectation for a student-facing desktop app — no update friction.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      // Never block launch on update-check failures (e.g. offline, rate limit).
      console.warn('[auto-update] check failed:', err?.message ?? err)
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
  }
})
