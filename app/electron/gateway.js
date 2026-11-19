// OpenClaw Gateway WS istemcisi — main process.
// Protokol: docs/gateway/protocol/* (openclaw paketi)
//   connect.challenge → connect → sessions.list / chat.send / chat.subscribe / models.list
// Streaming: event:"chat" çerçeveleri, state:"delta" + deltaText (bkz. rpc-bootstrap-and-events.md)
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TOKEN_TTL_MS = 5 * 60 * 1000;

// ── Cihaz kimliği (Ed25519) ────────────────────────────────────────────────
// openclaw sessiz yerel eşleştirme: loopback + paylaşılan token + imzalı
// cihaz kimliği → otomatik onay → operator scope'ları (docs/gateway/pairing.md
// "Silent local pairing", clients.md "device pairing mint the client token").
// deviceId = sha256(raw 32-bayt public key) hex; imza payload'ı v2:
//   ["v2", deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce].join("|")
// (bkz. openclaw/dist/device-auth-BT2rF0Jc.mjs buildDeviceAuthPayload)
function b64url(buf) { return buf.toString("base64url"); }

function loadOrCreateDeviceIdentity(dir) {
  const keyFile = path.join(dir, "device-identity.json");
  try {
    const j = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    if (j.privateKeyPem && j.publicKeyPem) return j;
  } catch {}
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const identity = {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(keyFile, JSON.stringify(identity, { mode: 0o600 })); } catch {}
  return identity;
}

function buildDeviceProof(identity, { deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  const payload = ["v2", deviceId, clientId, clientMode, role, scopes.join(","), String(signedAtMs), token ?? "", nonce].join("|");
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), identity.privateKeyPem);
  return { id: deviceId, publicKey: b64url(crypto.createPublicKey(identity.publicKeyPem).export({ type: "spki", format: "der" }).subarray(12)), signature: b64url(signature), signedAt: signedAtMs, nonce };
}

function deriveDeviceId(publicKeyPem) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  const raw = der.subarray(der.length - 32); // SPKI öneki 12 bayt + 32 bayt raw key
  return crypto.createHash("sha256").update(raw).digest("hex");
}

class GatewayClient {
  constructor(identityDir) {
    this.ws = null;
    this.seq = 0;
    this.pending = new Map(); // id → { resolve, reject, timer }
    this.handlers = {};
    this.connected = false;
    this.sessionKey = "notch-assistant";
    this.identity = identityDir ? loadOrCreateDeviceIdentity(identityDir) : null;
    this.deviceId = this.identity ? deriveDeviceId(this.identity.publicKeyPem) : null;
  }

  on(event, fn) { (this.handlers[event] ||= []).push(fn); }
  emit(event, ...args) { (this.handlers[event] || []).forEach(fn => { try { fn(...args); } catch {} }); }

  _rejectAll(err) {
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }

  connect(url, token) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      const fail = (err) => { if (!settled) { settled = true; reject(err); } };

      ws.addEventListener("open", () => {
        this.emit("status", { state: "challenging", url });
      });

      ws.addEventListener("message", (ev) => {
        let f; try { f = JSON.parse(ev.data); } catch { return; }

        if (f.type === "event" && f.event === "connect.challenge") {
          const nonce = f.payload?.nonce;
          const signedAtMs = typeof f.payload?.ts === "number" ? f.payload.ts : Date.now();
          const device = this.identity && nonce ? buildDeviceProof(this.identity, {
            deviceId: this.deviceId,
            clientId: "openclaw-macos",
            clientMode: "ui",
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            signedAtMs,
            token,
            nonce,
          }) : undefined;
          const id = this._send("connect", {
            minProtocol: f.payload?.minProtocol ?? 4,
            maxProtocol: f.payload?.maxProtocol ?? 4,
            client: { id: "openclaw-macos", version: "0.1.0", platform: "macos", mode: "ui" },
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            caps: [],
            commands: [], permissions: {},
            auth: { token },
            locale: "tr-TR",
            userAgent: "notch-assistant/0.1.0",
            ...(device ? { device } : {}),
          }, TOKEN_TTL_MS);
          const entry = this.pending.get(id);
          entry.resolve = (payload) => {
            settled = true;
            this.connected = true;
            resolve(payload);
            this.emit("status", { state: "connected", url });
            this._afterConnect();
          };
          entry.reject = (err) => { settled = true; fail(err); };
          return;
        }

        if (f.type === "res") {
          const p = this.pending.get(f.id);
          if (!p) return;
          this.pending.delete(f.id);
          clearTimeout(p.timer);
          if (f.ok) p.resolve?.(f.payload);
          else p.reject?.(new Error(f.error?.message || f.error || "gateway request failed"));
          return;
        }

        if (f.type === "event") {
          if (f.event === "chat") this._onChatEvent(f.payload);
          else if (f.event === "agent") this._onAgentEvent(f.payload);
          return;
        }
      });

      ws.addEventListener("error", () => {
        fail(new Error(`Couldn't reach gateway: ${url} — is the process running?`));
      });

      ws.addEventListener("close", (e) => {
        const wasConnected = this.connected;
        this.connected = false;
        this._rejectAll(new Error("Gateway connection closed"));
        if (!settled && !wasConnected) fail(new Error(`Gateway connection refused (code ${e.code})`));
        this.emit("status", { state: "disconnected", code: e.code, reason: e.reason });
      });
    });
  }

  disconnect() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }

  _send(method, params = {}, timeoutMs = 30000) {
    const id = `p${++this.seq}`;
    this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    const timer = setTimeout(() => {
      const p = this.pending.get(id);
      if (p) { this.pending.delete(id); p.reject?.(new Error(`${method} timed out (${timeoutMs / 1000}s)`)); }
    }, timeoutMs);
    this.pending.set(id, { timer });
    return id;
  }

  request(method, params = {}, timeoutMs) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new Error("Gateway not connected"));
    const id = this._send(method, params, timeoutMs);
    const entry = this.pending.get(id);
    return new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
  }

  async _afterConnect() {
    try {
      // gerçek oturum listesi → aktif oturum anahtarı
      const sessions = await this.request("sessions.list", { limit: 10 });
      const rows = sessions?.sessions || sessions?.rows || [];
      this.emit("sessions", rows);
    } catch (err) {
      this.emit("sessions-error", err);
    }
    try {
      // canlı akış aboneliği
      await this.request("chat.subscribe", { sessionKey: this.sessionKey });
    } catch {}
  }

  _onAgentEvent(p) {
    if (!p || p.stream !== "assistant") return;
    const d = p.data || {};
    // data.text varsa yetkili anlık görüntü (delta'yı zaten içerir) → tüm metinle değiştir
    if (typeof d.text === "string") {
      this.emit("delta", { text: d.text, replace: true, runId: p.runId });
    } else if (typeof d.delta === "string" && d.delta) {
      this.emit("delta", { text: d.delta, replace: !!d.replace, runId: p.runId });
    }
  }

  _onChatEvent(p) {
    if (!p) return;
    // metin projeksiyonu agent akışından geliyor; chat delta'ları çift saymamak için yok sayılır
    if (p.state === "final" || p.state === "complete") {
      const text = p.message?.text ?? "";
      this.emit("final", { text, runId: p.runId });
    } else if (p.state === "error") {
      this.emit("chat-error", {
        message: p.errorMessage || "Model run failed.",
        kind: p.errorKind,
        detail: p.errorDetail?.providerErrorMessagePreview,
      });
    }
  }

  async send(message) {
    return this.request("chat.send", {
      sessionKey: this.sessionKey,
      message,
      idempotencyKey: `notch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }, 120000);
  }

  async listModels() {
    const payload = await this.request("models.list", {}, 20000);
    const arr = Array.isArray(payload) ? payload
      : payload?.models || payload?.items || payload?.list || [];
    return arr
      .map(m => typeof m === "string" ? { id: m } : m)
      .filter(m => m && (m.id || m.modelId || m.name) && m.enabled !== false)
      .map(m => ({
        id: m.id || m.modelId || m.name,
        label: m.label || m.displayName || m.name || m.id || m.modelId,
        provider: m.provider || m.providerId || "",
      }));
  }

  async listSessions() {
    const payload = await this.request("sessions.list", { limit: 10 });
    return payload?.sessions || payload?.rows || [];
  }
}

module.exports = { GatewayClient };
