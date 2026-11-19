/* typewriter.js — renderer-side presentation queue: gelen delta akışını
   İNSAN KADANSINDA görünür kılar. Akışı asla throttlamaz/tutmaz — yalnızca
   neyin NE ZAMAN görüneceğini paceler (buffer → paylaşımlı rAF döngüsü).

   PACING İLKELERİ (motion-design skill + brief §2):
     BASE_CPS 75 — "human-shaped cadence": 60–90 bandının ortası; jet hızında
       dump ile tek-tek harf saydırma arası, takip edilebilir konuşma akışı.
     BATCH_MS 100 — tek paylaşımlı rAF döngüsü, 10Hz kuanta: tüm tüketim
       toplu yapılır; harf başına setTimeout/reflow fırtınası YOK.
     BACKLOG3 240 — ~3 satır (~80 sütun): urgency eşiği; geride kalınca
       boşaltma 1x→4x rampasıyla hızlanır (okunabilirlik tavanı 4x).
     8sn kuralı — rate = max(rate, backlog/8): toplam yazım ~0.8–8sn bandında;
       uzun cevapta asla fena halde geride kalmaz.
     LONG_AT 4000 — tane boyutu (grain) ilkesi: bunun üstü harf-tanesiyle
       gürültü olur → satır-satır reveal'a geçilir (ilerleme hâlâ pürüzsüz).
     PIN_PX 28 — yapışma toleransı: alt-kenara bu kadar yakınsa "dipte" sayılır;
       kullanıcı yukarı kaydırdıysa yazım asla scroll çalmaz.
     transform/filter-only — bu modül layout özelliği yazmaz: metin düğümü
       ekler, prose'u toplu innerHTML'ler; .msg'in kendisi hep AYNI düğüm.

   Kod blokları: kabuk md.js'ten (codeBlockShell — tek kaynak), içerik ham
   metin düğümleriyle pre'nin İÇİNE akar (md.js zaten escape'li; text node'a
   escape gerekmez). Kapanmamış fence düz metindir; kapanış fence'i GELDİĞİ
   AN yükselir (alıcı tarafında — reveal'ı beklemez), aynı pre yaşamaya devam
   eder: sıçrama (jump) yok, çerçeve başına yeniden parse yok.

   reduced-motion: kuyruk YOK — her feed tam metni anında renderlar. */
"use strict";
import { renderMarkdown, scanFences, codeBlockShell } from "./md.js";
import { scrollEnd } from "./dom.js";

const BASE_CPS = 75;    // baz boşaltma: ~60–90/sn bandı
const BATCH_MS = 100;   // paylaşımlı döngü kuantası
const BACKLOG3 = 240;   // ~3 satır: urgency eşiği (karakter)
const MULT_MAX = 4;     // okunabilirlik tavanı
const LONG_AT = 4000;   // satır-reveal'a geçiş eşiği (ham karakter)
const PIN_PX = 28;      // dipte-sayılma toleransı

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const live = new Set();   // aktif handle'lar — TEK rAF hepsini sürer
let rafId = 0;

function norm(s){ return String(s ?? "").replace(/\r\n?/g, "\n"); }

/* ham akış satırlarından bölgeler: prose dilimleri + fence aralıklı kod.
   Bölge anahtarları kararlıdır (prose başlangıç satırı / fence açılış satırı);
   akışa ekleme öncekilerin anahtarını oynatmaz → mühürlü DOM'a dokunulmaz. */
function computeRegions(raw){
  const nstr = norm(raw);
  const lines = nstr.split("\n");
  /* satır başı ofsetleri — canlı dilim KARAKTER-kesin kesilir (B1 dersi:
     satır-bazlı kesim tek satırlık yanıtı ilk çerçevede bütünüyle açıyordu) */
  const off = [0];
  lines.forEach((ln) => off.push(off[off.length - 1] + ln.length + 1));
  const regs = [];
  let li = 0;
  for (const f of scanFences(raw)){
    if (f.open > li) regs.push({ key: "p" + li, kind: "prose", a: li, b: f.open });
    const closed = f.close >= 0;
    regs.push({
      key: "c" + f.open, kind: "code", a: f.open + 1,
      b: closed ? f.close : lines.length, lang: f.lang, closed,
      fence: closed ? lines.slice(f.open, f.close + 1).join("\n") : null,
    });
    li = closed ? f.close + 1 : lines.length;
  }
  if (li < lines.length) regs.push({ key: "p" + li, kind: "prose", a: li, b: lines.length });
  return { nstr, lines, off, regs };
}

/* canlı dilim: [a,b) satır aralığının görünen karakter kadar önek'i.
   Kod gövdesinde sondaki tek \n kırpılır — mühür/kanonik metinle birebir,
   finalize'da satır zıplaması olmaz. Önek-büyüme korunur (ekleme yönü tek). */
function liveSlice(nstr, off, a, b, shown, stripNl){
  const end = Math.min(off[b] !== undefined ? off[b] : nstr.length, nstr.length, Math.floor(shown));
  const s = Math.min(off[a] !== undefined ? off[a] : nstr.length, end);
  let out = nstr.slice(s, end);
  if (stripNl && out.endsWith("\n")) out = out.slice(0, -1);
  return out;
}

/* görünen karakter sayısından görünen satır adedi (L): son satır kısmi olabilir.
   vis "\n" ile bitiyorsa fazladan boş satır sayılmaz. */
function visibleLines(raw, shown){
  const vis = norm(raw).slice(0, Math.floor(shown));
  if (!vis) return 0;
  const n = vis.split("\n").length;
  return vis.endsWith("\n") ? n - 1 : n;
}

function isPinned(sc){
  return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= PIN_PX;
}

function renderSlice(slice){
  const tmp = document.createElement("div");
  renderMarkdown(tmp, slice);
  return [...tmp.childNodes];
}

/* ── handle ── */
function makeHandle(msg, sc){
  return {
    msg, sc, raw: "", shown: 0, finishing: false, done: false,
    lineMode: false, lastBatch: 0,
    states: new Map(),   // key → { nodes[], sealed, code?, revealed }
    liveKey: null, liveNodes: [], liveSlice: null,
  };
}

function dropHandle(h){
  live.delete(h);
  h.done = true;
  if (!live.size && rafId){ cancelAnimationFrame(rafId); rafId = 0; }
}

function kick(){
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function tick(now){
  rafId = 0;
  for (const h of [...live]) drain(h, now);
  /* boşta spin YOK: kuyruğu olan veya kapanışı bekleyen varsa devam */
  for (const h of live){
    if (!h.done && (h.finishing || h.raw.length > h.shown)){
      rafId = requestAnimationFrame(tick);
      break;
    }
  }
}

/* anında tam render (reduced-motion + flush + finalize normalizasyonu):
   tek renderMarkdown → md.js kanonik DOM'u, piksel-birebir. */
function renderFull(h){
  renderMarkdown(h.msg, h.raw);
  h.states.clear();
  h.liveKey = null; h.liveNodes = []; h.liveSlice = null;
}

/* mühürlü bölge düğümlerini canlı düğümlerin ÖNÜNE ekler (sıra korunur) */
function appendSealed(h, nodes){
  const ref = h.liveNodes.length ? h.liveNodes[0] : null;
  for (const n of nodes){
    if (ref && ref.isConnected) h.msg.insertBefore(n, ref);
    else h.msg.appendChild(n);
  }
}

function sealRegion(h, lines, r){
  const st = { nodes: [], sealed: true };
  if (r.kind === "prose"){
    st.nodes = renderSlice(lines.slice(r.a, r.b).join("\n"));
  } else if (r.closed){
    const { box, code } = codeBlockShell(r.lang);
    code.textContent = lines.slice(r.a, r.b).join("\n");
    st.nodes = [box];
    st.code = code; st.revealed = code.textContent.length;
  } else {
    /* akış kapanmamış fence ile bittiyse (finish): md.js yorumu kanoniktir */
    st.nodes = renderSlice(lines.slice(r.a - 1).join("\n"));
  }
  appendSealed(h, st.nodes);
  h.states.set(r.key, st);
}

/* canlı düğüm grubunu yenisiyle değiştirir (tek DOM op; grup genelde büyür) */
function replaceLive(h, nodes){
  if (!h.liveNodes.length){
    for (const n of nodes) h.msg.appendChild(n);
  } else if (!nodes.length){
    for (const n of h.liveNodes) n.remove();
  } else {
    h.liveNodes[0].replaceWith(...nodes);
    for (let i = 1; i < h.liveNodes.length; i++) h.liveNodes[i].remove();
  }
  h.liveNodes = nodes;
}

function clearLive(h){
  for (const n of h.liveNodes) n.remove();
  h.liveNodes = []; h.liveKey = null; h.liveSlice = null;
}

/* kod bölgesi canlı güncellemesi: aynı pre yaşar, yalnızca delta metin
   düğümü eklenir (güvenli: text node'a escape gerekmez). */
function updateLiveCode(h, nstr, off, r){
  let st = h.states.get(r.key);
  const body = liveSlice(nstr, off, r.a, r.b, h.shown, true);
  if (!st){
    if (r.closed){
      const { box, code } = codeBlockShell(r.lang);
      st = { nodes: [box], sealed: false, code, revealed: 0 };
    } else {
      const div = document.createElement("div");
      div.className = "md-p";
      st = { nodes: [div], sealed: false, code: null, revealed: 0 };
    }
    h.states.set(r.key, st);
    appendSealed(h, st.nodes);
  } else if (r.closed && !st.code){
    /* YÜKSELTME: kapanış fence'i geldi — düz metin → tam blok. Aynı metin +
       başlık; pre bundan sonra final pre'dir, içine akmaya devam eder. */
    const { box, code } = codeBlockShell(r.lang);
    const idx = st.nodes[0] && st.nodes[0].isConnected
      ? [...h.msg.childNodes].indexOf(st.nodes[0]) : -1;
    st.nodes[0]?.remove();
    code.textContent = body;
    st.nodes = [box]; st.code = code; st.revealed = body.length;
    if (idx >= 0 && h.msg.childNodes[idx]) h.msg.insertBefore(box, h.msg.childNodes[idx]);
    else appendSealed(h, [box]);
    return;
  }
  if (st.code){
    if (body.length > st.revealed){
      st.code.appendChild(document.createTextNode(body.slice(st.revealed)));
      st.revealed = body.length;
    } else if (body.length < st.revealed){
      st.code.textContent = body;
      st.revealed = body.length;
    }
  } else {
    st.nodes[0].textContent = body;   // kapanmamış fence: düz metin
    st.revealed = body.length;
  }
}

function reconcile(h){
  const { nstr, lines, off, regs } = computeRegions(h.raw);
  const L = visibleLines(h.raw, h.shown);
  const lastIdx = regs.length - 1;

  /* sınır anahtarı: L'yi içeren bölge (yoksa — hepsi görünen — son bölge) */
  let boundIdx = regs.findIndex((r) => r.a < L && L <= r.b);
  if (boundIdx < 0) boundIdx = lastIdx;

  regs.forEach((r, i) => {
    const fully = r.b <= L;
    const key = r.key;
    if (fully && i < regs.length - 1 && !h.states.get(key)?.sealed){
      /* mühürle: bu bölge bitti, bir daha dokunulmaz */
      if (h.liveKey === key) clearLive(h);
      sealRegion(h, lines, r);
      return;
    }
    /* STABILITY (mühürlü bölge = kanonik DOM; solid-drawing ilkesi):
       Mühürlü bölge canlı döngüye ASLA alınmaz. L tam bölge sınırında
       kalınca (ör. kapanış fence'i hâlâ yazılıyorken L === r.b) findIndex
       mühürlü bölgeyi boundIdx olarak döndürür; canlı dalına düşseydik
       clearLive önce CANLI komşuyu (prose) siler, sonraki karede ise
       mühürlü düğümleri (kod bloğu akış ortasında KAYBOLURDU). Aynı yol
       mühürlü prose'i canlı dalda yeniden üretip çift görüntü yapardı. */
    if (h.states.get(key)?.sealed) return;
    if (i !== boundIdx){
      /* sınır dışı + mühürsüz (replace sonrası kalıntı): kaldır */
      const st = h.states.get(key);
      if (st && !st.sealed && key !== h.liveKey){ for (const n of st.nodes) n.remove(); h.states.delete(key); }
      return;
    }
    /* sınır bölgesi canlı */
    if (r.kind === "prose"){
      const slice = liveSlice(nstr, off, r.a, r.b, h.shown, false);
      if (h.liveKey !== key){ clearLive(h); h.liveKey = key; h.liveSlice = null; }
      if (slice !== h.liveSlice){
        h.liveSlice = slice;
        replaceLive(h, renderSlice(slice));
      }
    } else {
      if (h.liveKey !== key && !(h.states.get(key) && !h.states.get(key).sealed)){
        clearLive(h);
      }
      h.liveKey = key;
      h.liveNodes = h.states.get(key)?.nodes || h.liveNodes;
      updateLiveCode(h, nstr, off, r);
      h.liveNodes = h.states.get(key).nodes;
    }
  });

  /* kaybolan anahtarların kalıntıları (fence kapanınca şekil değişir) */
  for (const [key, st] of [...h.states]){
    if (!regs.some((r) => r.key === key) && !st.sealed){
      for (const n of st.nodes) n.remove();
      h.states.delete(key);
      if (h.liveKey === key){ h.liveNodes = []; h.liveKey = null; h.liveSlice = null; }
    }
  }
}

function finalize(h){
  /* kuyruk boşaldı: kalanı mühürle, sonra kanonik DOM'a normalize et
     (tek renderMarkdown — içerik birebir aynı, flaş yok). */
  const { lines, regs } = computeRegions(h.raw);
  clearLive(h);
  regs.forEach((r) => {
    if (!h.states.get(r.key)?.sealed) sealRegion(h, lines, r);
  });
  clearLive(h);
  for (const [, st] of h.states) for (const n of st.nodes) n.remove();
  h.states.clear();
  renderFull(h);
  dropHandle(h);
}

function drain(h, now){
  if (h.done) return;
  if (!h.msg.isConnected){ dropHandle(h); return; }   // düğüm gitti: yazma
  if (reduced()){ h.shown = h.raw.length; finalize(h); return; }

  const backlog = h.raw.length - h.shown;
  if (backlog <= 0){
    if (h.finishing) finalize(h);
    return;
  }
  if (now - h.lastBatch < BATCH_MS) return;
  const dt = Math.min(500, now - h.lastBatch);   // sekme dönüşü sıçramasın
  h.lastBatch = now;

  const pinned = isPinned(h.sc);
  if (!h.lineMode && h.raw.length > LONG_AT) h.lineMode = true;

  if (h.lineMode){
    /* satır tanesi: kalanı ~40 kuantaya böl (≤4sn), en az 1 satır */
    const all = norm(h.raw).split("\n");
    const doneLines = norm(h.raw).slice(0, Math.floor(h.shown)).split("\n").length - 1;
    const k = Math.max(1, Math.min(48, Math.ceil((all.length - doneLines) / 40)));
    const target = Math.min(all.length, doneLines + k);
    let off = 0;
    for (let i = 0; i < target; i++) off += all[i].length + 1;
    h.shown = Math.min(h.raw.length, off);
    if (h.raw.endsWith("\n") && target >= all.length - 1) h.shown = h.raw.length;
  } else {
    /* karakter tanesi: baz kadans + backlog'la rampa (2–4x) + 8sn tabanı */
    let mult = 1;
    if (backlog > BACKLOG3) mult = Math.min(MULT_MAX, 1 + backlog / BACKLOG3);
    const rate = Math.max(BASE_CPS * mult, backlog / 8);
    h.shown = Math.min(h.raw.length, h.shown + (rate * dt) / 1000);
  }

  reconcile(h);
  if (pinned) scrollEnd(h.sc);   // dipteyse takip et; değilse çalma

  if (h.shown >= h.raw.length && h.finishing) finalize(h);
}

/* ── dış API (app.js buradan sürer) ── */

export function start(msg, sc){
  const h = makeHandle(msg, sc);
  live.add(h);
  h.lastBatch = performance.now();
  if (isPinned(sc)) scrollEnd(sc);   // yeni gönderim dipteyse yeniden sabitle
  kick();
  return h;
}

/* akış parçası: ham metin birikir; görünür olanı döngü paceler.
   replace = sunucu baştan gönderdi → ortak önek korunur, kalan yeniden yazılır. */
export function feed(h, raw, replace){
  if (!h || h.done) return;
  const next = norm(raw);
  if (replace && next !== h.raw){
    let keep = 0;
    const old = norm(h.raw);
    const cap = Math.floor(h.shown);
    while (keep < cap && keep < next.length && old[keep] === next[keep]) keep++;
    h.raw = next;
    h.shown = keep;
    for (const [, st] of h.states) for (const n of st.nodes) n.remove();
    h.states.clear();
    clearLive(h);
  } else if (next.length < h.raw.length){
    /* bayraksız kısalma (beklenmez): mühürlü DOM geride kalmasın diye sıfırla */
    h.raw = next;
    h.shown = Math.min(h.shown, next.length);
    for (const [, st] of h.states) for (const n of st.nodes) n.remove();
    h.states.clear();
    clearLive(h);
  } else {
    h.raw = next;
  }
  if (reduced()){
    h.shown = h.raw.length;
    if (h.msg.isConnected) renderFull(h);
    return;
  }
  kick();
}

/* akış bitti: kanonik final metin; kuyruk paceli boşalır, sonra normalize. */
export function finish(h, finalText){
  if (!h || h.done) return;
  const next = norm(finalText ?? h.raw);
  if (next !== h.raw){
    /* final kanoniktir: ortak öneği koru, farkı sessizce eşitle */
    let keep = 0;
    const old = norm(h.raw);
    const cap = Math.floor(h.shown);
    while (keep < cap && keep < next.length && old[keep] === next[keep]) keep++;
    h.raw = next;
    h.shown = Math.min(keep, next.length);
    if (h.msg.isConnected){
      for (const [, st] of h.states) for (const n of st.nodes) n.remove();
      h.states.clear();
      clearLive(h);
    }
  }
  h.finishing = true;
  if (reduced()){
    h.shown = h.raw.length;
    if (h.msg.isConnected) renderFull(h);
    dropHandle(h);
    return;
  }
  kick();
}

/* iptal/hata: döngü durur, kısmi metin aynen kalır (thoughtline'ı çağıran kapatır) */
export function abort(h){
  if (!h || h.done) return;
  dropHandle(h);
}

/* handle hâlâ yazıyor mu (app yarış guard'ı için) */
export function alive(h){ return !!h && !h.done; }

/*oturum geçişi / yeni sohbet: düğümler zaten gidiyor, tüm kuyrukları sustur */
export function abortAll(){
  for (const h of [...live]) dropHandle(h);
}

/* yeni gönderim: önceki turun kuyruğu anında tamamlanır (yarım metin kalmaz) */
export function flush(h){
  if (!h || h.done) return null;
  h.shown = h.raw.length;
  if (h.msg.isConnected) renderFull(h);
  dropHandle(h);
  return null;
}
