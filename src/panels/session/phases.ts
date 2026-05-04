import type { ProjectFile } from '../../lib/bridge'

export interface Phase {
  id: string
  label: string
  done: boolean
  active: boolean
}

const NORMALIZE = (p: string) => p.replace(/\\/g, '/')

interface PhaseDef {
  id: string
  label: string
  matches: (path: string) => boolean
}

// Ordered loosely by the typical workflow. The phase set is fixed so the
// view stays predictable; whether each phase is "done" comes from the actual
// files on disk, not a state machine.
const PHASES: PhaseDef[] = [
  { id: 'read',     label: 'Read assignment', matches: (p) => p.includes('canvas/assignment') || p.includes('canvas/rubric') },
  { id: 'rubric',   label: 'Rubric analyzed', matches: (p) => p.includes('rubric_analysis') },
  { id: 'research', label: 'Research',        matches: (p) => p.startsWith('research/') },
  { id: 'draft',    label: 'First draft',     matches: (p) => p.includes('draft_v1') || p.startsWith('study/') || p.startsWith('drafts/') },
  { id: 'critique', label: 'Critique',        matches: (p) => p.includes('critique') },
  { id: 'final',    label: 'Final draft',     matches: (p) => p.includes('draft_v2') || p.includes('final') },
]

/**
 * Given the current project files, decide which phases are done and which
 * is the most recently active one. Returns phases in display order.
 */
export function inferPhases(files: ProjectFile[]): Phase[] {
  const paths = files.map((f) => NORMALIZE(f.path))
  const phases: Phase[] = PHASES.map((p) => ({
    id: p.id,
    label: p.label,
    done: paths.some(p.matches),
    active: false,
  }))
  // Active = the latest done phase, or the first not-yet-done phase if none
  // are done yet.
  const lastDone = phases.reduce<number>((acc, p, i) => (p.done ? i : acc), -1)
  const activeIndex = lastDone >= 0 ? lastDone : 0
  if (phases[activeIndex]) phases[activeIndex].active = true
  return phases
}
