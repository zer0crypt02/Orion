// Notch Assistant — Superpowers beceri yükleyici.
// Claude Code marketplace'indaki SKILL.md'leri okur; modele hepsini gömmek
// yerine dizin + alpha_load_skill aracı verilir → token tasarrufu.
// Dizin sürüm değişirse en yüksek semver otomatik seçilir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const MARKETPLACE = path.join(os.homedir(), ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
const NAME_RX = /^[a-z0-9][a-z0-9-]{0,60}$/;
const MAX_SKILL_BYTES = 60 * 1024;

/* Klasörde doğrudan <ad>/SKILL.md var mı? */
function hasSkillDirs(dir) {
  try {
    return fs.readdirSync(dir).some(function (n) {
      return NAME_RX.test(n) && fs.existsSync(path.join(dir, n, "SKILL.md"));
    });
  } catch (e) { return false; }
}

/* Kullanıcının kendi beceri kaynakları: opencode'un bilinen klasörleri.
   Bunlar özel klasörü EZMEZ, onunla birlikte okunur. */
const SOURCE_DIRS = [
  path.join(os.homedir(), ".config", "opencode", "skills"),
  path.join(os.homedir(), "Desktop", "opencode", "skills"),
];

/* Bir klasörü gerçek beceri köküne çevir: <ad>/SKILL.md ya da <kök>/skills/<ad>. */
function normalizeSkillDir(dir) {
  if (!dir) return null;
  try {
    if (hasSkillDirs(dir)) return dir;
    if (hasSkillDirs(path.join(dir, "skills"))) return path.join(dir, "skills");
  } catch (e) {}
  return dir;   // henüz boş (yeni içe alınanlar buraya yazılır)
}

/* TÜM kaynaklar: özel klasörler + opencode klasörleri + marketplace.
   Sıra öncelik sırasıdır: aynı adlı beceride ilk kaynak kazanır. */
function findSkillDirs(custom, tail) {
  const raw = [];
  if (Array.isArray(custom)) raw.push(...custom.filter(Boolean));
  else if (typeof custom === "string" && custom) raw.push(custom);
  raw.push(...SOURCE_DIRS);   // opencode: tam sürümler önce gelsin
  let versions = [];
  try {
    versions = fs.readdirSync(MARKETPLACE)
      .filter(function (v) { return fs.existsSync(path.join(MARKETPLACE, v, "skills")); })
      .sort();
  } catch (e) {}
  if (versions.length) raw.push(path.join(MARKETPLACE, versions[versions.length - 1], "skills"));
  /* son sıra: içe alınan kopyalar (aynı adı gölgelemesinler) */
  if (Array.isArray(tail)) raw.push(...tail.filter(Boolean));

  const out = [];
  for (const d of raw) {
    const n = normalizeSkillDir(d);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.filter(function (d) { try { return fs.existsSync(d); } catch (e) { return false; } });
}

/* Geriye uyum: tek dizin isteyen çağrılar için ilk kaynak. */
function findSkillsDir(customDir) {
  return findSkillDirs(customDir)[0] || null;
}

function stripQuotes(v) {
  const t = String(v || "").trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return t.slice(1, -1).trim();
  }
  return t;
}

function parseFrontmatter(text) {
  const out = {};
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text || "");
  if (!m) return out;
  const lines = m[1].split("\n");
  for (const line of lines) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) out[kv[1]] = stripQuotes(kv[2]);
  }
  return out;
}

function listSkills(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(function (n) {
      return NAME_RX.test(n) && fs.existsSync(path.join(dir, n, "SKILL.md"));
    });
  } catch (e) {
    return [];
  }
  return names.sort().map(function (name) {
    let text = "";
    try { text = fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8"); } catch (e) {}
    const fm = parseFrontmatter(text);
    const chars = text.length;
    const desc = fm.description || "(no description)";
    return {
      name,
      dir,                 // hangi kaynaktan geldiği (yükleme bu dizinden yapılır)
      description: desc,
      chars,
      estTokens: Math.max(1, Math.ceil(chars / 4)),
      indexTokens: Math.max(1, Math.ceil((name.length + desc.length + 4) / 4)),
    };
  });
}

// dizin metni: modele verilen kompakt liste (ad başına birkaç token)
function buildSkillsIndex(skills) {
  if (!skills.length) return "";
  const lines = skills.map(function (s) { return "- " + s.name + ": " + s.description; });
  return "Available skills (load full text with the alpha_load_skill tool when needed, don't apply them from memory):\n" + lines.join("\n");
}

function loadSkill(dir, name) {
  if (!NAME_RX.test(String(name || ""))) throw new Error("Invalid skill name.");
  const file = path.join(dir, name, "SKILL.md");
  if (path.dirname(path.resolve(file)) !== path.resolve(path.join(dir, name))) {
    throw new Error("Invalid skill path.");
  }
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error("Skill not found: " + name);
  }
  if (text.length > MAX_SKILL_BYTES) text = text.slice(0, MAX_SKILL_BYTES) + "\n…(truncated)";
  return text;
}

module.exports = { findSkillsDir, findSkillDirs, listSkills, buildSkillsIndex, loadSkill, NAME_RX, hasSkillDirs, SOURCE_DIRS };
