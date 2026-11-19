// Notch Assistant — minimal MCP istemcisi (stdio transport).
// Yalnızca gerekenler: initialize → tools/list → tools/call.
// NDJSON (satır başına bir JSON-RPC çerçevesi) konuşur; SSE/HTTP yok.
"use strict";

const { spawn } = require("node:child_process");

const PROTOCOL_VERSION = "2024-11-05";

class McpError extends Error {
  constructor(message) {
    super(message);
    this.kind = "mcp";
  }
}

class McpClient {
  constructor(opts) {
    this.command = opts.command;
    this.args = opts.args || [];
    this.env = opts.env || {};
    this.cwd = opts.cwd || undefined;
    this.proc = null;
    this.seq = 0;
    this.pending = new Map();
    this.buf = "";
    this.toolsCache = null;
  }

  get connected() {
    return !!this.proc && this.proc.exitCode === null;
  }

  connect(timeoutMs) {
    if (this.connected) return Promise.resolve();
    const self = this;
    const wait = timeoutMs || 25000;
    return new Promise(function (resolve, reject) {
      let settled = false;
      function done(err) {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      }
      try {
        self.proc = spawn(self.command, self.args, {
          env: Object.assign({}, process.env, self.env),
          cwd: self.cwd,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        done(new McpError("Couldn't start MCP (" + self.command + "): " + err.message));
        return;
      }
      const timer = setTimeout(function () {
        self.close();
        done(new McpError("MCP timeout (" + self.command + ") — check command/key."));
      }, wait);
      self.proc.on("error", function (err) {
        clearTimeout(timer);
        done(new McpError("MCP process error (" + self.command + "): " + err.message));
      });
      self.proc.on("exit", function (code) {
        clearTimeout(timer);
        self._rejectAll(new McpError("MCP server exited (code " + code + "): " + self.command));
        self.proc = null;
      });
      self.proc.stdout.on("data", function (chunk) { self._onData(chunk); });
      self.proc.stderr.on("data", function () {});
      self._send("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: "alpha-x", version: "0.1.0" },
      }).then(function () {
        try { self._notify("notifications/initialized"); } catch (e) {}
        clearTimeout(timer);
        done();
      }).catch(function (err) {
        clearTimeout(timer);
        done(err);
      });
    });
  }

  _onData(chunk) {
    this.buf += chunk.toString("utf8");
    const lines = this.buf.split("\n");
    this.buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let f;
      try { f = JSON.parse(t); } catch (e) { continue; }
      if (f.id === undefined || f.id === null) continue;
      const p = this.pending.get(f.id);
      if (!p) continue;
      this.pending.delete(f.id);
      clearTimeout(p.timer);
      if (f.error) p.reject(new McpError("MCP error (" + f.error.code + "): " + (f.error.message || "unknown")));
      else p.resolve(f.result);
    }
  }

  _rejectAll(err) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  _send(method, params, timeoutMs) {
    const self = this;
    if (!self.proc || self.proc.exitCode !== null) {
      return Promise.reject(new McpError("MCP not connected"));
    }
    const id = ++self.seq;
    const wait = timeoutMs || 30000;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        self.pending.delete(id);
        reject(new McpError("MCP request timed out (" + method + ")"));
      }, wait);
      self.pending.set(id, { resolve, reject, timer });
      try {
        self.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      } catch (err) {
        self.pending.delete(id);
        clearTimeout(timer);
        reject(new McpError("MCP write error: " + err.message));
      }
    });
  }

  _notify(method, params) {
    if (!this.proc || this.proc.exitCode !== null) return;
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params: params || {} }) + "\n");
    } catch (e) {}
  }

  async listTools() {
    if (this.toolsCache) return this.toolsCache;
    const res = await this._send("tools/list", {});
    const arr = Array.isArray(res && res.tools) ? res.tools : [];
    this.toolsCache = arr.map(function (t) {
      const schema = t.inputSchema && typeof t.inputSchema === "object"
        ? t.inputSchema
        : { type: "object", properties: {} };
      return { name: String(t.name || ""), description: String(t.description || ""), inputSchema: schema };
    }).filter(function (t) { return !!t.name; });
    return this.toolsCache;
  }

  async callTool(name, args) {
    const res = await this._send("tools/call", { name, arguments: args || {} }, 90000);
    const blocks = Array.isArray(res && res.content) ? res.content : [];
    const texts = blocks
      .filter(function (b) { return b && (b.type === "text" || typeof b.text === "string") && b.text; })
      .map(function (b) { return b.text; });
    if (res && res.isError && !texts.length) throw new McpError("Tool error (" + name + ")");
    return texts.join("\n") || JSON.stringify(res);
  }

  close() {
    this._rejectAll(new McpError("MCP closed"));
    try { if (this.proc) this.proc.kill(); } catch (e) {}
    this.proc = null;
    this.toolsCache = null;
  }
}

module.exports = { McpClient, McpError };
