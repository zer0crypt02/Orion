# TASK: Smooth typewriter rendering for assistant replies (fix the "instant answer" flash)

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer).
Work ONLY in `app/renderer/` (`js/app.js`, `js/md.js`, optional new `js/typewriter.js`).
Load the motion-design skill (~/.config/opencode/skills/motion-design/) for pacing
principles; comment which principle each constant uses.

## PRINCIPLE
The response arrives as fast as the model delivers — the UI must render it at a
HUMAN-SHAPED cadence. Buffer incoming deltas and play them out like someone speaking to
you, instead of dumping whole chunks instantly. Never throttle or hold the actual
stream; this is purely a renderer-side presentation queue.

## 1. ThoughtLine minimum visibility (fix the "Bağlanıyor" flash)
- Every ThoughtLine step stays visible at least ~350ms before advancing.
- Total working time is at least ~600ms even if the answer is instant — the settle
  chord must never read as an instant swap.

## 2. Typewriter queue
- Feed every streamed delta into a character buffer consumed at a paced rate:
  - base rate ~60–90 chars/sec
  - adaptive: when the buffer grows beyond ~3 lines (long answers), speed up the drain
    (2–4x) so total typing time stays in the ~0.8s–8s band — never lag badly behind
  - for very long answers, switch to word/line reveal instead of char-by-char
- Code blocks: type INSIDE the `pre` as raw text nodes (md.js already escapes —
  appending plain text is safe); an incomplete fence types as plain text and upgrades
  to a full block the moment the fence closes (no flicker, no re-parse per frame).
- Scroll: stay pinned to the bottom while typing unless the user scrolled up; typing
  never steals scroll.
- Abort/error: stop the queue immediately; partial typed text remains; thoughtline
  settles.
- `prefers-reduced-motion`: no typewriter — render the final text instantly.

## 3. Layout during typing
- Type into the SAME final DOM element (`msg assistant`) — no wrapper replacement,
  no flash.
- Consume in ONE shared animation-frame loop (batched per ~100ms) — no per-char
  reflow storm; visual effects transform/filter only, never layout properties.

## DO NOT TOUCH (unchanged)
`app/electron/main.js`, IPC channels, the thinking line's step ownership, the avatar
state machine, the avatar subsystem. Rendering still goes through md.js into the same
`msg assistant` — the typewriter only paces what becomes VISIBLE.

## VERIFICATION (static, then visual user pass)
1. One shared drain loop drives the visible stream (no per-char setTimeout storm).
2. Short instant answers: ThoughtLine stays visible ≥600ms through the full chord
   timeline.
3. Long answer: typing accelerates smoothly; never lags badly; code blocks type into
   the exact final `pre` (jump-free upgrade when the fence closes).
4. `prefers-reduced-motion`: instant render, no typing.
5. Aborting mid-stream: queue stops cleanly; partial text remains.
6. Scroll-up while typing keeps the user's position; new sends re-pin when at bottom.
