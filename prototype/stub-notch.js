/* GEÇİCİ PROTOTİP — Electron preload köprüsünün (window.notch) tarayıcı stub'ı.
   Amaç: gerçek index.html + gerçek js/app.js + gerçek CSS'i tarayıcıda çalıştırıp
   yeni tasarımı gözle doğrulamak. Uygulamaya dahil değildir.

   Kullanım: /prototype/preview.html          → sohbet dolu (has-chat)
             /prototype/preview.html?state=empty → boş durum */
(function () {
  "use strict";
  const QS = new URLSearchParams(location.search);
  const STATE = QS.get("state") || "chat";
  const noop = () => {};

  const handlers = { delta: [], final: [], error: [], tool: [], drop: [], cursor: [],
    gw: [], sessions: [], panel: [] };

  const CHAT = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Selam! Ben Orion. Bugün nasıl gidiyor?" },
    { role: "user", content: "iyidir, peki sen?" },
    { role: "assistant", content: "İyiyim — buradayım. Kodu, hatayı ya da aklındaki soruyu getir; birlikte bakarız." },
  ];

  const SESSIONS = [
    { id: "s-1", title: "hi", updatedAt: Date.now() - 6e5, count: 4 },
    { id: "s-2", title: "Heyyy, Naber Dostum?", updatedAt: Date.now() - 3.6e6, count: 3 },
    { id: "s-3", title: "Selam, nabeR?", updatedAt: Date.now() - 7.2e6, count: 1 },
    { id: "s-4", title: "Merhaba, Nasılsın? Termin…", updatedAt: Date.now() - 8.6e6, count: 4 },
    { id: "s-5", title: "Hii, Who are u?", updatedAt: Date.now() - 1.1e7, count: 3 },
  ];

  const MODELS = [
    { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B" },
    { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  ];

  const SKILLS = [
    { name: "frontend-design", description: "Farklı, kasıtlı görsel tasarım", estTokens: 2100, on: true },
    { name: "impeccable", description: "Üretim kalitesinde arayüz, AI-slop yok", estTokens: 3400, on: true },
    { name: "apple-design", description: "Akışkan, fiziksel hareket", estTokens: 2800, on: true },
    { name: "motion-design", description: "Zamanlama, easing, koreografi", estTokens: 1600, on: false },
  ];

  /* DİKKAT: bu bir PROTOTİP yanıtı — gerçek model yok. Sabit bir cevap yazmak
     "anlamsız cevap veriyor" izlenimi yaratıyordu; artık soruyu geri yansıtıp
     prototip olduğunu söylüyor. Gerçek yanıt Electron uygulamasından gelir. */
  const reply = (question) =>
    `Bu bir prototip penceresi, burada model yok — "${question.slice(0, 70)}" sorusuna ` +
    "gerçek yanıtı Orion uygulamasında alırsın. Bu sayfayı yalnız tasarımı denemek için kullan.";

  function stream(text) {
    // gerçekçi akış: ~55 karakter/sn, küçük parçalar hâlinde
    const chunk = 3;
    let i = 0;
    const tick = () => {
      if (i >= text.length) {
        handlers.final.forEach((f) => f({ text }));
        return;
      }
      const part = text.slice(i, i + chunk);
      i += chunk;
      handlers.delta.forEach((f) => f({ text: part, replace: false }));
      setTimeout(tick, 55);
    };
    setTimeout(tick, 420); // "düşünüyor" penceresi
  }

  window.notch = {
    // panel
    togglePanel: async () => true,
    panelState: async () => true,
    sidebarSet: async (open) => ({ ok: true, historyOpen: !!open }),
    onPanelChanged: (fn) => handlers.panel.push(fn),

    // ayarlar
    getSettings: async () => ({
      gatewayUrl: "ws://127.0.0.1:18789/", token: "", provider: "groq",
      groqKey: "demo", groqModel: "qwen/qwen3.8-27b", ocModel: "glm-5.3-flash-free",
      context7: { enabled: false }, graphify: { enabled: false }, skills: { enabled: true },
    }),
    setSettings: async (patch) => Object.assign({}, patch, { ok: true }),

    // gateway
    connectGateway: async () => ({ ok: false, error: "demo" }),
    listModels: async () => ({ ok: true, models: [] }),
    listSessions: async () => ({ ok: true, sessions: [] }),
    switchGatewaySession: async () => ({ ok: true }),
    listGroqModels: async () => ({ ok: true, models: MODELS, cached: true }),

    // oturumlar
    sessionsList: async () => ({ ok: true, activeId: "s-1", sessions: SESSIONS }),
    sessionsGet: async () => ({ ok: true, activeId: "s-1", messages: STATE === "empty" ? [] : CHAT }),
    sessionsNew: async () => { handlers.panel.forEach(noop); return { ok: true, activeId: "s-new" }; },
    sessionsSwitch: async () => ({ ok: true, activeId: "s-1", messages: CHAT }),
    sessionsDelete: async () => ({ ok: true, activeId: "s-1" }),

    // sohbet
    sendMessage: async () => ({ ok: true }),
    sendZenMessage: async (payload) => {
      const q = typeof payload === "string" ? payload : String(payload?.text || payload?.content || "");
      stream(reply(q));
      return { ok: true };
    },

    // araçlar
    toolsStatus: async () => ({
      ok: true,
      servers: [{ id: "context7", label: "Context7", enabled: false, needsKey: true,
        connected: false, tools: [], error: "" }],
      graphify: { enabled: false, graph: "", graphExists: false },
      skills: { master: true, dir: "/demo/skills", found: SKILLS.length, indexTokens: 9900, list: SKILLS },
    }),
    toolsPing: async () => ({ ok: false, error: "demo" }),

    // olaylar
    onGatewayStatus: (fn) => handlers.gw.push(fn),
    onSessions: (fn) => handlers.sessions.push(fn),
    onToolActivity: (fn) => handlers.tool.push(fn),
    onDropBubble: (fn) => handlers.drop.push(fn),
    onCursorPos: (fn) => handlers.cursor.push(fn),
    onDelta: (fn) => handlers.delta.push(fn),
    onFinal: (fn) => handlers.final.push(fn),
    onChatError: (fn) => handlers.error.push(fn),
  };
})();
