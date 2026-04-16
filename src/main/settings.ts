import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Settings {
  canvasBaseUrl: string
  canvasToken: string
  canvasCourseIds: number[]
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  refreshIntervalMinutes: number
  clickAwayToHide: boolean
  claudeMdTemplate: string
  preferredProvider: 'claude' | 'codex' | null
  onboardingComplete: boolean
  activeWritingStyleId: string | null
  windowBounds?: WindowBounds
}

export const DEFAULT_CLAUDE_MD_TEMPLATE = `# {{ASSIGNMENT_NAME}}

**Course:** {{COURSE_CODE}}
**Due:** {{DUE_AT}}
**Canvas URL:** {{HTML_URL}}
**IDs:** Course \`{{COURSE_ID}}\` / Assignment \`{{ASSIGNMENT_ID}}\`
**Mode:** {{WORKFLOW_MODE_LABEL}}

---

You are working on the Canvas assignment listed above. The student picked the **{{WORKFLOW_MODE_LABEL}}** mode, which means the work fits this shape: {{WORKFLOW_MODE_HINT}}

**Apply the \`{{WORKFLOW_AGENT}}\` agent.** Use the Task tool with \`subagent_type: "{{WORKFLOW_AGENT}}"\` and pass the assignment metadata above as the agent's context. The workflow agent will read the assignment in full, ask informed questions, spawn parallel sub-agents for the heavy lifting, and print a final summary.
`

const DEFAULT_SETTINGS: Settings = {
  canvasBaseUrl: 'https://canvas.uoregon.edu',
  canvasToken: '',
  canvasCourseIds: [],
  corner: 'top-right',
  refreshIntervalMinutes: 15,
  clickAwayToHide: true,
  claudeMdTemplate: DEFAULT_CLAUDE_MD_TEMPLATE,
  preferredProvider: null,
  onboardingComplete: false,
  activeWritingStyleId: null,
}

let currentSettings: Settings = { ...DEFAULT_SETTINGS }

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<void> {
  const filePath = getSettingsPath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<Settings>
      // Migrate old field name
      const migrated = parsed as Record<string, unknown>
      if (migrated['starterPromptTemplate'] && !parsed.claudeMdTemplate) {
        parsed.claudeMdTemplate = migrated['starterPromptTemplate'] as string
      }
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch {
    currentSettings = { ...DEFAULT_SETTINGS }
  }

  if (!currentSettings.canvasToken && process.env.CANVAS_API_TOKEN) {
    currentSettings.canvasToken = process.env.CANVAS_API_TOKEN
  }
}

export function saveSettings(updates: Partial<Settings>): void {
  currentSettings = { ...currentSettings, ...updates }
  const filePath = getSettingsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(currentSettings, null, 2), 'utf-8')
}

export function getSettings(): Settings {
  return currentSettings
}
