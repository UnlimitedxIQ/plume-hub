# Plume Hub

## Register

product

This is a desktop application: a Canvas LMS dashboard with launchers for Claude Code workflows. Design serves the product. The interface should disappear once the student is fluent with it. Identity moments (onboarding, brand mark, the four mode buttons) carry brand weight; everything else is a tool.

## Users

**Primary:** Undergraduate students at universities that use Canvas LMS, working under deadline pressure. They live in Canvas, jump between courses, and have ten things due next week. They're technical enough to install a desktop app and paste an API token, but not technical enough to write their own workflow agents from scratch. They want the app open on the left half of their screen with PowerShell on the right, glancing at assignments while Claude Code runs.

**Secondary:** Power users who already own a `~/.claude/` library and want a launchpad that respects what they've built rather than overwriting it.

The product is opinionated for students under deadline pressure first. Nothing else.

## Product purpose

Cut the friction between "I have an assignment due Friday" and "Claude Code is now actively drafting it" to one click. Plume Hub reads Canvas assignments and exposes four mode buttons per assignment (Think / Draft / Build / Study), each launching a tailored Claude Code workflow with the assignment context already piped in.

The four modes are not interchangeable, and the UI must make that obvious without a tutorial. Think is research-only. Draft is a structural skeleton. Build is a polished submission. Study is exam prep.

## Brand

**Name:** Plume Hub. Plume = the feather, the act of writing, lift. Hub = a launchpad, not a destination.

**Brand colors:**
- Warm chocolate: `#3a2820` (the hero band, the active rail tab, the identity surface)
- Soft amber: `#d99750` (the Build button, the canonical action, the only hot color in the app)
- Cream: `#efe4d4` (body text, the warm white the eye reads against chocolate)
- Warm grey neutrals (`stone-950` to `stone-100`) for chrome and muted text
- Windows 11 acrylic backdrop bleeds through panels

The chocolate ramp lives under the `plume` namespace in code, the amber under `plumeyellow`. Names kept for migration; values are entirely new. Anything green or duck-yellow has been retired.

**Tone:** Confident, terse, anti-corporate. The student is the protagonist. Microcopy reads like a smart friend, not a product manager. Mode buttons say "Think" not "Research Assistant."

**Visual feel:** Dark acrylic Windows 11 native chrome. Type-forward, no decorative chrome. Cards exist, but never nested, never identical-grid. The four mode buttons are the visual anchor of a card; everything else recedes.

## Theme scene

> Sunday night, dorm desk, two more assignments before sleep, lamp light, body tired but focused.

This sentence forces the theme. Warm dim. Quiet motion. Type that holds up after midnight. Generous touch targets so a tired hand doesn't miss. Plume's surface is the kind of dark a single warm bulb produces, not the dark of an office. Chocolate is a real surface on hero blocks (Canvas top band, active rail tab), not a tint. Amber is the canonical Build action and shows up exactly where Build does. No green. No bright yellow. The whole app reads as if lit by one lamp.

## Anchor references

These are the products Plume Hub should EVOKE. Not copy. Evoke means borrow the rhythm and the discipline.

- **Things 3.** Calm, opinionated, deliberate motion. Generous whitespace on hero blocks. Takes its time on the things that matter, not on the things that don't. Plume borrows the warmth and the patience.
- **Soulver.** Considered, dense, never shouty. Tan accents on a warm dim surface. Reads like a notebook lit by a single lamp. Plume borrows the warmth, the typography care, and the refusal to use bright color where calm color works.

Plume sits between these two. Things 3's patience plus Soulver's warm density. Not Linear, not Notion, not Cursor. Time is still the spine of Canvas, but the brand carrying it is now warm chocolate and amber.

## Anti-references

These are the failure modes Plume Hub explicitly avoids. Designs that look like any of these are wrong.

- **Notion / Linear clones.** Cool gray neutrals, blue-purple accent, generic productivity vibe. Plume is greener and more committed.
- **Canvas LMS itself.** Red bars, washed-out blue links, 2014-era patterns. Plume is the opposite reaction.
- **EdTech bloat.** Stock illustrations of diverse students smiling at laptops. Pastel gradients. "Empower your learning journey." None of it.
- **Generic AI SaaS.** Big purple gradient hero, "Powered by AI" badge, the chat-bubble + sparkle motif. Plume hides Claude Code; Claude Code is plumbing.
- **Dashboards that look like Stripe.** Cream cards, subtle shadows, identical metric tiles. Plume is darker, denser, and more direct.
- **Cursor's hero pattern.** Dark mode + gradient orb + monospace tagline. Saturated to death.
- **The hero-metric template.** Big number with sparkle, three small stats below. Banned globally.

## Strategic principles

1. **Speed over elegance.** A panel that loads instantly with rough type beats a polished panel that waits on a network call. Skeletons are okay; spinners are not.
2. **No tutorials.** The four modes must be self-evident from labels and microcopy. If a tooltip is required to explain a button, the button is wrong.
3. **Respect the user's library.** Plume seeds `~/.claude/` once and never overwrites. The Library panel is read-only on purpose.
4. **One click per assignment.** Anything beyond a single click to launch a workflow is a regression.
5. **Native chrome, custom interior.** The window frame is Windows 11. Inside, Plume is its own thing. Don't fight the OS chrome with custom title bars.
6. **Hybrid density.** Hero blocks (next-due assignment, session header, marketplace use-case card) get room to breathe. Lists (week-ahead timeline, file browser, vault entries, plugin install rows) stay tight so students see all ten things at once. Whitespace earns its place; lists earn their density.
7. **Time is the spine.** Canvas organizes around time, not courses. Today / Tomorrow / This week / Later are the primary axis. Course is a secondary filter, not a layout primitive.

## What "good" looks like

- The Canvas dashboard shows the next-due assignment with Build as the visual anchor; the rest of the week is visible without scrolling on a 1080p monitor.
- A first-time user knows which mode to click within five seconds, without reading docs.
- The four mode buttons feel like one decision: Build is the answer, the other three are alternates.
- The app feels like a tool a student would keep open all term, not a thing they open once and forget.
- Onboarding is two screens and ends on a real preview of the student's actual assignments.
- Chocolate is on screen anywhere the user looks: Canvas hero band, active rail tab. Amber only on Build.
- Empty states sound like a friend, not a database. "Nothing else due tonight. Sleep well." not "0 results."
- The whole app reads as warm. No green, no cool grey, no neon accent. The eye relaxes.
