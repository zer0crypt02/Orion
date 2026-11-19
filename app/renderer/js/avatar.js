/* ORION COMPANION RULES (Duo marka kuralları + Dynamic Island HIG'den doğrulandı):
   1. Eyalet başına tek sabit ev; sohbet metni ASLA örtülmez.
   2. Dinginlik varsayılandır — ambient hareketler seyrek, yavaş, küçük.
   3. Servis durumları (thinking/akış/hata) kişilikten üstündür. Her zaman.
   4. Kutlama SADECE kullanıcı eyleminden SONRA; istenmeyen pop-up yok.
   5. Reaksiyonlar çabuk söner; her davranışın soğuması ve çıkış yolu vardır.
   Aşağıdaki her ambient kuralı bu 5 maddeye karşı denetlenmiştir (denetim: Faz 1-2).
   avatar.js — tek sorumluluk: AVATAR KATMANI [2] + durum makinesi.
   İki parça:
     A) katman: 96px taban kutu, dairesel clip, 1.5px durum halkası, sürükle-bırak,
        localStorage'da konum, çift tık / Enter ile varsayılan yere dönüş.
     B) durum makinesi: sleeping/waking/listening/thinking/error… (v1 ile aynı
        eşikler) → avatar bundle'ın play() çağrısı + halka rengi.

   MOTION NOTLARI (motion-design skill):
   - Premium arketip, overshoot %0: konum geçişleri 240ms --ease-out (decelerate).
   - listening pulse 2.4s sine ease-in-out = hap noktasıyla aynı "nefes" (ambient).
   - thinking yayı 1.6s linear (skill: loop'lar linear döner).
   - error halkası statik (skill: "errors feel firm", pulse yok).
   - drag conflict rule: sürüklerken halka animasyonları duraklar.
   - release/settle: 120ms scale .97→1. */
import { $ } from "./dom.js";

const IDLE_MS = 90000;   // 90 sn hareketsizlik → uyku
const WAKE_MS = 2300;    // sleeping → waking ara geçişi
const DOCK = 76;         // sohbet modu çapı (hero bandındaki evi)
const EMPTY = 96;        // boş durum çapı (taban kutu)
/* skill/staging: free görsel 96px taban × 1.5 ≈ 144px — transform-only, kutu sabit */
const FREE_SCALE = 1.7;
/* SABİT EV: karakter fare ile taşınmaz. Default konum her modda tek ve sabittir
   (sohbette hero bandı, boş durumda sahne merkezi). Mıknatıs/sürükleme kodu
   duruyor ama kapı kapalı — ileride açmak tek satır. */
const PINNED = true;
/* scroll-to-dock penceresi: ~140px birikim / ~600ms (jest, dekoratif değil) */
const WHEEL_PX = 140;
const WHEEL_WINDOW = 600;
const WHEEL_REST = 12;    // flap kilidi bu eşiğin altında çözülür
const LABEL_DOCKED = "Orion — sürükleyerek taşı, Enter ile varsayılan konuma dön";
const LABEL_FREE = "Orion";   // free mod etkileşimsiz: kısa etiket, tab dışı
const PAD = 8;           // panel kenarından minimum boşluk
const GAP = 10;          // composer ile avatar arası dikey boşluk
const DRAG_THRESHOLD = 6; // px — tık ile sürüklemeyi ayırır
const POS_KEY = "orion.avatarPos";

const SEARCH_RX = /(ara\b|aray|search|google|web|internet|\bbul\b|find\b|fiyat|price|weather|hava durum|haber|news)/i;
const CODE_RX = /(kod|code|analiz|analy[sz]e|incele|review|debug|hata|error|fonksiyon|function|dosya|file|refaktör|refaktor|test et|\btest\b|derle|compile|çalışmıyor|calismiyor|not working|doesn.?t work)/i;

/* trigger → halka eşleşmesi */
const RING = {
  listening: "listen",
  thinking: "think", searching: "think", working: "think",
  error: "error", sad: "error", surprised: "error",
};

let ctl = null;
/* Varsayilan durum: uyanik. Karakter 90 sn hareketsizlikte uyur (IDLE_MS).
   Yatyor baslamak, ilk acilista bos/"kapali" bir yuz gosteriyordu. */
let state = "idle";
let idleTimer = null;
let sadTimer = null;
let hadError = false;
let onIdle = null;

let layer = null;
let drag = null;
let freeName = null;         // boş durumda avatarın üstündeki ad etiketi
let mode = "empty";          // 'empty' | 'chat'
let pos = { x: 0, y: 0 };    // merkez, katman koordinatı
let custom = null;           // kullanıcı konumu | null (varsayılan)
let press = null;
let dragging = false;

/* ── A) KATMAN ─────────────────────────────────────────────────────── */

/* free görsel yarıçapı taban×ölçekten hesaplanır (clamp + anchor dürüst kalsın) */
const radius = () => (mode === "chat" ? DOCK / 2 : (EMPTY * FREE_SCALE) / 2);

function layerSize(){
  const r = layer.getBoundingClientRect();
  return { w: r.width, h: r.height, left: r.left, top: r.top };
}

function anchor(){
  const L = layerSize();
  const r = radius();
  if (!L.w) return { x: 0, y: 0 };

  if (mode === "chat"){
    /* EV = hero bandındaki .avatar-slot. Avatar sohbet metninin ÜSTÜNDEKİ
       kendi bandında durur; composer'a çapalamak (eski davranış) karakteri
       metnin üzerine bırakıyordu (PROJECT.md kural 1 ihlali). */
    const slot = $("#avatarSlot");
    const s = slot ? slot.getBoundingClientRect() : null;
    if (s && s.width){
      return { x: s.left - L.left + s.width / 2, y: s.top - L.top + s.height / 2 };
    }
    /* yedek: slot yoksa composer üstü (eski çapa) */
    const c = $("#composer").getBoundingClientRect();
    return { x: c.left - L.left + c.width - r, y: c.top - L.top - GAP - r };
  }
  /* FREE (yalnızca boş durum — has-chat'te setMode bekçisi overlay'e izin
     vermez, bu dala has-chat'te girilemez): #stage yatay merkezi + stage-üstü
     → #empty-üstü boş alanın dikey merkezi. skill/staging + center-weight. */
  const s = $("#stage").getBoundingClientRect();
  if (!s.width) return { x: L.w / 2, y: L.h / 2 };
  const cx = s.left - L.left + s.width / 2;
  const stageTop = s.top - L.top;
  const e = $("#empty").getBoundingClientRect();
  const freeBottom = e.top - L.top;
  if (e.height > 0 && freeBottom > stageTop + 1) return { x: cx, y: (stageTop + freeBottom) / 2 };
  return { x: cx, y: stageTop + s.height / 2 };   /* son çare: stage merkezi */
}

/* sahne sınırları (katman koordinatında). Avatar pencereye değil SAHNEYE
   bağlıdır: menü açılınca sahne sağa kayar ve daralır, avatar da içeride kalır
   (yan menünün yazılarının üstüne binme hatası buradan kapanır). */
function stageBounds(){
  const s = $("#stage");
  const L = layerSize();
  if (!s || !L.w) return null;
  const r = s.getBoundingClientRect();
  if (!r.width) return null;
  return { left: r.left - L.left, right: r.right - L.left, top: r.top - L.top, bottom: r.bottom - L.top };
}

function clamp(p){
  const L = layerSize();
  const r = radius();
  if (L.w < r * 2 + PAD * 2) return p;      // panel henüz ölçülmedi
  const b = stageBounds();
  const minX = (b ? b.left : 0) + r + PAD;
  const maxX = (b ? b.right : L.w) - r - PAD;
  const minY = (b ? b.top : 0) + r + PAD;
  const maxY = (b ? b.bottom : L.h) - r - PAD;
  /* serbest hareket: dikeyde de serbest — yalnız sahne (composer üstü) sınırı var.
     Metnin üstüne gelebilir; kullanıcı istediği yere koyar, mıknatıs eve çeker. */
  return {
    x: Math.min(Math.max(p.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(p.y, minY), Math.max(minY, maxY)),
  };
}

/* ── MIKNATIS: yaklaşınca çeken oturma noktaları ──
   İki sabit ev: hero bandındaki .avatar-slot (sohbetin güzel başlangıcı) ve
   sahne merkezi. Sürüklerken hafif çekim (1:1 takibi bozmayacak kadar),
   bırakınca eşik içindeyse oraya oturur. */
const SNAP_PULL = 62;     // px — çekim başladığı yarıçap
const SNAP_COMMIT = 78;   // px — bırakınca oturduğu yarıçap

function snapTargets(){
  const L = layerSize();
  const out = [];
  if (!L.w) return out;
  const slot = $("#avatarSlot");
  const s = slot ? slot.getBoundingClientRect() : null;
  if (s && s.width) out.push({ x: s.left - L.left + s.width / 2, y: s.top - L.top + s.height / 2 });
  const b = stageBounds();
  if (b) out.push({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
  return out;
}

function nearestSnap(p, limit){
  let best = null;
  let bestD = limit;
  for (const t of snapTargets()){
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    if (d < bestD){ bestD = d; best = t; }
  }
  return best;
}

function magnetize(p){
  const t = nearestSnap(p, SNAP_PULL);
  if (!t) return p;
  const d = Math.hypot(p.x - t.x, p.y - t.y);
  const k = (1 - d / SNAP_PULL) * 0.5;   // yaklaştıkça güçlenen çekim
  return clamp({ x: p.x + (t.x - p.x) * k, y: p.y + (t.y - p.y) * k });
}

/* boş durumda ad, avatarla birlikte gezer (avatarın üstünde, 16px boşlukla) */
function paintFreeName(){
  if (!freeName) return;
  freeName.style.setProperty("--x", pos.x.toFixed(1) + "px");
  freeName.style.setProperty("--y", (pos.y - radius() - 16).toFixed(1) + "px");
}

function paint(animate = false){
  if (!drag) return;
  pos = clamp(pos);
  paintFreeName();
  /* dolu evden ayrıldıysa hero etiketi ortada kalmasın (yetim yazı) */
  if (mode === "chat"){
    const home = anchor();
    document.body.classList.toggle("avatar-away", Math.hypot(pos.x - home.x, pos.y - home.y) > 30);
  } else {
    document.body.classList.toggle("avatar-away", false);
  }
  drag.classList.toggle("no-anim", !animate);
  drag.style.setProperty("--x", pos.x.toFixed(1) + "px");
  drag.style.setProperty("--y", pos.y.toFixed(1) + "px");
  drag.style.setProperty("--s", (mode === "chat" ? DOCK / EMPTY : FREE_SCALE).toFixed(3));
  /* rAF DEĞİL: pencere gizliyken rAF hiç çalışmaz ve no-anim takılı kalır */
  if (!animate) setTimeout(() => drag.classList.remove("no-anim"), 0);
}

/* ölçüm uzlaşması (settle check): tek karelik rect'e güvenme. Panel-açılış /
   sidebar geçişi sırasında geometri 1-2 karede oturur; İKİ ölçüm bir
   animation-frame arayla aynıysa commit, değilse küçük üst sınıra kadar tekrar.
   skill/staging: kararlı karede karar kıl — panel-açılış/top-vs-middle yarışı
   burada ölür. Ölçülemezken (panel kapalı) sessizce vazgeç (önceki sonsuz
   50ms döngüsü yerine — hap penceresinde katman genişliği zaten 0'dır). */
const SETTLE_CAP = 10;    /* ~10 kare ≈ 170ms tavan; uzlaşma genelde 2-3 karede olur */
function stageBox(){
  const s = $("#stage");
  if (!s) return null;
  const r = s.getBoundingClientRect();
  return { l: r.left, t: r.top, w: r.width, h: r.height };
}
const sameBox = (a, b) =>
  !!a && !!b &&
  Math.abs(a.l - b.l) < 1 && Math.abs(a.t - b.t) < 1 &&
  Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
function whenSettled(fn, tries = 0){
  if (layerSize().w <= 40){
    if (tries > 40) return;
    setTimeout(() => whenSettled(fn, tries + 1), 50);
    return;
  }
  const a = stageBox();
  requestAnimationFrame(() => {
    if (sameBox(a, stageBox()) || tries >= SETTLE_CAP) fn();
    else whenSettled(fn, tries + 1);
  });
}

function readPos(){
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return { x: raw.x, y: raw.y };
  } catch {}
  return null;
}
function writePos(p){
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
}

export function refresh(animate = false){
  /* TÜM yerleşim olayları buradan geçer (setMode, resize, sidebar, setHasChat,
     panel-open, init) — uzlaşmalı ölçüm hepsine otomatik uygulanır */
  whenSettled(() => {
    /* kayıtlı konum SADECE docked modda; free her zaman ortalar */
    pos = clamp((mode === "chat" && custom) ? { ...custom } : anchor());
    /* clamp konumu değiştirdiyse (menü açıldı, sahne daraldı) kayıtlı konum da
       yeniden tabanlanır — sonraki yerleşim olayında eski koordinata dönülmez. */
    if (custom && (Math.abs(custom.x - pos.x) > .5 || Math.abs(custom.y - pos.y) > .5)){
      custom = { x: pos.x, y: pos.y };
      writePos(custom);
    }
    paint(animate);
  });
}

/* mod aynası: CSS (halka/disk/fill) + a11y, tek kaynaktan */
function syncModeAttrs(){
  if (!drag) return;
  drag.dataset.mode = mode;
  freeName?.classList.toggle("show", mode === "empty");   // ad yalnız boş durumda
  drag.tabIndex = -1;   // sabit ev: klavye odağı yok (taşınacak bir şey yok)
  drag.setAttribute("aria-label", LABEL_FREE);
}

export function setMode(next){
  /* FAZ 1/disiplinli ev: free SADECE boş durumda yaşar. has-chat'te avatar HER
     ZAMAN docked dairedir — overlay'in metin üstüne binme hatası bu kapıda ölür.
     skill/staging: tek-ev haritası — her yerleşim durumunda tek sabit dinlenme
     noktası, istisna yok. */
  if (next === "empty" && document.body.classList.contains("has-chat")) return;
  if (next === mode){
    /* aynı-mod tekrarı: yalnızca empty tazelenir (renderEmpty zaten empty'de).
       docked tekrarı dokunulmaz (onDelta her token'da setHasChat(true) çağırır). */
    if (next === "empty") refresh(false);
    return;
  }
  mode = next;
  syncModeAttrs();
  if (next === "chat") armDrowse();   // sohbete giriş okuma saatini başlatır (tek sefer)
  refresh(true);            // TEK koreografi: 320ms transform-only (hero + ikincil)
}

function resetPosition(){
  custom = null;
  try { localStorage.removeItem(POS_KEY); } catch {}
  pos = anchor();
  paint(true);
}

function bindDrag(){
  drag.addEventListener("pointerdown", (e) => {
    if (PINNED) return;             // sabit ev: taşıma yok
    if (mode !== "chat") return;   // free mod sürüklenemez (pointer-events:none yedeği)
    if (e.button !== 0) return;
    press = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    drag.classList.remove("settling");
    try { drag.setPointerCapture(e.pointerId); } catch {}
  });

  drag.addEventListener("pointermove", (e) => {
    if (!press) return;
    const dx = e.clientX - press.sx;
    const dy = e.clientY - press.sy;
    /* 6px eşik: kısa titreme sürükleme başlatmaz (tık ≠ drag) */
    if (!press.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!press.moved){
      press.moved = true;
      dragging = true;
      document.body.classList.add("avatar-dragging");   // halka animasyonları durur
    }
    pos = magnetize({ x: press.ox + dx, y: press.oy + dy });
    paint(false);
  });

  const end = (e) => {
    if (!press) return;
    const moved = press.moved;
    press = null;
    try { drag.releasePointerCapture(e.pointerId); } catch {}
    if (!moved) return;
    dragging = false;
    document.body.classList.remove("avatar-dragging");
    poke();   // sürükle-bırak = dostça dürtme (çift-tık reseti buraya girmez)
    /* mıknatıs: eve yakın bırakıldıysa oraya oturur, uzaktaysa bırakıldığı yerde kalır */
    const home = nearestSnap(pos, SNAP_COMMIT);
    if (home) pos = clamp(home);
    custom = { x: pos.x, y: pos.y };
    writePos(custom);
    paint(!!home);                                      // eve oturduysa 320ms yumuşak geçiş
    drag.classList.add("settling");                     // 120ms .97 → 1
    setTimeout(() => drag.classList.remove("settling"), 140);
  };
  drag.addEventListener("pointerup", end);
  drag.addEventListener("pointercancel", end);

  drag.addEventListener("dblclick", () => { if (mode === "chat") resetPosition(); });
  drag.addEventListener("keydown", (e) => {
    if (mode !== "chat") return;
    if (e.key === "Enter" || e.key === " "){ e.preventDefault(); resetPosition(); }
  });

  window.addEventListener("resize", () => refresh(false));
}

/* FAZ 1 scroll-jest: has-chat'te docked→free GENİŞLEMESİ YOK (metin üstüne
   binme yasağı). Yukarı-jest en üstte TEK-SEFERLİK merak bakışına (peek, Faz 2)
   dönüşür — mod değişimi değil. Boş-durum jesti aynen: aşağı = dock.
   Birikim + yön kilidi (flap guard) değişmedi.
   Bu kod scroll ÖZELLİĞİNE YAZMAZ — sadece okur (typewriter pinlemesi
   js/typewriter.js'te dokunulmadan durur; transform-only boya sürer). */
const TOP_PX = 2;          /* en üst eşiği: sub-piksel esneme payı (skill: jest toleransı) */
let wheelAcc = 0;
let wheelT = 0;
let wheelLock = false;

/* ── C) AMBIENT (FAZ 2: living presence) ───────────────────────────────
   Olay→animasyon katmanı: bundle'daki MEVCUT animasyonlar bağlamsal çalınır.
   Sert sosyal limitler:
   - SOĞUMA: iki ambient davranış arası ≥6sn (skill/ambient-continuous: seyrek
     arka-plan yaşamı; 1/3 kuralı — tek avatar, tek hareket).
   - ÖNCELİK: ambient servis durumunu (working/thinking/…/error) ASLA bölmez;
     ambient kendini yarıda kesmez (dönüş sayaçları tekil, servis galip).
   - GEÇİŞLER bundle'ın kendi ~500ms expression geçişlerine emanet — üstte JS
     crossfade YOK.
   Zaman sabitleri: PEEK_HOLD 2.5sn (skill/micro-story kurulum→çözüm),
   SETTLE_MS 5sn (skill/state-feedback üst bandı — reaksiyon okunur, takılmaz),
   DROWSE_MS 25sn (skill/ambient: uyku-90sn'den önce tek düşük-öncelikli bakış). */
const AMBIENT_COOLDOWN = 6000;
const PEEK_HOLD = 2500;
const SETTLE_MS = 5000;
const DROWSE_MS = 25000;
/* servis sahnesi: ambient bölemez (waking geçici kapı + hata ailesi dahil) */
const BUSY = new Set(["thinking", "searching", "working", "waking", "surprised", "sad"]);
/* calm'e dönecek karakter reaksiyonları (happy/laughing/celebrate gap'i burada kapanır) */
const REACT = new Set(["happy", "laughing", "celebrate", "curious", "excited",
  "playful", "proud", "shy", "bored", "suspicious", "confused", "scared", "angry"]);

let lastAmbientAt = 0;
const ambientCool = () => performance.now() - lastAmbientAt >= AMBIENT_COOLDOWN;
const noteAmbient = () => { lastAmbientAt = performance.now(); };

/* tek bekleyen calm-dönüşü: her yeni play() eskisini iptal eder (çift sayaç yok) */
let settleTimer = 0;
function settleCalm(ms){
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = 0;
    /* uyku ya da araya giren servis kazanır — ambient kendini dayatmaz */
    if (state === "sleeping" || BUSY.has(state)) return;
    noteAmbient();
    play("idle");
  }, ms);
}

/* okuma uykusu: sohbette 25sn girdi+akış yoksa tek drowsy bakışı; 90sn uykusu
   aynen devralır. Servis/soğuma o anda kazanırsa bu tur atlanır (ısrar yok). */
let drowseTimer = 0;
function armDrowse(){
  clearTimeout(drowseTimer); drowseTimer = 0;
  if (!document.body.classList.contains("has-chat")) return;  // boş durumda okuma yok
  drowseTimer = setTimeout(() => {
    drowseTimer = 0;
    if (state === "sleeping" || state === "waking") return;
    if (BUSY.has(state) || !ambientCool()) return;
    noteAmbient();
    play("drowsy");
  }, DROWSE_MS);
}

/* pet-to-warm (desktop-pet pratiği): art arda dostça dürtmeler tek jestte
   gruplanır, sevgi büyür. 1. dürtme = mevcut davranış (yalnızca settle);
   2. = playful; 3.+ = excited (tavan — pencere sıfırlanır, spam yok).
   skill/micro-feedback: 10sn kayar pencere ayrı dokunuşları tek jeste bağlar.
   Kural 3+5 bekçisi: uyku/servis/soğuma o anda kazanırsa pencere kırılır. */
const POKE_WINDOW = 10000;
let pokeCount = 0;
let lastPokeAt = 0;
function poke(){
  const now = performance.now();
  pokeCount = (now - lastPokeAt <= POKE_WINDOW) ? pokeCount + 1 : 1;
  lastPokeAt = now;
  if (state === "sleeping" || BUSY.has(state) || !ambientCool()){ pokeCount = 0; return; }
  if (pokeCount === 2){ noteAmbient(); play("playful"); }          // dönüş play() içinden (REACT)
  else if (pokeCount >= 3){ noteAmbient(); play("excited"); pokeCount = 0; lastPokeAt = 0; }
}

/* ── mikro-not balonu (Faz 3-revisit: NotchNook/Dynamic Island + Baymard kısıtı)
   Ayrılmış bölge: docked halkanın SOLU — sohbet alt dolgu bandı (body.has-chat'te
   .chat padding-bottom:76px; metin bu banda giremez). Halka en sağda durur;
   aradaki şerit ölçülür, uymuyorsa GÖSTERİLMEZ (doğru SKIP).
   Neden halkanın ÜSTÜ değil: halka üstü bandın yalnız ~8px'i boştur; üst yerleşim
   metne binerdi (DOCK=58/GAP=10/padding=76 geometrisi). Sol şerit aynı bandın
   gerçek boşluğudur — Kural 1'in ölçülü hali.
   Tetik SADECE: hata-düzeldi + session-ilk-yanıt (Clippy dersi: anahtar-tetik yok,
   akış-sırası mesaj yok). Kapak ≤1/30sn; akışta asla; ~2.5sn görünür; tıklama/Esc
   kapatır. Geçiş transform/opacity; reduced-motion = fade. */
const NOTE_COOLDOWN = 30000;  /* sert kapak (skill: proaktif akışlar batch'lenir, damlatılmaz) */
const NOTE_SHOW_MS = 2500;    /* görünürlük (skill/micro-story kurulum→çözüm — PEEK_HOLD ritmi) */
const NOTE_MIN_W = 110;       /* bu genişliğin altı = yer yok, gösterme */
let noteEl = null;
let noteTimer = 0;
let lastNoteAt = 0;

function measureNoteSlot(){
  const L = layerSize();
  const s = $("#stage").getBoundingClientRect();
  const c = $("#composer").getBoundingClientRect();
  if (!L.w || !s.width || !c.width) return null;
  const r = DOCK / 2;
  const edge = (pos.x - r) - 8;                 // balon sağ kenarı: halka solundan 8px
  const maxW = edge - ((s.left - L.left) + 8);  // stage solundan 8px pay
  const cy = pos.y;
  if (maxW < NOTE_MIN_W) return null;
  /* dikey bant: balon (~28px) dolgu bandında kalmalı */
  if (cy - 18 < (s.top - L.top) || cy + 18 > (c.top - L.top)) return null;
  return { x: edge, y: cy, maxW };
}

function noteEsc(e){
  if (e.key === "Escape"){ e.stopPropagation(); hideNote(); }  // capture: panel-Esc'inden önce
}
function hideNote(){
  clearTimeout(noteTimer); noteTimer = 0;
  document.removeEventListener("keydown", noteEsc, true);
  noteEl?.classList.remove("show");
}

export function note(text){
  if (!text || !drag || !layer) return;
  if (!document.body.classList.contains("open")) return;      // kapalı panelde hayalet yok
  if (mode !== "chat" || !document.body.classList.contains("has-chat")) return;
  if (state === "sleeping" || BUSY.has(state)) return;        // akışta asla (Kural 3)
  const now = performance.now();
  if (now - lastNoteAt < NOTE_COOLDOWN || !ambientCool()) return;
  const slot = measureNoteSlot();
  if (!slot) return;   // yer yok = gösterme; kota/bütçe HARcanmaz (sonra tekrar denenebilir)
  if (!noteEl){
    noteEl = document.createElement("div");
    noteEl.className = "avatar-note";
    noteEl.setAttribute("role", "status");
    noteEl.addEventListener("click", hideNote);
    layer.appendChild(noteEl);   // katman pointer-events:none; .show bunun istisnası (CSS)
  }
  noteEl.textContent = text;
  noteEl.style.setProperty("--nx", slot.x.toFixed(1) + "px");
  noteEl.style.setProperty("--ny", slot.y.toFixed(1) + "px");
  noteEl.style.maxWidth = Math.floor(slot.maxW) + "px";
  /* aynı karede sınıf basmak geçişi yutar — bir kare bekle (skill: entrance görünür olur) */
  requestAnimationFrame(() => noteEl?.classList.add("show"));
  clearTimeout(noteTimer);
  noteTimer = setTimeout(hideNote, NOTE_SHOW_MS);
  document.addEventListener("keydown", noteEsc, true);
  noteAmbient(); lastNoteAt = now;   // tek soğuma haritasına işlenir (Kural 5)
}

/* en-üst merak bakışı (Faz 1 jesti buraya bağlanır): soğuma + servis bekçisi,
   2.5sn sonra calm — araya servis girerse dönüş zaten iptal (play bekçisi). */
function peek(){
  if (state === "sleeping" || BUSY.has(state) || !ambientCool()) return;
  noteAmbient();
  play("curious");
  settleCalm(PEEK_HOLD);
}

function bindScrollGesture(){
  const stage = $("#stage");
  const chatEl = $("#chat");
  if (!stage) return;
  stage.addEventListener("wheel", (e) => {
    const now = performance.now();
    if (now - wheelT > WHEEL_WINDOW){ wheelAcc = 0; wheelLock = false; }  // dinlenme = sıfırla
    wheelT = now;
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (wheelLock){                                   // flap kilidi: sayaç sönene kadar bekle
      if (Math.abs(wheelAcc) < WHEEL_REST){ wheelAcc = 0; wheelLock = false; }
      return;
    }
    const hasChat = document.body.classList.contains("has-chat");
    if (wheelAcc >= WHEEL_PX && mode === "empty"){ setMode("chat"); wheelLock = true; }
    else if (wheelAcc <= -WHEEL_PX && mode === "chat" && !hasChat){
      setMode("empty"); wheelLock = true;
    }
    else if (wheelAcc <= -WHEEL_PX && mode === "chat" && hasChat &&
             (!chatEl || chatEl.scrollTop <= TOP_PX)){
      peek(); wheelLock = true;   // mod değişimi YOK — tek bakış, yerde kalır
    }
  }, { passive: true });
}

export function initLayer(){
  layer = $("#avatarLayer");
  drag = $("#avatarDrag");
  freeName = $("#freeName");
  if (!layer || !drag) return;
  /* PINNED: kayıtlı sürükleme konumu yok sayılır — eski sürümden kalan koordinat
     karakteri ortada bırakmasın (5. ekran görüntüsündeki kayma). */
  custom = PINNED ? null : readPos();
  bindDrag();
  bindScrollGesture();
  watchStage();      /* sidebar açık/kapalı + her geometri değişimi → çapa taze */
  syncModeAttrs();   // ilk boya: free etiketi + data-mode (JS öncesi flaş olmasın)
  /* ilk yerleştirme: refresh() içindeki uzlaşmalı ölçüm panel-açılış
     geometrisini bekler — tek seferlik whenLaidOut yarışı yok */
  refresh(false);
}

/* ── B) DURUM MAKİNESİ ─────────────────────────────────────────────── */

/* skill/stability: çapa SADECE ölçüldüğü geometri kadar doğrudur.
   #stage'in kutusu değiştiği AN yeniden çapa alınır — sidebar açılış VE
   kapanış (eski kod yalnızca açılışta refresh çağırıyordu; kapanışta avatar
   WIDE-layout çapasında bayat kalıyordu → 2. resim hatası), panel-açılış,
   pencere resize: hepsi tek kanaldan. Transform-only repaint, ucuz. */
function watchStage(){
  const stage = $("#stage");
  if (!stage || typeof ResizeObserver !== "function") return;
  let raf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    /* aynı karede çoklu fire = tek repaint (batching, reflow fırtınası yok) */
    raf = requestAnimationFrame(() => refresh(false));
  }).observe(stage);
}

function setRing(name){
  if (!drag) return;
  drag.dataset.ring = RING[name] || "idle";
}

export function play(name){
  /* en taze durum kazanır: bekleyen calm-dönüşü iptal (çift sayaç yok) */
  clearTimeout(settleTimer); settleTimer = 0;
  /* servis sahneyi alır: bekleyen okuma-uğultusu (drowse) düşer, açık not kapanır */
  if (BUSY.has(name)){ clearTimeout(drowseTimer); drowseTimer = 0; hideNote(); }
  state = name;
  try { ctl?.play(name); } catch {}
  setRing(name);
  /* karakter reaksiyonu takılı kalmaz: 5sn sonra calm (daha taze durum yoksa) */
  if (REACT.has(name)) settleCalm(SETTLE_MS);
  /* calm'e dönüş okuma saatini sıfırlar (drowse 25sn'i buradan sayar) */
  if (name === "idle") armDrowse();
}

export function stateOf(){ return state; }

export function consumeErrorFlag(){
  const v = hadError;
  hadError = false;
  return v;
}

export function setIdleHandler(fn){ onIdle = fn; }

function armIdle(){
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => onIdle?.(), IDLE_MS);
}

export function keepAlive(){ armIdle(); }

/* yazarken: sleeping → waking (2.3sn) → listening; akış boyunca taze kalır.
   Girdi = uyanıklık: okuma-uğultusu (drowse) saati SIFIRLANIR — drowse yalnızca
   girdisiz + akışsız 25sn'nin sonunda çalar. */
export function pokeActivity(wakeAnim = "listening"){
  clearTimeout(idleTimer);
  if (state === "sleeping"){
    play("waking");
    setTimeout(() => { if (state === "waking") play(wakeAnim); }, WAKE_MS);
  } else if (state !== "thinking" && state !== wakeAnim){
    play(wakeAnim);
  }
  armIdle();
  armDrowse();
}

/* beklenmedik hata: şok → 2.6sn sonra üzgün */
export function markSad(){
  hadError = true;
  play("surprised");
  clearTimeout(sadTimer);
  sadTimer = setTimeout(() => { if (state === "surprised") play("sad"); }, 2600);
}

export function pickBusyAnim(text){
  if (SEARCH_RX.test(text)) return { text: "arıyor…", anim: "searching" };
  if (CODE_RX.test(text)) return { text: "inceliyor…", anim: "working" };
  return { text: "düşünüyor…", anim: "thinking" };
}

/* bundle + tanım: ilk paint'i bekletmesin */
async function loadAvatar(){
  const { createAvatar } = await import("../vendor/avatar-web.bundle.js");
  const definition = await (await fetch("./assets/orion.avatar.json", { cache: "no-store" })).json();
  ctl = createAvatar($("#avatar"), {
    defaultAnimation: "idle",
    autoplay: true,
    size: "96px",
    ariaLabel: "Orion",
    definition,
  });
  armIdle();
}

export function deferAvatar(){
  const start = () => loadAvatar().catch((err) => console.warn("[avatar]", err.message));
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(start, { timeout: 900 });
  else setTimeout(start, 200);
}
