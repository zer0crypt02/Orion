/* js/squishswitch.js — React Bits "SquishSwitch" portu (vanilla JS, sıfır bağımlılık).
   Referans: motion/react yayları yerine tek paylaşımlı rAF spring integrator.
   Davranış birebir: role=switch, Space/Enter = toggle, sürükle-geçince-işle (midpoint),
   Escape = basış anına geri dön, Pointer Capture, ~8px görünmez vuruş padi (::after).

   MOTION (motion-design skill):
   - Arketip: PLAYFUL (skill tablo: 150-300ms, ease-out-back, overshoot %10-20).
     Settle yayı bilerek hafif underdamped (ζ≈0.87) — panelin premium "%0 overshoot"
     kuralından BİLEREK sapma; bu komponentin kişiliği küçük bir taşmadır.
   - Settle süresi ~250-300ms → skill "toggle 120-180ms + release/settle 200-300ms" bandı.
   - Squash & stretch: Disney "alan korunumu" (skill secondary-motion): scaleX=k·swell,
     scaleY=swell/k — uzayan başparmak daralır, alan sabit kalır.
   - Hover swell kendi yayında (stiffness 520) — skill "hover <100ms his" kuralı için
     hızlı şişme; transform-only (x, scaleX, scaleY). left/width animasyonu YOK.
   - Renk: yalnızca background-color cross-fade (CSS transition), JS dokunmaz.
   - reduced-motion: yaylar hedefe zıplar, renk fadesi 1ms (CSS media query). */
"use strict";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Kaynak sabiter (referansla aynı): settle = stiffness(speed) / 21.5 / 0.9,
   hover swell = 520 / 34 / 0.6, hız akışı (flow) = 320 / 40 / 0.6. */
const SETTLE_DAMPING = 21.5;
const SETTLE_MASS = 0.9;
const REST_DELTA = 0.001;
const REST_SPEED = 0.01;
const settleStiffness = (speed) => 170 - (50 - clamp(speed, 0, 100)) * 1.1;
const SWELL_STIFFNESS = 520;
const SWELL_DAMPING = 34;
const SWELL_MASS = 0.6;
const FLOW_STIFFNESS = 320;
const FLOW_DAMPING = 40;
const FLOW_MASS = 0.6;
const MAX_STRETCH = 0.4;
const STRETCH_SPEED = 600;
const TAP_SLOP = { fine: 4, coarse: 8 };   // kaynak: dokunmatikte 8px, fared 4px

/* Yarı-kapalı (semi-implicit) Euler: kararlı, tek karede patlamaz. */
function springStep(s, target, k, d, m, dt){
  const f = -k * (s.x - target) - d * s.v;
  s.v += (f / m) * dt;
  s.x += s.v * dt;
}

/* createSquishSwitch(rootEl, opts) — var olan <button>'ı squish switch'e yükseltir.
   Sözleşme: aria-checked HER ZAMAN kök butonun üstündedir (currentCfg/refreshTools
   okumaya devam eder); onChange yalnızca KULLANICI hareketinde ateşlenir
   (harici set() sessizdir — refreshTools yankı-persist döngüsü yaratmaz). */
export function createSquishSwitch(rootEl, opts = {}){
  const {
    onChange,
    width = 76,
    height = 38,
    radius = 19,
    speed = 50,
    stretch = 36,
    hoverScale = 1.035,
    colorDuration,          // verilmezse token (--dur-slow); ham ms CSS'e yazılmaz
    trackColor,             // verilmezse token varsayılanları (CSS) — #27272a YASAK
    trackOnColor,
    thumbColor,
    thumbOnColor,
    disabled = false,
    ariaLabel,
  } = opts;

  /* Geometri (kaynak formülü): thumb = yükseklik − 2·inset, yarıçap kapaklı. */
  const inset = Math.max(3, Math.round(height * 0.11));
  const thumb = height - inset * 2;
  const min = inset;
  const max = width - inset - thumb;
  const mid = (min + max) / 2;
  const trackRadius = Math.min(radius, height / 2);
  const thumbRadius = Math.max(2, trackRadius - inset);

  const reduceMQ = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduce = () => !!(reduceMQ?.matches);
  /* gain: reduced-motion'da 0 → stretchOf(v) hep 1 (yaylar hedefe zıplar). */
  const gain = () => (reduce() ? 0 : clamp(stretch, 0, 100) / 100);
  const stretchOf = (v) => 1 + Math.min(MAX_STRETCH, Math.abs(v) / STRETCH_SPEED) * gain();

  /* Kök: kimlik/semantik korunur, iç yapı kurulur. */
  rootEl.classList.add("squish-switch");
  rootEl.setAttribute("role", "switch");
  if (ariaLabel != null) rootEl.setAttribute("aria-label", ariaLabel);
  if (disabled) rootEl.setAttribute("aria-disabled", "true");
  rootEl.textContent = "";
  const track = document.createElement("span");
  track.className = "squish-switch__track";
  const knob = document.createElement("span");
  knob.className = "squish-switch__thumb";
  knob.setAttribute("aria-hidden", "true");
  track.appendChild(knob);
  rootEl.appendChild(track);

  const css = rootEl.style;
  css.setProperty("--ss-w", `${width}px`);
  css.setProperty("--ss-h", `${height}px`);
  css.setProperty("--ss-inset", `${inset}px`);
  css.setProperty("--ss-thumb", `${thumb}px`);
  css.setProperty("--ss-r", `${trackRadius}px`);
  css.setProperty("--ss-thumb-r", `${thumbRadius}px`);
  if (colorDuration != null) css.setProperty("--ss-fade", `${colorDuration}ms`);
  if (trackColor) css.setProperty("--ss-track", trackColor);
  if (trackOnColor) css.setProperty("--ss-track-on", trackOnColor);
  if (thumbColor) css.setProperty("--ss-thumb-color", thumbColor);
  if (thumbOnColor) css.setProperty("--ss-thumb-on", thumbOnColor);

  let state = rootEl.getAttribute("aria-checked") === "true";
  const paintState = () => {
    rootEl.setAttribute("aria-checked", state ? "true" : "false");
    if (state) rootEl.setAttribute("data-on", "");
    else rootEl.removeAttribute("data-on");
  };
  paintState();

  /* Yay durumları: x = başparmak konumu, swell = hover şişmesi, flow = hız akışı. */
  const xs = { x: state ? max : min, v: 0 };
  const sw = { x: 1, v: 0 };
  const fl = { x: 0, v: 0 };
  let swellTarget = 1;
  let prevX = xs.x;
  let dragging = false;

  const render = () => {
    const sx = stretchOf(fl.x) * sw.x;
    const sy = sw.x / stretchOf(fl.x);
    knob.style.transform =
      `translateX(${xs.x.toFixed(2)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  };
  render();

  /* TEK paylaşımlı rAF döngüsü (switch başına bir tane): üç yayı sürer, reposesda durur. */
  let raf = 0;
  let last = 0;
  const tick = (t) => {
    const dt = last ? Math.min(0.032, (t - last) / 1000) : 0.016;
    last = t;
    if (dt > 0){
      if (!dragging){
        const target = state ? max : min;
        /* reduced-motion: yay yok — hedefe zıpla (skill: işlev korunur, süs gider). */
        if (reduce()){ xs.x = target; xs.v = 0; }
        else springStep(xs, target, settleStiffness(speed), SETTLE_DAMPING, SETTLE_MASS, dt);
      }
      springStep(sw, swellTarget, SWELL_STIFFNESS, SWELL_DAMPING, SWELL_MASS, dt);
      const instV = (xs.x - prevX) / dt;
      prevX = xs.x;
      springStep(fl, instV, FLOW_STIFFNESS, FLOW_DAMPING, FLOW_MASS, dt);
    }
    render();
    const target = state ? max : min;
    const settled =
      Math.abs(xs.x - target) < 0.05 && Math.abs(xs.v) < 0.5 &&
      Math.abs(sw.x - swellTarget) < 0.001 && Math.abs(fl.x) < 5 && !dragging;
    if (settled){
      xs.x = target; xs.v = 0;
      sw.x = swellTarget; sw.v = 0;
      fl.x = 0; fl.v = 0;
      render();
      raf = 0; last = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf){ last = 0; raf = requestAnimationFrame(tick); } };

  let lastNotified = state;
  const commit = (next, silent = false) => {
    if (next === state) return;
    state = next;
    paintState();
    kick();
    if (!silent){ lastNotified = next; onChange?.(next); }
  };

  /* ── işaretçi: press → (opsiyonel) sürükle → ortadan geçince anında işle ── */
  let grip = null;
  let skipClick = false;
  const localX = (clientX) => {
    const r = track.getBoundingClientRect();
    const scale = r.width / (track.offsetWidth || r.width) || 1;
    return (clientX - r.left) / scale;
  };
  const cancelGrip = (g) => {
    grip = null;
    try { rootEl.releasePointerCapture(g.id); } catch { /* yoksa sorun değil */ }
    rootEl.removeAttribute("data-held");
    commit(g.onAtPress, true);   // Escape = basış anına geri dön (sessiz; renk senkron)
    /* Ara geçiş çoktan persist edildiyse geri dönüşü de bildir (ayar gerçeği korur). */
    if (state !== lastNotified){ lastNotified = state; onChange?.(state); }
    setDragging(false);
  };
  const setDragging = (d) => {
    dragging = d;
    if (d) rootEl.setAttribute("data-held", "");
    else rootEl.removeAttribute("data-held");
    kick();
  };

  const onPointerDown = (e) => {
    if (disabled || grip || e.button !== 0) return;
    grip = {
      id: e.pointerId,
      grab: null,
      moved: false,
      startX: e.clientX,
      onAtPress: state,
      slop: e.pointerType === "touch" ? TAP_SLOP.coarse : TAP_SLOP.fine,
    };
    try { rootEl.setPointerCapture(e.pointerId); } catch { /* desteksizde sürükleme yok */ }
    setDragging(true);
  };
  const onPointerMove = (e) => {
    const g = grip;
    if (!g || g.id !== e.pointerId) return;
    const lx = localX(e.clientX);
    if (g.grab === null){ g.grab = lx - xs.x; return; }
    if (!g.moved && Math.abs(e.clientX - g.startX) > g.slop) g.moved = true;
    if (!g.moved) return;
    xs.x = clamp(lx - g.grab, min, max);   // sürüklerken doğrudan — yay bırakınca devralır
    commit(xs.x > mid);                    // ortadan geçti = anında işle (canlı commit)
    kick();
  };
  const onPointerUp = (e, cancelled) => {
    const g = grip;
    if (!g || g.id !== e.pointerId) return;
    grip = null;
    try { rootEl.releasePointerCapture(e.pointerId); } catch { /* yoksa sorun değil */ }
    if (cancelled) commit(g.onAtPress);
    else if (!g.moved) commit(!state);      // kımıldamadı = dokunma = çevir
    /* Sürükleme sonrası doğan click'i yut (kaynak skipClick tekniği). */
    skipClick = true;
    setTimeout(() => { skipClick = false; }, 0);
    setDragging(false);
  };
  const onClick = () => {
    if (disabled) return;
    if (skipClick){ skipClick = false; return; }
    commit(!state);                        // klavye (Space/Enter) + programsız tıklama yolu
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape" && grip) { e.preventDefault(); cancelGrip(grip); }
  };
  const onPointerEnter = (e) => {
    if (e.pointerType === "mouse" && !disabled){ swellTarget = hoverScale; kick(); }
  };
  const onPointerLeave = () => {
    if (swellTarget !== 1){ swellTarget = 1; kick(); }
  };

  rootEl.addEventListener("pointerdown", onPointerDown);
  rootEl.addEventListener("pointermove", onPointerMove);
  const onUp = (e) => onPointerUp(e, false);
  const onCancel = (e) => onPointerUp(e, true);
  rootEl.addEventListener("pointerup", onUp);
  rootEl.addEventListener("pointercancel", onCancel);
  rootEl.addEventListener("click", onClick);
  rootEl.addEventListener("keydown", onKeyDown);
  rootEl.addEventListener("pointerenter", onPointerEnter);
  rootEl.addEventListener("pointerleave", onPointerLeave);

  return {
    /* Harici ayna (refreshTools): sessiz — onChange ateşlemez, yankı-persist yok. */
    set(next){
      next = !!next;
      if (next === state){ paintState(); return; }
      state = next;
      paintState();
      kick();
    },
    get: () => state,
    destroy(){
      cancelAnimationFrame(raf); raf = 0;
      rootEl.removeEventListener("pointerdown", onPointerDown);
      rootEl.removeEventListener("pointermove", onPointerMove);
      rootEl.removeEventListener("pointerup", onUp);
      rootEl.removeEventListener("pointercancel", onCancel);
      rootEl.removeEventListener("click", onClick);
      rootEl.removeEventListener("keydown", onKeyDown);
      rootEl.removeEventListener("pointerenter", onPointerEnter);
      rootEl.removeEventListener("pointerleave", onPointerLeave);
    },
  };
}
