#!/usr/bin/env node
// Rasterize assets/icon.svg into every platform-specific icon size +
// format Plume Hub needs. Intended to be re-run whenever the SVG changes.
//
//   assets/icon.svg        → source of truth
//   assets/icon.png        → 1024×1024 (electron-builder uses for macOS fallback, also README hero)
//   assets/icon.ico        → Windows multi-resolution (16, 32, 48, 64, 128, 256)
//   assets/icon.icns       → macOS multi-resolution (16, 32, 64, 128, 256, 512, 1024)
//   assets/tray-icon.png   → 32×32 for the window chrome icon
//   assets/icon-512.png    → 512×512 for README / social preview composites
//
// Safe to commit the generated files; .gitignore does NOT exclude them since
// running this script is cheap but not part of the every-commit dev loop.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import png2icons from 'png2icons'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC_SVG = path.join(ROOT, 'assets', 'icon.svg')
const ASSETS = path.join(ROOT, 'assets')

if (!fs.existsSync(SRC_SVG)) {
  console.error(`[generate-icons] missing source SVG at ${SRC_SVG}`)
  process.exit(1)
}

const svgBuffer = fs.readFileSync(SRC_SVG)

// Rasterize to a given square size. Density kept high so fine details in
// the SVG (barbs, tips) don't alias at small output sizes.
async function renderPng(size) {
  return sharp(svgBuffer, { density: Math.max(72, Math.ceil((size / 1024) * 512)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function main() {
  console.log('[generate-icons] rasterizing master PNG (1024×1024)…')
  const master = await renderPng(1024)
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), master)

  console.log('[generate-icons] rendering tray-icon + README sizes…')
  fs.writeFileSync(path.join(ASSETS, 'tray-icon.png'), await renderPng(32))
  fs.writeFileSync(path.join(ASSETS, 'icon-512.png'), await renderPng(512))
  fs.writeFileSync(path.join(ASSETS, 'icon-256.png'), await renderPng(256))

  // Build a size ladder for ICO + ICNS. png2icons expects a single input PNG
  // and packs the standard sizes for the target format automatically.
  console.log('[generate-icons] building icon.ico (Windows multi-res)…')
  const ico = png2icons.createICO(master, png2icons.HERMITE, 0, false)
  if (!ico) throw new Error('png2icons.createICO returned null')
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico)

  console.log('[generate-icons] building icon.icns (macOS multi-res)…')
  const icns = png2icons.createICNS(master, png2icons.HERMITE, 0)
  if (!icns) throw new Error('png2icons.createICNS returned null')
  fs.writeFileSync(path.join(ASSETS, 'icon.icns'), icns)

  console.log('[generate-icons] done.')
}

main().catch((err) => {
  console.error('[generate-icons] failed:', err)
  process.exit(1)
})
