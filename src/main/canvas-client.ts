import https from 'https'
import http from 'http'
import { URL } from 'url'

export interface CanvasUser {
  id: number
  name: string
  email: string
}

export interface CanvasCourse {
  id: number
  name: string
  courseCode: string
}

export interface CanvasAssignment {
  id: number
  courseId: number
  courseCode: string
  name: string
  dueAt: string | null
  pointsPossible: number | null
  htmlUrl: string
  description: string
  submissionTypes: string[]
}

export interface CanvasAnnouncement {
  id: number
  courseId: number
  title: string
  message: string
  postedAt: string | null
  authorName: string
}

export interface CanvasInstructor {
  id: number
  name: string
  enrollmentType: string
}

export interface CanvasSubmissionSample {
  filename: string
  content: string
  assignmentName: string
  courseCode: string
  submittedAt: string | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'submission'
}

function parseLink(header: string | undefined): string | null {
  if (!header) return null
  const match = header.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}

async function fetchJson<T>(urlStr: string, token: string): Promise<{ data: T; nextUrl: string | null }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }

    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(options, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Canvas API ${res.statusCode}: ${body.slice(0, 200)}`))
            return
          }
          const data = JSON.parse(body) as T
          const nextUrl: string | null = parseLink(res.headers['link'] as string | undefined)
          resolve({ data, nextUrl })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout'))
    })
    req.end()
  })
}

async function postJson<T>(urlStr: string, token: string, body: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr)
    const payload = JSON.stringify(body)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload).toString(),
      },
    }

    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(options, (res) => {
      let raw = ''
      res.on('data', (chunk: Buffer) => { raw += chunk.toString() })
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Canvas API ${res.statusCode}: ${raw.slice(0, 200)}`))
            return
          }
          resolve(JSON.parse(raw) as T)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(new Error('Request timeout')) })
    req.write(payload)
    req.end()
  })
}

async function fetchAllPages<T>(firstUrl: string, token: string): Promise<T[]> {
  const results: T[] = []
  let url: string | null = firstUrl
  while (url) {
    const fetched: { data: T[]; nextUrl: string | null } = await fetchJson<T[]>(url, token)
    results.push(...fetched.data)
    url = fetched.nextUrl
  }
  return results
}

// Downloads an attachment URL as a Buffer, following 3xx redirects (Canvas
// often hands out S3 redirect URLs for attachment payloads). The Authorization
// header is sent on the initial request; redirected URLs typically include a
// signed `verifier` query param and don't need the header again.
async function downloadAttachmentBuffer(
  urlStr: string,
  token: string,
  redirectsLeft = 3,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr)
    const transport = parsed.protocol === 'https:' ? https : http
    const headers: Record<string, string> = { Accept: '*/*' }
    // Only attach the bearer to the canvas host; redirected S3 URLs reject it.
    if (parsed.hostname.endsWith(new URL(urlStr).hostname) && redirectsLeft === 3) {
      headers.Authorization = `Bearer ${token}`
    }
    const req = transport.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume()
          const next = new URL(res.headers.location, urlStr).toString()
          downloadAttachmentBuffer(next, token, redirectsLeft - 1).then(resolve, reject)
          return
        }
        if (status >= 400) {
          res.resume()
          reject(new Error(`Attachment download ${status}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      },
    )
    req.on('error', reject)
    req.setTimeout(20000, () => req.destroy(new Error('Attachment download timeout')))
    req.end()
  })
}

export class CanvasClient {
  constructor(
    private baseUrl: string,
    private token: string
  ) {}

  async validateToken(): Promise<CanvasUser> {
    const { data } = await fetchJson<CanvasUser>(
      `${this.baseUrl}/api/v1/users/self`,
      this.token
    )
    return data
  }

  async listCourses(): Promise<CanvasCourse[]> {
    const raw = await fetchAllPages<{
      id: number
      name: string
      course_code: string
      enrollments?: { type: string; enrollment_state: string }[]
    }>(
      `${this.baseUrl}/api/v1/courses?enrollment_state=active&per_page=100`,
      this.token
    )
    return raw.map((c) => ({
      id: c.id,
      name: c.name,
      courseCode: c.course_code,
    }))
  }

  async listUpcoming(courseIds: number[]): Promise<CanvasAssignment[]> {
    if (courseIds.length === 0) return []

    const allAssignments: CanvasAssignment[] = []

    await Promise.all(
      courseIds.map(async (courseId) => {
        try {
          // include[]=submission bundles the CURRENT student's submission
          // object on each assignment — gives us workflow_state and
          // submitted_at so we can hide assignments the student already
          // turned in.
          const raw = await fetchAllPages<{
            id: number
            name: string
            due_at: string | null
            points_possible: number | null
            html_url: string
            description: string | null
            submission_types: string[]
            course_id: number
            submission?: {
              workflow_state?: string
              submitted_at?: string | null
            } | null
          }>(
            `${this.baseUrl}/api/v1/courses/${courseId}/assignments?per_page=100&bucket=upcoming&order_by=due_at&include[]=submission`,
            this.token
          )
          allAssignments.push(
            ...raw.map((a) => {
              const sub = a.submission
              const submitted = Boolean(
                sub && (
                  (sub.workflow_state && sub.workflow_state !== 'unsubmitted') ||
                  sub.submitted_at
                )
              )
              return {
                id: a.id,
                courseId: a.course_id ?? courseId,
                courseCode: '',
                name: a.name,
                dueAt: a.due_at,
                pointsPossible: a.points_possible,
                htmlUrl: a.html_url,
                description: a.description ?? '',
                submissionTypes: a.submission_types ?? [],
                submitted,
              }
            })
          )
        } catch {
          // skip courses that fail (e.g. missing permissions)
        }
      })
    )

    return allAssignments.sort((a, b) => {
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
  }

  async listAnnouncements(courseIds: number[]): Promise<CanvasAnnouncement[]> {
    if (courseIds.length === 0) return []
    const contextCodes = courseIds.map((id) => `context_codes[]=course_${id}`).join('&')
    const url = `${this.baseUrl}/api/v1/announcements?${contextCodes}&per_page=50&active_only=true`
    try {
      const raw = await fetchAllPages<{
        id: number
        title: string
        message: string
        posted_at: string | null
        context_code: string
        author: { display_name?: string; name?: string } | null
      }>(url, this.token)
      return raw.map((a) => {
        const courseMatch = a.context_code?.match(/course_(\d+)/)
        return {
          id: a.id,
          courseId: courseMatch ? parseInt(courseMatch[1], 10) : 0,
          title: a.title ?? '(untitled)',
          message: stripHtml(a.message ?? ''),
          postedAt: a.posted_at,
          authorName: a.author?.display_name ?? a.author?.name ?? 'Unknown',
        }
      })
    } catch {
      return []
    }
  }

  async listInstructors(courseId: number): Promise<CanvasInstructor[]> {
    try {
      const raw = await fetchAllPages<{
        id: number
        name: string
        enrollments?: { type: string }[]
      }>(
        `${this.baseUrl}/api/v1/courses/${courseId}/users?enrollment_type[]=teacher&enrollment_type[]=ta&per_page=50`,
        this.token
      )
      return raw.map((u) => ({
        id: u.id,
        name: u.name,
        enrollmentType: u.enrollments?.[0]?.type ?? 'teacher',
      }))
    } catch {
      return []
    }
  }

  async sendMessage(recipientIds: string[], subject: string, body: string): Promise<{ id: number }> {
    return postJson<{ id: number }>(
      `${this.baseUrl}/api/v1/conversations`,
      this.token,
      {
        recipients: recipientIds,
        subject,
        body,
        group_conversation: false,
      }
    )
  }

  // Pulls the student's most recent submissions from individual (non-group)
  // assignments across the given courses. Used by the writing-style "Auto from
  // Canvas" flow to harvest sample text for the analyzer. Returns up to `limit`
  // parsed samples; assignments without parseable content (PDF only, image
  // only, empty body) are skipped silently.
  async listIndividualSubmissions(
    courseIds: number[],
    limit: number,
    onProgress?: (line: string) => void,
  ): Promise<CanvasSubmissionSample[]> {
    if (courseIds.length === 0) return []
    const log = (line: string) => onProgress?.(line)

    const courses = await this.listCourses()
    const codeFor = new Map(courses.map((c) => [c.id, c.courseCode] as const))

    interface Candidate {
      courseId: number
      courseCode: string
      assignmentId: number
      assignmentName: string
      submittedAt: string | null
      bodyHtml: string | null
      attachments: { url: string; filename: string; contentType?: string }[]
    }

    const candidates: Candidate[] = []

    await Promise.all(
      courseIds.map(async (courseId) => {
        const courseCode = codeFor.get(courseId) ?? `course-${courseId}`
        try {
          const raw = await fetchAllPages<{
            id: number
            name: string
            group_category_id: number | null
            submission?: {
              workflow_state?: string
              submitted_at?: string | null
              body?: string | null
              submission_type?: string | null
              attachments?: {
                url: string
                filename: string
                'content-type'?: string
                content_type?: string
              }[]
            } | null
          }>(
            `${this.baseUrl}/api/v1/courses/${courseId}/assignments?per_page=100&include[]=submission`,
            this.token,
          )
          log(`Scanning ${courseCode} (${raw.length} assignments)`)

          for (const a of raw) {
            if (a.group_category_id != null) {
              log(`Skipping group assignment "${a.name}"`)
              continue
            }
            const sub = a.submission
            if (!sub) continue
            const submitted =
              (sub.workflow_state && sub.workflow_state !== 'unsubmitted') ||
              Boolean(sub.submitted_at)
            if (!submitted) continue

            const bodyHtml = sub.body && sub.body.trim().length > 0 ? sub.body : null
            const attachments = (sub.attachments ?? []).map((att) => ({
              url: att.url,
              filename: att.filename,
              contentType: att['content-type'] ?? att.content_type,
            }))
            if (!bodyHtml && attachments.length === 0) continue

            candidates.push({
              courseId,
              courseCode,
              assignmentId: a.id,
              assignmentName: a.name,
              submittedAt: sub.submitted_at ?? null,
              bodyHtml,
              attachments,
            })
          }
        } catch (err) {
          log(`Failed ${courseCode}: ${(err as Error).message}`)
        }
      }),
    )

    // Newest first.
    candidates.sort((a, b) => {
      if (!a.submittedAt) return 1
      if (!b.submittedAt) return -1
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    })

    const SUPPORTED_TEXT_EXTS = ['.txt', '.md', '.markdown', '.text', '.rtf']
    const samples: CanvasSubmissionSample[] = []

    for (const cand of candidates) {
      if (samples.length >= limit) break

      // 1) Body (online_text_entry)
      if (cand.bodyHtml) {
        const plain = stripHtml(cand.bodyHtml)
        if (plain.length >= 100) {
          log(`Read ${cand.courseCode} — ${cand.assignmentName}`)
          samples.push({
            filename: `${slugify(cand.assignmentName)}.txt`,
            content: plain,
            assignmentName: cand.assignmentName,
            courseCode: cand.courseCode,
            submittedAt: cand.submittedAt,
          })
          continue
        }
      }

      // 2) Attachments — first .docx, then first plain-text-ish ext.
      const docx = cand.attachments.find((a) =>
        a.filename.toLowerCase().endsWith('.docx'),
      )
      const text = cand.attachments.find((a) =>
        SUPPORTED_TEXT_EXTS.some((ext) => a.filename.toLowerCase().endsWith(ext)),
      )

      if (docx) {
        try {
          log(`Parsing .docx attachment from "${cand.assignmentName}"`)
          const buffer = await downloadAttachmentBuffer(docx.url, this.token)
          // mammoth's main entry is the Node build (./lib/index.js); this
          // import is intentionally NOT mammoth/mammoth.browser.
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ buffer })
          const cleaned = result.value.trim()
          if (cleaned.length >= 100) {
            samples.push({
              filename: docx.filename,
              content: cleaned,
              assignmentName: cand.assignmentName,
              courseCode: cand.courseCode,
              submittedAt: cand.submittedAt,
            })
            continue
          }
        } catch (err) {
          log(`Skipped "${cand.assignmentName}" (.docx error: ${(err as Error).message})`)
        }
      }

      if (text) {
        try {
          const buffer = await downloadAttachmentBuffer(text.url, this.token)
          const cleaned = buffer.toString('utf-8').trim()
          if (cleaned.length >= 100) {
            log(`Read ${cand.courseCode} — ${cand.assignmentName} (${text.filename})`)
            samples.push({
              filename: text.filename,
              content: cleaned,
              assignmentName: cand.assignmentName,
              courseCode: cand.courseCode,
              submittedAt: cand.submittedAt,
            })
            continue
          }
        } catch (err) {
          log(`Skipped "${cand.assignmentName}" (attachment error: ${(err as Error).message})`)
        }
      }
    }

    log(`Done — found ${samples.length} sample${samples.length === 1 ? '' : 's'}`)
    return samples
  }

  async getAssignmentDetail(courseId: number, assignmentId: number): Promise<CanvasAssignment> {
    const { data } = await fetchJson<{
      id: number
      name: string
      due_at: string | null
      points_possible: number | null
      html_url: string
      description: string | null
      submission_types: string[]
      course_id: number
    }>(
      `${this.baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
      this.token
    )
    return {
      id: data.id,
      courseId: data.course_id ?? courseId,
      courseCode: '',
      name: data.name,
      dueAt: data.due_at,
      pointsPossible: data.points_possible,
      htmlUrl: data.html_url,
      description: data.description ?? '',
      submissionTypes: data.submission_types ?? [],
    }
  }
}
