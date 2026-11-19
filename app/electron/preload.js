// Notch Assistant — preload köprüsü (contextIsolation açık)
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notch", {
  // panel
  togglePanel: () => ipcRenderer.invoke("panel:toggle"),
  panelState: () => ipcRenderer.invoke("panel:state"),
  sidebarSet: (open) => ipcRenderer.invoke("sidebar:set", !!open),
  onPanelChanged: (fn) => ipcRenderer.on("panel:changed", (_e, s) => fn(s)),

  // ayarlar
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),

  // gateway
  connectGateway: (cfg) => ipcRenderer.invoke("gateway:connect", cfg),
  listModels: () => ipcRenderer.invoke("gateway:models"),
  listSessions: () => ipcRenderer.invoke("gateway:sessions"),
  switchGatewaySession: (key) => ipcRenderer.invoke("gateway:session-switch", key),
  listGroqModels: (force) => ipcRenderer.invoke("groq:models", { force: !!force }),

  // yerel session'lar (Groq/Zen)
  sessionsList: () => ipcRenderer.invoke("sessions:list"),
  sessionsGet: () => ipcRenderer.invoke("sessions:get"),
  sessionsNew: (title) => ipcRenderer.invoke("sessions:new", title),
  sessionsSwitch: (id) => ipcRenderer.invoke("sessions:switch", id),
  sessionsDelete: (id) => ipcRenderer.invoke("sessions:delete", id),
  onGatewayStatus: (fn) => ipcRenderer.on("gateway:status", (_e, s) => fn(s)),
  onSessions: (fn) => ipcRenderer.on("gateway:sessions", (_e, rows) => fn(rows)),

  // sohbet
  sendMessage: (text) => ipcRenderer.invoke("chat:send", text),
  sendZenMessage: (message, history, skills) => ipcRenderer.invoke("zen:send", { message, history, skills }),
  /* bağlam devri: sohbeti özetle → yeni sohbet (hafıza taşınır) */
  sessionsCarry: () => ipcRenderer.invoke("sessions:carry"),

  // kalıcı kişisel hafıza
  profileGet: () => ipcRenderer.invoke("profile:get"),
  profileSave: (patch) => ipcRenderer.invoke("profile:save", patch),
  profileResolve: (id, action) => ipcRenderer.invoke("profile:resolve", { id, action }),
  profileClear: () => ipcRenderer.invoke("profile:clear"),
  onProfilePending: (fn) => ipcRenderer.on("profile:pending", (_e, d) => fn(d)),

  // beceri yükleme
  skillsPickDir: () => ipcRenderer.invoke("skills:pickDir"),
  skillsImport: (name, text) => ipcRenderer.invoke("skills:import", { name, text }),
  skillsLoad: (name) => ipcRenderer.invoke("skills:load", name),
  onToolActivity: (fn) => ipcRenderer.on("chat:tool", (_e, d) => fn(d)),
  onDropBubble: (fn) => ipcRenderer.on("chat:drop", () => fn()),

  // araçlar / beceriler / MCP
  toolsStatus: () => ipcRenderer.invoke("tools:status"),
  toolsPing: (id) => ipcRenderer.invoke("tools:ping", id),
  onCursorPos: (fn) => ipcRenderer.on("cursor:pos", (_e, p) => fn(p)),
  onDelta: (fn) => ipcRenderer.on("chat:delta", (_e, d) => fn(d)),
  onFinal: (fn) => ipcRenderer.on("chat:final", (_e, d) => fn(d)),
  onChatError: (fn) => ipcRenderer.on("chat:error", (_e, d) => fn(d)),
});
