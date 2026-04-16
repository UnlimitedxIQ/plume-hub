// Small platform-detection + shell-escape helpers used by the launcher and
// skill-optimizer modules. Centralising these keeps the branches in those
// files shaped as data rather than open-coded `process.platform` checks.

export const isMac = process.platform === 'darwin'
export const isWindows = process.platform === 'win32'

/**
 * Escape a string for safe inclusion inside a POSIX single-quoted shell token.
 * Rule: replace every "'" with "'\\''". This lets us embed user-supplied text
 * (assignment names, prompts) into a bash script without command injection risk.
 */
export function shEscapeSingle(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

/**
 * Escape a string for safe inclusion inside an AppleScript string literal
 * (double-quoted). Rule: escape backslashes and double-quotes.
 */
export function applescriptEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
