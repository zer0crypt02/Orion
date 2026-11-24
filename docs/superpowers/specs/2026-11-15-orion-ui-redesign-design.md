# Orion — UI/UX Redesign: Aydınlık Vibrancy (Tasarım Dokümanı)

> Tarih: 2026-11-15 · Durum: onaylandı (kullanıcı tüm mockup'ları onayladı)
> Kapsam: renderer'ın tamamının görsel/etkileşim yenilemesi. Mimari, pencere
> geometrisi, IPC kanalları ve avatar tanımının şekli **değişmez**.

## 1. Niyet ve neden

Orion bugün rozetli bir sohbet penceresi gibi görünüyor: düz tipografi, mor-mavi
gradient (AI-slop imzası), kalabalık ve kişiliksiz bir panel. Kullanıcının
istekleri net: arkaplan duvar kağıdı kalacak, üstüne **buzlu cam (frosted
glass)** katmanı çekilecek, yazılar okunur olacak, ve tüm arayüz **baştan
aşağı, premium** yenilenecek — bakış açısı olumlu yönde değişmeli.

Seçilen yön: **B · Aydınlık Vibrancy** — macOS'un açık cam malzemesi
(beyaza yakın buzlu cam + `saturate(180%)`), koyu yazı, tek mavi aksan.
Mevcut eski DESIGN.md ("gece gökyüzü / amber") yönü **terk edildi**;
kullanıcı açık cami seçti. Bu doküman tek tasarım kaynağıdır.

## 2. Hedefler / olmayanlar / karşıtı olanlar

**Hedefler**
- Panel, duvar kağıdının üstünde gerçek bir cam katman gibi okunmalı (blur +
  saturate + rim ışığı + hairline kenarlar).
- Avatar tek cesur öğe; ekran başına bir dikkat noktası.
- Tipografi net hiyerarşili; data hizalı; başlıklar dengeli.
- Ayarlar: ray (sidebar) + bento profil hibriti (aşağıda).
- Erişilebilirlik baseline: aria-label, odak, reduced-motion, 44px hedefler.

**Olmayanlar (non-goals)**
- React/Tailwind/HeroUI eklemek yok — vanilla renderer korunur.
- Elektron pencere geometrisi, IPC kanal adları, main process değişmez.
- `orion.avatar.json` şekli donmuş; yalnızca renk/ölçek dışarıdan ayarlanır.
- Dağıtım/paketleme hedefi yok (kişisel proje).

**Anti-hedefler (başarıyı bozan şeyler)**
- Mor→mavi gradient, neon glow, gradient yazı (AI-slop imzası) geri gelirse.
- Her öğeye animasyon; birden fazla cesur öğe aynı ekranda.
- Emoji ikon (SVG dışı), gray-on-gray metin, alanın dışında hata mesajı.

## 3. Tasarım sistemi (token disiplini)

`renderer/styles/tokens.css` TEK kaynak olarak kalır; içerik yeni dile
güncellenir:

- **Malzeme:** `--glass: rgba(250,250,252,.62)` + `backdrop-filter: blur(30px)
  saturate(180%)`; kartlar `rgba(255,255,255,.72–.8)`; ray `rgba(255,255,255,.35)`.
- **Renk:** metin `#1C1E26`; ikincil `rgba(28,30,38,.45–.6)` (gray-on-gray
  yasak: ikincil metin kontrastı ≥ 4.5:1 hedefi, hairline'lar `.06–.09`);
  tek aksan **#3A6FF7** (butonlar, seçili durum, kullanıcı balonu); yeşil
  #34C759 yalnız canlılık durumları; hata #C0392B.
- **Tipografi (SF Pro / system-ui, bilinçli seçim):** kademe 10.5 / 13 / 17 px
  (~1.3 oran) — başlık 17/700/-0.3px, gövde 13/400/1.5, yardımcı
  10.5–11/500–600 uppercase. Başlıklarda `text-wrap:balance`; data'da
  `font-variant-numeric:tabular-nums`; satır uzunluğu < 80 karakter.
- **Yarıçap / gölge:** panel 22px; satır grubu 12px; karo 14px; hap 999px.
  Gölge: büyük `0 30px 60px rgba(0,0,0,.35)` + `0 0 0 1px rgba(255,255,255,.5)`.

## 4. Motion kimliği (motion-design, Premium kişilik)

- **İmza easing:** `cubic-bezier(0.4, 0, 0.2, 1)` — animasyonların %80'i.
- **Süre paleti:** hızlı **120ms** (basınç/toggle) · standart **270ms**
  (satır/kart/ileti girişi) · yavaş **450ms** (panel aç/kapa).
- **Cam malzemesi 0.9× tempo:** overshoot %0; zıplama yok.
- **Giriş deseni:** opacity 0→1 + translateY 12px + scale 0.985→1; listeler
  **50ms kademeli** (micro cascade, toplam < 500ms; 1/3 kuralına uygun).
- **Ortam katmanı (non-user-triggered, seyrek):** yalnızca avatar nefesi —
  5s, sine ease-in-out, scale 1→1.04; kapalı hapta nabız noktası 3s.
- **Baseline-ui sınırı:** etkileşim geri bildirimi ≤ 200ms ve yalnızca
  `transform`/`opacity`; `prefers-reduced-motion` tüm hareketleri kapatır,
  içerik kaybolmaz. Width/height animasyonu yasak.
- Mevcut thoughtline/typewriter/squishswitch modülleri bu paletin temposuna
  kozmetik olarak uyarlanır (davranış korunur).

## 5. Ekran kararları (kullanıcı onaylı)

### 5.1 Chat anasayfası (panel 481×600)
- Başlık: avatar **46px**, altında yeşil durum noktası; "Orion" 17/700 +
  "hazır · Groq" 11px; sağda ayarlar/kapat ikon butonları (SVG, aria-label'lı).
- Kullanıcı mesajı: mavi kuyruklu balon (16px üst, 4px alt-kuyruk).
- Asistan: **balonsuz metin**, yanında 26px mini "hayalet avatar" — diyaloj hissi.
- Asistan başlığı 14.5/700 balance; gövde 13/1.5; listeler girintili.
- Gün ayırıcı: hap rozet, uppercase 10px.
- Composer: beyaz cam hap; 32px mavi gönder düğmesi (ikon buton, kendi
  boyutunu taşır — flex esneme tuzağı yok); placeholder < 80 karakter.
- Boş durum: avatar **110px** nefes alır; "Merhaba, ben Orion" (balance);
  öneri çipleri (3 adet, 999px hap, basınç feedback'i); cam composer.

### 5.2 Ayarlar — hibrit "Orion Rayı" (kullanıcı onaylı)
- Sol ray (~112px): **en üstte "Orion"** satırı — mini avatar (26px beyaz
  çember) + ad. Seçiliyken **Bento Profil** ekranı açılır (5.3).
- Altında kategoriler, renkli 22px ikon kareler (SVG, tuvale renk:
  mavi #3A6FF7, mor #AF52DE, turuncu #FF9500, yeşil #34C759, gri #8E8E93):
  Bağlantı, Modeller, Araçlar, Hafıza; altta Genel.
- Kategori içeriği: macOS ayarları dili — beyaz satır grupları (12px), etiket
  solda + alt-açıklama, kontrol sağta (seçici/⌄, toggle 30×18, radio 15px);
  hairline ayraçlar; alt barda durum ("✓ Kaydedildi") + Geri al / Kaydet.
- Klavye: ray öğeleri odaklanabilir (role=button, Enter/Space), odak halkası.

### 5.3 Bento Profil (rayın "Orion" görünümü)
- Hero: 52px avatar + yeşil nokta; "Orion" + "bağlı · Groq · allam-2-7b".
- Bento karolar (2 kolon): Sağlayıcı (geniş karo, tek gerçek), Gecikme
  (tabular-nums büyük sayı), Bu oturum (12 mesaj · 3 araç), Araçlar toggle,
  Hafıza toggle, Groq anahtarı satırı (•••• + ›).
- Karo içi kontroller anında çalışır; anahtar silme gibi tahrip edici işlem
  onay diyaloğu ister (AlertDialog karşılığı vanilla).

### 5.4 Kapalı hap (196×36)
- Koyu hap `rgba(8,9,14,.92)`; içinde 22px avatar çemberi, "hazır" 11.5px,
  sağda yeşil nabız noktası (3s). Çentik omuzları korunur (main process).

### 5.5 Sidebar açık (701×600)
- Ray dili sohbet listesine taşınır: renkli nokta + ad; seçili beyaz satır;
  altta "+ Yeni" mavi. Mesaj alanı 5.1'in aynı dili; "yazıyor" üç noktası
  (1.2s, kademeli 150ms gecikme; reduced-motion'da durur).

## 6. Erişilebilirlik & etkileşim baseline (baseline-ui + ui-ux-pro-max)

- Kontrast ≥ 4.5:1; ikincil metin gri-gri değil (açıktan koyuya doğru ton).
- Tüm ikon butonlar `aria-label`'lı; klavye navigasyonu ve görünür odak halkası.
- Dokunma hedefi ≥ 44px (küçük ikon butonlarda padding ile büyütülmüş hedef).
- Hata mesajı **alanın yanında**; placeholder-only label yok; yapıştırma
  engellenmez; loading/inline doğrulama feedback'i var.
- İkonlar **SVG** (emoji yok); renk tek başına anlam taşımaz (durum noktasının
  yanında metin).

## 7. Uygulamada bırakılanlar (builder'a)

- Yeni CSS'in mevcut `components.css` parçalarına dağıtımı ve sınıf adları.
- ThoughtLine/typewriter temposunun paletten eşlenmesi (davranış aynı).
- Toast/onay diyaloğu vanilla bileşeninin yazımı (erişilebilir).
- Önizleme yolu: `npm start` (Electron) — mockup referansları
  `.superpowers/brainstorm/54351-*/content/` altında duruyor.

## 8. Yaklaşımlar (kullanıcının seçtiği yol)

1. **Aydınlık Vibrancy + vanilla CSS token yenilemesi** ✅ (seçildi) —
   mevcut mimaride, tek dosyalık token + bileşen CSS güncellemesi; risk düşük,
   donmuş sınırlara saygılı.
2. HeroUI/React geçişi — reddedildi: vanilla mimariyi yeniden yazmak demek,
   kazanç düşük.
3. Koyu "Gece Camı" yönü — reddedildi: kullanıcı açık cami seçti.
