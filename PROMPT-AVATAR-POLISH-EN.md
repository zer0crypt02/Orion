# TASK: Orion Avatar — Polish pass (3 focused changes, small diff)

Context: macOS notch assistant, Electron renderer at /Users/fatihemre/Desktop/JS/notch.
Work ONLY in `app/renderer/`. The v4 layer architecture (tokens.css / base.css /
components.css, js/avatar.js) is in place — do NOT rewrite it, just apply these 3 changes.
Load the `motion-design` skill (~/.config/opencode/skills/motion-design/) and follow its
timing/easing rules; add a code comment per change naming the principle used.

## DO NOT TOUCH
`app/electron/main.js`, IPC channel names, npm dependencies, CSP, avatar bundle
(`vendor/avatar-web.bundle.js`, `assets/orion.avatar.json`), state machine logic in
`js/avatar.js` (only extend trigger→visual mapping where specified).

## CHANGE 1 — Default avatar position = above the composer, right-aligned
- The DEFAULT resting spot (no saved position / double-click reset / cleared storage)
  moves from "centered above composer" to: right-side above the composer — the circle's
  right edge aligned with the composer capsule's right edge (the send button column),
  ~10px gap above the composer.
- Dragged positions keep persisting in `localStorage` (`orion.avatarPos`) exactly as
  now; persistence behavior itself is unchanged.
- Keep the 8px window-edge clamp for dragged positions.

## CHANGE 2 — Frosted glass INSIDE the circle
- Inside the circular avatar container (`.orb-clip` region only): add a frosted-glass
  backing — a subtle light tint (token, e.g. `rgb(220 222 228 / 0.06)`) +
  `backdrop-filter: blur(14px)` — clipped strictly to the circle (border-radius: 50%).
- The avatar canvas sits ON TOP of this frosted disc.
- IMPORTANT: NOTHING frosted may leave the circle bounds. No blur outside the ring;
  the chatbox area stays untouched. If the backdrop-filter causes visible seams with
  the ring, adjust padding so the frosted disc sits 1px inside the ring — never overlap.

## CHANGE 3 — Animated ring: smooth deep-blue ↔ navy ↔ light-blue loop
- Replace the static/idle ring look with a continuously animating gradient ring:
  a conic-gradient cycling smoothly between deep blue (~#0a2f6b), navy (~#143a5e)
  and light blue (~#63acff), with soft transitions (no hard color stops; use
  color-mix/gradient stops so each hue melts into the next).
- Implementation: rotating conic-gradient masked to the ring shape
  (mask: radial-gradient to keep only the 1.5px band), rotation ~7s linear infinite,
  transform-only (GPU). Duplicated half behind the rotation point is NOT allowed to
  create a visible seam — use two identical copies (conic at 0deg and 180deg) sliding,
  or hue-rotate the gradient instead, whichever is seamless.
- State override hierarchy (keep existing semantics on top of this base loop):
  - default/idle → the animated tricolor loop (this is the new baseline)
  - listening → blue pulse (2.4s) still overrides, as today
  - thinking → rotating arc still overrides, as today
  - error → static coral, still overrides
- While dragging (`body.avatar-dragging`) the loop pauses, like other ring animations.
- `prefers-reduced-motion`: loop frozen on a static gradient frame (no rotation).

## VERIFICATION (static, then user does the visual pass)
1. Default position shows right-aligned above the composer after resetting
   (double-click AND after clearing `orion.avatarPos`).
2. Frosted disc visible ONLY inside the circle; screenshot the chatbox area directly
   under the ring — must remain crisp.
3. Ring: visually seamless loop, no rotation seam/jump at loop point; drag pauses it;
   reduced-motion freezes it.
4. All viewport checks from the previous pass still hold (⌘/ toggle smoothness untouched
   — no main.js changes were made).
