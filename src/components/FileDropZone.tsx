import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, File, FileText, AlertCircle, Loader2 } from 'lucide-react'

// Browser-safe mammoth build — no Node APIs
import mammoth from 'mammoth/mammoth.browser'

export interface UploadedSample {
  filename: string
  content: string
}

interface Props {
  onFiles: (samples: UploadedSample[]) => void
  maxFiles?: number
  disabled?: boolean
}

const ACCEPTED = ['.txt', '.md', '.markdown', '.text', '.docx', '.rtf']
const ACCEPT_STRING = ACCEPTED.join(',')

type ParseResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase()

  // .pdf — graceful reject
  if (name.endsWith('.pdf')) {
    return {
      ok: false,
      error: 'PDFs aren\u2019t supported yet. Save as .docx or paste the text.',
    }
  }

  // .docx via mammoth
  if (name.endsWith('.docx')) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      const text = result.value.trim()
      if (!text) return { ok: false, error: 'The document appears to be empty.' }
      return { ok: true, content: text }
    } catch (err) {
      return { ok: false, error: `Failed to read .docx: ${(err as Error).message}` }
    }
  }

  // Plaintext formats (.txt .md .markdown .text .rtf)
  const supported = ACCEPTED.some((ext) => name.endsWith(ext))
  if (!supported) {
    return {
      ok: false,
      error: `${file.name} — unsupported. Use ${ACCEPTED.slice(0, -1).join(', ')} or .docx.`,
    }
  }

  try {
    const text = await file.text()
    const cleaned = text.trim()
    if (!cleaned) return { ok: false, error: 'File is empty.' }
    return { ok: true, content: cleaned }
  } catch (err) {
    return { ok: false, error: `Failed to read file: ${(err as Error).message}` }
  }
}

export function FileDropZone({ onFiles, maxFiles, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function handleFileList(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    setErrors([])

    const files = Array.from(fileList).slice(0, maxFiles ?? fileList.length)
    const samples: UploadedSample[] = []
    const newErrors: string[] = []

    for (const file of files) {
      const result = await parseFile(file)
      if (result.ok) {
        samples.push({ filename: file.name, content: result.content })
      } else {
        newErrors.push(`${file.name}: ${result.error}`)
      }
    }

    if (samples.length > 0) onFiles(samples)
    setErrors(newErrors)
    setBusy(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!disabled && !busy) setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (disabled || busy) return
    void handleFileList(e.dataTransfer.files)
  }

  function openPicker() {
    if (disabled || busy) return
    inputRef.current?.click()
  }

  return (
    <div className="flex flex-col gap-2">
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openPicker}
        initial={false}
        animate={{
          borderColor: dragOver ? 'rgba(0, 103, 71, 0.8)' : 'rgba(255, 255, 255, 0.15)',
          backgroundColor: dragOver ? 'rgba(0, 103, 71, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        }}
        transition={{ duration: 0.12 }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-transform ${
          disabled || busy ? 'pointer-events-none opacity-50' : 'hover:scale-[1.005]'
        }`}
      >
        <motion.div
          animate={{ y: dragOver ? -2 : 0 }}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-500/15"
        >
          {busy ? (
            <Loader2 size={22} className="animate-spin text-plume-400" />
          ) : (
            <Upload size={22} className="text-plume-400" />
          )}
        </motion.div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="text-sm font-semibold text-zinc-100">
            {busy
              ? 'Reading files…'
              : dragOver
              ? 'Drop files to upload'
              : 'Drag & drop writing samples'}
          </div>
          <div className="text-[11px] text-zinc-500">
            or <span className="text-plume-400 underline">click to browse</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1">
          {['.txt', '.md', '.docx', '.rtf'].map((ext) => (
            <span
              key={ext}
              className="rounded-md border border-white/10 bg-zinc-900/60 px-1.5 py-[1px] font-mono text-[9px] text-zinc-400"
            >
              {ext}
            </span>
          ))}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_STRING}
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFileList(e.target.files)
            // Reset so selecting the same file again re-triggers onChange
            e.target.value = ''
          }}
        />
      </motion.div>

      {/* Error list for rejected files */}
      {errors.length > 0 && (
        <div className="flex flex-col gap-1">
          {errors.map((err, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[10px] text-red-300"
            >
              <AlertCircle size={10} className="mt-[2px] flex-shrink-0" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Compact uploaded-file badge. Shown in the CreateForm once a file has been
 * parsed so the user can see which file contributed which sample.
 */
export function UploadedBadge({
  filename,
  chars,
}: {
  filename: string
  chars: number
}) {
  const isDoc = filename.toLowerCase().endsWith('.docx')
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-plume-500/30 bg-plume-500/10 px-2 py-[1px] font-mono text-[10px] text-plume-300">
      {isDoc ? <File size={9} /> : <FileText size={9} />}
      <span className="max-w-[180px] truncate">{filename}</span>
      <span className="text-plume-500/70">· {chars}c</span>
    </span>
  )
}
