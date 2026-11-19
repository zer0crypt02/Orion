/* app.js — orkestrasyon: panel aç/kapa, sohbet akışı, geçmiş, gönderim,
   araçlar & ayarlar. Görsel katman [1] burada yönetilir; avatar [2] avatar.js'te. */
"use strict";
import { $, el, scrollEnd } from "./dom.js";
import { renderMarkdown, ALERT_ICON } from "./md.js";
import * as avatar from "./avatar.js";
import * as thought from "./thoughtline.js";
import * as tw from "./typewriter.js";
import { createSquishSwitch } from "./squishswitch.js";
import "./mark.js";                      // statik Orion markasını yerleştirir
import { confirmAction } from "./confirm.js";

const chat = $("#chat");
const input = $("#input");
const composer = $("#composer");

/* iki pencere: ?mode=pill yalnızca hap, ?mode=panel yalnızca panel.
   Hap penceresi avatar bundle'ını yüklemez (boşuna CPU). */
const WIN_MODE = new URLSearchParams(location.search).get("mode") || "single";

avatar.initLayer();
avatar.setIdleHandler(() => setStatus("hazır", { dot: "ok", anim: "sleeping" }));
if (WIN_MODE !== "pill") avatar.deferAvatar();

/* durum: applyPanel modül değerlendirmesi sırasında da çağrılabilir (pill penceresi),
   bu yüzden sayaçlar burada, kullanımdan ÖNCE tanımlanır (TDZ) */
let historyOpen = false;

/* ── panel ── */
function applyPanel(open){
  if (WIN_MODE === "pill") open = false;
  if (WIN_MODE === "panel") open = true;
  document.body.classList.toggle("open", open);
  document.body.classList.toggle("closed", !open);
  if (open){
    /* görünür olduktan sonra ölç: varsayılan konum composer'a göre hesaplanır */
    setTimeout(() => avatar.refresh(true), 30);
    if (WIN_MODE !== "pill") setTimeout(() => input.focus(), 260);
  } else {
    $("#settings").classList.remove("show");
    if (historyOpen) setHistory(false);   // hap penceresi panelin geometrisine dokunmasın
  }
}
$("#pill").addEventListener("click", () => window.notch.togglePanel());
$("#pill").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " "){ e.preventDefault(); window.notch.togglePanel(); }
});
$("#btnClose").addEventListener("click", () => window.notch.togglePanel());

function replayPanelIn(){
  const p = document.querySelector(".panel-ui");
  if (!p) return;
  p.style.animation = "none";
  void p.offsetWidth;
  p.style.animation = "";
}

window.notch.onPanelChanged(({ open }) => { applyPanel(open); if (open && WIN_MODE === "panel") replayPanelIn(); });
if (WIN_MODE === "single") window.notch.panelState().then(applyPanel);
else applyPanel(true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("open") && !$("#settings").classList.contains("show"))
    window.notch.togglePanel();
});

/* ── sohbet sahnesi ── */
function setHasChat(on){
  document.body.classList.toggle("has-chat", !!on);
  avatar.setMode(on ? "chat" : "empty");
}

function renderEmpty(){
  thought.abandon();   // sayaç sızmasın: satır DOM'la birlikte gider
  tw.abortAll();       // kuyruklar susturulur (düğümler zaten gidiyor)
  chat.textContent = "";
  welcomedSession = false;   // yeni session → ilk yanıt balonu yeniden aday
  setHasChat(false);
}

let tl = null;   // o turun ThoughtLine satırı (handle; tur başına bir satır)
let twH = null;  // o turun typewriter kuyruğu (aynı .msg'e yazar; tur başına bir handle)

function showError(text, withRetry, opts = {}){
  const m = el(`<div class="msg error">${ALERT_ICON}<span class="txt"></span></div>`);
  m.querySelector(".txt").textContent = text;
  if (withRetry){
    const b = el(`<button class="retry" type="button">Tekrar dene</button>`);
    b.addEventListener("click", () => { m.remove(); window.notch.connectGateway(currentCfg()); });
    m.appendChild(b);
  }
  /* bağlam dolduğunda "yeni sohbet = her şeyi unut" olmasın: özet taşıyan çıkış */
  if (opts.carry){
    const c = el(`<button class="retry carry" type="button">Özetleyip devam et</button>`);
    c.addEventListener("click", async () => {
      c.disabled = true;
      c.textContent = "Özetleniyor…";
      avatar.play("thinking");
      const r = await window.notch.sessionsCarry().catch(() => null);
      if (!r?.ok){
        c.disabled = false;
        c.textContent = "Özetleyip devam et";
        showError(r?.error || "Özet oluşturulamadı.", false);
        return;
      }
      m.remove();
      await refreshSessions();
      renderMessages([], r.memory);
      avatar.play("proud");
      setStatus("özet taşındı", { dot: "ok", anim: "proud" });
    });
    m.appendChild(c);
  }
  chat.appendChild(m);
  scrollEnd(chat);
}

function classifyError(raw, kind){
  const t = String(raw || "");
  if (kind === "auth") return { msg: "Anahtar geçersiz veya kredisi bitmiş. Ayarlar'dan kontrol et.", status: "anahtar hatası" };
  /* Zen ücretsiz modelleri API anahtarıyla çalışmıyor (429/403) — anahtar suçlu değil */
  if (kind === "zen_free_limit")
    return { msg: "Zen ücretsiz modelleri yalnızca OpenCode uygulamasında çalışıyor; API anahtarıyla reddediliyor. Ayarlar → Modeller'de Groq'a geç (araçlar da orada çalışır) ya da OpenCode Go'ya abone ol.", status: "zen ücretsiz mod kapalı" };
  if (kind === "zen_model_blocked")
    return { msg: "Zen bu modeli bu anahtar için reddetti (403). Ücretli bir model seç ya da Groq'a geç.", status: "zen modeli reddedildi" };
  if (kind === "context_length" || /context overflow|bağlam/i.test(t))
    return { msg: "Bağlam doldu. Sohbeti özetleyip yeni bir sohbete taşıyabilirsin — geçmiş silinmez.", status: "bağlam dolu" };
  if (/unreach|closed|refus|connection|ulaşılamadı|kapandı|reddedildi|bağlantı/i.test(t))
    return { msg: "Orion'a ulaşılamadı. Bağlantıyı ve ayarları kontrol edip tekrar dene.", status: "bağlantı yok" };
  return { msg: t || "Model hatası.", status: "model hatası" };
}

function setStatus(text, { dot = "", anim = "idle" } = {}){
  /* başlık kimlik satırı: durum metni + canlı nokta (sağlayıcı ayrı kalır) */
  const label = text.split("·")[0].trim() || "hazır";
  const st = $("#statusText");
  if (st) st.textContent = label;
  const hd = $("#headDot");
  if (hd) hd.className = `dot ${dot}`.trim();
  $("#pillStatus").textContent = label;
  $("#pillDot").className = `pill-dot ${dot}`;
  /* anim:null = salt metin (decoupled tepki yolu — avatar anında ayrıca çalınır) */
  if (anim === "sad") avatar.markSad();
  else if (anim) avatar.play(anim);
}

/* sağlayıcı etiketi: başlıkta "hazır · Groq" */
function paintProviderLabel(){
  const v = $("#provider")?.value || "groq";
  const el = $("#statusProvider");
  if (el) el.textContent = v === "zen" ? "Zen" : "Groq";
}
/* bento/ray tazelemesi: ayarlar ve sohbet durumu değiştiğinde tek sinyal */
const pingRail = () => document.dispatchEvent(new CustomEvent("orion:state"));

/* ── gateway olayları ── */
let gwConfigured = false;
/* OpenClaw İSTEĞE BAĞLI yedek. Hiç bağlanmadıysa "çevrimdışı" demek yanlış:
   kullanıcı Groq/Zen ile çalışırken paneli bozuk gösteriyordu. Bu bayrak
   yalnızca GERÇEK bir bağlantı kurulduğunda true olur; kopma ancak o zaman
   hata sayılır. */
let gwEverConnected = false;
window.notch.onGatewayStatus((s) => {
  if (s.state === "connected"){
    gwConfigured = true;
    gwEverConnected = true;
    $("#conn").classList.add("ok");
    $("#connText").textContent = `Bağlı · ${s.url}`;
    setStatus("Orion · hazır", { dot: "ok", anim: "idle" });
    loadModels();
  } else if (s.state === "disconnected"){
    const conn = $("#conn");
    conn?.classList.remove("ok");
    conn?.classList.remove("warn");
    if (gwEverConnected){
      /* gerçekten bağlıydı, koptu → bu bir hatadır */
      $("#connText").textContent = "Bağlantı kapandı";
      conn?.classList.add("warn");
      setStatus("çevrimdışı", { dot: "err", anim: "sad" });
    } else {
      /* hiç bağlanmamış: sessiz, isteğe bağlı not — durum "hazır" kalır */
      $("#connText").textContent = "OpenClaw bağlı değil — isteğe bağlı";
      setStatus("hazır", { dot: "ok", anim: null });
    }
  } else if (s.state === "challenging"){
    setStatus("el sıkışıyor…", { dot: "", anim: "thinking" });
  }
});

window.notch.onDelta(({ text, replace }) => {
  thought.noteToken(tl);   // 1. token → "Düşünüyor", 2. → "Yanıt yazıyor"
  setHasChat(true);
  let m = chat.querySelector(".msg.assistant[data-streaming]");
  if (!m){
    m = el(`<div class="msg assistant" data-streaming="1"></div>`);
    chat.appendChild(m);
  }
  /* aynı .msg'e yazılır (düğüm değişmez — flaş yok); handle başka mesaja
     aitse (dropBubble sonrası) eski kuyruk susturulup yenisi açılır */
  if (!tw.alive(twH) || twH.msg !== m){ if (twH) tw.abort(twH); twH = tw.start(m, chat); }
  const raw = replace ? text : (m.dataset.raw || "") + text;
  m.dataset.raw = raw;
  tw.feed(twH, raw, !!replace);   // scroll'u kuyruk pinler (dipteyse takip, değilse çalmaz)
  setStatus("yazıyor…", { dot: "ok", anim: "thinking" });
  avatar.keepAlive();
});

const THANKS_RX = /(sa[ğg]?ol|sağolun|teşekkür|tesekkur|eyvallah|harika|süper|super|ellerine sağlık|eline sağlık|bravo|mükemmel|mukemmel|cansın|kralsın|thank|awesome|great|perfect|amazing|brilliant|\bnice\b|well done)/i;
const LAUGH_RX = /(hahaha|hahah|hehe|hihi|kahkaha|komik|güldüm|guldum|😂|🤣|\blol\b)/i;
let pendingThanks = false;
let pendingLaugh = false;
let welcomedSession = false;   // session-ilk-yanıt balonu bir kez (avatar.note kota koyar)
let sentAt = 0;
let statusSeq = 0;
const MIN_BUSY_MS = 600;

function finalStatus(text){
  if (avatar.consumeErrorFlag()) { pendingThanks = pendingLaugh = false; return { text: "Orion 🎉", dot: "ok", anim: "celebrate" }; }
  if (pendingLaugh || /haha|hehe|hihi|😂|🤣/i.test(text || "")) { pendingLaugh = pendingThanks = false; return { text: "hahaha! 😂", dot: "ok", anim: "laughing" }; }
  if (pendingThanks) { pendingThanks = false; return { text: "rica ederim!", dot: "ok", anim: "happy" }; }
  return { text: "hazır", dot: "ok", anim: "idle" };
}

window.notch.onFinal(({ text }) => {
  let m = chat.querySelector(".msg.assistant[data-streaming]");
  if (!m && text){
    m = el(`<div class="msg assistant"></div>`);
    chat.appendChild(m);
  }
  if (m){
    if (!tw.alive(twH) || twH.msg !== m){ if (twH) tw.abort(twH); twH = tw.start(m, chat); }
    if (text) m.dataset.raw = text;
    /* final kanoniktir: kuyruk paceli boşalır, sonra md.js DOM'una normalize olur */
    tw.finish(twH, text || m.dataset.raw || "");
    m.removeAttribute("data-streaming");
  }
  const st = finalStatus(text);
  /* §5 DECOUPLED (skill: geri bildirim <100ms = anında his): avatar tepkisi finalin
     geldiği tick'te çalınır — MIN_BUSY_MS kapısının ARKASINDA beklemez. SADECE
     durum METNİ ThoughtLine disiplin penceresine uyar (kapı aynen durur). */
  avatar.play(st.anim);
  /* mikro-not (Kural 4: SADECE kullanıcı turu SONRASI, en fazla 2 an):
     hata-düzeldi → "Toparladık 🎉"; session-ilk-yanıt → "Buradayım.".
     note() kendi bekçilerini taşır (akış/meşgul/kota/yer) — akış sırasında
     çağrılmadığı için BUSY düşmesi burada gerekmez. */
  if (st.anim === "celebrate"){ welcomedSession = true; avatar.note("Toparladık 🎉"); }
  else if (!welcomedSession){ welcomedSession = true; avatar.note("Buradayım."); }
  const seq = statusSeq;
  const wait = Math.max(0, MIN_BUSY_MS - (Date.now() - sentAt));
  const applyText = () => { if (seq === statusSeq) setStatus(st.text, { dot: st.dot, anim: null }); };
  if (wait > 0){
    setStatus("yazıyor…", { dot: "ok", anim: null });   // metin disiplini sürer, avatar el değmez
    setTimeout(applyText, wait);
  } else applyText();
  const line = tl;   // MIN_BUSY beklemesi bitince BU turun satırı kapanır;
  const settleLine = () => { if (seq === statusSeq) thought.settle(line, true); };   // eski akış yeni satıra dokunamaz
  if (wait > 0) setTimeout(settleLine, wait); else settleLine();
  avatar.keepAlive();
  /* scroll yok: kuyruk dipteyse zaten pinler; yukarıdaysa çalınmaz */
});

window.notch.onChatError(({ message, detail, kind }) => {
  /* kuyruk ANINDA durur; kısmi metin aynen kalır, thoughtline'ı çağıran kapatır */
  if (twH){ tw.abort(twH); twH = null; }
  if (kind === "aborted"){ thought.discard(tl); return; }
  const c = classifyError(detail ? `${message} — ${detail}` : message, kind);
  showError(c.msg, true);
  /* §5: avatar tepkisi aynı tick'te, kuyruk/thoughtline sonrası BEKLEMEZ
     (bu yolda await/setTimeout yok — markSad senkron çalınır). */
  setStatus(c.status, { dot: "err", anim: "sad" });
  thought.settle(tl, false);
});

window.notch.onToolActivity?.(({ name, error }) => {
  if (error) return;
  setStatus(`araç: ${name}…`, { dot: "ok", anim: "thinking" });
});
window.notch.onDropBubble?.(() => {
  if (twH){ tw.abort(twH); twH = null; }   // düşen balonun kuyruğu ölür; sonraki delta yeniler
  chat.querySelector(".msg.assistant[data-streaming]")?.remove();
  thought.ensureWorking(tl);
});

/* ── geçmiş (sidebar) ── */
function setHistory(open){
  historyOpen = !!open;
  document.body.classList.toggle("history-open", historyOpen);
  window.notch.sidebarSet?.(historyOpen);
  setTimeout(() => avatar.refresh(false), 260);   // açık VE kapanış: çapa tazelensin
  if (historyOpen) setTimeout(() => $("#histList")?.querySelector(".hist-item.active")?.scrollIntoView({ block: "nearest" }), 300);
}

async function refreshSessions(){
  const box = $("#histList");
  if (!box) return;
  const res = await window.notch.sessionsList().catch(() => null);
  if (!res?.ok) return;
  box.textContent = "";
  if (!res.sessions.length){
    box.appendChild(el(`<div class="hist-empty">Henüz sohbet yok</div>`));
    return;
  }
  res.sessions.forEach((s) => {
    const row = el(`<div class="hist-item${s.id === res.activeId ? " active" : ""}" role="button" tabindex="0"></div>`);
    row.dataset.id = s.id;
    row.title = s.title || "Yeni sohbet";
    const t = el(`<span class="t"></span>`); t.textContent = s.title || "Yeni sohbet";
    const n = el(`<span class="n"></span>`); n.textContent = String(s.count >> 1);
    const x = el(`<button class="x" type="button" title="Bu sohbeti sil" aria-label="Bu sohbeti sil">×</button>`);
    x.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmAction({
        title: "Sohbet silinsin mi?",
        message: `“${s.title || "Yeni sohbet"}” kalıcı olarak silinir. Bu işlem geri alınamaz.`,
        confirmLabel: "Sil",
      });
      if (!ok) return;
      const r = await window.notch.sessionsDelete(s.id).catch(() => null);
      if (r?.ok){
        const cur = await window.notch.sessionsGet().catch(() => null);
        renderMessages(cur?.messages, cur?.memory);
        await refreshSessions();
      }
    });
    row.append(t, n, x);
    const open = async () => {
      const r = await window.notch.sessionsSwitch(s.id).catch(() => null);
      if (r?.ok) renderMessages(r.messages, r.memory);
      box.querySelectorAll(".hist-item").forEach((m) => m.classList.toggle("active", m.dataset.id === s.id));
      avatar.keepAlive();
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } });
    box.appendChild(row);
  });
}

/* önceki sohbetten taşınan özet — sessiz, tek blokluk not (silinebilir değil) */
function memoryNote(memory){
  const d = el(`<div class="memory-note"><b></b><p></p></div>`);
  d.querySelector("b").textContent = `Önceki sohbetten devam · ${memory.fromTitle || "sohbet"}`;
  d.querySelector("p").textContent = memory.summary || "";
  return d;
}

function renderMessages(messages, memory){
  thought.abandon();
  tw.abortAll();
  chat.textContent = "";
  const rows = (messages || []).filter((m) => m.role === "user" || m.role === "assistant");
  if (!rows.length){
    renderEmpty();
    if (memory) chat.appendChild(memoryNote(memory));
    return;
  }
  welcomedSession = false;   // session açılışı → ilk yanıt balonu aday
  setHasChat(true);
  if (memory) chat.appendChild(memoryNote(memory));
  rows.forEach((m) => {
    const d = el(`<div class="msg ${m.role === "user" ? "user" : "assistant"}"></div>`);
    d.dataset.raw = m.content || "";
    renderMarkdown(d, m.content || "");
    chat.appendChild(d);
  });
  scrollEnd(chat);
  pingRail();
}

async function newSession(title){
  const res = await window.notch.sessionsNew(title).catch(() => null);
  renderEmpty();
  pingRail();
  avatar.play("waking");
  setTimeout(() => { if (avatar.stateOf() === "waking") avatar.play("idle"); }, 2300);
  setStatus("yeni sohbet", { dot: "ok", anim: "idle" });
  await refreshSessions();
  return res;
}

$("#btnHistNew")?.addEventListener("click", () => newSession());
$("#btnHistory")?.addEventListener("click", () => setHistory(!historyOpen));

/* ── gönderim ── */
async function send(){
  const text = input.value.trim();
  if (!text) return;
  closeMention();
  /* @beceri: metinde geçen, dizinde bulunan ve açık olan beceriler.
     Tam metni main process yükler ve yalnızca bu mesaja ekler. */
  const pins = [...new Set(Array.from(text.matchAll(/@([a-z0-9][a-z0-9-]{0,60})/g))
    .map((m) => m[1])
    .filter((n) => skillsCache.some((s) => s.name === n && s.on)))];
  if (/^\/new(\s|$)/i.test(text)){
    input.value = "";
    await newSession(text.replace(/^\/new\s*/i, "").trim() || undefined);
    return;
  }
  input.value = "";
  setHasChat(true);
  /* gün ayırıcı yalnız CANLI oturumda: kayıtlı sohbete sahte tarih yazılmaz */
  if (!chat.querySelector(".day-sep")){
    const sep = el(`<div class="day-sep">Bugün</div>`);
    chat.prepend(sep);
  }
  const um = el(`<div class="msg user"></div>`);
  um.dataset.raw = text;
  renderMarkdown(um, text);
  chat.appendChild(um);
  avatar.keepAlive();
  const busy = avatar.pickBusyAnim(text);
  pendingThanks = THANKS_RX.test(text);
  pendingLaugh = LAUGH_RX.test(text);
  sentAt = Date.now();
  if (twH){ tw.flush(twH); twH = null; }   // önceki turun kuyruğu anında tamamlanır (yarım metin kalmaz)
  tl = thought.start(chat, sentAt);   // saat sıfırlanır, döngü baştan başlar
  statusSeq += 1;
  setStatus(busy.text, { dot: "ok", anim: busy.anim });

  const s = await window.notch.getSettings().catch(() => ({}));
  const useGroq = (s.provider || "groq") === "groq";
  const useZen = useGroq ? !!s.groqKey : !!(s.ocKey && s.ocModel);
  const res = useZen
    ? await window.notch.sendZenMessage(text, undefined, pins)
    : await window.notch.sendMessage(text);

  if (!res.ok){
    if (twH){ tw.abort(twH); twH = null; }   // kısmi metin kalır, kuyruk durur
    if (res.kind === "aborted"){ thought.discard(tl); return; }
    const c = classifyError(res.error, res.kind);
    const isContext = res.kind === "context_length" || c.status === "bağlam dolu";
    showError(c.msg, true, { carry: isContext });
    /* bağlam doldu: "şaşkın" — bundle'da vardı ama hiç bağlanmamıştı */
    setStatus(c.status, isContext ? { dot: "err", anim: "confused" } : { dot: "err", anim: "sad" });
    thought.settle(tl, false);
  }
}
composer.addEventListener("submit", (e) => { e.preventDefault(); send(); });
input.addEventListener("input", () => avatar.pokeActivity("listening"));
input.addEventListener("focus", () => avatar.pokeActivity("listening"));

/* çipler: input'u doldurur, odak verir */
document.querySelectorAll(".chip").forEach((ch) => {
  ch.addEventListener("click", () => {
    input.value = ch.dataset.text || "";
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    avatar.pokeActivity("listening");
  });
});

/* ── @beceri seçicisi (besteci) ─────────────────────────────
   "@" + harf yazılınca açık beceriler listelenir; seçim metne @ad olarak girer.
   Gönderimde o becerinin tam metni mesaja eklenir (main: zen:send → skills). */
let mentionItems = [];
let mentionIdx = 0;

function closeMention(){
  const box = $("#mention");
  if (box){ box.hidden = true; box.textContent = ""; }
  mentionItems = [];
}

function paintMention(items, active){
  const box = $("#mention");
  if (!box) return;
  box.textContent = "";
  items.forEach((s, i) => {
    const row = el(`<button class="mention-item" type="button" role="option"><b></b><span></span></button>`);
    row.querySelector("b").textContent = `@${s.name}`;
    row.querySelector("span").textContent = s.description || "";
    row.classList.toggle("active", i === active);
    row.setAttribute("aria-selected", i === active ? "true" : "false");
    row.addEventListener("mousedown", (e) => { e.preventDefault(); insertMention(s.name); });
    box.appendChild(row);
  });
  box.hidden = items.length === 0;
}

/* imlecin solundaki "@parça"yı bul */
function mentionQuery(){
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, pos);
  const m = /(^|\s)@([a-z0-9-]*)$/i.exec(before);
  return m ? { start: m.index + m[1].length, query: m[2].toLowerCase() } : null;
}

function refreshMention(){
  const q = mentionQuery();
  if (!q || !skillsCache.length){ closeMention(); return; }
  const items = skillsCache.filter((s) => s.on && s.name.startsWith(q.query)).slice(0, 6);
  mentionItems = items;
  mentionIdx = 0;
  paintMention(items, 0);
}

function insertMention(name){
  const q = mentionQuery();
  if (!q) return;
  const pos = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, q.start) + `@${name} ` + input.value.slice(pos);
  const caret = q.start + name.length + 2;
  input.setSelectionRange(caret, caret);
  closeMention();
  input.focus();
}

input.addEventListener("input", refreshMention);
input.addEventListener("keydown", (e) => {
  if (!mentionItems.length) return;
  if (e.key === "ArrowDown"){
    e.preventDefault();
    mentionIdx = (mentionIdx + 1) % mentionItems.length;
    paintMention(mentionItems, mentionIdx);
  } else if (e.key === "ArrowUp"){
    e.preventDefault();
    mentionIdx = (mentionIdx - 1 + mentionItems.length) % mentionItems.length;
    paintMention(mentionItems, mentionIdx);
  } else if (e.key === "Enter" || e.key === "Tab"){
    e.preventDefault();
    insertMention(mentionItems[mentionIdx].name);   // seçili olan; Enter mesajı göndermez
  } else if (e.key === "Escape"){
    e.preventDefault();
    closeMention();
  }
});
input.addEventListener("blur", () => setTimeout(closeMention, 120));

/* ── araçlar / beceriler ── */
/* Son flip zaman damgaları: refreshTools taze bir flip'i (< ~2sn) ezemez. */
const lastFlipAt = { tgContext7: 0, tgGraphify: 0, tgSkills: 0, skills: 0 };
const FLIP_GUARD_MS = 2000;
const freshFlip = (key) => Date.now() - (lastFlipAt[key] || 0) < FLIP_GUARD_MS;

/* Toggle flip'leri Kaydet beklenmeden kalıcı olur (debounce; tam alt-ağaç yollanır).
   apiKey BİLEREK yok: kasadaki anahtar boş/yok patch ile silinmesin. skills.on
   yalnızca dizin yüklüyken yollanır (boş harita kayıtlı becerileri silmesin). */
let persistT = 0;
function persistTogglePatch(){
  clearTimeout(persistT);
  persistT = setTimeout(() => {
    const cfg = currentCfg();
    const patch = {
      context7: { enabled: cfg.context7.enabled },
      graphify: cfg.graphify,
    };
    if (skillsCache.length) patch.skills = cfg.skills;
    window.notch.setSettings(patch).catch(() => {});
  }, 350);
}
function noteFlip(key){ lastFlipAt[key] = Date.now(); persistTogglePatch(); }

/* Üç araç düğmesi: SquishSwitch (Part 2). aria-checked kök butonda kalır —
   currentCfg/refreshTools seçicileri ve semantik aynen çalışır. */
const toolSwitches = {};
/* Boyut eski .toggle ile aynı (38×22) — yerleşim kaymaz. */
[["tgContext7", "Context7"], ["tgGraphify", "Graphify"], ["tgSkills", "Superpowers"]]
  .forEach(([id]) => {
    const root = document.getElementById(id);
    if (!root) return;
    toolSwitches[id] = createSquishSwitch(root, {
      width: 38, height: 22, radius: 11,
      onChange: () => noteFlip(id),
    });
  });
/* Harici ayna (refreshTools/test): sessiz set — onChange yok, yankı-persist yok. */
function paintToggle(id, on){
  toolSwitches[id]?.set(!!on);
}

let skillsCache = [];
function paintSkills(list){
  skillsCache = list || [];
  const box = $("#skillList");
  if (!box) return;
  box.textContent = "";
  if (!skillsCache.length){
    box.appendChild(el(`<div class="skill-empty">Beceri yok. Klasör seç ya da SKILL.md ekle.</div>`));
    return;
  }
  skillsCache.forEach((s) => {
    const row = el(`<div class="skill" role="checkbox" tabindex="0"><span class="box"></span><b></b><span class="desc"></span><span class="tok"></span></div>`);
    row.dataset.name = s.name;
    row.querySelector("b").textContent = s.name;
    const d = row.querySelector(".desc");
    d.textContent = s.description;
    d.title = s.description;
    row.querySelector(".tok").textContent = `~${s.estTokens}`;
    row.setAttribute("aria-checked", s.on ? "true" : "false");
    if (!s.on) row.classList.add("off");
    const toggle = () => {
      s.on = !s.on;
      row.classList.toggle("off", !s.on);
      row.setAttribute("aria-checked", s.on ? "true" : "false");
      paintToolsTokens();
      noteFlip("skills");   // satır flip'i de Kaydet beklemez
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); toggle(); } });
    box.appendChild(row);
  });
}
function paintToolsTokens(){
  const on = skillsCache.filter((s) => s.on);
  const idx = on.reduce((n, s) => n + Math.max(1, Math.ceil((s.name.length + s.description.length + 4) / 4)), 0);
  const pill = $("#toolsTokens");
  if (pill) pill.textContent = $("#tgSkills")?.getAttribute("aria-checked") === "true"
    ? `dizin ~${idx} token · ${on.length}/${skillsCache.length}`
    : "kapalı";
  const hint = $("#skillsHint");
  if (hint) hint.textContent = skillsCache.length
    ? `${skillsCache.length} beceri · ~${idx} token dizin`
    : "beceri dizini bulunamadı";
}

async function refreshTools(){
  const res = await window.notch.toolsStatus().catch(() => null);
  if (!res?.ok) return;
  const srv = (res.servers || [])[0];
  if (srv){
    if (!freshFlip("tgContext7")) paintToggle("tgContext7", srv.enabled);
    const st = $("#ctx7State");
    if (st){
      if (!srv.enabled){ st.textContent = srv.needsKey ? "anahtar yok" : "kapalı"; st.className = "tool-state"; }
      else if (srv.connected){ st.textContent = `bağlı · ${srv.tools.length} araç`; st.className = "tool-state ok"; }
      else { st.textContent = "bağlanamadı"; st.className = "tool-state warn"; }
    }
  }
  const gs = $("#graphState");
  if (gs){
    if (!res.graphify.enabled){ gs.textContent = "kapalı"; gs.className = "tool-state"; }
    else if (res.graphify.graphExists){ gs.textContent = "hazır"; gs.className = "tool-state ok"; }
    else { gs.textContent = "graf yok"; gs.className = "tool-state warn"; }
  }
  if (!freshFlip("tgGraphify")) paintToggle("tgGraphify", res.graphify.enabled);
  if (!freshFlip("tgSkills")) paintToggle("tgSkills", res.skills.master);
  if (!freshFlip("skills")) paintSkills(res.skills.list);
  paintToolsTokens();
  const dirHint = $("#skillsDir");
  const dirs = res.skills.dirs || (res.skills.dir ? [res.skills.dir] : []);
  if (dirHint){
    dirHint.textContent = dirs.length
      ? dirs.map(shortPath).join("\n")
      : "beceri dizini yok — klasör seç ya da SKILL.md ekle";
    dirHint.title = dirs.join("\n");
  }
  const srcPill = $("#skillsSources");
  if (srcPill) srcPill.textContent = dirs.length ? `${dirs.length} kaynak` : "";
  pingRail();
}

/* ── beceri yükleme ── */
/* ev dizini kısaltılır: /Users/x/.config/... → ~/.config/... */
function shortPath(p){
  return String(p).replace(/^\/Users\/[^/]+/, "~");
}

$("#btnSkillDir")?.addEventListener("click", async () => {
  const r = await window.notch.skillsPickDir().catch(() => null);
  if (!r?.ok) return;
  await refreshTools();   // kaynak EKLENİR; mevcut beceriler korunur
});

$("#btnSkillAdd")?.addEventListener("click", () => {
  const wrap = $("#skillImport");
  if (!wrap) return;
  wrap.hidden = !wrap.hidden;
  if (!wrap.hidden) $("#skillName")?.focus();
});

$("#btnSkillSave")?.addEventListener("click", async () => {
  const note = $("#skillNote");
  if (note) note.textContent = "ekleniyor…";
  const r = await window.notch.skillsImport(
    ($("#skillName")?.value || "").trim(),
    $("#skillText")?.value || "",
  ).catch(() => null);
  if (!r?.ok){
    if (note) note.textContent = `hata: ${r?.error || "bilinmiyor"}`;
    return;
  }
  if (note) note.textContent = `eklendi: @${r.name}`;
  if ($("#skillName")) $("#skillName").value = "";
  if ($("#skillText")) $("#skillText").value = "";
  const wrap = $("#skillImport");
  if (wrap) wrap.hidden = true;
  await refreshTools();
});

$("#btnCtx7Test")?.addEventListener("click", async () => {
  const note = $("#ctx7Note");
  if (note) note.textContent = "test ediliyor…";
  await window.notch.setSettings({ context7: { enabled: true, apiKey: $("#ctx7Key").value || null } }).catch(() => null);
  paintToggle("tgContext7", true);
  const res = await window.notch.toolsPing("context7").catch(() => null);
  if (note) note.textContent = res?.ok
    ? `bağlı · ${(res.tools || []).length} araç`
    : `hata: ${res?.error || "bilinmiyor"}`;
  await refreshTools();
});

/* ── ayarlar ── */
const currentCfg = () => ({
  gatewayUrl: $("#gw").value,
  token: $("#token").value,
  provider: $("#provider")?.value || "groq",
  context7: {
    enabled: $("#tgContext7")?.getAttribute("aria-checked") === "true",
    apiKey: $("#ctx7Key").value || null,
  },
  graphify: {
    enabled: $("#tgGraphify")?.getAttribute("aria-checked") === "true",
    graph: $("#graphPath").value || null,
  },
  skills: {
    enabled: $("#tgSkills")?.getAttribute("aria-checked") === "true",
    on: Object.fromEntries(skillsCache.map((s) => [s.name, s.on])),
  },
});

const OC_FREE_MODELS = [
  { id: "big-pickle", label: "Big Pickle (stealth, free)" },
  { id: "beam-free", label: "Beam (free)" },
  { id: "flint-40b-free", label: "Flint 40B (free)" },
  { id: "mimo-v2.6-flash-free", label: "MiMo V2.6 Flash (free)" },
  { id: "nemotron-3.5-super-vl-free", label: "Nemotron 3.5 Super VL (free)" },
  { id: "nemotron-3.5-lightning-free", label: "Nemotron 3.5 Lightning (free)" },
  { id: "jev-1.13-free", label: "Jev 1.13 (free)" },
  { id: "deepseek-v4.1-flash-free", label: "DeepSeek V4.1 Flash (free)" },
  { id: "glm-5.3-flash-free", label: "GLM 5.3 Flash (free)" },
];

const GROQ_FALLBACK = [
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (recommended)" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (tight daily quota)" },
];

function modelRow(m, tag, saved, first){
  const row = el(`<div class="model" data-id=""><span class="radio"></span><span><b></b></span><span class="tag"></span></div>`);
  row.dataset.id = m.id;
  row.querySelector("b").textContent = m.label || m.id;
  row.querySelector(".tag").textContent = tag;
  if (saved ? saved === m.id : first) row.classList.add("selected");
  return row;
}

function paintGroqModels(models, savedId){
  const list = $("#groqModels");
  if (!list) return;
  list.textContent = "";
  (models?.length ? models : GROQ_FALLBACK).forEach((m, i) => list.appendChild(modelRow(m, "groq", savedId, i === 0)));
}

let groqWarm = null;
async function loadGroqModels(force = false, savedId){
  const note = $("#groqNote");
  try {
    if (note) note.textContent = "yükleniyor…";
    const res = await window.notch.listGroqModels(force).catch(() => null);
    const models = res?.ok && res.models?.length ? res.models : GROQ_FALLBACK;
    const saved = savedId ?? (await window.notch.getSettings().catch(() => ({}))).groqModel;
    paintGroqModels(models, saved);
    if (note){
      if (res?.stale) note.textContent = `kayıtlı model listede yok (${res.stale}) — yeniden seç`;
      else if (res?.fallback) note.textContent = res.error ? `çevrimdışı liste (${res.error})` : "varsayılan liste";
      else if (res?.cached) note.textContent = "önbellekten (24s)";
      else note.textContent = `${models.length} model · canlı`;
    }
  } catch {
    paintGroqModels(GROQ_FALLBACK, savedId);
    if (note) note.textContent = "varsayılan liste";
  }
}
$("#btnGroqRefresh")?.addEventListener("click", async () => {
  const s = await window.notch.getSettings().catch(() => ({}));
  await loadGroqModels(true, s.groqModel || null);
});

function renderOcModels(savedId){
  const list = $("#ocModels");
  if (!list) return;
  list.textContent = "";
  OC_FREE_MODELS.forEach((m) => list.appendChild(modelRow(m, "zen-v1", savedId, m.id === OC_FREE_MODELS[0].id)));
}

async function loadModels(){
  const res = await window.notch.listModels();
  const list = $("#models");
  list.textContent = "";
  if (!res.ok){ list.appendChild(el(`<div class="model-empty">Model listesi yüklenemedi: ${res.error}</div>`)); return; }
  if (!res.models.length){ list.appendChild(el(`<div class="model-empty">OpenClaw model döndürmedi.</div>`)); return; }
  const saved = (await window.notch.getSettings()).model;
  res.models.forEach((m, i) => {
    const row = modelRow(
      { id: m.id, label: (m.label || m.id) + (m.provider ? ` · ${m.provider}` : "") },
      m.id, saved, i === 0,
    );
    list.appendChild(row);
  });
}

/* tek seçim davranışı: her liste kendi içinde radyo gibi */
["#models", "#ocModels", "#groqModels"].forEach((sel) => {
  $(sel)?.addEventListener("click", (e) => {
    const row = e.target.closest(".model");
    if (!row) return;
    $(sel).querySelectorAll(".model").forEach((x) => x.classList.remove("selected"));
    row.classList.add("selected");
  });
});

function closeSettings(){ $("#settings").classList.remove("show"); }
$("#btnSettings").addEventListener("click", async () => {
  $("#settings").classList.add("show");
  if (groqWarm){ const w = groqWarm; groqWarm = null; try { await w(); } catch {} }
  refreshTools().catch(() => {});
  refreshProfile().catch(() => {});
  setDirty(false);
  pingRail();
});
$("#btnBack").addEventListener("click", closeSettings);
$("#settingsTitle")?.addEventListener("click", closeSettings);
$("#settingsTitle")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " "){ e.preventDefault(); closeSettings(); }
});

/* send() ile aynı kapı: Zen/Groq anahtarı varsa gateway yalnızca yedektir. */
function computeUseZen(s){
  const useGroq = (s.provider || "groq") === "groq";
  return useGroq ? !!s.groqKey : !!(s.ocKey && s.ocModel);
}
/* ── kalıcı hafıza paneli ── */
const PF_FIELDS = ["name", "age", "location", "hobbies", "interests", "habits", "notes"];
const PF_LABELS = {
  name: "Ad", age: "Yaş", location: "Yer", hobbies: "Hobiler",
  interests: "İlgi alanları", habits: "Alışkanlıklar / sık hatalar", notes: "Notlar",
};

function paintPending(list){
  const box = $("#pfPending");
  if (!box) return;
  box.textContent = "";
  const pill = $("#pfPendingCount");
  if (pill) pill.textContent = list.length ? `${list.length} öneri` : "";
  if (!list.length){
    box.appendChild(el(`<div class="pending-empty">Bekleyen öneri yok.</div>`));
    return;
  }
  list.forEach((it) => {
    const row = el(`<div class="pending"><div class="pending-txt"><b></b><span></span></div>
      <div class="pending-actions">
        <button class="mini" type="button" data-a="accept">Onayla</button>
        <button class="mini" type="button" data-a="reject">Reddet</button>
      </div></div>`);
    row.querySelector("b").textContent = PF_LABELS[it.field] || it.field;
    row.querySelector("span").textContent = it.value;
    row.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await window.notch.profileResolve(it.id, b.dataset.a).catch(() => null);
      if (!r?.ok){ b.disabled = false; return; }
      paintProfile(r);
      avatar.play("proud");
    }));
    box.appendChild(row);
  });
}

function paintProfile(p){
  PF_FIELDS.forEach((k) => {
    const f = $(`#pf_${k}`);
    if (f && document.activeElement !== f) f.value = p[k] || "";
  });
  paintPending(p.pending || []);
  const meta = $("#pfMeta");
  if (meta) meta.textContent = p.updatedAt
    ? `son güncelleme: ${new Date(p.updatedAt).toLocaleString("tr-TR")}`
    : "henüz bilgi yok";
  pingRail();
}

async function refreshProfile(){
  const p = await window.notch.profileGet().catch(() => null);
  if (p?.ok) paintProfile(p);
}

$("#btnPfClear")?.addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "Hafıza temizlensin mi?",
    message: "Kişisel profil alanları ve bekleyen öneriler silinir. Sohbet geçmişin etkilenmez.",
    confirmLabel: "Temizle",
  });
  if (!ok) return;
  const r = await window.notch.profileClear().catch(() => null);
  if (r?.ok){ paintProfile(r); setDirty(false); pingRail(); }
});

/* model öneri eklediğinde panel sessizce tazelenir */
window.notch.onProfilePending?.(() => { refreshProfile().catch(() => {}); });

/* ── kaydetme modeli: yalnız kaydedilmemiş değişiklik varken çubuk etkin ── */
const DIRTY_IDS = ["gw", "token", "provider", "groqKey", "ocKey", "ctx7Key", "graphPath",
  "pf_name", "pf_age", "pf_location", "pf_hobbies", "pf_interests", "pf_habits", "pf_notes"];

function setDirty(on){
  const st = $("#footState");
  const save = $("#btnSave");
  const rev = $("#btnRevert");
  if (save) save.disabled = !on;
  if (rev) rev.disabled = !on;
  if (!st) return;
  st.textContent = on ? "kaydedilmedi" : "✓ Kaydedildi";
  st.classList.toggle("dirty", !!on);
  st.classList.toggle("saved", !on);
}

DIRTY_IDS.forEach((id) => {
  const f = $(`#${id}`);
  if (!f) return;
  f.addEventListener("input", () => { setDirty(true); pingRail(); });
  f.addEventListener("change", () => { setDirty(true); pingRail(); });
});
$("#provider")?.addEventListener("change", () => { paintProviderLabel(); pingRail(); });
document.querySelectorAll(".model-list").forEach((list) =>
  list.addEventListener("click", () => setDirty(true)));

/* Geri al: formu diskteki hâle döndürür (profil dahil) */
async function reloadForm(){
  const s = await window.notch.getSettings().catch(() => ({}));
  if ($("#gw")) $("#gw").value = s.gatewayUrl || "";
  if ($("#token")) $("#token").value = s.token || "";
  if ($("#ocKey")) $("#ocKey").value = s.ocKey || "";
  if ($("#groqKey")) $("#groqKey").value = s.groqKey || "";
  if ($("#ctx7Key")) $("#ctx7Key").value = s.context7?.apiKey || "";
  if ($("#graphPath")) $("#graphPath").value = s.graphify?.graph || "";
  const p = $("#provider");
  if (p) p.value = s.provider || "groq";
  await refreshProfile();
  setDirty(false);
  pingRail();
}
$("#btnRevert")?.addEventListener("click", () => { reloadForm().catch(() => {}); });

$("#btnSave").addEventListener("click", async () => {
  const cfg = currentCfg();
  /* profil alanları aynı Kaydet'e bağlı — ayrı bir kaydet düğmesi yok */
  const pf = {};
  PF_FIELDS.forEach((k) => { const f = $(`#pf_${k}`); if (f) pf[k] = f.value; });
  await window.notch.profileSave(pf).catch(() => null);
  setDirty(false);
  pingRail();
  /* Kaydetme sonucu = setSettings başarısı (Superpowers DAHİL — panel yalan söylemez). */
  const saved = await window.notch.setSettings({
    model: $("#models .selected")?.dataset.id || null,
    ocKey: $("#ocKey").value || null,
    ocModel: $("#ocModels .selected")?.dataset.id || null,
    provider: $("#provider")?.value || "groq",
    groqKey: $("#groqKey").value || null,
    groqModel: $("#groqModels .selected")?.dataset.id || null,
    context7: cfg.context7,
    graphify: cfg.graphify,
    skills: cfg.skills,
  }).catch(() => null);
  if (computeUseZen(saved || {})){
    /* Gateway İSTEĞE BAĞLI yedek: arka planda dene; başarısızlık yalnızca conn
       satırında ikincil not — hata balonu YOK, üzgün avatar YOK, panel kapanır. */
    if (cfg.gatewayUrl || cfg.token) gwConfigured = true;
    $("#conn")?.classList.remove("warn");
    $("#connText").textContent = "Kaydedildi ✓";
    setTimeout(closeSettings, 700);
    window.notch.connectGateway(cfg).then((res) => {
      if (res?.ok) return;   // onGatewayStatus zaten "Bağlı" yazar
      const conn = $("#conn");
      conn?.classList.remove("ok");
      conn?.classList.add("warn");
      $("#connText").textContent = "Kaydedildi ✓ · OpenClaw: bağlanamadı (isteğe bağlı)";
    }).catch(() => {
      const conn = $("#conn");
      conn?.classList.remove("ok");
      conn?.classList.add("warn");
      $("#connText").textContent = "Kaydedildi ✓ · OpenClaw: bağlanamadı (isteğe bağlı)";
    });
    return;
  }
  /* Gateway TEK yol: bugünkü engelleyici UX aynen korunur (orası can damarı). */
  $("#connText").textContent = "Bağlanıyor…";
  if (cfg.gatewayUrl || cfg.token) gwConfigured = true;
  const res = await window.notch.connectGateway(cfg);
  if (!res.ok){
    $("#connText").textContent = "Bağlanılamadı";
    const c = classifyError(res.error);
    showError(c.msg, true);
    setStatus(c.status, { dot: "err", anim: "sad" });
    return;
  }
  setTimeout(closeSettings, 700);
});

/* ── başlangıç ── */
renderEmpty();
(async () => {
  const s = await window.notch.getSettings();
  if (s.gatewayUrl) $("#gw").value = s.gatewayUrl;
  if (s.token) $("#token").value = s.token;
  if (s.ocKey) $("#ocKey").value = s.ocKey;
  if (s.groqKey) $("#groqKey").value = s.groqKey;
  if (s.context7?.apiKey) $("#ctx7Key").value = s.context7.apiKey;
  if (s.graphify?.graph) $("#graphPath").value = s.graphify.graph;
  const p = $("#provider");
  if (p) p.value = s.provider || "groq";
  paintProviderLabel();
  renderOcModels(s.ocModel || null);
  paintGroqModels(GROQ_FALLBACK, s.groqModel || null);
  if ($("#groqNote")) $("#groqNote").textContent = "liste hazırlanıyor…";

  try {
    const cur = await window.notch.sessionsGet().catch(() => null);
    if (cur?.ok && (cur.messages?.length || cur.memory)) renderMessages(cur.messages, cur.memory);
    await refreshSessions();
  } catch {}

  const warm = () => loadGroqModels(false, s.groqModel || null);
  groqWarm = warm;
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2500);

  if (s.gatewayUrl !== undefined || s.token !== undefined){
    gwConfigured = true;
    window.notch.connectGateway({ gatewayUrl: s.gatewayUrl, token: s.token });
  }
})();
