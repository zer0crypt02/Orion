# TASK: Avatar free-mode fixes — deterministic centered anchor + scroll-to-top expansion in existing chats

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer).
Work ONLY in `app/renderer/` (`js/avatar.js`, `js/app.js`, `styles/components.css`).
Load the motion-design skill (~/.config/opencode/skills/motion-design/) for the
choreography decisions; comment which principle each constant uses.

Two user-verified defects with screenshots. Fix both; no re-architecture.

## BUG 1 — Free mode position is inconsistent (must be FIXED and CENTERED)

### Symptom
Two empty-state screenshots: one has the free avatar at middle-RIGHT (off-center),
another at TOP-center. Same state, different positions. User demand: "yeri sabit
olmalı, her zaman tam merkezde" — a fixed, deterministic position, every time.

### Diagnosed causes (verified in code — do not re-litigate)
1. `anchor()` free branch derives X from `#empty`'s rect center and Y from
   `e.top - 18 - r` — `#empty` is `margin-top:auto` (bottom-anchored), so Y depends
   on greeting position and X on the empty box; neither is the stable "center" the
   user wants.
2. Stale-measurement races: `whenLaidOut()` is single-shot at init; sidebar toggle
   (app.js refresh after 260ms), panel-open geometry settling, and window resize can
   all change the layer/stage rect AFTER the last refresh → the avatar keeps a stale
   position until some later event (explains the two different screenshots).
3. `.avatar-layer` spans the ENTIRE panel (`inset:0`), including the sidebar area —
   centering on the layer centers on panel+sidebar combined, not the chat column.

### Fix — one deterministic anchor + refresh on every layout event
- Free-mode anchor becomes: **X = horizontal center of `#stage`**, **Y = vertical
  center of the free area above the content**:
  - empty mode: free area = stage top → `#empty` top.
  - has-chat free overlay (Bug 2): free area = stage top → composer top.
  - Fallback (no measurable area): stage center. Comment: staging/center-weight —
    the resting point is where the eye already is (motion-design skill).
- Compute from `#stage`'s rect (the chat column), never the full layer — sidebar
  open/closed must not move the anchor relative to the chat column.
- **Re-anchor on ALL layout events**, not just some: `setMode`, window resize,
  sidebar toggle, `setHasChat`, and panel open. Replace the single-shot
  `whenLaidOut` init with a settle check: measure twice, one animation frame apart,
  and only commit the anchor when both measurements agree (rects stable) — retry up
  to a small cap (keeps the existing 50ms retry spirit). This kills the
  panel-open/top-vs-middle race for good.
- Free mode stays non-draggable and ignores the saved position (already correct —
  keep).

## BUG 2 — Scrolling to the start of an existing chat must expand the avatar

### Symptom
In a conversation with messages, the user scrolled to the very top of the history —
the avatar stayed in its docked circle. Expected: at the START of a session's
history it goes free-floating, like a new session ("sohbetin en başındayım ama
kendisi yerine geçmedi, yeni session'daki gibi").

### Current code
`bindScrollGesture()` returns early when `body.has-chat` — the gesture only exists
in the empty state. That early-return is the whole bug.

### Fix — extend the gesture to real conversations
- Remove the blanket `has-chat` early-return; instead gate by scroll position:
  - **Docked → free:** only when `#chat.scrollTop <= 2` AND accumulated upward wheel
    delta ≤ -WHEEL_PX within WHEEL_WINDOW (an upward gesture AT the top = clear
    rubber-band intent; reading-scroll upward from mid-history must NOT trigger).
  - **Free overlay → docked:** accumulated downward delta ≥ +WHEEL_PX while in the
    free overlay, OR `#chat.scrollTop` grows beyond ~40px by any means (wheel,
    keyboard, programmatic) — listening on `#chat`'s `scroll` event for that.
- Keep the existing accumulator + direction lock (flap guard) unchanged; the lock
  applies to both directions.
- New messages dock as today: `setHasChat(true)` (send path) wins over the overlay.
  `renderEmpty` → free, unchanged.
- While the free overlay is up in a has-chat chat, `pointer-events:none` already
  keeps the chat interactive — verify no regression there.
- Do NOT let this fight the typewriter scroll pinning (`js/typewriter.js` untouched):
  we only call `setMode`, which is transform-only painting; assert in comments that
  no scroll property is written by this code.

## Choreography (unchanged from the previous brief — verify, don't redo)
free↔docked stays ONE transform-only motion (~320ms --dur-slow, --ease-out, ring/disc
secondary layer trailing). If the current implementation deviates from that, fix it
to match; otherwise leave as-is.

## DO NOT TOUCH (frozen)
`app/electron/main.js`, IPC names, npm deps, CSP, avatar bundle + state machine
thresholds, `js/thoughtline.js`, `js/typewriter.js`. No raw hex/raw ms outside
`tokens.css`; transform/opacity animation only.

## VERIFICATION (static — user does the visual pass)
1. `cat js/avatar.js | node --input-type=module --check` (and any other touched JS).
2. Free anchor math reads from `#stage`/`#empty`/composer rects only — no full-layer
   centering; grep that no width/height/top/left animation was added.
3. Re-anchor covers: setMode, resize, sidebar toggle, setHasChat, panel open; init
   uses the two-measurement settle (no single-shot race).
4. Gesture: upward-at-top (scrollTop≤2) expands in a REAL conversation; scrollTop
   >~40px or downward gesture re-docks; mid-history upward reading-scroll does NOT
   expand; empty-state behavior unchanged; direction lock intact.
5. Typewriter pinning untouched (grep: no scrollTop writes in avatar.js).
6. Report DONE/SKIPPED per item; no git commits; delete any build artifacts
   (e.g. graphify-out/).
