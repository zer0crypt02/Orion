/* sky.js — panelin zemin katmanı (React Bits <GradientASCII/> portu).
   ---------------------------------------------------------------------
   Katman sırası:  [0] sky (bu dosya) → [1] .glass → [2] panel-ui → [6] avatar

   Kurallar:
   • Panel kapalıyken (hap görünürken) döngü tamamen durur — pil.
   • Sekme/pencere gizliyken durur.
   • prefers-reduced-motion: tek kare çizilir (kütüphane içinde ele alınır).
   • WebGL2 yoksa hiçbir şey yapılmaz; CSS'teki yedek zemin görünür.
   • Renkler token'lardan değil buradan gelir: shader renk rampası CSS
     değişkeni okuyamaz. Değerler gece gökyüzü paletinin (indigo → periwinkle)
     soğuk ucudur; sıcak yıldız tonu yalnız avatarda kalır. */
"use strict";
import { createGradientAscii } from "../vendor/gradient-ascii.js";

const host = document.getElementById("sky");

if (host) {
  const api = createGradientAscii(host, {
    colors: ["#101a4d", "#5f6fd8", "#aab6ff", "#2c3f9e"],
    shape: "horizon",
    characters: " =+xX0S8#@",
    cellSize: 16,
    density: 0.76,
    glyphOpacity: 0.55,
    gradientOpacity: 0.9,
    glow: 0.34,
    softness: 0.6,
    flow: 0.7,
    speed: 0.4,
    scale: 1.3,
    grain: 0.05,
    mouseInteraction: true,
    scrambleRadius: 0.12,
    clickEffect: "none",
    intro: true,
    maxFps: 30,
  });

  if (api) {
    document.body.classList.add("has-sky");
    /* layout-busy: panel/sidebar geometri geçişi sürerken shader döngüsü durur
       (yeniden raster + 30fps WebGL aynı karede çakışırsa geçiş kasıyordu) */
    const sync = () => api.setActive(
      document.body.classList.contains("open") &&
      !document.body.classList.contains("layout-busy") &&
      !document.hidden
    );
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", sync);
    sync();
  }
}
