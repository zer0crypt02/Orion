# TASK: Avatar "companion system" — disciplined homes + living presence (phased, stop after each phase compiles)

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer — NO React).
Work ONLY in `app/renderer/` (`js/avatar.js`, `js/app.js`, `styles/components.css`).
Load the motion-design skill (~/.config/opencode/skills/motion-design/) BEFORE any
animation work; comment which principle each constant/timing uses.

## WHY (product decision, user-approved)
The avatar must feel like a WORK COMPANION: always present, never in the way.
Today's failure (screenshot): the free-floating overlay in a has-chat conversation
sits ON TOP of message text. Approved direction:
- Approach A ("disciplined homes"): the avatar has ONE fixed home per layout state;
  it NEVER covers chat text.
- Approach C ("ambient identity"): the avatar LIVES at its home — small contextual
  micro-behaviors using animations that already exist in the bundle. The bundle
  animation list (frozen, read from assets/orion.avatar.json): sleeping, waking,
  idle, listening, thinking, searching, working, excited, bored, suspicious, angry,
  drowsy, happy, curious, confused, surprised, proud, shy, sad, laughing, scared,
  playful, celebrate.
- Approach B (magnetic free-floating over content) is REJECTED — a 481px panel has
  no room; that is exactly the text-overlap bug.

Work PHASE BY PHASE: finish a phase, run its verification, then move on. If a phase
verification fails, stop and report.

---

## PHASE 1 — One home map: the avatar never covers chat text

1. Free-floating mode exists ONLY in the empty state: gate every free visual
   (big scale, hidden ring/disc) on `!document.body.classList.contains("has-chat")`.
   In a has-chat conversation the avatar is ALWAYS in its docked circle above the
   composer — no exceptions, no overlay.
2. Update the scroll gesture (`bindScrollGesture`):
   - Remove the docked→free expansion in has-chat. Instead: upward wheel gesture at
     `#chat.scrollTop <= 2` triggers a one-shot PEEK reaction (Phase 2), not a
     mode change.
   - Downward expansion logic and the empty-state gesture stay as they are.
   - Keep the accumulator + direction lock unchanged.
3. Clean up what becomes dead: any has-chat free-overlay branch in `anchor()`
   (stage→composer free area), CSS selectors that only served it, dead `data-mode`
   styles. Grep before deleting; no dead code.
4. Keep: free-in-empty anchor (deterministic #stage-center + settle check),
   ResizeObserver, docked drag + persistence, `setHasChat` mapping.

## PHASE 2 — Living presence: calm, cooldown-governed micro-behaviors

1. **Ambient engine in `js/avatar.js`**: a tiny event→animation layer that plays
   EXISTING bundle animations contextually, with hard social limits:
   - COOLDOWN: at least ~6s between two ambient behaviors; an ambient anim NEVER
     interrupts working/thinking/streaming/error states (those are service states,
     ambient is personality). Ambient never cancels itself mid-play.
   - All transitions rely on the bundle's own smooth 500ms expression transitions —
     do not add JS crossfades on top.
2. **Peek (history-top curiosity)**: upward-at-top gesture (Phase 1 trigger) →
   `play("curious")` once, then return to `idle` after ~2.5s — unless a service
   state (listening/thinking/…) took over meanwhile. One cooldown entry.
3. **Return-to-calm settle**: character reactions (happy, laughing, celebrate) must
   not loop forever: after ~5s, ease back to `idle` if no newer state. (Long-known
   gap: today they loop until the next event.) Cooldown entry, no double timers —
   cancel pending settles on any new `play()`.
4. **Reading drowse**: in a has-chat conversation, if the user reads without typing
   for ~25s (no input events, no stream, not sleeping yet), play `"drowsy"` once
   before the existing 90s sleep takes over. Waking inputs (`pokeActivity`)
   already recover to listening — verify that path resets the drowse timer.
5. Copy: no new user-facing text in this phase (behaviors are non-verbal).

## PHASE 3 — OPTIONAL (implement only if Phases 1-2 verified clean)
A single glass speech bubble anchored to the avatar's docked circle: short Turkish
one-liners on rare moments only (error fixed → "Toparladık 🎉", first response of a
session → "Buradayım."). Hard cap: max one bubble per ~30s, never during streaming,
auto-fade ~2.5s (--dur-slow + --ease-out), transform/opacity only, token colors,
`prefers-reduced-motion` = fade only. If any risk of clutter, SKIP and report.

---

## DO NOT TOUCH (frozen)
`app/electron/main.js`, IPC names, npm deps, CSP, `vendor/avatar-web.bundle.js`,
`assets/orion.avatar.json` (read-only), state-machine thresholds (IDLE_MS/WAKE_MS/
sleeping/waking/listening…), `js/thoughtline.js`, `js/typewriter.js`. No raw hex or
raw ms outside `tokens.css`; transform/opacity only; Turkish user-facing copy.

## VERIFICATION (static, per phase — user does the visual pass)
1. `cat file | node --input-type=module --check` for each touched JS file.
2. Phase 1: grep proof that free visuals are gated on `:not(.has-chat)`; zero
   has-chat overlay code left; no width/height/top/left animation; token discipline
   in any touched CSS.
3. Phase 2: cooldown map + no-interrupt rule visible in code (trace: working state
   cannot be overridden by peek/drowse/settle); pending settles cancelled on new
   `play()`; drowse timer reset by `pokeActivity`.
4. Phase 3 (if built): rate caps in code, reduced-motion path, no clutter.
5. Choreography untouched: free↔docked remains one transform-only ~320ms motion.
6. DONE/SKIPPED line per checklist item; no git commits; delete build artifacts
   (e.g. graphify-out/).
