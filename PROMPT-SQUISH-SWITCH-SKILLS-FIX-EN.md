# TASK: SquishSwitch port (React Bits → vanilla JS) + Settings save/trust fix

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer — NO React).
Work ONLY in `app/renderer/` (`js/squishswitch.js` [new], `js/app.js`,
`styles/components.css`, `index.html`).
Load the motion-design skill (~/.config/opencode/skills/motion-design/) BEFORE writing
any animation; comment which principle each timing/constant uses.

Two independent parts. Do them in order; both must pass verification.

---

## PART 1 — Settings: "Kaydet & bağlan" must not lie (Superpowers bug)

### Diagnosed root cause (verified in code — do not re-litigate)
In `js/app.js` `#btnSave` handler: `setSettings(...)` SAVES fine (Superpowers IS
persisted), then it unconditionally calls `connectGateway(cfg)`. OpenClaw gateway is an
OPTIONAL chat path — `send()` prefers Zen/Groq (`sendZenMessage`) whenever keys exist,
gateway is only the fallback. Yet a gateway failure surfaces as a TOTAL failure:
conn bar "Bağlanılamadı" + error bubble + `markSad()` avatar + early `return` so the
settings panel never closes. User enabled Superpowers, got "bağlanılamadı", believed
the feature failed. It didn't — the UX lied.

### Fix (renderer only — main.js is frozen)
1. **Decouple save from gateway.** In `#btnSave`: treat `setSettings` success as the
   save result. Compute `useZen` the same way `send()` does (provider + key checks).
   - If `useZen`: attempt gateway connect in the background; on failure show ONLY a
     small secondary note in the conn row (e.g. conn bar text "OpenClaw: bağlanamadı
     (isteğe bağlı)" with the existing led/warn styling) — NO error bubble, NO sad
     avatar, panel closes normally.
   - If NOT useZen (gateway is the only path): keep today's error UX (bubble + sad +
     stay open) — there the gateway really is the lifeline.
2. **Toggles persist immediately.** Today `flipToggle` only flips `aria-checked`
   locally; if the panel closes without Kaydet the click is silently lost, and
   `refreshTools()` (runs on every settings open) overwrites toggles from stored
   settings. Fix: on every toggle flip (master toggles AND per-skill rows), fire a
   debounced `window.notch.setSettings({ ...patch })` with just the changed subtree
   (skills master/on, context7.enabled, graphify.enabled). No lost clicks; add a small
   "last-flip" timestamp guard so a concurrent `refreshTools()` cannot clobber a flip
   made < ~2s ago.
3. **Honest copy (Turkish).** Save button feedback: "Kaydedildi ✓" for the save itself;
   gateway state lives in its own conn row text. Never show a global error for an
   optional-path failure.

---

## PART 2 — Port React Bits "SquishSwitch" to vanilla JS (the three tool toggles)

This is a PORT, not a copy-paste (NO React, NO motion/react, ZERO new dependencies):
replace `motion/react` springs with a small rAF spring integrator; keep the full
behavioral spec of the reference component (source provided below in the brief's
context — follow it faithfully).

### New file: `js/squishswitch.js` (ES module)
Export a factory: `createSquishSwitch(rootEl, { onChange, ...opts })` that upgrades an
existing `<button>` into a squish switch. Options (mirror the React props):
`width, height, radius, speed(0-100), stretch(0-100), hoverScale, colorDuration,
trackColor, trackOnColor, thumbColor, thumbOnColor, disabled, ariaLabel`.

### Behavior contract (port faithfully)
- `role="switch"`, `aria-checked`, `aria-disabled`; keyboard: Space/Enter toggles,
  Escape during drag cancels (revert to state at press).
- Pointer: press → optional drag (tap slop 4px fine / 8px coarse pointer types) →
  commit when thumb passes the midpoint mid-drag (live commit, like the source);
  release without move = toggle; cancel = revert. Use Pointer Capture. An invisible
  hit-area pad (~8px, the source's `::after inset:-8px`) around the switch.
- Thumb motion (THE squish — rAF spring, no motion/react):
  - Settle spring: stiffness `170 - (50 - clamp(speed,0,100)) * 1.1`, damping 21.5,
    mass 0.9, restDelta 0.001 → thumb x. (skill: playful archetype — small overshoot
    is DESIRED here; comment this deviation from the panel's premium 0%-overshoot
    default as component-specific personality.)
  - Squash & stretch from velocity: `stretchOf(v) = 1 + min(0.4, |v|/600) * gain`
    where `gain = stretch/100`; `scaleX = stretchOf(v) * swell`, `scaleY = swell /
    stretchOf(v)` (area preserved — Disney squash-and-stretch principle; comment it).
  - Hover swell to `hoverScale` with its own spring (stiffness 520, damping 34).
  - ONE shared rAF loop per switch; springs integrate transform-only (x, scaleX,
    scaleY). Never animate left/width/top/height.
- Color: track/thumb cross-fade `colorDuration` ms via CSS `transition` on
  background-color (not JS).

### CSS (append to `styles/components.css`)
- ALL colors/sizes derive from app tokens in `tokens.css` — the React defaults
  (#27272a, #f5f5f4) are FORBIDDEN raw. Map: track-off = existing glass surface token
  (same family as `.toggle` today), track-on = `--accent` (or the accent-dim family
  the app already uses), thumb-on = glass/ink token, fade = `--dur-slow` (320ms).
- SIZE: match the current `.toggle` footprint in the settings rows (read its CSS
  first) so layout does not shift; keep proportions internally (thumb inset =
  `max(3, round(height*0.11))` like the source).
- `prefers-reduced-motion`: springs jump to target, color fade = 1ms (base.css global
  block may already cover transitions — add the JS `reduce` path via
  `matchMedia('(prefers-reduced-motion: reduce)')`).

### Integration (must not break existing wiring)
- Replace the three `.toggle` buttons (`#tgContext7`, `#tgGraphify`, `#tgSkills`) in
  `index.html` with the new markup + `createSquishSwitch` init in `app.js`.
- CONTRACT: `currentCfg()` and `refreshTools()` read `aria-checked` on those IDs and
  Part 1's flip-persistence hooks the change callback — keep those selectors and
  semantics working. The component must set `aria-checked` on the root button itself.
- Delete the old `.toggle`/`.knob` CSS ONLY if nothing else uses it (grep first);
  no dead code.

## DO NOT TOUCH (frozen)
`app/electron/main.js`, IPC channel names, npm dependencies (ZERO new deps), CSP,
`vendor/avatar-web.bundle.js`, `assets/orion.avatar.json`, `js/avatar.js` state
machine, `js/thoughtline.js`, `js/typewriter.js` internals.

## VERIFICATION (static — user does the visual pass)
1. `cat file | node --input-type=module --check` for every JS file touched.
2. Grep new CSS: zero raw hex, zero raw ms outside tokens.css; transform/opacity only
   (no layout-property animation in the switch).
3. Part 1: with a Zen/Groq key configured and OpenClaw OFF, saving settings shows
   "Kaydedildi ✓" + conn note, closes the panel, NO error bubble/sad avatar; with no
   keys, gateway failure keeps the current blocking UX. Toggle flips persist without
   pressing Kaydet (trace the setSettings patch path).
4. Part 2: keyboard toggles + aria-checked updates; drag-past-midpoint commits live;
   Escape reverts; reduced-motion jumps; switch footprint matches old `.toggle`
   (no layout shift — compare dims).
5. `refreshTools()` no longer clobbers a fresh flip (guard in code).
6. Old `.toggle` CSS: removed or provably still used.
7. Report DONE/SKIPPED per item; no git commits; delete any build artifacts
   (e.g. graphify-out/).
