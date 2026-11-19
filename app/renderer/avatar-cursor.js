// Göz takibi: avatar SVG'sindeki göz grubunu imleç yönünde kaydırır.
// Sınırlar: max 7px kayma, lerp yumuşatma (titreme yok), prefers-reduced-motion'da kapalı.
// Pencere dışı imleç konumu main process'ten "cursor:pos" kanalıyla gelir ({x, y});
// main tarafı başka bir dalga — burada yalnızca dinleyici hazırdır.
"use strict";

const MAX_SHIFT = 7;   // px — göz grubunun en fazla kayacağı mesafe
const LERP = 0.12;     // yumuşatma katsayısı (düşük = daha akıcı, titremesiz)
const REACH = 220;     // px — imleç bu uzaklıkta tam kaymaya ulaşır

export function initCursorTracking(){
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const stage = document.getElementById("avatar");
  if (!stage) return;

  let eyes = null;
  const findEyes = () => {
    const svg = stage.querySelector("svg");
    if (!svg) return null;
    return svg.querySelector('[data-part="eyes"], .eyes, #eyes, g[id*="eye" i], g[class*="eye" i]');
  };

  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

  const tick = () => {
    cx += (tx - cx) * LERP;
    cy += (ty - cy) * LERP;
    if (eyes) eyes.setAttribute("transform", `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
    if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(tick);
    else raf = null;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  const aim = (px, py) => {
    if (!eyes) eyes = findEyes();
    if (!eyes) return;
    const r = stage.getBoundingClientRect();
    const dx = px - (r.left + r.width / 2);
    const dy = py - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / REACH) * MAX_SHIFT / d;
    tx = dx * k;
    ty = dy * k;
    wake();
  };

  window.addEventListener("mousemove", (e) => aim(e.clientX, e.clientY), { passive: true });
  document.addEventListener("mouseleave", () => { tx = 0; ty = 0; wake(); });

  // main process köprüsü (preload) hazır olduğunda pencere dışı konumlar da akar
  // main ekran koordinatı gönderir → istemci koordinatına çevir (mousemove ile aynı uzay)
  window.notch?.onCursorPos?.((p) => aim((p?.x ?? 0) - window.screenX, (p?.y ?? 0) - window.screenY));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCursorTracking);
else initCursorTracking();
