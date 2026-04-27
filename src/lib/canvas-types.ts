export interface Assignment {
  id: number
  courseId: number
  courseCode: string
  name: string
  dueAt: string | null
  pointsPossible: number | null
  htmlUrl: string
  description: string
  submissionTypes: string[]
  /**
   * True when the student has already submitted this assignment (workflow_state
   * of their submission is anything other than "unsubmitted", or submitted_at
   * is set). Used by the dashboard to hide completed work.
   */
  submitted: boolean
}
