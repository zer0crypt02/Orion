# Orion — Notch Asistanı · Proje Belgesi

> macOS çentiğinde (notch) yaşayan, kişisel kullanıma özel bir AI masaüstü asistanı.
> Bu belge projenin %100'ünü anlatır: mimari, dosya düzeni, tasarım dili, davranış
> kuralları, dondurulmuş sınırlar ve geliştirme akışı. Son güncelleme: 2026-11-11.

---

## 1. Orion nedir?

Orion; MacBook'un ekran çentiğinde **kapalıyken bir hap (pill)**, **açıkken cam bir
panel** olarak yaşayan bir asistandır. İçinde animasyonlu bir bulut karakteri
(avatar) yaşar — bu karakter bir süs değil, **sözleşmeli bir iş arkadaşıdır**: her
yerleşim durumunda sabit bir "evi" vardır, sohbet metnini asla örtmez, tepkileri
soğuma (cooldown) kurallarıyla yönetilir.

- **Kişisel proje** — dağıtım/paketleme hedefi yok (CSP uyarısı bilinçli tolere edilir).
- Lisans: tüm hakları saklıdır (bkz. `LICENSE`) · paket adı: `notch-assistant` · sürüm `0.1.0`.

---

## 2. Dizayn kararlarının evrimi (kritik arka plan)

| Tur | Karar | Durum |
|---|---|---|
| v4 | İki pencere mimarisi (pill/panel), katman sırası, token disiplini | ✅ Donmuş |
| Çözüm A | Panel boyutu per-frame `setBounds` yerine **renderer-only GPU animasyonu** (judder fix) | ✅ Donmuş |
| Avatar polish | Sağa dayalı varsayılan konum, çember içi buğulu disk, üç-renkli halka | ✅ |
| ThoughtLine | React Bits portu → `js/thoughtline.js` (adım dizisi + settle akoru) | ✅ |
| Typewriter | Stream'i daktilo temposunda sunma (`js/typewriter.js`) | ✅ |
| Free-floating | Boş sohbette çembere sığmayan büyük avatar; chat'te docked çember | ✅ |
| SquishSwitch | React Bits portu → settings toggle'ları vanilla squish switch | ✅ |
| Companion sistemi | Tek ev haritası + ambient motoru (cooldown, service-wins) | ✅ |
| Companion polish | Davranış anayasası + sevilme tırmandırması + mikro-not balonu | ✅ |

---

## 3. Mimari genel bakış

```
macOS notch
└── Electron (main: electron/main.js)  ← tek BrowserWindow, iki "mod"
    ├── KAPALI: hap (196×36)  → "hazır" metni + nabız noktası
    └── AÇIK:  panel (481×600; sidebar açıkken 701×600)
        ├── [0] .window       → cam kabuk (vibrancy + rim + çentik omuzları)
        ├── [1] .panel-ui     → sohbet, composer, sidebar, chips, settings
        └── [2] .avatar-layer → dairesel, sürüklenebilir avatar (en üst)
```

**Ana ilke:** pencere geometrisi sadece mod geçişlerinde bir kez değişir; tüm
canlı animasyon renderer'da **transform-only GPU** işidir. Ana süreçte animasyon
yok, IPC kanal isimleri değişmez.

### Boyutlar (electron/main.js)
| Sabit | Değer |
|---|---|
| `PILL` | 196 × 36 |
| `PANEL` | 481 × 600 |
| `SIDEBAR_W` | 220 |
| `WIDE` | 701 × 600 (PANEL + SIDEBAR_W) |

---

## 4. Dosya haritası

```
notch/
├── PROJECT.md                    ← bu belge
├── PROMPT-*.md                   ← coder'a verilen tasarım brifleri (EN, tarihçe)
└── app/
    ├── package.json              ← 1 çalışma bağımlılığı: @bible-strong/avatar-web
    ├── electron/                 ← ANA SÜREÇ (dondurulmuş sınırlar aşağıda)
    │   ├── main.js      (698)    ← pencereler, IPC, sohbet/araç yolları, settings
    │   ├── gateway.js   (246)    ← OpenClaw WebSocket istemcisi
    │   ├── zen.js       (174)    ← Opencode Zen / Groq HTTP streaming yolu
    │   ├── sessions.js  (66)     ← yerel sohbet oturumları (userData'da JSON)
    │   ├── skills.js    (97)     ← Superpowers beceri dizini yükleyici
    │   ├── mcp.js       (174)    ← MCP (Context7) istemcisi
    │   ├── preload.js   (45)     ← contextBridge → window.notch API
    │   └── fnwatcher.swift       ← fn tuşu izleyici (Swift yardımcı)
    └── renderer/
        ├── index.html            ← katman iskeleti + CSP
        ├── avatar-cursor.js      ← imleç kenar davranışı
        ├── listening-preview.html← mikrofon önizleme sayfası
        ├── assets/orion.avatar.json ← avatar tanımı (DONDURULMUŞ, read-only)
        ├── vendor/avatar-web.bundle.js ← avatar runtime (esbuild paketi, DONDURULMUŞ)
        ├── js/
        │   ├── app.js        (686) ← tüm UI akışı: status, chat, sessions, settings
        │   ├── avatar.js     (557) ← AVATAR: ev haritası + durum makinesi + ambient
        │   ├── thoughtline.js(252) ← "Düşünüyor" satırı (adımlar, süre, settle akoru)
        │   ├── typewriter.js (439) ← cevabı daktilo temposunda gösteren kuyruk
        │   ├── squishswitch.js(285)← settings toggle'ları (React Bits portu)
        │   ├── md.js         (162) ← escape-first markdown parser + codeBlockShell
        │   └── dom.js        (13)  ← $, el, scrollEnd yardımcıları
        ├── styles/
        │   ├── tokens.css    (116) ← TEK tasarım token kaynağı (renk/süre/easing)
        │   ├── base.css      (137) ← reset + reduced-motion global bloğu
        │   └── components.css(626) ← tüm bileşen CSS'i (avatar, thoughtline, chat…)
        └── vendor/                   ← yukarıda
```

---

## 5. Sohbet yolları (model erişimi)

`send()` (renderer) → provider seçimi:

1. **Zen/Groq (birincil):** `provider=zen` → `ocKey` + `ocModel`; `provider=groq`
   → `groqKey` + `groqModel`. Ana süreç `zen:send` ile HTTP streaming yapar;
   delta'lar `chat:delta`, canonik final `chat:final` ile panel'e gelir.
2. **OpenClaw Gateway (fallback, İSTEĞE BAĞLI):** `gateway.js` üzerinden
   `ws://127.0.0.1:18789/` (ayarlanabilir) + token. Gateway KAPALIYKEN Zen/Groq
   anahtarı varsa uygulama normal çalışır — bu nedenle settings'teki "Kaydet &
   bağlan" artık gateway hatasını engelleyici hata olarak göstermez ("Kaydedildi ✓"
   + conn satırında isteğe bağlı not).

Araçlar (Groq yolunda): hava durumu benzeri basit araçlar + `alpha_load_skill`
beceri yükleyici + Context7 MCP araçları. Beceri dizini sistem prompt'una
`buildSkillsIndex()` ile ~token-başına-4-char maliyetle eklenir.

### IPC kanalları (DONDURULMUŞ — isimler asla değişmez)
`panel:toggle, panel:state, sidebar:set, settings:get, settings:set,
gateway:connect, gateway:models, gateway:sessions, gateway:session-switch,
sessions:list, sessions:get, sessions:new, sessions:switch, sessions:delete,
groq:models, chat:send, tools:status, tools:ping, zen:send`
+ panel'e gidenler: `chat:delta, chat:final, chat:drop, chat:tool, chat:error,
panel:changed, gateway:status, tool:activity`

---

## 6. Avatar sistemi (companion sözleşmesi)

### 6.1 Davranış anayasası (js/avatar.js başında kodla da yazılı)
```
ORION COMPANION RULES:
1. Durum başına TEK sabit ev; sohbet metnini asla örtmez.
2. Durgunluk varsayılandır — ambient hareketler nadir, yavaş, küçük.
3. Hizmet durumları (düşünme/akış/hata) kişilikten ÜSTÜN. Her zaman.
4. Kutlama yalnızca kullanıcının eyleminden SONRA; istenmeyen pop-up yok.
5. Tepkiler çabuk söner; her davranışın soğuması ve çıkış yolu vardır.
```

### 6.2 Ev haritası
| Durum | Ev |
|---|---|
| Boş sohbet (`body:not(.has-chat)`) | **Serbest:** çember/halka/disk yok, ~144px görsel (96px taban × 1.5), `#stage` yatay merkezinde, içerik üstü boş alanın dikey merkezinde; sürüklenemez (`pointer-events:none`), kayıtlı konum yok sayılır |
| Sohbet (mesaj var/yok) | **Docked:** composer'ın sağ üstünde 58px çember; sürüklenebilir, konum `localStorage("orion.avatarPos")`'da persist, çift tık/Enter → varsayılan |
| Serbest↔docked geçiş | TEK transform-only hareket, ~320ms `--dur-slow` + `--ease-out`; halka+buzlu disk ikincil katman olarak hareketin sonunda içeri süzülür |

Geometri doğruluğu: çapa `#stage` rect'inden hesaplanır (layer tüm paneli kaplar,
sidebar dahil — bu nedenle stage referans alınır); `ResizeObserver` + iki-ölçüm
uzlaşması (settle check) bayat ölçüm yarışlarını öldürür; sidebar açık/kapalı,
resize, panel açılışı → hepsi tek kanaldan taze çapa.

### 6.3 Durum makinesi (eşikler DONDURULMUŞ)
- `IDLE_MS = 90000` → uyku; `WAKE_MS = 2300` → waking ara geçişi → listening
- Yazma/odak → `pokeActivity` → listening; hata → `surprised` (2.6s) → `sad`
- **Halka dili:** idle = üç-renkli conic döngü (7s linear, sıçrama yok),
  listening = mavi pulse (2.4s, pill noktasıyla aynı nefes), thinking = dönen yay
  (1.6s linear), error = mercan statik ("hata serttir")

### 6.4 Ambient motoru (kişilik katmanı)
- `AMBIENT_COOLDOWN = 6000` — iki ambient davranış arası asgari süre
- **Service-wins:** `thinking/streaming/error` durumları ambient'i asla kesmez
- **Peek:** sohbetin en tepesinde yukarı kaydırma jesti → tek `curious` → ~2.5s
  sonra idle
- **Drowse:** 25s sessiz okuma → tek `drowsy`; `pokeActivity` geri döndürür
- **Settle:** happy/laughing/celebrate/curious/… → ~5s sonra `idle` (sonsuz loop
  yok); yeni `play()` bekleyen settle'ı iptal eder
- **Sevilme tırmandırması (pet-to-warm):** 10s pencere içinde ardışık sürükleme
  dürtmeleri → 2.'de `playful`, 3.+ `excited` (tavan) → settle + pencere sıfır;
  çift tık sayılmaz; uyuyan avatar dürtmeyle uyanmaz (uyandırma yalnızca
  yazma/odak işi)
- **Mikro-not balonu:** yalnızca `onFinal` anlarında (hata düzelince "Toparladık
  🎉", session ilk yanıtında "Buradayım."); halkanın SOLUNDAKI rezerve şeritte
  (measureNoteSlot() <110px ise göstermez, kota harcamaz); 30sn sert kap;
  akış başlarsa anında kapanır; tıkla/Esc kapatır; ~2.5s görünür; cam reçetesi +
  token renkleri; reduced-motion = fade

### 6.5 Dondurulmuş avatar varlıkları
`vendor/avatar-web.bundle.js` ve `assets/orion.avatar.json` **asla değişmez**.
Bundle'da 23 animasyon vardır: sleeping, waking, idle, listening, thinking,
searching, working, excited, bored, suspicious, angry, drowsy, happy, curious,
confused, surprised, proud, shy, sad, laughing, scared, playful, celebrate.
Kimlik kilidi: hareket çeşitlenir, **yüz/şekil asla değişmez** (Replika dersi).

---

## 7. UI katmanları ve bileşenler

### ThoughtLine (`js/thoughtline.js`)
Cevap beklerken sol hizalı canlı satır: "Bağlanıyor → Düşünüyor → Yanıt yazıyor"
adım dizisi + `tabular-nums` sayaç. Adım min görünürlük `STEP_MIN_MS=350`,
toplam min çalışma `MIN_WORK_MS=600` ("Bağlanıyor" flash'ı düzeltmesi).
Settle akoru: "X sn'de yanıtlandı" cümlesine blur-dikişli (~2px) çapraz geçiş.

### Typewriter (`js/typewriter.js`)
Stream delta'ları buffer'a girer, tek paylaşılan rAF döngüsü (10Hz batch)
tüketir: `BASE_CPS=75`, backlog >240 char → 4x'e kadar rampa, toplam ≤~8s;
`LONG_AT=4000` sonrası satır-reveal. Kod blokları final `pre`'ine metin-düğüm
olarak akar (fence kapanınca zıplamasız yükseltme — sealed-region bug'ı
giderildi). Scroll pinleme: 28px tolerans, yukarı çalmaz. Abort → kuyruk
anında durur, kısmi metin kalır. `prefers-reduced-motion` → anında final render.

### SquishSwitch (`js/squishswitch.js`)
React Bits portu (motion/react → rAF spring integratörü): thumb x-spring
(stiffness `170-(50-speed)*1.1`, damping 21.5), hızdan squash&stretch (alan
korunur), hover şişmesi, 320ms renk çapraz geçişi. `#tgContext7, #tgGraphify,
#tgSkills` id'leri ve `aria-checked` sözleşmesi korunur. Settings'te toggle
çevirmek anında persist eder (Kaydet'e gerekmez) + 2s flip-guard.

### Settings paneli
Alanlar: OpenClaw URL/token, provider (zen/groq), model listeleri (canlı + fallback),
Opencode/Groq anahtarları, Context7 (anahtar + test), Graphify (graf yolu),
Superpowers (master + beceri satırları). "Kaydet & bağlan": kayıt daima başarılı
sayılır ("Kaydedildi ✓"); gateway bağlantısı isteğe bağlı ikincil yoldur.

---

## 8. Tasarım dili

- **Tek token kaynağı:** `styles/tokens.css` — süre paleti `--dur-micro 120 /
  quick 160 / base 200 / slow 320`; imza easing `--ease-out
  cubic-bezier(.22,1,.36,1)` (premium arketip, %0 overshoot); `--glass-*` cam
  reçetesi; `--ring-deep/navy/sky` halka üçlüsü; `--color-error` ailesi.
- **Token disiplini:** bileşen CSS'inde raw hex / raw ms YASAK — her değer
  tokens.css'ten çözülür.
- **Animasyon disiplini:** transform/opacity only; layout özelliği (width/height/
  top/left) animasyonu yok; tek paylaşılan rAF döngüleri; `prefers-reduced-motion`
  global blok (base.css) + JS `matchMedia` yolları.
- **Katman sırası (index.html'de de belgeli):** [0] .window cam kabuğu (dokunulmaz)
  → [1] .panel-ui içerik → [2] .avatar-layer en üst etkileşimli.
- **Cam kuralı:** tek blur `.orb-clip::before` içindedir (1px halka içinde);
  blur asla daire dışına/diğer katmanlara sızmaz.
- Referans yetenek: `~/.config/opencode/skills/motion-design/` (LottieFiles).

---

## 9. Dondurulmuş sınırlar (RED LINES — her prompt'ta tekrarlanır)

| Alan | Kural |
|---|---|
| `app/electron/main.js` | Değiştirilmez |
| IPC kanal isimleri | Değiştirilmez |
| npm bağımlılıkları | SIFIR yeni bağımlılık (renderer React'tir ASLA; React Bits portla) |
| CSP | Değişmez (`unsafe-eval` uyarısı bilinçli tolere edilir) |
| Avatar bundle + tanım | Değişmez (read-only; sadece CSS scale) |
| Durum makinesi eşikleri | IDLE_MS/WAKE_MS/uyku-uyanma mantığı değişmez |
| thoughtline/typewriter iç yapı | Kuyruk disiplinleri değişmez |

---

## 10. Geliştirme akışı

```bash
# Çalıştır (arkaplanda, log ile):
cd app && ELECTRON_ENABLE_LOGGING=1 npm start

# Durdur:
pkill -f "notch/app/node_modules/electron"

# Avatar bundle'ı yeniden üret (yalnızca vendor değişirse — normalde ASLA):
npm run build:avatar
```

- Renderer değişikliği → uygulama yeniden başlatma veya panelde ⌘R.
- Bilinen zararsız uyarılar: safeStorage deprecation, CSP `unsafe-eval`,
  SIGTERM kapanışında GPU/network "crash" gürültüsü (çökme değildir).
- Static doğrulama alışkanlığı: `cat <file> | node --input-type=module --check`
  + grep ile token/ölü-kod denetimi; görsel pasta kullanıcıya ait.
- Coder brifleri: `PROMPT-*-EN.md` (İngilizce, kod içi kullanıcı metinleri Türkçe,
  motion-design ilkeleriyle yorumlanmış sabitler, DONE/SKIPPED checklist
  raporu, git commit yok, artifact temizliği var).

---

## 11. Bilinen açık maddeler / sonraki adaylar

- Avatar konum değişkenliği: tam çözüldü (ResizeObserver + settle check) —
  regression izlenir.
- Balon: rezerve şerit <110px olan uç konumlarda sessizce atlanır (by design).
- Gateway (OpenClaw) yolu ikincil kullanım — `gateway.js` alanı bakım isteyebilir.
- Typewriter sealed-region bug fix'i (v sonrası) uzun stream'lerde yeniden
  gözlemlenmeli (statik fix, görsel teyit kullanıcıda).
