#!/usr/bin/env node
// Render a 1280×640 GitHub / Open-Graph social card from an inline SVG.
// Output: assets/social-preview.png — upload via `gh api` to set
// open_graph_image on the repo so shared links render a branded card.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'assets', 'social-preview.png')

// Inline the app icon SVG into the card SVG so we get a single atomic
// rasterization — no multi-pass compositing, no font-rendering fragility.
const APP_ICON = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf-8')
// Strip the outer <svg ...> wrapper and keep only the inner contents, so we
// can re-embed it inside our larger canvas with a different viewBox.
const innerIcon = APP_ICON
  .replace(/^<\?xml[^>]*\?>\s*/, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')

const card = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00563d"/>
      <stop offset="100%" stop-color="#006747"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1280" height="640" fill="url(#bg)"/>

  <!-- App icon: embed the master SVG inside a 240×240 slot on the left -->
  <g transform="translate(120 200) scale(0.234)">
    ${innerIcon}
  </g>

  <!-- Title + tagline on the right -->
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#ffffff">
    <text x="420" y="290" font-size="80" font-weight="800" letter-spacing="-2">Plume Hub</text>
    <text x="422" y="348" font-size="28" font-weight="500" fill="#FEE123" letter-spacing="0.5">
      Canvas + Claude Code for students
    </text>
    <text x="422" y="420" font-size="22" font-weight="400" fill="#b4f0d0" opacity="0.85">
      Think. Draft. Build. Study.
    </text>
    <text x="422" y="460" font-size="20" font-weight="400" fill="#b4f0d0" opacity="0.7">
      One click per assignment. Four modes, zero config.
    </text>
  </g>

  <!-- Bottom-right badge: github handle -->
  <text x="1160" y="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="18" fill="#ffffff" opacity="0.6" text-anchor="end">
    github.com/UnlimitedxIQ/plume-hub
  </text>
</svg>`

await sharp(Buffer.from(card))
  .png()
  .toFile(OUT)

console.log(`[social-preview] wrote ${OUT}`)
