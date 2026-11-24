# TASK: Companion polish — adopt the 3 research-validated upgrades (small, additive)

Project: /Users/fatihemre/Desktop/JS/notch (Electron, vanilla JS/CSS renderer — NO React).
Work ONLY in `app/renderer/` (`js/avatar.js`, `js/app.js`, `styles/components.css`,
`index.html` if a bubble anchor is needed).
Load the motion-design skill (~/.config/opencode/skills/motion-design/) first; comment
which principle each constant uses.

## CONTEXT
A design-intelligence report (research across Clippy, Shimeji, VPet, desktop-pet,
Replika, Duolingo, NotchNook, Apple Dynamic Island HIG, Slack/Discord presence)
validated our current companion architecture (fixed homes, never-over-text,
cooldowns, settling reactions) and surfaced 3 small upgrades. Implement them as
additive changes — the existing ambient engine (AMBIENT_COOLDOWN, service-wins
priority, settleCalm, drowsy) stays as-is.

## UPGRADE 1 — Brand-rule card (Duo's practice, zero runtime cost)
Add a 5-line behavior constitution as a comment block at the top of `js/avatar.js`,
and treat it as the gate for every ambient rule that follows:
```
ORION COMPANION RULES (validated vs. Duolingo brand rules + Dynamic Island HIG):
1. One fixed home per state; never covers chat text.
2. Stillness is the default — ambient moves are rare, slow, small.
3. Service states (thinking/streaming/error) outrank personality. Always.
4. Celebrate only AFTER the user's action; never interrupt with unprompted pop-ups.
5. Reactions decay promptly; every behavior has a cooldown and an off path.
```
Then grep the existing ambient code against it; fix any rule it already violates
(expected: none — if found, fix and report).

## UPGRADE 2 — Pet-to-warm escalation (from desktop-pet, uses existing anims)
Repeated friendly pokes escalate affection, mapped onto EXISTING bundle animations:
- Trigger: drag-release (the existing pointerup-with-moved path in `bindDrag`) counts
  as a "poke". Keep a small rolling window (e.g. pokes within 10s of each other).
- Escalation: 1st poke = current behavior (settle only); 2nd within window =
  `playful`; 3rd+ = `excited` (bundle list confirms both exist). After escalation,
  settle to `idle` via the existing settleCalm (~5s) and RESET the window.
- Limits: escalation respects the ambient cooldown AND service-wins (no playful
  while thinking/streaming/error); double-click reset (resetPosition) does NOT count
  as a poke; max escalation `excited` — no loop-back spam. One cooldown entry in the
  existing map, no new timers beyond what settleCalm already provides.

## UPGRADE 3 — Micro-note bubble, Phase 3 REVISITED with the research constraint
The report confirms the skipped speech bubble is the right shape ONLY with these
guardrails (from NotchNook/Dynamic Island + Baymard anti-pattern data):
- Placement: a RESERVED zone anchored to the docked avatar's ring — the sliver of
  space between the ring and the composer's top edge (or directly above the ring if
  that sliver is < ~22px). It must NEVER extend over chat text; implement as a
  fixed-position element whose max size is measured against that reserved gap, and
  SKIP (report why) if the panel can't guarantee the gap at all reachable widths.
- Content: max ONE short Turkish line, only on these rare moments: error fixed
  ("Toparladık 🎉"), first response of a session ("Buradayım."). Nothing else —
  no keyword-triggered, no streaming-time messages (Clippy lesson).
- Rate: ≤1 per ~30s hard cap; never during streaming/working states; auto-fade
  ~2.5s (--dur-slow + --ease-out), transform/opacity only; glass styling from
  tokens (--glass-* family, --ink-hi text, --fs-xs); `prefers-reduced-motion` =
  fade only.
- Dismissible: clicking it dismisses immediately; Esc dismisses.
If ANY guardrail can't be met at a reachable panel size, SKIP with reason — a
skipped bubble is a correct outcome (matches the previous decision).

## DO NOT TOUCH (frozen)
`app/electron/main.js`, IPC names, npm deps, CSP, `vendor/avatar-web.bundle.js`,
`assets/orion.avatar.json`, state-machine thresholds, `js/thoughtline.js`,
`js/typewriter.js`. No raw hex/raw ms outside `tokens.css`; transform/opacity only;
identity lock: vary motion, NEVER the face/shape (Replika face-churn lesson).

## VERIFICATION (static — user does the visual pass)
1. `cat file | node --input-type=module --check` for each touched JS file.
2. Brand-rule card present; existing ambient code audited against it (report result).
3. Pet-to-warm: escalation path traced (poke window, playful→excited, settle+reset,
   cooldown + service-wins respected; dblclick excluded).
4. Bubble (if built): reserved-zone measurement logic in code; 30s cap; dismiss
   paths; reduced-motion; token styling; never over text at min/max panel widths.
5. No dead code; no git commits; delete build artifacts (e.g. graphify-out/).
6. DONE/SKIPPED line per item.
