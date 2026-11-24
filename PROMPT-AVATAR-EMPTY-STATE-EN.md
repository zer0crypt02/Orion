# TASK: Avatar "free-floating empty state" + scroll-to-dock choreography + instant reactions

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer — NO React).
Work ONLY in `app/renderer/` (`js/avatar.js`, `js/app.js`, `styles/components.css`,
`styles/tokens.css`, `index.html`).
Load the motion-design skill (~/.config/opencode/skills/motion-design/) BEFORE writing
any animation; comment in code which principle each timing/easing uses.

## WHY (user feedback, 3 screenshots)
Today the empty state shows the avatar in a 96px circle + ring + frosted disc — the user
wants the avatar OUT of the circle there: big, free, container-less. When the conversation
starts (first message) OR on a downward scroll gesture, it must smoothly shrink BACK into
its 58px ringed circle above the composer. Also: avatar reactions sometimes arrive late
(gated behind the reply choreography) — they must be instant.

## STEP 0 — Read first
`styles/tokens.css` (duration palette: --dur-micro 120 / quick 160 / base 200 / slow 320;
--ease-out cubic-bezier(.22,1,.36,1)), `js/avatar.js` (mode 'empty'|'chat', anchor(),
paint(), --x/--y/--s mechanism), `js/app.js` (setHasChat, onDelta/onFinal reaction flow),
`styles/components.css` (avatar layer section). Every new duration/easing/color MUST
resolve to an existing token — raw hex and raw ms values outside tokens.css are banned.

## SPEC

### 1. Free-floating empty state (mode: 'empty' → visual "free" state)
- When there are NO messages (new chat, fresh session, `body:not(.has-chat)`):
  - NO circular container look: hide `.ring` and the `.orb-clip::before` frosted disc
    (opacity 0 / display none — the disc blur must never leak outside the circle in any
    mode; free mode simply has no disc).
  - Avatar is LARGE and free-floating: scale the 96px base box to ≈150px visual
    (--s ≈ 1.5 on `.orb-scale` — transform-only, never width/height).
  - Centered in the empty space above the greeting (adapt the existing empty-mode
    branch of `anchor()`; keep greeting + chips fully unobstructed — staging rule:
    content > ornament).
  - NOT draggable: in free mode `.avatar-drag` gets `pointer-events:none` (no grab
    cursor, no drag handlers fire, no focus ring). Chat/docked mode keeps dragging
    exactly as today, including localStorage persistence (`orion.avatarPos`).
  - The saved custom position applies ONLY in docked mode; free mode always centers.
- Keep `#avatar` bundle canvas untouched (frozen): only CSS scale changes.

### 2. The transition — ONE choreographed motion (the hero of this brief)
- Trigger A: first message sent (`setHasChat(true)` path already calls setMode).
- Trigger B: scroll gesture (see §3).
- free → docked: ONE smooth motion, ~320ms (--dur-slow) var(--ease-out), transform-only
  (translate3d via --x/--y + scale via --s — the existing paint() mechanism already
  transitions these; verify both .avatar-drag and .orb-scale transition together).
  - Choreography (skill/choreography — hero + secondary):
    - Primary (hero): avatar travels + shrinks into its anchor position above composer.
    - Secondary: ring + frosted disc fade/scale IN during the last ~40% of the motion
      (delay ≈ 180ms, --dur-quick) so the container "catches" the avatar as it lands —
      never a ring already waiting mid-air.
  - Premium archetype: 0% overshoot. No bounce.
- docked → free (new chat / renderEmpty): the reverse — ring+disc fade OUT first
  (~--dur-quick), avatar grows + travels to center (~--dur-slow, ease-out).
- Exit accelerates, entrance decelerates (skill/easing directional rule): into the
  circle = ease-out landing; back out to free = ease-in departure, ease-out arrival.

### 3. Scroll-to-dock gesture (renderer only)
- Listen for `wheel` on `#stage` (passive). In free mode with NO messages:
  - Accumulated downward deltaY ≥ ~140px within a ~600ms window → dock the avatar
    (setMode('chat') visual) WITHOUT creating messages — the empty greeting/chips stay;
    only the avatar docks into its circle.
- In that docked-but-still-empty state, an upward wheel gesture (accumulated ≥ ~140px
  upward within ~600ms, effectively at scroll top — `#chat` is empty anyway) → expand
  back to free.
- Guard against flapping: one gesture-direction lock — after a trigger, ignore further
  triggers until the accumulated delta resets (delta accumulator decays to 0).
- When real messages exist, existing behavior wins: `setHasChat(true/false)` is the
  source of truth; the gesture only applies while `body:not(.has-chat)`.

### 4. Docked mode: avatar fills its circle more
- Today the 96px canvas renders small inside the 58px ring. Add an inner fill factor:
  scale `#avatar` canvas ~1.12 inside `.orb-clip` (new token, e.g. `--orb-fill: 1.12`)
  so the character fills the circle with a clearly smaller gap — the RING diameter
  stays 58px (DOCK unchanged), only the canvas content grows.
- The frosted disc must still sit 1px inside the ring (existing inset:1px rule —
  do not break the double-clip frost containment).

### 5. Instant reactions (fix "tepki geç geliyor")
- Root cause: in `js/app.js` `onFinal`, the final status/avatar reaction waits behind
  `MIN_BUSY_MS` (`wait = max(0, MIN_BUSY_MS - elapsed)`) — the AVATAR animation is
  gated with the text.
- Fix: DECOUPLE. Avatar reactions (happy/laughing/celebrate/idle/sad…) play
  IMMEDIATELY at the event (`avatar.play(st.anim)` right when finalStatus is computed).
  Only the STATUS TEXT obeys the MIN_BUSY_MS choreography window (that gate stays —
  it is ThoughtLine's discipline, do not touch STEP_MIN_MS/MIN_WORK_MS).
- Same principle in onChatError: `markSad`-driven reactions already fire via setStatus —
  make sure the avatar anim is not deferred by anything queue-related. The typewriter
  queue (`js/typewriter.js`) and ThoughtLine internals must remain untouched.

### 6. Accessibility & reduced motion
- `prefers-reduced-motion` (base.css global block): free↔docked transitions become
  instant state swaps; ring/disc appear/disappear without animation; scroll gesture
  still works (it is functional, not decorative).
- `index.html`: update `.avatar-drag` aria-label to reflect the two modes (free =
  not interactive; docked = draggable). Keep role="button" only meaningful in docked
  mode (e.g. toggle `tabindex="-1"` in free mode).

## DO NOT TOUCH (frozen)
`app/electron/main.js`, IPC channel names, npm dependencies (ZERO new deps), CSP,
`vendor/avatar-web.bundle.js`, `assets/orion.avatar.json`, the avatar STATE MACHINE
thresholds (IDLE_MS/WAKE_MS/sleeping/waking/listening…), `js/thoughtline.js` and
`js/typewriter.js` internals, the tricolor idle ring conic loop design. No new
background layers.

## VERIFICATION (static — user does the visual pass)
1. `cat file | node --input-type=module --check` for every JS file you touch.
2. Grep your new CSS: every duration/easing/color resolves to a token — zero raw hex,
   zero raw ms outside tokens.css. No layout-property animation (transform/opacity only).
3. Free mode: `.ring` and frosted disc absent, avatar ≈150px, centered, NOT draggable
   (pointer-events:none), no saved-pos influence.
4. Docked mode: 58px ring + frost intact, dragging + persistence unchanged, canvas
   fills the circle more (--orb-fill) without the disc escaping the ring.
5. Gesture: downward scroll docks while empty; upward expands back; no flapping
   (accumulator + lock logic in code); ignored entirely once `.has-chat` is set.
6. Transition is ONE motion: transform-only 320ms --ease-out; ring/disc secondary
   layer delayed ~180ms; no opacity-only state change for the hero move.
7. Reactions: avatar.play fires synchronously in onFinal/onChatError paths (trace
   the call order; nothing between event and play());
   ThoughtLine/typewriter gates untouched.
8. prefers-reduced-motion: instant swaps.
9. Report DONE/SKIPPED per item above; no git commits; delete any build artifacts
   you create (e.g. graphify-out/).
