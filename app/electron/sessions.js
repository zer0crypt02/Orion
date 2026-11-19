// Notch Assistant — yerel session deposu (Groq/Zen modu).
// Gateway yokken sohbet geçmişi burada yaşar: userData/sessions.json
// { activeId, sessions: [{ id, title, createdAt, updatedAt, messages: [{role, content}] }] }
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function sessionsPath(userDataDir) {
  return path.join(userDataDir, "sessions.json");
}

function blankStore() {
  return { activeId: null, sessions: [] };
}

function loadStore(userDataDir) {
  try {
    const j = JSON.parse(fs.readFileSync(sessionsPath(userDataDir), "utf8"));
    if (Array.isArray(j.sessions)) return { activeId: j.activeId || null, sessions: j.sessions };
  } catch {}
  return blankStore();
}

function saveStore(userDataDir, store) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(sessionsPath(userDataDir), JSON.stringify(store, null, 2));
  } catch {}
}

function newId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureActive(userDataDir) {
  const store = loadStore(userDataDir);
  let active = store.sessions.find((s) => s.id === store.activeId);
  if (!active) {
    active = {
      id: newId(),
      title: "Yeni sohbet",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    store.sessions.unshift(active);
    store.activeId = active.id;
    saveStore(userDataDir, store);
  }
  return { store, active };
}

function  titleFrom(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!t) return "Yeni sohbet";
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

module.exports = {
  loadStore,
  saveStore,
  ensureActive,
  newId,
  titleFrom,
};
