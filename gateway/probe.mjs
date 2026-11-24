// OpenClaw Gateway protokol sonda'sı — bağımlılık yok, Node'un global WebSocket'i.
// Kullanım: node probe.mjs            (token .gateway-token dosyasından okunur)
import fs from 'node:fs';

const token = fs.readFileSync(new URL('./.gateway-token', import.meta.url), 'utf8').trim();
const url = process.env.GW_URL || 'ws://127.0.0.1:18789/';
const TIMEOUT_S = Number(process.env.GW_TIMEOUT_S || 15);
const MESSAGE = process.env.GW_MESSAGE || 'merhaba';

let seq = 0;
const log = (...a) => console.log(...a);
const short = (o) => {
  const s = JSON.stringify(o);
  return s.length > 700 ? s.slice(0, 700) + `… (${s.length} bayt)` : s;
};

const ws = new WebSocket(url);
const pending = new Map();

function send(method, params = {}) {
  const id = `p${++seq}`;
  ws.send(JSON.stringify({ type: 'req', id, method, params }));
  return id;
}

const timer = setTimeout(() => { log(`\n[timeout] ${TIMEOUT_S}s doldu, kapatılıyor`); process.exit(0); }, TIMEOUT_S * 1000);

ws.addEventListener('open', () => log('[ws] açıldı', url));

ws.addEventListener('message', (ev) => {
  let f;
  try { f = JSON.parse(ev.data); } catch { return log('[raw]', String(ev.data).slice(0, 200)); }

  if (f.type === 'event' && f.event === 'connect.challenge') {
    log('[challenge]', short(f.payload));
    const id = send('connect', {
      minProtocol: f.payload?.minProtocol ?? 4,
      maxProtocol: f.payload?.maxProtocol ?? 4,
      // Geçerli kimlikler: openclaw-macos / openclaw-control-ui / cli / gateway-client …
      // Geçerli modlar: webchat | cli | ui | backend | node | worker | probe | test
      client: {
        id: process.env.GW_CLIENT_ID || 'openclaw-macos',
        version: '0.0.1',
        platform: 'macos',
        mode: process.env.GW_CLIENT_MODE || 'ui',
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      caps: [], commands: [], permissions: {},
      auth: { token },
      locale: 'tr-TR',
      userAgent: 'notch-probe/0.0.1',
    });
    pending.set(id, { label: 'connect', at: Date.now() });
    return;
  }

  if (f.type === 'res') {
    if (process.env.GW_HELLO_DUMP === '1' && f.ok && f.payload?.type === 'hello-ok') {
      fs.writeFileSync('/tmp/openclaw-hello.json', JSON.stringify(f.payload, null, 2));
    }
    const meta = pending.get(f.id);
    log(`[res ${f.id}] ok=${f.ok}${meta ? ' (' + meta.label + ')' : ''}`, short(f.ok ? f.payload : f.error));
    if (meta?.label === 'connect' && f.ok) {
      // bağlantı kuruldu → oturum listesi
      const id = send('sessions.list', { limit: 5 });
      pending.set(id, { label: 'sessions.list' });
      // oturum yoksa genel bir mesaj denemesi (model yapılandırılmamışsa anlamlı hata döner)
      const id2 = send('chat.send', {
        sessionKey: 'main',
        message: MESSAGE,
        idempotencyKey: 'probe-' + Date.now(),
      });
      pending.set(id2, { label: 'chat.send' });
    }
    return;
  }

  if (f.type === 'event') {
    log(`[event ${f.event}]`, short(f.payload));
    return;
  }
  log('[other]', short(f));
});

ws.addEventListener('error', (e) => log('[ws error]', e?.message || String(e)));
ws.addEventListener('close', (e) => {
  log('[ws kapandı]', e.code, e.reason || '');
  clearTimeout(timer);
});
