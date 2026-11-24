# TASK: Port React Bits "ThoughtLine" to vanilla JS — harmonized with Orion's existing motion language

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer — NO React).
Work ONLY in `app/renderer/`. This is a PORT, not a copy-paste: keep the behavioral spec
of the reference component (given below), but implement it dependency-free:
- Replace `motion/react` with the browser's built-in Web Animations API (`el.animate()`).
- Replace the 3 Hugeicons with tiny inline SVGs (sparkle, chevron, check-tick).
- ES module: `js/thoughtline.js` + styles appended into `styles/components.css`.

## STEP 0 — Read the app's motion language FIRST (this brief's core requirement)
Read `app/renderer/styles/tokens.css` and `styles/base.css` BEFORE writing any CSS.
ThoughtLine must DERIVE every duration, easing and color from the app's existing tokens
— it must feel like it was designed with the panel, not pasted next to it. Do NOT reuse
React Bits' hardcoded values where an app token exists; map them:

| React Bits value | Must become (from app tokens) |
|---|---|
| `EASE_OUT cubic-bezier(.23,1,.32,1)` | the app's own ease-out token (premium archetype, 0% overshoot) — if identical, reuse it; if different, the APP token wins |
| settle chord 350ms | the app's slow duration token (320ms if that's the palette's top step) |
| step/mark transitions 200ms | the app's 200ms token |
| micro fades 160ms | the app's 160ms token |
| breath period 1.6s | keep 1.6s, BUT align the step pulse dot to the app's existing dot language (`.pill-dot` / ring pulse share the same breath vocabulary — one "breathing family" across the panel, not two different pulses) |
| colors (currentColor defaults) | `--ink-hi` label, `--ink-low`/`--ink-mid` dimmed steps, glyph `--accent-dim`, active pulse dot `--accent`, error variant `--color-error` |
| font/defaults 16px | 12.5–13px, `--ink-hi`, matching message typography |

Comment in code which motion-design principles + which tokens each timing uses.
Note: the label shimmer (background-clip:text) is acceptable ONLY as functional working
feedback on this line — never reuse it for static text (impeccable ban).

## Reference behavior (faithful port of ThoughtLine)
- While `working`: label ("Düşünüyor…" default, Turkish) breathes via opacity trough
  (~0.55, period 1.6s sine); light shimmer sweeps it (1.8s); the glyph (sparkle) dims
  with the breath.
- Steps trace beneath the line: strings array; earlier steps tick into done (tiny
  check + dimmed text with 200ms ease), the last step holds a soft pulse dot. The line
  toggles the trace (grid-template-rows 0fr↔1fr — NEVER height/padding animation).
- Live timer while working (tabular-nums).
- On settle (`working=false`): the settle chord — text crossfades with a slight blur
  seam (≤2px) into the done line ("X sn'de yanıtlandı"), timer freezes into the
  sentence, trace folds up, glyph dims. Chord duration = app's slow token (not 350ms).
- `prefers-reduced-motion`: breath depth ≤0.2, shimmer off, no blur seam, chord = fade only.

## Integration (the Orion mapping)
- REPLACE the current `.typing` dots indicator in the panel chat (remove its CSS/JS —
  no dead code).
- While the assistant is streaming/working: `working=true`; steps come from the app's
  existing chat state machine (`pokeActivity`, `MIN_BUSY_MS`, `sendStartedAt`):
  1. "Bağlanıyor" (send → before first token)
  2. "Düşünüyor" (before first response token)
  3. "Yanıt yazıyor" (streaming — pulse dot on this step)
- On stream final/error: settle with elapsed time from `sendStartedAt`; the error
  variant uses `--color-error` on glyph/pulse only — the app's error ring language stays
  authoritative.
- A new user message resets the clock and restarts the cycle.
- Empty chat state: not shown (greeting/chips stay as-is).

## DO NOT TOUCH
`app/electron/main.js`, IPC names, npm deps, CSP, avatar subsystem (`js/avatar.js`
untouched). Do NOT install React, motion, hugeicons or any dependency.

## VERIFICATION (static, user does visual pass)
1. Grep renderer: zero references to react / motion/react / hugeicons; zero dead
   `.typing` code.
2. Every duration/easing/color in the new CSS resolves to an existing token (grep for
   raw hex and raw ms values outside tokens.css — must be none).
3. Working → steps advance → settle chord; timer freezes into the done sentence.
4. Trace toggle uses grid-template-rows; no height/padding animation.
5. The breath/pulse family reads as ONE shared vocabulary with `.pill-dot` and the
   avatar ring (same easing character), not a foreign element.
6. prefers-reduced-motion honored.
