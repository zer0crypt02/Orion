/* md.js — tek sorumluluk: güvenli minimal markdown.
   SIRA ÖNEMLİ: (1) HTML-escape, (2) sınırlı markdown dönüşümü.
   Escape edilmiş metne yalnızca bizim eklediğimiz etiketler girer → XSS yok.
   Destek: ``` fenced (mesaj başına çoklu), başlık (#/##), sırasız/sıralı liste,
   kalın (**x** / __x__), italik (*x*), satır içi kod. */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/* satır içi: önce escape, sonra kalın/italik/kod (kod parçaları yer tutucuyla korunur) */
function inline(raw){
  let s = esc(raw);
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=$|[\s).,!?;:…])/g, "$1<i>$2</i>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code class="inline">${codes[+i]}</code>`);
  return s;
}

const FENCE = /^\s*```\s*([A-Za-z0-9+#._-]{0,20})\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUM = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;

function parse(src){
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length){
    const line = lines[i];

    const f = line.match(FENCE);
    if (f){
      const lang = f[1] || "";
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;                                  // kapanış fence'i
      blocks.push({ t: "code", lang, code: buf.join("\n") });
      continue;
    }

    const h = line.match(HEADING);
    if (h){
      blocks.push({ t: "h", level: h[1].length, html: inline(h[2]) });
      i++;
      continue;
    }

    if (!line.trim()){ blocks.push({ t: "gap" }); i++; continue; }

    if (BULLET.test(line)){
      const items = [];
      while (i < lines.length && BULLET.test(lines[i])) items.push(inline(lines[i++].replace(BULLET, "$1")));
      blocks.push({ t: "ul", items });
      continue;
    }

    if (NUM.test(line)){
      const items = [];
      while (i < lines.length && NUM.test(lines[i])) items.push(inline(lines[i++].replace(NUM, "$2")));
      blocks.push({ t: "ol", items });
      continue;
    }

    /* paragraf: boş satır veya başka bir blok gelene kadar */
    const buf = [];
    while (
      i < lines.length && lines[i].trim() &&
      !FENCE.test(lines[i]) && !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) && !NUM.test(lines[i])
    ) buf.push(lines[i++]);
    blocks.push({ t: "p", html: buf.map(inline).join("\n") });
  }
  return blocks;
}

/* typewriter için: boş codeblock kabuğu. parse/renderMarkdown ile AYNI düğüm
   şekli (tek kaynak) — kabuk bir kez kurulur, kod metni sonra ham metin
   düğümleriyle içine akar; çerçeve başına yeniden parse YOK. */
export function codeBlockShell(lang){
  const box = document.createElement("div");
  box.className = "codeblock";

  const head = document.createElement("div");
  head.className = "code-head";
  const langEl = document.createElement("span");
  langEl.className = "lang";
  langEl.textContent = lang || "kod";
  const copy = document.createElement("button");
  copy.className = "copy";
  copy.type = "button";
  copy.textContent = "Kopyala";
  copy.addEventListener("click", async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(code.textContent); copy.textContent = "Kopyalandı ✓"; copy.classList.add("copied"); }
    catch { copy.textContent = "Kopyalanamadı"; }
    setTimeout(() => { copy.textContent = "Kopyala"; copy.classList.remove("copied"); }, 1200);
  });
  head.append(langEl, copy);

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  pre.appendChild(code);

  box.append(head, pre);
  return { box, code };
}

function codeBlock(b){
  const { box, code } = codeBlockShell(b.lang);
  code.textContent = b.code;              // metin düğümü → escape gerekmez
  return box;
}

/* typewriter için: fence taraması. parse() ile AYNI FENCE kuralı (tek kaynak).
   Döner: [{ open, close, lang }] — satır indisleri; close === -1 ise fence
   akışta henüz kapanmamış (typewriter bunu düz metin yazar, kapanınca yükseltir). */
export function scanFences(src){
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let open = -1;
  let lang = "";
  lines.forEach((line, i) => {
    if (!FENCE.test(line)) return;
    if (open < 0){ open = i; lang = (line.match(FENCE) || [])[1] || ""; }
    else { out.push({ open, close: i, lang }); open = -1; lang = ""; }
  });
  if (open >= 0) out.push({ open, close: -1, lang });
  return out;
}

export function renderMarkdown(host, text){
  host.textContent = "";
  const src = String(text ?? "");
  if (!src) return;
  for (const b of parse(src)){
    if (b.t === "gap") continue;
    if (b.t === "code"){ host.appendChild(codeBlock(b)); continue; }

    const node = document.createElement("div");
    if (b.t === "h") node.className = b.level <= 1 ? "md-h1" : "md-h2";
    if (b.t === "p") node.className = "md-p";
    if (b.t === "ul" || b.t === "ol"){
      const list = document.createElement(b.t === "ul" ? "ul" : "ol");
      for (const it of b.items){
        const li = document.createElement("li");
        li.innerHTML = it;                  // it zaten escape edilmiş + whitelist etiketler
        list.appendChild(li);
      }
      host.appendChild(list);
      continue;
    }
    node.innerHTML = b.html;                // escape edilmiş + whitelist etiketler
    host.appendChild(node);
  }
}

export const ALERT_ICON = `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
  <circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11h.01"/></svg>`;
