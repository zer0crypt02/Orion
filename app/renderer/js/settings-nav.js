/* settings-nav.js — Ayarlar'ın "Orion Rayı" seçicisi (Faz 2).
   ------------------------------------------------------------------
   Sol ray beş görünüm taşır:

     Orion    → bento profil (canlı durum karoları)
     Bağlantı → OpenClaw adresi + token + bağlantı durumu
     Modeller → sağlayıcı + anahtarlar + model listeleri
     Araçlar  → Context7, Graphify, Beceriler
     Hafıza   → kalıcı kişisel profil + bekleyen öneriler

   Tüm alanlar DOM'da kalır (app.js ID'lerle çalışmaya devam eder); yalnız
   görünürlük değişir — durum kaybı yok. Ray öğeleri role=tab sözleşmesini
   taşır: ok tuşları gezinir, Enter/Space seçer, odak halkası görünür.

   Bento karoları GERÇEK veriden beslenir; karşılığı olmayan karo basılmaz
   (sahte metrik yok). */
"use strict";

const PANES = ["orion", "conn", "models", "tools", "memory"];
const rail = document.getElementById("settingsNav");
const settings = document.getElementById("settings");

const providerLabel = (v) => (v === "zen" ? "Opencode Zen" : "Groq");

if (rail && settings) {
  const tabs = Array.from(rail.querySelectorAll('[role="tab"]'));
  const panes = PANES.map((key) => document.querySelector(`.settings .pane[data-pane="${key}"]`));

  const selectedModel = (listId) => {
    const row = document.querySelector(`#${listId} .model.selected`);
    return row?.dataset.id || "";
  };

  /* ── bento: yalnız gerçek değerler ── */
  function paintBento() {
    const providerEl = document.getElementById("provider");
    const provider = providerEl?.value || "groq";
    const provName = providerLabel(provider);
    const model = provider === "zen" ? selectedModel("ocModels") : selectedModel("groqModels");

    const prov = document.getElementById("bentoProvider");
    if (prov) prov.textContent = provName;

    const sub = document.getElementById("bentoSub");
    if (sub) sub.textContent = ["bağlı", provName, model].filter(Boolean).join(" · ");

    const tools = ["tgContext7", "tgGraphify", "tgSkills"]
      .filter((id) => document.getElementById(id)?.getAttribute("aria-checked") === "true").length;
    const toolsEl = document.getElementById("bentoTools");
    if (toolsEl) toolsEl.textContent = tools ? `${tools} açık` : "kapalı";

    const memFields = ["pf_name", "pf_age", "pf_location", "pf_hobbies", "pf_interests", "pf_habits", "pf_notes"];
    const filled = memFields.filter((id) => (document.getElementById(id)?.value || "").trim()).length;
    const memEl = document.getElementById("bentoMemory");
    if (memEl) memEl.textContent = filled ? `${filled} alan` : "boş";

    const key = (provider === "zen" ? document.getElementById("ocKey") : document.getElementById("groqKey"))?.value || "";
    const keyEl = document.getElementById("bentoKey");
    if (keyEl) keyEl.textContent = key ? "•••• kayıtlı" : "yok";

    window.notch?.sessionsGet?.().then((cur) => {
      const box = document.getElementById("bentoSession");
      if (!box) return;
      const n = (cur?.messages || []).filter((m) => m.role === "user" || m.role === "assistant").length;
      box.textContent = n ? `${n} mesaj` : "boş";
    }).catch(() => {});
  }

  /* ── görünüm değiştirme ── */
  function show(key, { focus = false } = {}) {
    const index = Math.max(0, PANES.indexOf(key));
    panes.forEach((pane, i) => pane?.classList.toggle("active", i === index));
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle("active", on);
      if (on && focus) tab.focus();
    });
    settings.dataset.pane = PANES[index];
    if (PANES[index] === "orion") paintBento();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => show(tab.dataset.target));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (step) {
        e.preventDefault();
        const next = (i + step + tabs.length) % tabs.length;
        show(tabs[next].dataset.target, { focus: true });
        return;
      }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(tab.dataset.target); }
    });
  });

  /* karo → ilgili görünüm (değiştir ⌄, araçlar, hafıza) */
  settings.querySelectorAll("[data-goto]").forEach((tile) => {
    tile.addEventListener("click", () => show(tile.dataset.goto));
  });

  document.getElementById("provider")?.addEventListener("change", paintBento);
  document.addEventListener("orion:state", paintBento);

  /* panel her açıldığında taze değerlerle başla */
  new MutationObserver(() => {
    if (!settings.classList.contains("show")) return;
    requestAnimationFrame(() => {
      show(settings.dataset.pane || "orion");
      paintBento();
    });
  }).observe(settings, { attributes: true, attributeFilter: ["class"] });

  show(settings.dataset.pane || "orion");
}
