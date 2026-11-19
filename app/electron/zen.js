// Notch Assistant — Opencode Zen v1 istemcisi (main process).
// OpenAI-uyumlu Chat Completions + SSE. Anahtar yalnızca bellekte tutulur,
// asla loglanmaz. Ücretsiz Zen modelleri üçüncü parti istemciden çalışır (v1).
"use strict";

const ZEN_BASE = "https://opencode.ai/zen/v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";

class ZenError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

function classifyHttp(status, bodyText, label) {
  const t = String(bodyText || "");
  let parsed = null;
  try { parsed = JSON.parse(t); } catch { /* düz metin gövde */ }
  const type = parsed?.error?.type || parsed?.type || "";
  const msg = parsed?.error?.message || parsed?.message || "";
  /* Zen ücretsiz modelleri YALNIZCA kendi uygulamasında kabul ediyor.
     API anahtarıyla gelen istek 429 FreeUsageLimitError / 403 {"model":""} alır.
     Bu bir anahtar hatası DEĞİL: kullanıcıyı yanlış yola sokmayalım. */
  if (/freeusage|free_usage|free usage limit/i.test(type) || /free usage limit|works in opencode/i.test(msg))
    return new ZenError(
      `${label}: free models are limited to the OpenCode app; the API key path is rejected (HTTP ${status}). Use Groq, or subscribe to OpenCode Go.`,
      "zen_free_limit", status);
  if (status === 403 && /"model"\s*:\s*""/.test(t))
    return new ZenError(`${label} refused this model for the key (403). Pick a paid model or use Groq.`, "zen_model_blocked", status);
  if (status === 401 || status === 403)
    return new ZenError(
      `${label} key was rejected (401/403). Check the key and account status.`,
      "auth", status);
  if (status === 429)
    return new ZenError("Rate limit exceeded (429). Wait a bit and retry.", "rate_limit", status);
  if (/context[_-]?length|too many tokens|maximum context/i.test(t))
    return new ZenError("Model context is full. Start a new chat.", "context_length", status);
  const detail = t.slice(0, 200);
  return new ZenError(`${label} error (HTTP ${status})${detail ? ": " + detail : ""}.`, "model", status);
}

async function sendChat({ apiKey, model, messages, onDelta, signal, timeoutMs = 120000, baseUrl = ZEN_BASE, label = "Zen" }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("zaman aşımı")), timeoutMs);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener?.("abort", onAbort, { once: true });
  if (signal?.aborted) ctrl.abort(signal.reason); // zaten iptal edilmişse (yarış durumu)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw classifyHttp(res.status, body, label);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim().split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta?.(delta);
        }
        const finish = json.choices?.[0]?.finish_reason;
        if (finish === "length") {
          throw new ZenError(`${label}: context full (reply cut off). Start a new chat.`, "context_length", 200);
        }
      }
    }
    return full;
  } catch (err) {
    if (err instanceof ZenError) throw err;
    // kullanıcının iptali (session değişimi) ile gerçek zaman aşımını ayırt et
    if (signal?.aborted)
      throw new ZenError("Request cancelled.", "aborted");
    if (err?.name === "AbortError" || /zaman aşımı/i.test(err?.message || ""))
      throw new ZenError(`${label} didn't respond (timeout).`, "timeout");
    throw new ZenError(`${label} connection failed: ${err?.message || err}`, "connection");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

/* Araç destekli sohbet: tek streaming turu; içerik canlı akar,
   model araç çağırırsa delta sonunda toolCalls döner (görüntülenmez). */
async function sendChatWithTools({ apiKey, model, messages, tools, onDelta, signal, timeoutMs = 120000, baseUrl = GROQ_BASE, label = "Groq" }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("zaman aşımı")), timeoutMs);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener?.("abort", onAbort, { once: true });
  if (signal?.aborted) ctrl.abort(signal.reason);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw classifyHttp(res.status, body, label);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    const calls = new Map(); // index → { id, name, args }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim().split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        const delta = json.choices?.[0]?.delta || {};
        if (typeof delta.content === "string" && delta.content) {
          full += delta.content;
          onDelta?.(delta.content);
        }
        for (const tc of delta.tool_calls || []) {
          const i = tc.index ?? 0;
          const cur = calls.get(i) || { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(i, cur);
        }
        const finish = json.choices?.[0]?.finish_reason;
        if (finish === "length" && !calls.size) {
          throw new ZenError(`${label}: context full (reply cut off). Start a new chat.`, "context_length", 200);
        }
      }
    }
    const toolCalls = [...calls.values()]
      .filter((c) => c.name)
      .map((c) => {
        let args = {};
        try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = { _raw: c.args }; }
        return { id: c.id || `call-${Date.now()}`, name: c.name, arguments: args };
      });
    return { content: full, toolCalls };
  } catch (err) {
    if (err instanceof ZenError) throw err;
    if (signal?.aborted)
      throw new ZenError("Request cancelled.", "aborted");
    if (err?.name === "AbortError" || /zaman aşımı/i.test(err?.message || ""))
      throw new ZenError(`${label} didn't respond (timeout).`, "timeout");
    throw new ZenError(`${label} connection failed: ${err?.message || err}`, "connection");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

module.exports = { sendChat, sendChatWithTools, ZenError, classifyHttp, ZEN_BASE, GROQ_BASE };
