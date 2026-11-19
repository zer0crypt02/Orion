/* thoughtline.js — React Bits "ThoughtLine" portu: vanilla ES modülü.
   Davranış birebir korunur (nefes · sheen · adım izi · settle akoru), ama:
     motion/react → WAAPI (el.animate) + CSS keyframes (kütüphane YOK),
     Hugeicons → 3 satır-içi mini SVG (sparkle / chevron / tick),
     tüm süre + easing + renk → tokens.css (ham değer YOK).

   MOTION HARİTASI (brief §STEP 0 + motion-design skill):
     EASE_OUT (.23,1,.32,1) → var(--ease-out) (uygulama token'ı KAZANIR;
       premium arketip, overshoot %0 — skill: "firm, no overshoot")
     settle akoru → var(--dur-slow) 450ms (tokenMs() ile okunur)
     adım/metiş geçişi → var(--dur-base) 270ms (renk transition + tick pop)
     mikro fade → var(--dur-quick) 160ms (reduced-motion akoru)
     nefes 1.6s sine → var(--ease-in-out) loop; çukur .55 = dotPulse /
       ringPulse ile AYNI "nefes ailesi" (tek kelime, yabancı cisim yok)
     sheen 1.8s linear süpürme — sürekli tek-yön hareket = linear (skill: loop)
     renkler → --ink-hi (etiket) · --ink-low/--ink-mid (adımlar) ·
       --accent-dim (glif) · --accent (nabız) · --color-error (hata; glif+nabızda)
     yazı → --fs-sm/--fs-xs (mesaj tipografisiyle aynı merdiven, ≥12px)

   NOT: label sheen (background-clip:text) SADECE bu çalışma satırında
   işlevsel geri bildirimdir — statik metinde kullanılması YASAK.
   avatar.js'e DOKUNULMAZ; bu modül yalnızca sohbet akışındaki satırı yönetir. */
"use strict";
import { el, scrollEnd } from "./dom.js";

/* asistan turunun 3 adımı (Türkçe, sabit sıra) */
export const STEPS_TR = ["Bağlanıyor", "Düşünüyor", "Yanıt yazıyor"];

/* satır-içi mini SVG'ler (Hugeicons YOK): sparkle = çalışıyor glifi,
   chevron = bekleyen adım işareti, tick = biten adım */
const SVG_SPARK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8c.5 3.4 2 4.9 5.4 5.4-3.4.5-4.9 2-5.4 5.4-.5-3.4-2-4.9-5.4-5.4 3.4-.5 4.9-2 5.4-5.4z"/><path d="M12.4 1.4c.2 1.5.9 2.2 2.4 2.4-1.5.2-2.2.9-2.4 2.4-.2-1.5-.9-2.2-2.4-2.4 1.5-.2 2.2-.9 2.4-2.4z"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.2 6.4l2.5 2.5 5.1-5.6"/></svg>`;
const SVG_CHEVRON = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5l3.5 3.5-3.5 3.5"/></svg>`;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* token'dan ms: "320ms"/"0.32s" → 320. Tek kaynak tokens.css; ham sayı YOK. */
function tokenMs(name, fallback){
  const m = /^([\d.]+)(m?s)$/.exec(cssVar(name));
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  return m[2] === "s" ? n * 1000 : n;
}
const easeOut = () => cssVar("--ease-out") || "ease-out";

/* GÖRÜNÜRLÜK TABANLARI (typewriter brief §1 — ham sayı değil, davranış sabiti):
   STEP_MIN_MS 350 — algılanabilir-durum tabanı: ~300ms altındaki değişim
     durum okunmaz, flaş okunur; her adım en az bu kadar görünür kalır.
   MIN_WORK_MS 600 — akor bütünlüğü: toplam çalışma bunun altında olursa
     settle dikişi slit-instant swap okunur; sayaç bu süre dolmadan donmaz. */
const STEP_MIN_MS = 350;
const MIN_WORK_MS = 600;

/* "4,2 sn" / "12 sn" — ondalıkta Türkçe virgül */
export function fmtDur(ms){
  const s = Math.max(0, ms) / 1000;
  return (s < 10 ? s.toFixed(1).replace(".", ",") : String(Math.round(s))) + " sn";
}

let active = null;   // o anki çalışan satır (handle) | null

function build(t0){
  const root = el(`<div class="thoughtline" role="status" aria-label="Orion çalışıyor">
    <div class="tl-swap">
      <div class="tl-head">
        <span class="tl-breathe"><span class="tl-glyph">${SVG_SPARK}</span><span class="tl-label"></span></span>
        <span class="tl-time">0,0 sn</span>
      </div>
      <div class="tl-done"><span class="tl-glyph">${SVG_CHECK}</span><span class="tl-done-text"></span></div>
    </div>
    <div class="tl-trace"><div class="tl-steps"></div></div>
  </div>`);
  const h = {
    root, t0, settled: false, tokens: 0, activeStep: 0, timerId: 0,
    stepAt: t0, pendStep: 0, settleTimer: 0,
    head: root.querySelector(".tl-head"),
    done: root.querySelector(".tl-done"),
    doneText: root.querySelector(".tl-done-text"),
    label: root.querySelector(".tl-label"),
    time: root.querySelector(".tl-time"),
    trace: root.querySelector(".tl-trace"),
    steps: [],
  };
  const box = root.querySelector(".tl-steps");
  STEPS_TR.forEach((s) => {
    const row = el(`<div class="tl-step" data-s="todo"><span class="tl-mark">${SVG_CHEVRON}</span><span class="tl-name"></span></div>`);
    row.querySelector(".tl-name").textContent = s;
    box.appendChild(row);
    h.steps.push(row);
  });
  paintSteps(h, 0);
  h.timerId = setInterval(() => { h.time.textContent = fmtDur(Date.now() - h.t0); }, 100);
  return h;
}

/* adım boyası: biten → tick + sönük (200ms renk geçişi CSS'te),
   o anki → nabız noktası, bekleyen → chevron. İşaret değişiminde
   200ms (--dur-base) mikro pop — WAAPI, süre token'dan okunur. */
function pop(mark){
  mark.animate(
    [{ transform: "scale(.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
    { duration: tokenMs("--dur-base", 200), easing: easeOut() },
  );
}
function paintSteps(h, upto){
  h.steps.forEach((row, i) => {
    const s = i < upto ? "done" : i === upto ? "now" : "todo";
    if (row.dataset.s === s) return;
    row.dataset.s = s;
    const mark = row.querySelector(".tl-mark");
    mark.innerHTML = s === "done" ? SVG_CHECK : s === "now" ? `<span class="tl-dot"></span>` : SVG_CHEVRON;
    if (!reduced() && s !== "todo") pop(mark);
  });
  h.label.textContent = STEPS_TR[upto] + "…";
}

/* settle akoru: başlık blur'lu dikişle (≤2px) silinir, done satırı aynı
   anda belirir — süre app token’ı (--dur-slow 450).
   reduced-motion: blur YOK, akor = yalnızca fade (--dur-quick). */
function chord(h){
  const head = h.head;
  const done = h.done;
  done.style.visibility = "visible";
  if (reduced()){
    const d = tokenMs("--dur-quick", 160);
    head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: "ease-out", fill: "forwards" });
    done.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: "ease-out", fill: "forwards" });
    return;
  }
  const d = tokenMs("--dur-slow", 320);
  const e = easeOut();
  head.animate(
    [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(2px)" }],
    { duration: d, easing: e, fill: "forwards" },
  );
  done.animate(
    [{ opacity: 0, filter: "blur(2px)" }, { opacity: 1, filter: "blur(0px)" }],
    { duration: d, easing: e, fill: "forwards" },
  );
}

/* ── dış API (app.js buradan sürer) ── */

/* yeni kullanıcı mesajı: saat sıfırlanır, döngü baştan başlar.
   Çalışan eski satır varsa sessizce kaldırılır (geçmiş settled satırlar durur). */
export function start(parent, t0){
  if (active && !active.settled) remove(active);
  const h = build(t0);
  parent.appendChild(h.root);
  active = h;
  scrollEnd(parent);
  /* iz kapalıdan açığa: grid 0fr→1fr (CSS, --dur-slow ease-out).
     Çift rAF: ekleme boyası işlendikten sonra açılsın ki geçiş oynasın. */
  requestAnimationFrame(() => requestAnimationFrame(() => { h.root.dataset.working = "1"; }));
  return h;
}

/* ilk token → "Düşünüyor", ikinci token → "Yanıt yazıyor" (nabız bu adımda).
   TABAN: önceki adım STEP_MIN_MS dolmadan ilerlenmez — erken token kuyruğa
   girer, flaş olmaz. Kapanış planlandıysa (settleTimer) token yoksayılır. */
export function noteToken(h){
  if (!h || h.settled || h.settleTimer || !h.root.isConnected) return;
  h.tokens += 1;
  const target = h.tokens === 1 ? 1 : 2;
  if (target <= h.activeStep) return;
  const wait = STEP_MIN_MS - (Date.now() - h.stepAt);
  if (wait <= 0){ h.activeStep = target; h.stepAt = Date.now(); paintSteps(h, target); return; }
  clearTimeout(h.pendStep);
  h.pendStep = setTimeout(() => {
    h.pendStep = 0;
    if (h.settled || h.settleTimer || !h.root.isConnected) return;
    if (target <= h.activeStep) return;
    h.activeStep = target; h.stepAt = Date.now(); paintSteps(h, target);
  }, wait);
}

/* bağlam daralmasında düşen balon: satır çalışır durumda kalsın */
export function ensureWorking(h){
  if (!h || h.settled || !h.root.isConnected) return;
  h.root.dataset.working = "1";
}

/* akış bitti / hata: sayaç cümleye donar, iz katlanır, glif söner.
   Hata varyantı: glif + nabız --color-error (metin aynı renk merdiveninde). */
export function settle(h, ok){
  if (!h || h.settled || !h.root.isConnected) return;
  if (h.settleTimer) return;   // kapanış zaten planlı: ikinci çağrı ezemez
  /* TABAN: toplam çalışma MIN_WORK_MS + son adım STEP_MIN_MS dolmadan akor
     başlamaz — anlık cevapta bile dikiş slit-instant swap okunmaz. Sayaç bu
     beklemede işlemeye devam eder; süre dürüst kalır. */
  const now = Date.now();
  const wait = Math.max(MIN_WORK_MS - (now - h.t0), STEP_MIN_MS - (now - h.stepAt), 0);
  if (wait > 0){
    h.settleTimer = setTimeout(() => { h.settleTimer = 0; doSettle(h, ok); }, wait);
    return;
  }
  doSettle(h, ok);
}

function doSettle(h, ok){
  if (h.settled || !h.root.isConnected) return;
  h.settled = true;
  clearInterval(h.timerId);
  const elapsed = fmtDur(Date.now() - h.t0);
  paintSteps(h, h.activeStep);
  h.steps.forEach((row, i) => {
    if (i > h.activeStep) return;
    if (row.dataset.s !== "done"){
      row.dataset.s = "done";
      row.querySelector(".tl-mark").innerHTML = SVG_CHECK;
    }
  });
  if (ok){
    h.done.querySelector(".tl-glyph").innerHTML = SVG_CHECK;
    h.doneText.textContent = `${elapsed}'de yanıtlandı`;
    h.root.setAttribute("aria-label", `Orion ${elapsed}'de yanıtladı`);
  } else {
    h.root.dataset.err = "1";
    h.done.querySelector(".tl-glyph").innerHTML = SVG_SPARK;
    h.doneText.textContent = `Yanıt alınamadı · ${elapsed}`;
    h.root.setAttribute("aria-label", `Orion yanıt veremedi · ${elapsed}`);
  }
  h.head.setAttribute("aria-hidden", "true");
  h.root.dataset.working = "0";   // iz katlanır (grid 1fr→0fr, yükseklik animasyonu yok)
  chord(h);
  if (active === h) active = null;
}

function remove(h){
  clearInterval(h.timerId);
  clearTimeout(h.pendStep);
  clearTimeout(h.settleTimer);
  h.pendStep = h.settleTimer = 0;
  h.root.remove();
  if (active === h) active = null;
}

/* iptal: çalışan satırı iz bırakmadan kaldır */
export function discard(h){
  if (!h || h.settled) return;
  remove(h);
}

/* sohbet temizlenmeden önce (geçmiş geçişi / /new): sayaç sızmasın */
export function abandon(){
  if (!active) return;
  clearInterval(active.timerId);
  clearTimeout(active.pendStep);
  clearTimeout(active.settleTimer);
  active = null;
}
