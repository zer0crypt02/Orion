/* confirm.js — erişilebilir onay diyaloğu (vanilla, AlertDialog karşılığı).
   ---------------------------------------------------------------------------
   Yalnızca tahrip edici işlerde kullanılır: sohbet silme, hafızayı temizleme,
   anahtar silme. Sözleşme:

     const ok = await confirmAction({ title, message, confirmLabel, danger });
     if (!ok) return;

   - role="alertdialog" + aria-modal, başlık/açıklama bağlı
   - ilk odak "Vazgeç" üzerinde (yanlışlıkla silmeye karşı)
   - Tab/Shift+Tab diyaloğun içinde döner (odak tuzağı)
   - Esc ve arka plan tıklaması iptal eder
   - kapanınca odak, açan öğeye geri döner
   - reduced-motion: yalnız fade (CSS'te)
*/
"use strict";

let scrim = null;
let resolver = null;
let lastFocus = null;
let titleEl = null;
let msgEl = null;
let okBtn = null;
let cancelBtn = null;

function build(){
  scrim = document.createElement("div");
  scrim.className = "confirm-scrim";
  scrim.hidden = true;
  scrim.innerHTML = `
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMsg">
      <h2 id="confirmTitle"></h2>
      <p id="confirmMsg"></p>
      <div class="confirm-actions">
        <button class="btn ghost" type="button" data-act="cancel">Vazgeç</button>
        <button class="btn danger" type="button" data-act="ok">Sil</button>
      </div>
    </div>`;
  document.body.appendChild(scrim);

  titleEl = scrim.querySelector("#confirmTitle");
  msgEl = scrim.querySelector("#confirmMsg");
  okBtn = scrim.querySelector('[data-act="ok"]');
  cancelBtn = scrim.querySelector('[data-act="cancel"]');

  cancelBtn.addEventListener("click", () => close(false));
  okBtn.addEventListener("click", () => close(true));
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(false); });
  scrim.addEventListener("keydown", onKey);
}

function onKey(e){
  if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(false); return; }
  if (e.key !== "Tab") return;
  /* odak tuzağı: iki düğme arasında döner */
  const focusables = [cancelBtn, okBtn];
  const i = focusables.indexOf(document.activeElement);
  e.preventDefault();
  const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i + 1) % focusables.length;
  focusables[next].focus();
}

function close(ok){
  if (!scrim || scrim.hidden) return;
  scrim.hidden = true;
  document.body.classList.remove("confirm-open");
  const r = resolver;
  resolver = null;
  if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  lastFocus = null;
  if (r) r(!!ok);
}

export function confirmAction({ title, message, confirmLabel = "Sil", danger = true } = {}){
  if (!scrim) build();
  /* üst üste çağrı: önceki bekleyen iptal edilir */
  if (resolver){ const prev = resolver; resolver = null; prev(false); }

  titleEl.textContent = title || "Emin misin?";
  msgEl.textContent = message || "Bu işlem geri alınamaz.";
  okBtn.textContent = confirmLabel;
  okBtn.classList.toggle("danger", !!danger);

  lastFocus = document.activeElement;
  scrim.hidden = false;
  document.body.classList.add("confirm-open");
  requestAnimationFrame(() => cancelBtn.focus());

  return new Promise((resolve) => { resolver = resolve; });
}

export function isConfirmOpen(){
  return !!scrim && !scrim.hidden;
}
