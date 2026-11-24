# Orion — Tasarım Yönü (Design Direction)

> Bu belge **karar** belgesidir, uygulama talimatı değil. Kod içermez; hangi yöne
> gideceğimizi ve nedenini tanımlar. Onaylanan maddeler `PROMPT-*` brief'lerine
> dönüşür. Tarih: 2026-11-11 · Durum: **öneri / onay bekliyor**

---

## 0. Tek cümlelik teşhis

Orion bugün **rozeti olan bir sohbet uygulaması**; olması gereken **odası olan bir
karakter**. "Benlik" eksikliği üç yerden geliyor: karakter renksiz (kimlik yok),
avatar sohbet başlayınca küçülüp dekorasyona dönüşüyor (hiyerarşi ters), tipografi
düz olduğu için panelin "sesi" yok (ritim yok).

### Kanıt (mevcut kod + ekran görüntüleri)

| Bulgu | Ölçüm |
|---|---|
| Avatar gövdesi | `colors.body: "#c9cbcf"` (açık gri), `eyes: "#111316"` — marka rengi yok |
| Avatarın okunuşu | İki dikey siyah çubuk, ekranda **"⏸" (pause)** gibi okunuyor, göz gibi değil |
| Avatarın varlığı | Boşta 144 px → sohbette **58 px** (panel genişliğinin ~%12'si) |
| Konum hatası | Kayıtlı sürükleme konumu sohbet metninin üzerine düşebiliyor (1. görsel); `clamp()` yalnızca katman sınırına bakıyor |
| Tipografi ölçeği | 12 / 12.5 / 13 / 13.5 / 15 px → kademe oranı **1.04–1.08** (hiyerarşi yok) |
| Palet | Tek accent `rgb(77 159 255)` + gri; her öğe aynı görsel ağırlıkta |
| Kimlik adı | Uygulama **Orion**, avatar tanımı **"Cloudee"**, paket `notch-assistant` — görsel karşılık yok |
| Çentik fikri | Panelde hiç yok; içeri girince sıradan bir chat penceresi |

### Referans gözlem
`Bible Strong Avatar Lab` (Strobi / Freddy / Citrus / Nova / Grek bot / Sunee):
**aynı prosedürel şema, farklı gövde rengi** → karakterler birbirinden ayrışıyor.
Strobi'nin mavi küresi, gri bulutun veremediği şeyi tek başına veriyor: *orada bir
şey var.* Yani kimlik kaldıracı **renk**, şekil değil.

---

## 1. Karar özeti (onay isteyen 6 madde)

1. **Karakter adı:** Orion (tek isim; "Cloudee" adı dosya içinde kalır, kullanıcıya
   görünmez — ileride `name` alanı da `orion` yapılmalı).
2. **Kimlik yönü:** *Gece gökyüzü* — derin indigo/lacivert zemin, yıldız tozu
   nötrleri, **tek sıcak accent (ay ışığı amberi)**. Cyan/neon ve mor→mavi gradient
   kullanılmaz (AI-slop imzası).
3. **Avatar:** şekil donmuş; **gövde rengi değişir** (tek satır JSON). Halka aurora
   üçlüsüne kayar. Gri kimlik bırakılır.
4. **Avatar hiyerarşisi:** karakter panelin sahibi — sohbette de **kalıcı, ~96–112 px**,
   kendi **bandında** yaşar; metnin üstüne binmesi yapısal olarak imkânsız olur.
5. **Tipografi:** düz ölçek bırakılır; **1.3 oranlı 5 kademe** + display/gövde ikilisi.
   Refleks fontlar (Inter, DM Sans, Space Grotesk…) kullanılmaz.
6. **Tek cesur öğe kuralı:** ekran başına bir dikkat noktası (avatar). Gerisi sessiz:
   hairline, sıkı liste, ghost buton.

---

## 2. Kimlik: Orion

**Üç kelime:** *dingin · göksel · meraklı.*
Kullanım bağlamı: gece, masa başında, tek kişi, kod/düşünce işi. Panelin işi
kullanıcıyı heyecanlandırmak değil, **yanında durmak**.

**Anlatı (tek paragraf, tasarım kararlarının referansı):**
> Orion çentiğin içinde yaşayan, ışığını senden alan bir gökcismi. Konuşmadığında
> nefes alır; konuşurken senin hızına uyar. Odası karanlık ama soğuk değil: yıldız
> tozu grileri, ay ışığı vurgusu. Süs yapmaz — her hareketinin bir sebebi var.

**Anti-referanslar (yapılmayacaklar):**
- Cyan-on-dark, neon glow, mor→mavi gradient, gradient yazı.
- Her köşede kart, her butonda dolgu rengi, gölge yığını.
- "Hacker dashboard" tipografisi; monospace'i teknik görünmek için kullanmak.
- Emoji ile kimlik kurmak (kutlama anları hariç).

---

## 3. Avatar kararı (şekil sabit, renk değişken)

### 3.1 Neden renk?
`orion.avatar.json` içinde gövde tek renkle boyanıyor: `colors.body`. 26 ifade
yalnızca göz/baş geometrisini değiştiriyor — **renk değişikliği hiçbir ifadeyi
bozmaz.** Yani en yüksek kimlik kazancı, en düşük riskle buradan geliyor.

### 3.2 Üç renk varyantı (denenecek, biri seçilecek)

| # | Ad | body | eyes | Not |
|---|---|---|---|---|
| **A (önerilen)** | Ay taşı | `#8E9BF0` | `#12101F` | Periwinkle; lacivert zeminde parlar, gözler koyu kalır (yüz okunur) |
| B | Gece | `#2B2A52` | `#FFE7C7` | Ters kontrast; riskli: açık gözler "II" hissini güçlendirebilir |
| C (güvenli) | Süt | `#E7E5F5` | `#241F3D` | Bugünküne en yakın; kimlik CSS glow'una bırakılır |

Uygulama: `colors.body` / `colors.eyes` dışında hiçbir alan değişmez. Üç varyant
yan yana tek ekranda karşılaştırılır (geçici bir preview HTML'i), sonra seçim yapılır.

### 3.3 "Pause" okunuşunu düzeltmek (şekle dokunmadan)
İki dikey çubuk, ancak şu üç şeyle "göz" olarak okunur:
1. **Renk kontrastı** (gövde renkli, göz koyu) — asıl düzeltme budur.
2. **Varsayılan kare:** idle'da "neutral" yerine daha yumuşak bir ifade
   (`small-attentive` veya `gentle-downward-gaze`) → ilk izlenim "II" değil "bakan yüz".
3. **Nefes + kenar ışığı:** gövdeye 1.5 px sıcak rim (CSS, `filter: drop-shadow`) —
   düz sticker hissi gider.

### 3.4 Çoklu avatar (opsiyonel, 4. faz)
Lab'deki karakterler (Strobi, Freddy, Citrus, Nova, Grek bot, Sunee) aynı şemayı
kullanıyor; `createAvatar` bir `definition` alıyor. Yani teknik olarak birden fazla
karakter mümkün — **ama her karakter kendi 23 animasyonluk tanımını gerektirir**
(Lab'den export). Maliyet yüksek, kazanç "seçim özgürlüğü". Öneri: **şimdilik tek
karakter + 3 renk varyantı**; çoklu karakter 4. faza.

---

## 4. Palet: gece gökyüzü

Nötrler **indigo'ya tintlenir** (hue ~285). Saf siyah/beyaz yok. Cyan yok.
Accent tektir ve **sıcaktır** (ay ışığı) — soğuk zemin × sıcak vurgu = hatırlanır,
ayrıca "cyan-on-dark" tuzağına düşmez.

### 4.1 Ana token tablosu

| Token | Şimdi | Öneri | Kullanım |
|---|---|---|---|
| `--glass-tint` | `47 47 47` | `26 28 52` | panel zemini (vibrancy üstü) |
| `--glass-alpha` | `.42` | `.52` | okunurluk için biraz daha opak |
| `--ink-hi` | `244 244 248` | `244 241 252` | birincil metin |
| `--ink-mid` | `185 185 198` | `190 186 212` | ikincil metin |
| `--ink-low` | `107 107 120` | `132 128 158` | etiket/ipucu (yalnız ≥11 px) |
| `--accent` | `77 159 255` | `255 206 143` | **yalnız** birincil eylem + odak |
| `--accent-hover` | `99 172 255` | `255 219 168` | hover |
| `--accent-dim` | `77 159 255 /.2` | `255 206 143 /.14` | seçili zemin, retry zemini |
| `--ring-deep` | `10 47 107` | `27 42 107` | halka üçlüsü 1 |
| `--ring-navy` | `20 58 94` | `59 91 169` | halka üçlüsü 2 |
| `--ring-sky` | `99 172 255` | `159 182 255` | halka üçlüsü 3 |
| `--color-error` | `255 138 122` | **korunur** | hata (amber ile karışmasın: hatada ikon zorunlu) |
| `--surface-user` | `255 255 255 /.1` | `255 255 255 /.07` | kullanıcı balonu (daha sessiz) |
| `--surface-code` | `0 0 0 /.45` | `9 9 28 /.6` | kod zemini |
| `--orb-frost` | `220 222 228 /.06` | `226 222 255 /.06` | avatar içi buzlu disk |

### 4.2 Oranlar (60/30/10)
- **60** zemin + cam: `#1A1C34` ailesi
- **30** metin + hairline: `--ink-*`
- **10** accent: yalnız gönder/odak/retry + avatar halka anları

### 4.3 Kontrast (yaklaşık, doğrulanacak)
`--ink-hi` → ~12:1 · `--ink-mid` → ~8:1 · `--ink-low` → ~4.6:1 (yalnız etiket) ·
accent üstü koyu metin → ~9:1. Hepsi AA; `--ink-low` 11 px altına inmemeli.

### 4.4 Ambient katmanı
Mevcut üç radial `.ambient` katmanı korunur, ama **aurora**ya çekilir:
indigo (.16), mor-menekşe (.12), ve tek sıcak nokta (.06). Sıcak nokta avatarın
arkasında dursun — "ışığını senden alan gökcismi" anlatısı buradan gelir.

---

## 5. Tipografi

### 5.1 Font seçimi
Bugünkü **Inter Tight** reflekstir (Inter türevi) ve tek başına hiyerarşi taşıyamıyor.

| Rol | Font | Neden |
|---|---|---|
| Display (marka + boş durum başlığı) | **Bricolage Grotesque** | Karakterli, sıkı harf aralığıyla imza taşır; yalnız 2 yerde kullanılır |
| UI + gövde | **General Sans** | Inter'in mono-kültüründen uzak, sakin/geometrik; 17 px'te net |
| Kod | mevcut mono stack | dokunulmaz |

**Risk ve yedek:** font dosyaları yerel `.woff2` olarak `renderer/fonts/` altına
girer (npm bağımlılığı değil, CSP `self` ile uyumlu). Türkçe glif kapsamı (ş, ğ, İ)
ilk iş doğrulanır; kapsam yoksa **SF Pro Text**'e düşülür ve hiyerarşiyi
**ağırlık kontrastı** taşır (800/600/400).

### 5.2 Ölçek (düz ölçek bırakılıyor)

| Rol | Şimdi | Öneri | Ağırlık | Harf aralığı | Satır yük. |
|---|---|---|---|---|---|
| Hero (boş durum) | 15 | **28** | 600 | -0.02em | 1.15 |
| Panel başlık | 13 | **22** | 600 | -0.01em | 1.2 |
| Gövde / mesaj | 13.5 | **17** | 400 | 0 | **1.7** |
| UI / etiket / chip | 12–12.5 | **13** | 500 | 0.01em | 1.4 |
| Mikro (kod dili, sayaç) | 11 | **11** | 500 | 0.06em (uppercase) | 1.3 |

Oranlar: 11→13 (1.18) · 13→17 (1.31) · 17→22 (1.29) · 22→28 (1.27). Gövde 17 px
+ panel iç genişliği ~449 px → satır uzunluğu ~55 karakter (okunabilir bant).
Koyu zeminde açık metin için satır yüksekliği **1.7** (normalden +0.1).

---

## 6. Layout — avatarın kendi bandı

**Sorun:** bugün avatar `absolute` katmanda yüzüyor; composer'a göre konumlanıyor,
kayıtlı sürükleme konumu metnin üstüne düşebiliyor. Kural 1 yalnızca niyetle
korunuyor, **geometriyle değil.**

**Çözüm:** avatar, sahnenin **ilk satırında kendi bandında** yaşar. Sohbet metni
onun altındaki ayrı satırda akar. Örtüşme *fiziksel olarak imkânsız* olur; `clamp()`
kaynaklı hata da kendiliğinden ölür.

### 6.1 Dikey ızgara (481 × 600)
```
satır 1: 44px    header   — marka + durum + 2 ikon
satır 2: 116px   avatar bandı — 96px avatar (sol) + durum metni (sağ)
satır 3: 1fr     sohbet    — kaydırılabilir, alt dolgu 16px
satır 4: 64px    composer
```
Sidebar açıkken (701 × 600) yalnızca **kolon** eklenir; satırlar aynı kalır.

### 6.2 Boş durum
```
┌──────────────────────────────────────────────┐
│  Orion                             ⚙     ✕    │ 44
├──────────────────────────────────────────────┤
│                                              │
│                 ╭──────────╮                 │
│                 │  avatar  │  200px          │
│                 ╰──────────╯                 │
│                                              │
│            Merhaba, ben Orion.               │ 28
│      Bugün neyi birlikte çözelim?            │ 17 / mid
│                                              │
│   [ Şu hatayı çöz ] [ Özetle ] [ Kod yaz ]   │ 13
│                                              │
├──────────────────────────────────────────────┤
│  Bir şey sor…                            ▸    │ 64
└──────────────────────────────────────────────┘
```
Değişiklikler: çip sayısı 4 → **3** (biri zayıf, "Hızlı çeviri" jenerik); selamlama
**iki satır** (başlık + tek destek cümlesi); karşılama metni Orion'un sesiyle.

### 6.3 Sohbet
```
┌──────────────────────────────────────────────┐
│  Orion · hazır                     ⚙     ✕   │ 44
├──────────────────────────────────────────────┤
│  ╭──────╮   Bağlanıyor → Düşünüyor…          │ 116
│  │ 96px │   0,8 sn                           │
│  ╰──────╯                                    │
├──────────────────────────────────────────────┤
│                              ┌────────────┐  │
│                              │ hi         │  │
│ Selam! Ben Orion. Bugün      └────────────┘  │
│ nasıl gidiyor?                               │
│                                              │
│ Ben de iyiyim — hep buradayım.               │
├──────────────────────────────────────────────┤
│  Bir şey sor…                            ▸    │ 64
└──────────────────────────────────────────────┘
```
- Avatar **sol**da, durum/ThoughtLine metni **sağında** → asimetri + tek bakışta
  "kim konuşuyor" bilgisi.
- Asistan mesajı balonsuz (mevcut karar korunur), kullanıcı balonu sağda.
- Sürükleme kalkar; avatarın yeri artık **ev** (PROJECT.md "tek ev" ilkesiyle uyumlu).

### 6.4 Sidebar (701)
```
┌────────────┬─────────────────────────────────┐
│ SOHBETLER  │ Orion · hazır      ⚙     ✕      │
│ ┌────────┐ ├─────────────────────────────────┤
│ │ hi   2 │ │ ╭────╮  düşünüyor…               │
│ │ Heyyy 3│ │ ╰────╯                          │
│ └────────┘ │                                 │
│            │ Selam! Ben Orion.               │
```
Aktif satır: yalnızca zemin tonu + metin rengi (kenar şeridi **yok** — AI-slop
imzası). Başlık 11 px uppercase, harf aralığı .06em.

### 6.5 Ayarlar
Tam yüzey overlay korunur. Bölümler 11 px uppercase; her alan etiketi + tek cümle
ipucu. SquishSwitch **kalır** — panelin en kişilikli bileşeni.

---

## 7. Bileşen notları (kısa)

- **Kod bloğu:** zemin `--surface-code`, hairline, başlıkta dil etiketi (11 px
  uppercase) + "Kopyala" ghost. Satır yük. 1.6; çoklu blok aynı ritimde.
- **Composer:** 22 radius, odakta hairline → `--accent-dim`; gönder butonu 28 px,
  metin varken **amber dolgu**, boşken nötr.
- **Hata:** mercan çerçeve + ikon + "Tekrar dene" ghost (dolgu accent değil).
- **Mikro-not balonu:** cam reçetesi korunur, metin 13 px; 30 sn kap aynı.
- **Odak halkası:** `--accent` 1.5 px + 2 px offset, tüm etkileşimli yüzeylerde.

---

## 8. Hareket

Mevcut motion dili (160/200/320, `--ease-out`, %0 overshoot) **korunur** — Orion'un
en tutarlı tarafı orası. Eklenen üç kural:

1. **Tek koreografi:** panel açılışı, avatar bandı ve içerik aynı karede başlar;
   üst üste ikinci bir hareket yok.
2. **Mesaj girişi:** 200 ms `--ease-out`, 8 px yukarıdan; art arda mesajlarda 40 ms
   stagger (sadece ilk 3 öğe).
3. **Sessizlik:** avatar hareket etmiyorsa panelde hiçbir şey hareket etmez.
   Halka loop'u 7 sn → **9 sn** (daha dingin).

`prefers-reduced-motion` yolları aynen korunur.

---

## 9. Kırmızı çizgilerle uzlaşma

| PROJECT.md kuralı | Bu belge |
|---|---|
| `main.js` değişmez | Değişmiyor |
| IPC isimleri değişmez | Değişmiyor |
| CSP değişmez | Değişmiyor (fontlar yerel dosya) |
| Sıfır yeni npm bağımlılığı | Korunuyor (font = varlık dosyası) |
| Avatar bundle değişmez | Bundle'a dokunulmuyor |
| **Avatar tanımı değişmez** | **Değişiyor: yalnız `colors.body` / `colors.eyes`** (senin onayınla; şekil, 26 ifade, 23 animasyon aynı) |
| Durum makinesi eşikleri | Korunuyor (yalnız idle varsayılan ifadesi dener) |
| thoughtline/typewriter içi | Korunuyor |

**Not:** `projects/JS/.impeccable.md` bu depo kökünde duruyor ama **başka bir projeye**
(Freebuff/LocalSend) ait. Orion için tasarım bağlamı **bu belgedir**; ileride
`notch/.impeccable.md` oluşturulursa aynı içerik oraya taşınmalı.

---

## 10. Faz planı ve doğrulama

| Faz | İçerik | Risk | Görsel kazanç |
|---|---|---|---|
| **1** | Avatar `colors` (A/B/C karşılaştırma) + `tokens.css` paleti | Düşük | Çok yüksek — "benlik" burada başlar |
| **2** | Tipografi (font + ölçek) + mesaj/composer/header/kod bloğu | Orta | Yüksek |
| **3** | Avatar bandı ve ızgara (örtüşme hatası ölür, sürükleme kalkar) | Orta | Yüksek |
| **4** | Boş durum sahnesi + mikro kopya + (ops.) renk varyantı seçici | Düşük | Orta |

Her fazın sonunda:
1. `481×600` ve `701×600` — taşma/örtüşme yok, metin kesilmiyor.
2. Kontrast: gövde ≥7:1, etiket ≥4.5:1.
3. `prefers-reduced-motion` açıkken hareket minimum.
4. `⌘/` ile 6 kez aç/kapa: panel animasyonu regresyona uğramadı.
5. Türkçe glif kontrolü (ş, ğ, İ, ı) — özellikle seçilen fontta.
6. Kural 1 testi: en uzun asistan mesajında avatar metne **hiç** değmiyor.

---

## 11. Açık noktalar

- **Font lisansı ve Türkçe kapsamı** (General Sans / Bricolage) doğrulanmadan
  uygulamaya geçilmemeli; yoksa SF Pro + ağırlık kontrastı planına düşülür.
- **Amber accent** 12. adımda "uyarı" çağrışımı yapabilir; hata mercan + ikonla
  ayrıştırıldığı sürece güvenli, faz 1'de görsel olarak teyit edilmeli.
- **Avatar bandı** sohbet alanından 116 px alıyor; 600 px yükseklikte sohbete
  ~380 px kalır. Yetmezse: band 96 px'e iner veya avatar bandı yalnızca son 2 mesaj
  görünürken incelir (bu bir *opacity/ölçek* işi olmalı, satır yüksekliği animasyonu
  **değil** — layout animasyonu yasak).
- **"Cloudee" adı** dosyada kalıyor; kullanıcıya görünmüyor ama ileride `name: "orion"`
  yapılması öneriliyor (kimlik tutarlılığı).
