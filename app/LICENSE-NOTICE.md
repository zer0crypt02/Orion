# LICENSE-NOTICE — lisans ve üçüncü taraf bildirimleri

Son güncelleme: 2026-11-24
Kapsam: `notch/app` (Orion)

## 1. Bu deponun lisansı

Orion'un özgün kodu, tasarımı ve içeriği **tüm hakları saklı** (all rights reserved)
statüsündedir. Depo yalnızca görüntüleme amacıyla herkese açıktır; kopyalama, değiştirme,
türetme ve yeniden dağıtma önceden yazılı izin gerektirir. Tam metin: depo kökündeki `LICENSE`.

## 2. Üçüncü taraf bağımlılık: `@bible-strong/avatar-web`

`@bible-strong/avatar-web@0.1.0` (ve bağımlılığı `@bible-strong/avatar-core@0.1.0`)
**AGPL-3.0-only** lisanslıdır. Bu projede değiştirilmeden, npm üzerinden bağımlılık
olarak kullanılır. Lisanstan doğan yükümlülükler:

- Paket, npm'den kendi kaynağıyla kurulur; AGPL kodu bu depoya kopyalanmaz.
- `renderer/vendor/avatar-web.bundle.js`, `npm run build:avatar` ile
  `node_modules/@bible-strong/avatar-web/dist/index.js` kaynağından yerel olarak üretilir.
  **Bu bundle depoda tutulmaz** (`.gitignore`); dolayısıyla depo, AGPL bileşenin
  derlenmiş halini yeniden dağıtmaz.
- Bundle'ı üreten taraf, aynı kaynaktan (`npm install` + `npm run build:avatar`)
  birebir aynı çıktıyı üretebilir.
- Paket lisans metinleri kurulumla birlikte korunur:
  `node_modules/@bible-strong/avatar-web/LICENSE`
  `node_modules/@bible-strong/avatar-core/LICENSE`
- Üçüncü taraf bildirimleri: `node_modules/@bible-strong/avatar-core/THIRD_PARTY_NOTICES.md`

Proje, AGPL bileşenle birlikte **dağıtılan bir bütün** olarak sunulmaz; depoda yalnızca
özgün kaynak bulunur. Uygulama bir ağ hizmeti olarak sunulmadığı için AGPL §13
yükümlülüğü doğmaz.

## 3. Özgünlük

Jarvis maskotu, logosu ve ikonları **kopyalanmadı**. Maskot, Bible Strong prosedürel
avatar şemasıyla **özgün** yazılmış `renderer/assets/orion.avatar.json` tanımıdır
(isim: `orion-notch-blob`).

## 4. React Bits portları

`renderer/vendor/gooey-nav.js` ve `renderer/vendor/gradient-ascii.js`, React Bits
bileşenlerinin React'siz vanilla portlarıdır. Kaynak bileşen ve uyarlama bilgisi her
dosyanın başlığında belirtilmiştir.

## 5. Kapsam dışı

- `notch/gateway/` ayrı bir bileşendir; kendi lisansına tabidir.
- `notch/prototype/` içindeki HTML prototipleri bu bildirime dahil değildir.
- `notch/.superpowers/` yerel çalışma notlarıdır ve depoya dahil edilmez.
