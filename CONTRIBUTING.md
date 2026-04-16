# Contributing to Plume Hub

Thanks for your interest. Plume Hub is a single-maintainer project, so the workflow is simple and informal — but a few norms help keep it tractable.

## Quick start

```bash
git clone https://github.com/UnlimitedxIQ/plume-hub
cd plume-hub
npm install
npm run dev     # hot-reload renderer, rebuilds main on save
```

On save the Vite dev server serves the renderer at `http://localhost:5173`, and Electron picks that up. `npm run typecheck` is a good idempotent sanity check.

## Project layout (cheat-sheet)

- **`src/main/`** — Electron main-process code: launcher, IPC handlers, Canvas client, workflow installer, scanners, vault
- **`src/panels/`** — React renderer panels: Canvas, Library (Agents/Skills/MCPs), Session, Settings
- **`src/components/`** — Shared React pieces (onboarding overlay, error boundary, UI primitives)
- **`scripts/`** — Build-time tooling (icon generation, bundle snapshotting, social preview)
- **`resources/`** — Files shipped inside the installer (plume-owned workflow agents, bundled library, marketplace catalog)

## Building an installer

```bash
npm run dist           # current platform
npm run dist:win       # force Windows NSIS .exe
npm run dist:mac       # force macOS .dmg (requires a Mac)
```

The `dist` pipeline runs `build:icons` → `bundle:library` → `build` → `electron-builder`. Skipping the `build:icons` step gives you a stale icon; skipping `bundle:library` ships an empty `~/.claude/` snapshot.

## Making changes

1. Branch off `main` (`git switch -c feat/your-thing`).
2. Keep commits focused and descriptive. A one-line subject is fine if the body explains the why.
3. Run `npm run typecheck` before opening a PR. CI isn't set up yet — typecheck catches the majority of issues.
4. For UI changes, test `dist` on your platform and attach a screenshot or short clip in the PR.

## Filing issues

Please use the issue templates — they remove a round-trip of "what version / what OS" back-and-forth. If something looks bundle-library-related, include the output of `ls ~/.claude/agents/` and `ls ~/.claude/skills/`.

## Scope

Plume Hub is built around a specific student workflow (Canvas + Claude Code + the four-mode runner). PRs that expand that core are welcome. PRs that pivot the product to a different use case are probably better as a fork.

## License

MIT — see [LICENSE](LICENSE). By opening a PR you agree to release your contribution under the same license.
