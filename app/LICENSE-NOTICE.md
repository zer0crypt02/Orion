# LICENSE-NOTICE — AGPL kararı ve kaynak dağıtım planı

Tarih: 25 Ekim 2026
Kapsam: **kişisel kullanım** (notch-assistant, `notch/app`)

## Karar

`@bible-strong/avatar-web@0.1.0` (ve bağımlılığı `@bible-strong/avatar-core@0.1.0`)
**AGPL-3.0-only** lisanslıdır. Bu proje AGPL-3.0 altında kullanım **kabul edilmiştir**;
dolayısıyla:

- Proje lisansı `AGPL-3.0-only` olarak ilan edildi (`package.json` → `license`).
- Paketler npm'den asıl kaynaklarıyla kuruldu; repo kodu/asset'leri elle kopyalanmadı.
- Jarvis maskotu, logosu ve ikonları **kopyalanmadı** — maskot, Bible Strong
  prosedürel avatar şemasıyla **özgün** yazılmış `renderer/assets/orion.avatar.json`
  tanımıdır (isim: `orion-notch-blob`).

## Telif ve lisans bildirimleri

- Paket lisans metinleri kurulumla birlikte korunur:
  `node_modules/@bible-strong/avatar-web/LICENSE`
  `node_modules/@bible-strong/avatar-core/LICENSE` (npm bağımlılığı)
- Üçüncü taraf bildirimleri: `node_modules/@bible-strong/avatar-core/THIRD_PARTY_NOTICES.md`
  (openclaw kurulumundan) — dağıtım sırasında kopyalanır.
- Bu dosya (LICENSE-NOTICE.md) depoda tutulur ve AGPL §4-§7 gerekliliklerini belgeler.

## Değişikliklerin belgelenmesi

Avatar paketinde **kod değişikliği yapılmadı**. Renderer'da kullanım şekli:

- `renderer/vendor/avatar-web.bundle.js` — `npm run build:avatar` ile
  `node_modules/@bible-strong/avatar-web/dist/index.js` kaynağından esbuild
  ile paketlenir (ajv CJS bağımlılığı tarayıcıda çalışsın diye). Kaynak kodu
  değiştirilmez; yalnızca derlenir.
- `renderer/assets/orion.avatar.json` — bizim özgün avatar tanımımız
  (paketin şemasını kullanır, paket kodunu içermez).

## Kaynak dağıtım planı (AGPL §6 uyumu)

Uygulama üçüncü kişilere dağıtılırsa:

1. **Kaynak teklifi:** Uygulamanın tamamının AGPL-3.0 lisansıyla kaynak kodu
   paylaşılır (bu depo + `package.json` + `build:avatar` scripti yeterlidir;
   bundle yeniden üretilebilir).
2. **Bundle eşdeğerliliği:** `renderer/vendor/avatar-web.bundle.js` dağıtımında
   yanına "kaynağı npm'den `@bible-strong/avatar-web@0.1.0` + `npm run build:avatar`"
   notu eklenir; alıcı birebir aynı bundle'ı üretebilmelidir.
3. **Bildirimler:** Yukarıdaki LICENSE ve THIRD_PARTY_NOTICES dosyaları
   dağıtım paketine `licenses/` altında kopyalanır.
4. **Etkileşim:** Uygulama uzaktan ağ hizmeti olarak sunulmazsa (masaüstü
   uygulama — sunulmaz), AGPL §13 ağ etkileşimi yükümlülüğü doğmaz.

## Kapsam dışı

- `notch/gateway/` (openclaw) ayrı bir bileşendir; kendi lisansına tabidir.
- `notch/prototype/` içindeki HTML prototipleri bu karara dahil değildir.
