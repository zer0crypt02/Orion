# TASK: Orion Panel — Rebuild the renderer UI from scratch (Ground-Up Redesign v4)

This is a rewrite brief — do NOT patch the existing `index.html`/`app.js` UI code.
Write it from scratch with a clean layered architecture. The Electron side is off-limits.
(The previous v2 run went wrong: the avatar ended up overlapping the chatbox with a
blurry layer — this brief is the FINAL spec that fixes that mistake.)

NOTE: The animated background work is OUT OF SCOPE for this round — it comes later.
Do not add any new background layers. Keep the existing window shell look.

## Step 0 — Load context
1. Load the `motion-design` skill (installed globally at
   `~/.config/opencode/skills/motion-design/`). Use its decision framework (timing/
   easing tables, state-feedback recipes, choreography) for panel animations, avatar
   state transitions and motion; note in code comments which principle you applied.
2. Read the current files: `app/renderer/index.html`, `app/renderer/app.js`,
   `app/renderer/avatar-cursor.js`, `app/electron/preload.js` (IPC channel names),
   `app/electron/main.js` (READ ONLY — window sizes; do not modify).

## Context
A personal assistant living inside the macOS notch: an Electron app with a transparent +
vibrancy glass panel (481×600; closed state is a 196×36 pill). Single user, a developer,
Turkish-speaking. Tone: calm, premium, glass aesthetic. Chat quality references:
ChatGPT/Claude desktop apps — interpreted ON GLASS, not as an opaque window.

## LAYERS (get the order right)
```
[2] AVATAR layer  → circular, draggable, NO blur of its own (top-most interactive element)
[1] UI content layer → chat messages, composer, sidebar, settings, chips, buttons
```
The avatar is NOT a frosted sheet over the chatbox — it is a clean circular element
floating above the UI.

## DO NOT TOUCH
- `app/electron/main.js`: window geometry, the two-window pill/panel swap animation,
  IPC channels, globalShortcut. (IPC channel names sent from the renderer stay fixed.)
- The window SHELL: `.window` shape, notch shoulders, vibrancy settings, the existing
  `--glass-*` tokens and ambient gradient layers.
- The avatar bundle (`vendor/avatar-web.bundle.js`, `assets/orion.avatar.json`) and the
  `createAvatar` API; the state machine (sleeping/waking/thinking/listening/error/happy).
- NO new npm dependencies. CSP unchanged. Markdown: a hand-written minimal safe parser
  (HTML-escape first, then markdown conversion — no XSS).

## DESIGN DECISIONS

### 1. UI content layer [1]
- Assistant message: NO bubble. Left-aligned plain text block, max-width ~92%,
  13.5px/1.65 line-height, `--ink-hi`.
- User message: right-aligned compact block `rgb(255 255 255 / .10)`, radius 16/16/4/16.
- Accent (blue) ONLY for interaction: active send button, retry, selected list item.
  Error gets its own token: `--color-error` (soft coral, ~#ff8a7a).
- Minimum text size 12px. Raw hex FORBIDDEN in component CSS — everything feeds from
  semantic tokens (4pt spacing scale).
- Composer: one capsule, radius 22, `rgb(0 0 0 / .30)` background, `--glass-rim` border;
  on focus border brightens to accent. Send button: 26px circle inside the capsule,
  right side; neutral gray when empty → accent 180ms transition when text present.
  Enter sends.
- Code blocks: header with the language lowercase 11px on the left, "Copy" on the right
  → 1.2s "Copied ✓" cross-fade; support MULTIPLE code blocks per message.
- Empty state: a short greeting + 3–4 suggestion chips ("Fix this error", "Summarize",
  "Write code", "Quick translate") — clicking a chip fills the input.

### 2. AVATAR layer [2] — "The circular resident you can pick up and drag"
Reference: an avatar inside a clear circle with a ring around it (like a badge/cursor).
Do NOT copy that image literally — use it as a target feel only.

- The avatar lives inside a CIRCULAR container: 58px circle in chat mode, avatar canvas
  circularly clipped. NO backdrop-filter, NO glass tint, NO blur behind it — the content
  behind a transparent-ish circle stays untouched.
- Around it: a **1.5px ring** whose color carries state:
  listening → blue pulse (2.4s) · thinking → slowly rotating gradient arc ·
  error → coral · idle → neutral low-contrast ring.
- Default resting spot: centered, directly ABOVE the composer (a few px gap). But it is
  NOT locked to it:
- **Drag & drop:**
  - Grab with `pointerdown` (grab cursor); dragging starts after a 6px movement threshold
    (keeps it distinct from clicking).
  - Free positioning anywhere INSIDE the panel bounds, clamped to 8px padding from the
    window edges.
  - On release: a small settle animation (120ms scale .97→1).
  - Position persists in `localStorage` (`orion.avatarPos`) and is restored when the
    panel reopens; double-click → reset to the default spot above the composer.
  - While dragging, ring state animations pause (motion-design: drag conflict rule).
- **Empty state:** the same avatar element grows to 96px, centered in the panel, with
  the greeting + chips below. Dragging works in this state too; on first message it
  eases (240ms transform-only transition) back into the 58px floating position.
- **State machine** (pokeActivity, MIN_BUSY_MS, IDLE_MS) is preserved; only the
  trigger→visual mapping is rewired to the new ring/clip system.

### 3. Sidebar & micro-details
- History items ≥40px tap height, 12.5px text, active state `rgb(255 255 255 / .07)`.
- All micro-interactions 160–200ms ease-out; NO bounce.
- Keep all copy in Turkish; short single sentences.

## PRIORITY ORDER
1) Layer skeleton + chat/composer rebuild + parser — 2) avatar circular container +
ring + drag & drop — 3) empty-state variant + transition — 4) sidebar/settings polish

## VERIFICATION (run these yourself before finishing)
1. `npm start` → toggle with `⌘/` 6 times: the panel animation is still as smooth as
   before (no regression)
2. The avatar is a clean circle with its state ring; there is NO blurry/frosted sheet
   over the chatbox area (the v2 mistake is gone)
3. Avatar drag & drop: movable anywhere within the panel, position persists after
   reopening; double-click resets it to the default spot
4. Long answer (heading + list + bold + 2 code blocks) → parser correct, no overflow
5. Tab navigation: every button gets an elegant, visible focus ring
6. Listening/thinking/error ring states correct; pulse pauses during drag
7. `prefers-reduced-motion`: motion minimal
8. Outside-click auto-close, ESC, sidebar PANEL↔WIDE all still work
