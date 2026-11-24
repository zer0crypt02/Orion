// Orion — Electron main process.
// Frameless + transparent + vibrancy notch window.
// The pill (196x36) expands to the panel (481x600) with a 667ms spring
// animation; the renderer fades content in sync.
//
// AGPL NOTU: @bible-strong/avatar-web@0.1.0 AGPL-3.0-only lisanslıdır ve
// kişisel kullanım kapsamında kullanılır. Bkz. LICENSE-NOTICE.md.
"use strict";

const { app, BrowserWindow, ipcMain, globalShortcut, screen, safeStorage, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { GatewayClient } = require("./gateway.js");
const { sendChat: sendZenChat, sendChatWithTools, GROQ_BASE } = require("./zen.js");
const Sessions = require("./sessions.js");
const { McpClient } = require("./mcp.js");
const Skills = require("./skills.js");
const Profile = require("./profile.js");
const { execFile } = require("node:child_process");

/* ── Groq canlı katalog (24s önbellek, fallback statik) ── */
const GROQ_FALLBACK = [
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (recommended)" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (tight daily quota)" },
];
const GROQ_CACHE_MS = 24 * 60 * 60 * 1000;
const GROQ_EXCLUDE_RX = /whisper|tts|guard|moderation|embedding|transcri/i;
async function fetchGroqCatalog(apiKey) {
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Groq list error (HTTP ${res.status})`);
  const j = await res.json().catch(() => ({}));
  const arr = Array.isArray(j) ? j : j.data || j.models || j.items || [];
  const models = arr
    .map((m) => (typeof m === "string" ? { id: m } : m))
    .map((m) => ({ id: m.id || m.modelId || m.name || "" }))
    .filter((m) => m.id && !GROQ_EXCLUDE_RX.test(m.id))
    .map((m) => ({ id: m.id, label: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!models.length) throw new Error("Groq returned an empty list");
  return models;
}

const PILL = { w: 196, h: 36 };
const PANEL = { w: 481, h: 600 };
const SIDEBAR_W = 220;
const WIDE = { w: PANEL.w + SIDEBAR_W, h: PANEL.h };
const TOP_BLEED = 2;            // pencere ekranın 2pt üstünden başlar (çentiğe yapışma)
/* ÇÖZÜM A: iki pencere — pencere geometrisi animasyonu YOK.
   Hap (196x36) ve panel (481x600) pre-create edilir, aynı anchor'da durur.
   Açılış/kapanış = show/hide swap; büyüme illüzyonunu renderer CSS'i (GPU transform) yapar.
   per-frame setBounds + vibrancy + backdrop-filter zinciri ortadan kalkar. */
let pillWin = null;
let panelWin = null;
let isOpen = false;
/* Native diyalog açıkken panel "odağı kaybetti" diye kapanmamalı:
   klasör seçici macOS'ta ayrı bir pencere, panel blur alır. */
let dialogOpen = 0;
let historyOpen = false;   // yan geçmiş paneli açık mı? (panel pencere genişliğini belirler)

let focusTimer = null;
let hasBeenFocused = false;    // açılıştan beri en az bir kez odaklandı mı? (güvenlik ağı için)
const gateway = new GatewayClient(app.getPath("userData"));

function centerX(w) {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: Math.round(workArea.x + workArea.width / 2 - w / 2), y: workArea.y - TOP_BLEED };
}
/* sağa sabit büyüme: panelin SAĞ kenarı ekranda sabit kalır, sidebar açılırken
   genişlik SOLA doğru artar. Merkezden büyüme sohbet kolonunu 110px kaydırıp
   sidebar animasyonuyla çakışıyordu (kasmanın ilk yarısı). */
function anchoredX(w) {
  const { workArea } = screen.getPrimaryDisplay();
  const right = Math.round(workArea.x + workArea.width / 2 + PANEL.w / 2);
  return { x: right - w, y: workArea.y - TOP_BLEED };
}
function sendToPanel(channel, data) {
  try { if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send(channel, data); } catch {}
}
function sendToAll(channel, data) {
  try { if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send(channel, data); } catch {}
  try { if (pillWin && !pillWin.isDestroyed()) pillWin.webContents.send(channel, data); } catch {}
}

/* ── ayarlar (userData/settings.json) + gizli anahtarlar (OS keychain, secrets.json) ──
   API anahtarları settings.json'a DÜZ METİN yazılmaz; safeStorage ile şifrelenip
   secrets.json'da (base64) saklanır. loadSettings() ikisini birleştirip döner,
   böylece renderer tarafı değişmeden çalışır. */
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const secretsPath = () => path.join(app.getPath("userData"), "secrets.json");
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
function readPlainSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), "utf8")); } catch { return {}; }
}
function readSecrets() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(secretsPath(), "utf8")); } catch { return {}; }
  if (!canEncrypt()) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    try {
      if (typeof v === "string" && v) out[k] = safeStorage.decryptString(Buffer.from(v, "base64"));
    } catch { /* bozuk girdi atlanır */ }
  }
  return out;
}
function writeSecrets(next) {
  fs.mkdirSync(path.dirname(secretsPath()), { recursive: true });
  const enc = {};
  if (!canEncrypt()) { try { fs.writeFileSync(secretsPath(), JSON.stringify(enc)); } catch {} return; }
  for (const [k, v] of Object.entries(next)) {
    try {
      if (typeof v === "string" && v) enc[k] = safeStorage.encryptString(v).toString("base64");
    } catch { /* şifrelenemeyen atlanır */ }
  }
  fs.writeFileSync(secretsPath(), JSON.stringify(enc));
}
// düz anahtar adları (üst seviye) + iç içe: context7.apiKey → "context7.apiKey"
function splitSecrets(patch) {
  const secrets = {};
  const plain = { ...patch };
  for (const k of ["groqKey", "ocKey", "token"]) {
    if (k in plain) { secrets[k] = plain[k]; delete plain[k]; }
  }
  if (plain.context7 && typeof plain.context7 === "object" && "apiKey" in plain.context7) {
    secrets["context7.apiKey"] = plain.context7.apiKey;
    plain.context7 = { ...plain.context7 };
    delete plain.context7.apiKey;
  }
  return { plain, secrets };
}
function applySecrets(base, secrets) {
  const out = { ...base };
  if (secrets.groqKey !== undefined) out.groqKey = secrets.groqKey;
  if (secrets.ocKey !== undefined) out.ocKey = secrets.ocKey;
  if (secrets.token !== undefined) out.token = secrets.token;
  if (secrets["context7.apiKey"] !== undefined)
    out.context7 = { ...(out.context7 || {}), apiKey: secrets["context7.apiKey"] };
  return out;
}
// eski düz-metin anahtarları ilk açılışta kasaya taşı (tek seferlik migrasyon)
let secretsMigrated = false;
function migratePlainSecrets(plain) {
  if (secretsMigrated) return plain;
  secretsMigrated = true;
  const { plain: rest, secrets } = splitSecrets(plain);
  const hasSecret = Object.values(secrets).some((v) => typeof v === "string" && v);
  if (!hasSecret || !canEncrypt()) return plain;
  const stored = readSecrets();
  let changed = false;
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === "string" && v && !stored[k]) { stored[k] = v; changed = true; }
  }
  if (changed) writeSecrets(stored);
  try { fs.writeFileSync(settingsPath(), JSON.stringify(rest, null, 2)); } catch {}
  return rest;
}
function loadSettings() {
  const plain = migratePlainSecrets(readPlainSettings());
  return applySecrets(plain, readSecrets());
}
function saveSettings(patch) {
  const { plain, secrets } = splitSecrets(patch || {});
  /* iç içe nesnelerde kısmi güncelleme: skills gibi alt anahtarlar birbirini ezmesin
     (beceri kaynak listesi, bir SKILL.md eklendiğinde siliniyordu) */
  if (plain.skills && typeof plain.skills === "object" && !Array.isArray(plain.skills)) {
    plain.skills = { ...(readPlainSettings().skills || {}), ...plain.skills };
    if (plain.skills.dir === undefined) delete plain.skills.dir;
  }
  const stored = readSecrets();
  let secretsChanged = false;
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === "string" && v) { stored[k] = v; secretsChanged = true; }
    else if (v == null || v === "") { if (k in stored) { delete stored[k]; secretsChanged = true; } }
  }
  if (secretsChanged) writeSecrets(stored);
  const next = { ...migratePlainSecrets(readPlainSettings()), ...plain };
  // emniyet: düz dosyaya anahtar sızmasın (üst seviye + context7.apiKey)
  delete next.groqKey; delete next.ocKey; delete next.token;
  if (next.context7 && typeof next.context7 === "object" && "apiKey" in next.context7) {
    next.context7 = { ...next.context7 };
    delete next.context7.apiKey;
  }
  // boşaltılan anahtarlar birleşimde görünmesin diye üstüne null yazma — kasadan silindi zaten
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  return loadSettings();
}

/* ── pencereler: hap + panel, aynı anchor'da pre-create (ÇÖZÜM A) ── */
function windowOpts(w, h) {
  const pos = centerX(w);
  return {
    width: w,
    height: h,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    vibrancy: "under-window",       // macOS vibrancy — cam arkası masaüstü
    visualEffectState: "active",
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    resizable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,               // ESM bundle importu için
    },
  };
}
function createWindow() {
  pillWin = new BrowserWindow(windowOpts(PILL.w, PILL.h));
  panelWin = new BrowserWindow(windowOpts(PANEL.w, PANEL.h));
  pillWin.setAlwaysOnTop(true, "floating");
  panelWin.setAlwaysOnTop(true, "floating");
  pillWin.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { mode: "pill" } });
  panelWin.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { mode: "panel" } });
  pillWin.once("ready-to-show", () => {
    pillWin.show();
    startFocusWatch();
  });

  // odak yönetimi: SADECE panel penceresi kapatmayı tetikler — hapın blur'u kapatmamalı
  panelWin.on("focus", () => { hasBeenFocused = true; console.log("[focus] panel odaklandı"); });
  panelWin.on("blur", () => { console.log("[focus] panel odağı kaybetti, isOpen=" + isOpen); if (isOpen && !dialogOpen) setPanel(false, "blur"); });
}



/* ── güvenlik ağı: blur olayı kaçarsa bile odaksız açık paneli kapat ── */
function startFocusWatch() {
  if (focusTimer || !panelWin) return;
  focusTimer = setInterval(() => {
    if (!panelWin || !isOpen) return;
    try {
      if (hasBeenFocused && !dialogOpen && !panelWin.isFocused()) setPanel(false, "unfocus-poll");
    } catch {}
  }, 500);
}

function setPanel(open, reason) {
  if (isOpen === open) return;
  console.log("[panel] " + (open ? "açılıyor" : "kapanıyor") + " (" + (reason || "user") + ")");
  isOpen = open;
  if (!open) hasBeenFocused = false;
  if (open) {
    // panel gerçek boyutunda tek seferlik konumlanır (geometri animasyonu yok) + swap
    const target = historyOpen ? WIDE : PANEL;
    const pos = anchoredX(target.w);
    try { panelWin.setBounds({ x: pos.x, y: pos.y, width: target.w, height: target.h }); } catch {}
    try { panelWin.setOpacity(0); } catch {}
    try { pillWin.hide(); } catch {}
    panelWin.show();
    panelWin.focus();
    // hafif glass-pop: alpha-only rampa (re-layout tetiklemez, ucuz)
    try {
      let a = 0;
      const t = setInterval(() => {
        a += 0.25;
        try { panelWin.setOpacity(Math.min(1, a)); } catch {}
        if (a >= 1) clearInterval(t);
      }, 16);
    } catch {}
    startCursorFeed();
  } else {
    try { panelWin.hide(); } catch {}
    try { if (pillWin && !pillWin.isDestroyed()) pillWin.show(); } catch {}
    stopCursorFeed();
  }
  sendToAll("panel:changed", { open, reason: reason || "user" });
}

/* ── IPC ── */
ipcMain.handle("panel:toggle", () => setPanel(!isOpen));
ipcMain.handle("panel:state", () => isOpen);
ipcMain.handle("sidebar:set", (_e, open) => {
  historyOpen = !!open;
  if (isOpen && panelWin) {
    // tek seferlik setBounds — geometri animasyonu yok, kritik değil
    // sağ kenar sabit: sohbet kolonu ekranda yerinde kalır, alan sola açılır
    const target = historyOpen ? WIDE : PANEL;
    const pos = anchoredX(target.w);
    try { panelWin.setBounds({ x: pos.x, y: pos.y, width: target.w, height: target.h }); } catch {}
  }
  return { ok: true, historyOpen };
});

ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:set", (_e, patch) => {
  const next = saveSettings(patch || {});
  // araç/MCP/beceri ayarı değiştiyse eski MCP süreçlerini kapat (sonraki istekte tazelenir)
  if (patch && (patch.context7 !== undefined || patch.graphify !== undefined || patch.skills !== undefined))
    dropMcpClients();
  return next;
});

ipcMain.handle("gateway:connect", async (_e, cfg) => {
  const settings = saveSettings({
    gatewayUrl: cfg?.gatewayUrl,
    token: cfg?.token,
  });
  const url = (settings.gatewayUrl || "ws://127.0.0.1:18789/").trim();
  const token = (settings.token || "").trim();
  gateway.disconnect();
  try {
    await gateway.connect(url, token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("gateway:models", async () => {
  try { return { ok: true, models: await gateway.listModels() }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle("gateway:sessions", async () => {
  try { return { ok: true, sessions: await gateway.listSessions() }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle("gateway:session-switch", async (_e, key) => {
  try {
    gateway.sessionKey = String(key || "notch-assistant");
    if (gateway.connected) await gateway.request("chat.subscribe", { sessionKey: gateway.sessionKey });
    saveSettings({ sessionKey: gateway.sessionKey });
    return { ok: true, sessionKey: gateway.sessionKey };
  } catch (err) { return { ok: false, error: err.message }; }
});

/* ── yerel session'lar (Groq/Zen) ── */
const userSessions = () => Sessions.loadStore(app.getPath("userData"));
const saveUserSessions = (store) => Sessions.saveStore(app.getPath("userData"), store);

ipcMain.handle("sessions:list", async () => {
  const { store, active } = Sessions.ensureActive(app.getPath("userData"));
  saveUserSessions(store);
  return {
    ok: true,
    activeId: active.id,
    sessions: store.sessions.map((s) => ({
      id: s.id, title: s.title, updatedAt: s.updatedAt,
      count: s.messages.length,
    })),
  };
});

ipcMain.handle("sessions:get", async () => {
  const { store, active } = Sessions.ensureActive(app.getPath("userData"));
  saveUserSessions(store);
  return { ok: true, activeId: active.id, messages: active.messages.slice(-60), memory: active.memory || null };
});

ipcMain.handle("sessions:new", async (_e, title) => {
  try { zenAbort?.abort(); } catch {}
  const { store } = Sessions.ensureActive(app.getPath("userData"));
  const now = Date.now();
  const s = {
    id: Sessions.newId(),
    title: String(title || "New chat").slice(0, 60) || "New chat",
    createdAt: now, updatedAt: now, messages: [],
  };
  store.sessions.unshift(s);
  store.activeId = s.id;
  store.sessions = store.sessions.slice(0, 30); // en son 30 sohbet
  saveUserSessions(store);
  return { ok: true, activeId: s.id };
});

ipcMain.handle("sessions:switch", async (_e, id) => {
  try { zenAbort?.abort(); } catch {}
  const store = userSessions();
  const found = store.sessions.find((s) => s.id === id);
  if (!found) return { ok: false, error: "Chat not found." };
  store.activeId = id;
  saveUserSessions(store);
  return { ok: true, activeId: id, messages: found.messages.slice(-60), memory: found.memory || null };
});

ipcMain.handle("sessions:delete", async (_e, id) => {
  const store = userSessions();
  store.sessions = store.sessions.filter((s) => s.id !== id);
  if (store.activeId === id) store.activeId = null;
  saveUserSessions(store);
  Sessions.ensureActive(app.getPath("userData"));
  const next = Sessions.loadStore(app.getPath("userData"));
  saveUserSessions(next);
  return { ok: true, activeId: next.activeId };
});

/* ── BAĞLAM DEVRİ ──────────────────────────────────────────
   Bağlam dolunca sohbeti özetler ve ÖZETİ taşıyarak yeni bir sohbet açar.
   Eski sohbet silinmez; yeni sohbetin system mesajına hafıza olarak eklenir
   (bkz. zen:send → memoryNote). Özet yapılandırılmıştır: serbest özet en çok
   detay kaybettiren yöntem. */
const CARRY_MAX_MESSAGES = 40;
const CARRY_MAX_CHARS = 24000;
const CARRY_PROMPT =
  "Aşağıdaki sohbeti, yeni bir sohbete taşınacak şekilde özetle.\n" +
  "Türkçe yaz. En fazla 180 kelime. Tam olarak şu üç başlığı kullan:\n" +
  "## Kararlar\n## Açık kalanlar\n## Teknik referanslar\n" +
  "Uydurma; yalnızca sohbette geçenleri yaz. Kod parçalarını kısalt, dosya/dizin/komut adlarını aynen koru.\n\nSOHBET:\n";

ipcMain.handle("sessions:carry", async () => {
  const settings = loadSettings();
  const isGroq = (settings.provider || "groq") === "groq";
  const apiKey = (isGroq ? settings.groqKey : settings.ocKey || "").trim();
  const model = (isGroq ? settings.groqModel : settings.ocModel || "glm-5.3-flash-free").trim();
  if (!apiKey) return { ok: false, error: "Özet için API anahtarı gerekli (Ayarlar → Modeller).", kind: "auth" };

  const { store, active } = Sessions.ensureActive(app.getPath("userData"));
  const rows = (active.messages || []).filter((m) => m && (m.role === "user" || m.role === "assistant"));
  if (!rows.length) return { ok: false, error: "Özetlenecek mesaj yok." };

  let body = rows.slice(-CARRY_MAX_MESSAGES)
    .map((m) => `${m.role === "user" ? "Kullanıcı" : "Orion"}: ${m.content}`)
    .join("\n\n");
  if (body.length > CARRY_MAX_CHARS) body = body.slice(body.length - CARRY_MAX_CHARS);

  let summary = "";
  try {
    summary = await sendZenChat({
      apiKey, model,
      messages: [
        { role: "system", content: "Sen bir sohbet özetleyicisin. Yalnızca istenen özeti yaz, başka şey ekleme." },
        { role: "user", content: CARRY_PROMPT + body },
      ],
      baseUrl: isGroq ? GROQ_BASE : undefined,
      label: isGroq ? "Groq" : "Zen",
    });
  } catch (err) {
    return { ok: false, error: err.message, kind: err.kind || "model" };
  }
  summary = String(summary || "").trim();
  if (!summary) return { ok: false, error: "Özet boş döndü." };

  const now = Date.now();
  const fromTitle = String(active.title || "Sohbet").slice(0, 40);
  const next = {
    id: Sessions.newId(),
    title: `${fromTitle} → devam`,
    createdAt: now,
    updatedAt: now,
    messages: [],
    memory: { summary, fromId: active.id, fromTitle, at: now },
  };
  store.sessions.unshift(next);
  store.sessions = store.sessions.slice(0, 30);
  store.activeId = next.id;
  saveUserSessions(store);
  return { ok: true, activeId: next.id, memory: next.memory };
});

/* ── canlı Groq katalog ── */
ipcMain.handle("groq:models", async (_e, { force } = {}) => {
  const settings = loadSettings();
  const apiKey = (settings.groqKey || "").trim();
  const cache = settings.groqModelsCache;
  const fresh = cache && Array.isArray(cache.models) && cache.models.length
    && (Date.now() - (cache.at || 0) < GROQ_CACHE_MS);
  if (fresh && !force) return { ok: true, models: cache.models, cached: true };
  if (!apiKey) return { ok: true, models: GROQ_FALLBACK, cached: false, fallback: true };
  try {
    const models = await fetchGroqCatalog(apiKey);
    saveSettings({ groqModelsCache: { at: Date.now(), models } });
    const saved = loadSettings().groqModel;
    if (saved && !models.some((m) => m.id === saved))
      return { ok: true, models, stale: saved };
    return { ok: true, models };
  } catch (err) {
    if (fresh) return { ok: true, models: cache.models, cached: true, error: err.message };
    return { ok: true, models: GROQ_FALLBACK, fallback: true, error: err.message };
  }
});

ipcMain.handle("chat:send", async (_e, message) => {
  try {
    await gateway.send(String(message || ""));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* Orion kimliği — her Zen/Groq isteğinin başına eklenir (saklanmaz, modele her seferde gider) */
const PERSONA = "Sen Orion'sun — kullanıcının macOS menü çubuğu çentiğinde yaşayan kişisel AI asistanısın. " +
  "Türkçe konuş, kısa ve doğal yaz, gereksiz resmiyetten kaçın. " +
  "Kim olduğun sorulursa kendini Orion olarak tanıt; altyapı sorulursa Groq üzerinde çalıştığını söyle. " +
  "Asla başka bir isim, şirket veya model iddia etme (Qwen, Alibaba vb. deme).";

/* ── araçlar: MCP sunucuları + graphify + beceri yükleyici ── */
const mcpClients = new Map(); // serverId → { client, cfgKey }
const MAX_TOOL_ROUNDS = 4;
const TOOL_NAME_RX = /^[A-Za-z0-9_-]{1,64}$/;

function mcpServerDefs(settings) {
  const c7 = settings.context7 || {};
  return [{
    id: "context7",
    label: "Context7 (up-to-date library docs)",
    enabled: c7.enabled !== false && !!(c7.apiKey || "").trim(),
    needsKey: !(c7.apiKey || "").trim(),
    command: (c7.command || "npx").trim() || "npx",
    args: String(c7.args || "-y @upstash/context7-mcp").trim().split(/\s+/).filter(Boolean),
    env: { CONTEXT7_API_KEY: (c7.apiKey || "").trim() },
  }];
}

function graphifyDef(settings) {
  const g = settings.graphify || {};
  return {
    enabled: g.enabled === true && !!(g.graph || "").trim(),
    graph: (g.graph || "").trim(),
  };
}

/* Beceri kaynakları ÇOKLUDUR: settings.skills.dirs + opencode klasörleri +
   marketplace. Tek dizin kullanmak, kullanıcı bir SKILL.md eklediğinde
   Superpowers listesinin kaybolmasına yol açıyordu. */
function skillsState(settings) {
  const sk = settings.skills || {};
  /* öncelik: kullanıcının açıkça seçtiği klasörler → opencode → marketplace
     → en sonda içe alınan kopyalar (aynı adlı gerçek beceriyi gölgelemez) */
  const dirs = Skills.findSkillDirs(sk.dirs || [], [sk.importDir, sk.dir]);
  const all = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const s of Skills.listSkills(dir)) {
      if (seen.has(s.name)) continue;   // aynı ad: ilk kaynak kazanır
      seen.add(s.name);
      all.push(s);
    }
  }
  all.sort((a, b) => a.name.localeCompare(b.name));
  const master = sk.enabled !== false;
  const onMap = sk.on || {};
  // varsayılan: hepsi açık (dizin maliyeti ~ad başına birkaç token)
  const enabled = all.filter((s) => onMap[s.name] !== false);
  return { dirs, dir: dirs[0] || "", all, master, enabled };
}

function getMcpClient(def) {
  const cfgKey = JSON.stringify({ c: def.command, a: def.args, e: def.env });
  const cached = mcpClients.get(def.id);
  if (cached && cached.cfgKey === cfgKey && cached.client.connected) return cached.client;
  try { cached?.client.close(); } catch {}
  const client = new McpClient({ command: def.command, args: def.args, env: def.env });
  mcpClients.set(def.id, { client, cfgKey });
  return client;
}

function dropMcpClients() {
  for (const [, e] of mcpClients) { try { e.client.close(); } catch {} }
  mcpClients.clear();
}

// Groq function-listesi + çalıştırıcılar + beceri dizini (sistem notu için)
async function buildTools(settings) {
  const tools = [];
  const run = new Map();
  // 1) MCP sunucuları
  for (const def of mcpServerDefs(settings)) {
    if (!def.enabled) continue;
    try {
      const client = getMcpClient(def);
      await client.connect(20000);
      for (const t of await client.listTools()) {
        const fname = `${def.id}__${t.name}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
        if (!TOOL_NAME_RX.test(fname)) continue;
        tools.push({ type: "function", function: { name: fname, description: `[${def.id}] ${t.description || t.name}`.slice(0, 500), parameters: t.inputSchema } });
        run.set(fname, (args) => client.callTool(t.name, args || {}));
      }
    } catch (err) {
      // sunucu ayağa kalkmazsa sohbet araçsız devam eder; durum tools:status'ta görünür
      sendToPanel("chat:tool", { name: def.id, error: err.message });
    }
  }
  // 2) graphify (yerel CLI sarıcı — MCP değil, function-tool)
  const g = graphifyDef(settings);
  if (g.enabled) {
    tools.push({ type: "function", function: {
      name: "graphify_query",
      description: "Search symbols in the local code graph (graphify). Build the graph first with `graphify build` in the project dir.",
      parameters: { type: "object", properties: { symbol: { type: "string", description: "Class/function name to look up" } }, required: ["symbol"] },
    } });
    run.set("graphify_query", (args) => new Promise((resolve, reject) => {
      const symbol = String(args?.symbol || "").trim();
      if (!/^[A-Za-z0-9_.$:#/\\-]{1,120}$/.test(symbol)) return reject(new Error("Invalid symbol."));
      execFile("graphify", ["query", g.graph, symbol], { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`graphify: ${String(stderr || err.message).slice(0, 300)}`));
        resolve(String(stdout || "(no results)").slice(0, 8000));
      });
    }));
  }
  // 3) beceri yükleyici (superpowers — dizin sistemde, tam metin istekle)
  const sk = skillsState(settings);
  let skillIndex = "";
  if (sk.master && sk.dir && sk.enabled.length) {
    skillIndex = Skills.buildSkillsIndex(sk.enabled);
    tools.push({ type: "function", function: {
      name: "alpha_load_skill",
      description: "Load the full text of a skill (SKILL.md). Only call for skills in the index.",
      parameters: { type: "object", properties: { name: { type: "string", description: "Skill name (exactly as in the index)" } }, required: ["name"] },
    } });
    run.set("alpha_load_skill", async (args) => {
      const fresh = skillsState(loadSettings());
      const hit = fresh.master && fresh.enabled.find((s) => s.name === args?.name);
      if (!hit) throw new Error("Skill is off or not found.");
      return Skills.loadSkill(hit.dir, args.name);
    });
  }
  // 4) kalıcı hafıza: model yalnızca ÖNERİ ekler, kullanıcı Hafıza'da onaylar
  tools.push({ type: "function", function: {
    name: "remember_user",
    description: "Propose one durable fact about the user (name, age, hobbies, interests, recurring habits/mistakes). Only call when the user reveals something durable about themselves; never speculate and never call more than once per fact.",
    parameters: {
      type: "object",
      properties: {
        field: { type: "string", enum: Profile.FIELD_KEYS, description: "Profile field to propose for" },
        value: { type: "string", description: "Short Turkish phrase, e.g. 'siber güvenlikle ilgileniyor'" },
      },
      required: ["field", "value"],
    },
  } });
  run.set("remember_user", async (args) => {
    const p = Profile.load(app.getPath("userData"));
    const added = Profile.addPending(p, args?.field, args?.value);
    if (!added) return "Profilde ya da bekleyen listede zaten var.";
    Profile.save(app.getPath("userData"), p);
    sendToPanel("profile:pending", { count: p.pending.length });
    return "Profil önerisi eklendi (Ayarlar → Hafıza'da onay bekliyor).";
  });
  return { tools, run, skillIndex };
}

/* ── kalıcı kişisel hafıza (profile.json) ── */
ipcMain.handle("profile:get", () => ({ ok: true, ...Profile.load(app.getPath("userData")) }));

ipcMain.handle("profile:save", (_e, patch) => {
  const p = Profile.load(app.getPath("userData"));
  for (const k of Profile.FIELD_KEYS) {
    if (patch && typeof patch[k] === "string") p[k] = patch[k].slice(0, 600);
  }
  p.updatedAt = Date.now();
  return { ok: true, ...Profile.save(app.getPath("userData"), p) };
});

ipcMain.handle("profile:resolve", (_e, { id, action } = {}) => {
  const p = Profile.load(app.getPath("userData"));
  const ok = Profile.resolvePending(p, String(id || ""), action === "accept" ? "accept" : "reject");
  if (!ok) return { ok: false, error: "Öneri bulunamadı." };
  return { ok: true, ...Profile.save(app.getPath("userData"), p) };
});

ipcMain.handle("profile:clear", () => {
  const p = Profile.emptyProfile();
  p.updatedAt = Date.now();
  return { ok: true, ...Profile.save(app.getPath("userData"), p) };
});

/* ── beceri yükleme: klasör seç · SKILL.md içe al · metni oku ── */
ipcMain.handle("skills:pickDir", async () => {
  if (!panelWin || panelWin.isDestroyed()) return { ok: false, error: "Panel penceresi yok." };
  dialogOpen += 1;
  let res;
  try {
    res = await dialog.showOpenDialog(panelWin, {
      title: "Beceri klasörü seç (içinde <ad>/SKILL.md olan)",
      buttonLabel: "Ekle",
      properties: ["openDirectory", "createDirectory"],
    });
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    dialogOpen = Math.max(0, dialogOpen - 1);
    try { panelWin.focus(); } catch {}
  }
  if (!res || res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
  const dir = res.filePaths[0];
  const sk = loadSettings().skills || {};
  /* ekle, ÜZERİNE YAZMA: mevcut kaynaklar (marketplace, opencode) korunur */
  const dirs = [...new Set([...(sk.dirs || []), ...(sk.dir ? [sk.dir] : []), dir])];
  saveSettings({ skills: { ...sk, dirs, dir: undefined } });
  const st = skillsState(loadSettings());
  return { ok: true, dir, found: st.all.length };
});

ipcMain.handle("skills:import", (_e, { name, text } = {}) => {
  const n = String(name || "").trim().toLowerCase();
  if (!Skills.NAME_RX.test(n)) return { ok: false, error: "Ad geçersiz: küçük harf, sayı, tire (örn. sprint-review)." };
  const body = String(text || "");
  if (!body.trim()) return { ok: false, error: "SKILL.md boş." };
  if (body.length > 60 * 1024) return { ok: false, error: "60 KB'tan büyük." };
  const root = path.join(app.getPath("userData"), "skills");
  try {
    fs.mkdirSync(path.join(root, n), { recursive: true });
    fs.writeFileSync(path.join(root, n, "SKILL.md"), body);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const sk = loadSettings().skills || {};
  /* içe alınan beceriler kendi kökünde durur, listede EN SONA düşer:
     aynı adlı gerçek beceriyi (opencode/marketplace) gölgelemez */
  saveSettings({ skills: { ...sk, importDir: root, dir: undefined } });
  return { ok: true, name: n };
});

ipcMain.handle("skills:load", (_e, name) => {
  const st = skillsState(loadSettings());
  const hit = st.all.find((s) => s.name === name);
  if (!hit) return { ok: false, error: "Beceri bulunamadı." };
  try { return { ok: true, text: Skills.loadSkill(hit.dir, name) }; }
  catch (err) { return { ok: false, error: err.message }; }
});

/* Araç/beceri/MCP durum paneli (Ayarlar sekmesi) */
ipcMain.handle("tools:status", async () => {
  const settings = loadSettings();
  const servers = [];
  for (const def of mcpServerDefs(settings)) {
    const row = { id: def.id, label: def.label, enabled: def.enabled, needsKey: def.needsKey, connected: false, tools: [], error: "" };
    if (def.enabled) {
      try {
        const client = getMcpClient(def);
        await client.connect(12000);
        row.connected = true;
        row.tools = (await client.listTools()).map((t) => t.name);
      } catch (err) { row.error = err.message; }
    }
    servers.push(row);
  }
  const g = graphifyDef(settings);
  const sk = skillsState(settings);
  return {
    ok: true,
    servers,
    graphify: { enabled: g.enabled, graph: g.graph, graphExists: g.graph ? require("node:fs").existsSync(g.graph) : false },
    skills: {
      master: sk.master,
      dir: sk.dir || "",
      dirs: sk.dirs,
      sources: sk.dirs.length,
      found: sk.all.length,
      indexTokens: sk.enabled.reduce((n, s) => n + s.indexTokens, 0),
      list: sk.all.map((s) => ({ name: s.name, description: s.description, estTokens: s.estTokens, on: sk.enabled.some((e) => e.name === s.name) })),
    },
  };
});

ipcMain.handle("tools:ping", async (_e, id) => {
  const settings = loadSettings();
  const def = mcpServerDefs(settings).find((d) => d.id === id);
  if (!def) return { ok: false, error: "Unknown server." };
  try {
    const client = getMcpClient(def);
    await client.connect(15000);
    const tools = await client.listTools();
    return { ok: true, tools: tools.map((t) => t.name) };
  } catch (err) { return { ok: false, error: err.message }; }
});

/* Zen/Groq: doğrudan sohbet (gateway bypass) — geçmiş aktif yerel session'dan gelir */
let zenAbort = null;
ipcMain.handle("zen:send", async (_e, { message, history, skills }) => {
  const settings = loadSettings();
  const provider = settings.provider || "groq";
  const isGroq = provider === "groq";
  const apiKey = (isGroq ? settings.groqKey : settings.ocKey || "").trim();
  const model = (isGroq ? settings.groqModel : settings.ocModel || "glm-5.3-flash-free").trim();
  if (!apiKey) return { ok: false, error: "No API key. Add one in Settings.", kind: "auth" };
  try { zenAbort?.abort(); } catch {}
  zenAbort = new AbortController();
  const text = String(message || "");
  /* @beceri: kullanıcı bestecide açıkça çağırdıysa o becerinin TAM metni bu
     mesaja eklenir — model "belki kullanırım" diye tahmin etmez. */
  let skillPreamble = "";
  const pins = Array.isArray(skills) ? skills.filter((n) => typeof n === "string").slice(0, 3) : [];
  if (pins.length) {
    const st = skillsState(settings);
    if (st.master) {
      for (const name of pins) {
        const hit = st.enabled.find((s) => s.name === name);
        if (!hit) continue;
        try {
          skillPreamble += `\n\n[BECERİ: ${name} — kullanıcı bu mesajda açıkça istedi, talimatlarını uygula]\n` + Skills.loadSkill(hit.dir, name);
        } catch { /* okunamayan beceri mesajı engellemez */ }
      }
    }
  }
  const userContent = text + skillPreamble;
  // aktif session → geçmiş (renderer'dan gelen history yalnızca yedek)
  const { store, active } = Sessions.ensureActive(app.getPath("userData"));
  active.messages.push({ role: "user", content: text });
  /* devralınan sohbette başlık "… → devam" kalır (ilk mesaj onu ezmesin) */
  if (!active.memory && (active.messages.length === 1 || active.title === "New chat"))
    active.title = Sessions.titleFrom(text);
  active.updatedAt = Date.now();
  saveUserSessions(store);
  const past = (Array.isArray(history) && history.length ? history : active.messages.slice(0, -1)).slice(-20)
    .filter((m) => m && (m.role === "user" || m.role === "assistant"));
  // araçlar yalnızca Groq yolunda (Zen ham chat). Araç yoksa bugünkü hızlı streaming yolu aynen çalışır.
  let toolKit = { tools: [], run: new Map(), skillIndex: "" };
  if (isGroq) {
    try { toolKit = await buildTools(settings); } catch {}
  }
  const hasTools = toolKit.tools.length > 0;
  // kişisel kimlik + (varsa) beceri dizini
  /* bağlam devri: önceki sohbetten taşınan özet, sistem mesajında hafıza olarak durur */
  const memoryNote = active.memory && active.memory.summary
    ? "\n\nÖnceki sohbetten devam — aşağıdaki özeti hatırla ve gerektiğinde kullan:\n" + active.memory.summary
    : "";
  /* kalıcı kişisel hafıza: onaylanmış alanlar her istekte bağlamda */
  const profileBlock = Profile.buildBlock(Profile.load(app.getPath("userData")));
  const systemContent = PERSONA + profileBlock + memoryNote + (toolKit.skillIndex ? "\n\n" + toolKit.skillIndex : "");
  const messages = [{ role: "system", content: systemContent }, ...past, { role: "user", content: userContent }];
  const persist = (full) => {
    const store2 = Sessions.loadStore(app.getPath("userData"));
    const cur = store2.sessions.find((s) => s.id === active.id);
    if (cur) {
      cur.messages.push({ role: "assistant", content: full });
      cur.updatedAt = Date.now();
      saveUserSessions(store2);
    }
    sendToPanel("chat:final", { text: full });
  };
  try {
    if (!hasTools) {
      const full = await sendZenChat({
        apiKey, model, messages,
        baseUrl: isGroq ? GROQ_BASE : undefined,
        label: isGroq ? "Groq" : "Zen",
        signal: zenAbort.signal,
        onDelta: (text) => sendToPanel("chat:delta", { text }),
      });
      persist(full);
      return { ok: true };
    }
    // araçlı tur: içerik canlı akar; model araç isterse balon düşer, araçlar koşar, tur tekrarlar
    let rounds = 0;
    for (;;) {
      const round = await sendChatWithTools({
        apiKey, model, messages, tools: toolKit.tools,
        baseUrl: GROQ_BASE, label: "Groq",
        signal: zenAbort.signal,
        onDelta: (text) => sendToPanel("chat:delta", { text }),
      });
      if (!round.toolCalls.length || ++rounds > MAX_TOOL_ROUNDS) {
        persist(round.content);
        return { ok: true };
      }
      // kısmi balonu kaldır, araç durumunu göster
      sendToPanel("chat:drop");
      messages.push({
        role: "assistant", content: round.content || "",
        tool_calls: round.toolCalls.map((c) => ({
          id: c.id, type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) },
        })),
      });
      for (const c of round.toolCalls) {
        sendToPanel("chat:tool", { name: c.name });
        let out;
        try {
          const fn = toolKit.run.get(c.name);
          if (!fn) throw new Error("Unknown tool.");
          out = String(await fn(c.arguments) || "(boş sonuç)");
        } catch (err) {
          out = `Error: ${err.message}`;
        }
        messages.push({ role: "tool", tool_call_id: c.id, content: out.slice(0, 12000) });
      }
    }
  } catch (err) {
    // bilinçli iptal (session değişimi/yeni sohbet) → hata ekranı yok, renderer sessizce döner
    if (err.kind === "aborted") return { ok: false, error: "Request cancelled.", kind: "aborted" };
    sendToPanel("chat:error", { message: err.message, kind: err.kind || "model" });
    return { ok: false, error: err.message, kind: err.kind || "model" };
  }
});

/* cursor konumu → renderer (avatar takibi, OC tarafı dinler) */
let cursorTimer = null;
function startCursorFeed() {
  if (cursorTimer || !panelWin || !isOpen) return;
  cursorTimer = setInterval(() => {
    try {
      const p = screen.getCursorScreenPoint();
      if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send("cursor:pos", p);
    } catch {}
  }, 100);
}
function stopCursorFeed() {
  if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
}

/* gateway olaylarını renderer'a ilet */
gateway.on("status", (s) => sendToAll("gateway:status", s));
gateway.on("delta", (d) => sendToPanel("chat:delta", d));
gateway.on("final", (d) => sendToPanel("chat:final", d));
gateway.on("chat-error", (d) => sendToPanel("chat:error", d));
gateway.on("sessions", (rows) => sendToPanel("gateway:sessions", rows));

/* ── yaşam döngüsü ── */
app.whenReady().then(() => {
  createWindow();
  // cursor akışı yalnızca panel açıkken (isOpen) — hap kapalıyken IPC yok
  // ⌘/ ile paneli aç/kapat
  globalShortcut.register("CommandOrControl+/", () => setPanel(!isOpen));
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
