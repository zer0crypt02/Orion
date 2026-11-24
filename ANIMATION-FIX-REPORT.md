# RAPOR: Notch (Alpha X) panel açılış animasyonu takılıyor — teşhis & çözüm

> Görev: Bu raporu oku, **Çözüm A**'yı uygula. Uygulanabilir olmazsa Çözüm B.

## 1. Belirti

Hap (196×36) → panel (481×600) açılışı akıcı değil, kademeli/titik atlamalı ("kasiyor"). Kapanış daha tolere edilebilir; asıl sorun **açılışta**.

- Proje: Electron masaüstü uygulaması, macOS `transparent: true` + `vibrancy: "under-window"` pencere.
- İlgili dosyalar:
  - `app/electron/main.js` (`animateTo`, `setPanel`, pencere ayarları)
  - `app/renderer/index.html` (`.window` glass CSS, `panelIn` keyframes)

## 2. Kök neden analizi (önem sırasıyla)

### N1 — ASIL SUÇLU: Açılış, main process'te per-frame `setBounds` ile yapılıyor

`main.js` içindeki `animateTo()` bir `setInterval(…, 16)` döngüsüyle her frame'de `win.setBounds({...})` çağırıyor. macOS'ta kötü bilinen bir anti-pattern:

- `setBounds` asenkron ve **vsync'e hizalı değil**. 16ms'lik `setInterval` display refresh'e kilitli değil — özellikle **ProMotion (120Hz) MacBook'larda** döngü, 120Hz taramanın fazıyla sürekli kayar → titreme/judder.
- Pencere `transparent: true` + `vibrancy: "under-window"` + `hasShadow: true`. Her `setBounds` çağrısında:
  1. Pencere geometrisi değişir,
  2. **NSVisualEffectView material yeniden boyutlanır**,
  3. Renderer'da `backdrop-filter: blur(32px) saturate(200%)` tüm pencere için **yeniden hesaplanır**,
  4. Gölge her frame yeniden project edilir.

  Frame başına maliyet çok yüksek; 320ms'lik animasyonda ~20 frame'de bu zincir tekrarlanıyor.
- Koddaki yorum bunu zaten deşifre ediyor: *"667ms yay + opak gövde denendi, **renk sıçraması** + frame-by-frame hissi verdi; o yüzden kaldırıldı"* → kasayı gizlemişler (animasyonu kısaltmışlar), düzeltmemişler.

### N2 — İKİ ayrı animasyon saati üst üste bindirilmiş

- **Main:** pencereyi 320ms boyutlandırıyor (`animateTo`).
- **Renderer:** aynı anda `panelIn` keyframes'i 340ms'lik `scaleY(.55)→1 + translateY(-16px)→0 + opacity 0→1` oynatıyor.

Yani içerik hem büyüyor hem kayarken hem scale yapıyor — **çift hareket hissi**.

İlginç detay: CSS'te şu yorum duruyor: *"pencere anında tam boyda, büyüme illüzyonu GPU transform'u (tek katman, takılmasız)"* — bu, eski (doğru) yaklaşımın yorumu ve keyframe'leri; pencere-geometrisi animasyonuna geçilirken **temizlenmemiş**.

### N3 — küçük uyaranlar (animasyon sırasında)

- Panel açılır açılmaz `startCursorFeed()` 100ms'lik IPC seli başlatıyor — animasyonla aynı pencerede `webContents.send` trafiği.
- 500ms'lik focus-poll timer'ı + IPC'ler main process event loop'unda animasyon döngüsüyle aynı thread'i paylaşıyor.

## 3. Çözüm önerileri

### ÇÖZÜM A (ÖNERİLEN): İki pencere — pencere geometrisi animasyonu YOK

Notch uygulamalarının standart deseni. Pencere boyutu hiçbir frame'de değiştirilmez:

1. App start'ta **iki pencereyi pre-create et**:
   - `pillWin` → 196×36
   - `panelWin` → 481×600 (geçmiş modu için WIDE varyantı ayrıca düşünülebilir)
   - İkisi de transparent + vibrancy, top-center'da **aynı anchor** noktasında. Vibrancy, gerçek boyutunda bir kez oluşur → material "ısınmış" olur.
2. **Kapalıyken:** `pillWin` görünür, `panelWin` `hide()`.
3. **Açılış:** `panelWin.show()` + `pillWin.hide()` (aynı frame). Görsel büyümeyi **renderer tek başına** yapar: mevcut `panelIn` keyframes (scaleY + translateY + opacity) — bunlar transform/opacity = GPU compositor, vsync-synced, blur yeniden hesaplanmaz. İsteğe bağlı olarak 150–250ms'lik hafif `setOpacity` rampası eklenerek "glass pop" hissi yumuşatılır (`NSWindow.alphaValue` per-frame değişimi re-layout tetiklemez, ucuzdur).
4. **Kapanış:** tersi — `panelWin` fade-out, sonra `pillWin.show()`.

#### Uygulama detayları (kuş bakışı)

- `preload.js` ve `index.html` her iki pencereye de yüklenebilir; `?mode=pill|panel` query param'ıyla renderer hangi UI'yi göstereceğini seçer (pill UI zaten HTML'de `.pill-ui` olarak mevcut).
- Focus/blur mantığı `panelWin`'e taşınmalı: mevcut `win.on("blur")` + 500ms focus-poll güvenlik ağı **yalnızca panel penceresinde** çalışmalı. Pill penceresinin blur'u paneli KAPATMAMALI. `hasBeenFocused` state'i panel penceresine özel.
- "blur sonrası hasBeenFocused resetleme" mantığı bozulmasın: kapalı duruma geçiş yalnızca panel penceresi üzerinden sürülsün.
- `globalShortcut` (⌘/) ve IPC kanalları (`panel:changed`, `chat:*`, `cursor:*`) her iki pencereye gönderilebilecek ortak helper'a alınmalı (ör. `sendToPanel`).
- `sidebar:set` (PANEL→WIDE) yine setBounds gerektiriyor ama bu 240ms'lik tek seferlik resize; ya snap bırak ya da `win.setSize(w, h, true)` (macOS native NSWindow animasyonu) kullan — kritik değil.
- Avatar bundle yalnızca panel penceresinde yüklenmeli; pill penceresi statik metin + dot.

**Avantaj:** Animasyonun tamamı GPU/view katmanında; WindowServer'a frame başına geometry emri yok. Kasmanın anatomik nedeni ortadan kalkar.

### ÇÖZÜM B (tek pencere, daha az kod): Snap + alpha fade

1. `animateTo`'yu tamamen sil. Açılışta tek seferlik `win.setBounds(PANEL)` (~0ms).
2. `win.setOpacity(0)` ile başla, ~200ms boyunca 8–12 adımda 1'e rampala (main'de küçük bir timer; alpha-only, ucuz). Renderer `panelIn` (zaten var) büyüme illüzyonunu verir.
3. N2'yi temizle: `panelIn`'i tek saate indir (opacity + scaleY), çift translate'i bırak.
4. Kapanışta tersi: 160ms fade-out → sonra `setBounds(PILL)` tek seferlik.

**Risk:** vibrancy tüm pencereyi doldurduğu için fade sırasında tam boy cam dikdörtgeni belirir. Alpha ramp bunu yumuşatır ama Çözüm A kadar temiz olmayabilir.

### ÇÖZÜM C (ÖNERİLMEYEN, sadece yara bandı): Mevcut setBounds döngüsünü hafifletmek

Animasyon sırasında `hasShadow: false`, `startCursorFeed`'i geciktir, interval'ı vsync'e yaklaştır. Bu kasayı **azaltır ama kaldırmaz** — setBounds + vibrancy + backdrop-filter zinciri kalır. Kullanma.

## 4. Doğrulama planı (düzeltme sonrası)

1. `npm start` → `⌘/` ile 10 kez aç-kapa + hızlı ardışık toggle — her açılışta akıcılık aynı olmalı.
2. ProMotion dahili ekran (120Hz) ve varsa harici 60Hz ekranda ayrı ayrı dene.
3. Panel açıkken sohbet streaming'i başlat (token akarken) → animasyonda düşüş olmamalı (Çözüm A'da animasyon sohbet frame'lerinden bağımsız).
4. Panel dışına tıklayınca otomatik kapanma hâlâ çalışıyor mu (focus-poll panelWin'de).
5. Sidebar aç/kapa (PANEL↔WIDE) geçişi bozulmadı mı.
6. ESC ile kapanış çalışıyor mu.

## 5. Özet

Kasmanın anatomisi: **transparent+vibrancy pencere üzerinde per-frame `setBounds` döngüsü + üzerine binen ikinci bir CSS scale animasyonu**. Genel reçete: pencere geometrisini animasyonun DIŞINDA tut, tüm hareketi renderer'da transform/opacity ile yap. En temiz çözüm Çözüm A (iki hazır pencere swap'ı).
