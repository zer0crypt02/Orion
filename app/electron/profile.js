// Orion — kalıcı kişisel hafıza (profile.json).
// Sohbetten öğrenilen bilgiler buraya yazılır ve HER istekte sistem mesajına
// eklenir. Model kendi başına yazmaz: remember_user aracı yalnızca "öneri"
// (pending) üretir, kullanıcı Ayarlar → Hafıza'da onaylar. Sessiz yazma yok.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* Alanlar: hepsi düz metin — dar panelde düzenlenebilir kalsın, şema büyümesin. */
const FIELDS = [
  { key: "name", label: "Ad", hint: "Nasıl hitap etsin" },
  { key: "age", label: "Yaş", hint: "" },
  { key: "location", label: "Yer", hint: "" },
  { key: "hobbies", label: "Hobiler", hint: "" },
  { key: "interests", label: "İlgi alanları", hint: "örn. siber güvenlik, Electron" },
  { key: "habits", label: "Alışkanlıklar / sık hatalar", hint: "Tekrar eden tuzaklar, tercih ettiği yollar" },
  { key: "notes", label: "Notlar", hint: "" },
];
const FIELD_KEYS = FIELDS.map((f) => f.key);
const MAX_VALUE_CHARS = 600;
const MAX_PENDING = 20;

function emptyProfile() {
  const p = { pending: [], updatedAt: 0 };
  for (const k of FIELD_KEYS) p[k] = "";
  return p;
}

function file(userData) {
  return path.join(userData, "profile.json");
}

function load(userData) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(userData), "utf8")) || {};
  } catch { /* ilk açılış */ }
  const p = emptyProfile();
  for (const k of FIELD_KEYS) {
    if (typeof raw[k] === "string") p[k] = raw[k].slice(0, MAX_VALUE_CHARS);
  }
  p.updatedAt = Number(raw.updatedAt) || 0;
  if (Array.isArray(raw.pending)) {
    p.pending = raw.pending
      .filter((x) => x && FIELD_KEYS.includes(x.field) && typeof x.value === "string")
      .slice(-MAX_PENDING)
      .map((x) => ({ id: String(x.id || ""), field: x.field, value: String(x.value).slice(0, MAX_VALUE_CHARS), at: Number(x.at) || 0 }));
  }
  return p;
}

function save(userData, p) {
  const out = { updatedAt: Date.now() };
  for (const k of FIELD_KEYS) out[k] = String(p[k] || "").slice(0, MAX_VALUE_CHARS);
  out.pending = (p.pending || []).slice(-MAX_PENDING);
  fs.mkdirSync(path.dirname(file(userData)), { recursive: true });
  fs.writeFileSync(file(userData), JSON.stringify(out, null, 2));
  return out;
}

/* Model önerisi: aynı alan+değer zaten varsa ya da bekliyorsa eklenmez. */
function addPending(p, field, value) {
  const key = String(field || "").trim();
  const val = String(value || "").trim().slice(0, MAX_VALUE_CHARS);
  if (!FIELD_KEYS.includes(key) || !val) return false;
  const cur = String(p[key] || "").toLowerCase();
  if (cur && cur.includes(val.toLowerCase())) return false;
  if ((p.pending || []).some((x) => x.field === key && x.value.toLowerCase() === val.toLowerCase())) return false;
  p.pending = [...(p.pending || []), {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    field: key, value: val, at: Date.now(),
  }].slice(-MAX_PENDING);
  return true;
}

/* Onay: değeri alana yaz (append — mevcut bilgi korunur). Red: at. */
function resolvePending(p, id, action) {
  const item = (p.pending || []).find((x) => x.id === id);
  if (!item) return false;
  p.pending = (p.pending || []).filter((x) => x.id !== id);
  if (action === "accept") {
    const cur = String(p[item.field] || "").trim();
    const low = cur.toLowerCase();
    if (!low.includes(item.value.toLowerCase())) {
      p[item.field] = cur ? `${cur}${/[,;]$/.test(cur) ? " " : ", "}${item.value}` : item.value;
    }
  }
  p.updatedAt = Date.now();
  return true;
}

/* Sistem mesajı bloğu — boş profil hiç yer kaplamaz. */
function buildBlock(p) {
  if (!p) return "";
  const rows = FIELDS.filter((f) => String(p[f.key] || "").trim())
    .map((f) => `${f.label}: ${String(p[f.key]).trim()}`);
  if (!rows.length) return "";
  return "\n\nKULLANICI HAKKINDA (kalıcı hafıza — doğal biçimde kullan, her mesajda tekrarlama):\n" + rows.join("\n");
}

module.exports = { FIELDS, FIELD_KEYS, load, save, addPending, resolvePending, buildBlock, emptyProfile };
