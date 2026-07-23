> **Bu dosya projenin hafızasıdır. Her güncelleme, yeni özellik,
> bug fix veya teknik karar sonrasında bu dosya GÜNCELLENMELİDİR.
> Güncelleme yapılmadan iş 'bitti' sayılmaz.**

# Çevirim — Proje Hafızası

## Özet

Çevirim, İngilizce ⇄ Türkçe çeviri yapan ve çevirdiğin kelimeleri kişisel bir
kelime defterine kaydeden bir web uygulamasıdır. Amaç, çeviri sırasında
karşılaşılan yeni kelimeleri kaybetmeden biriktirip aralıklı tekrar (spaced
repetition) ile ezberlemektir. Kurulum gerektirmez; saf HTML/CSS/JS ile
çalışır, PWA olarak telefona veya masaüstüne yüklenebilir ve çevrimdışı açılır.

---

## Tamamlanan işler (en yeni üstte)

### 2026-07-23 — iOS PWA tamamlama
- `index.html`'e `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
  (`black-translucent`), `apple-mobile-web-app-title` ve `mobile-web-app-capable`
  meta etiketleri eklendi → "Ana Ekrana Ekle" ile tam ekran açılıyor.
- Viewport'a `viewport-fit=cover` eklendi.
- `body`'ye `env(safe-area-inset-*)` dolgusu, `.toast`'a alt güvenli alan payı
  eklendi → çentik ve home bar içerikle çakışmıyor.
- `manifest.json` `start_url` → `./` (standart).
- Service worker önbellek sürümü `v1` → `v2` (eski kabuk temizlensin diye).
- PROGRESS.md oluşturuldu.

### 2026-07-22 — PWA, çevrimdışı destek, aralıklı tekrar, kayıt düzenleme (`bd3c338`)
- `manifest.json` + `icons/` (192/512, any + maskable) eklendi.
- `sw.js`: uygulama kabuğu için cache-first + stale-while-revalidate; çeviri
  API çağrıları kasıtlı olarak önbelleklenmiyor.
- Çevrimdışı şeridi (`#offlineBanner`) ve `beforeinstallprompt` ile "Uygulamayı
  yükle" butonu.
- Aralıklı tekrar: kelimelere `level` ve `due` alanları; aralıklar
  1 → 3 → 7 → 16 → 35 → 90 gün. "Tekrar zamanı gelenler" destesi.
- Kelime satırlarında düzenleme: not, etiket, çeviri metni; etikete göre filtre.
- Sıralama seçenekleri: yeni/eski/A-Z/Z-A/zorlandıklarım/tekrar zamanı gelenler.

### 2026-07-22 — Otomatik dosya yedeklemesi ve kelime kimlikleri (`dc1cb8a`, `eab7656`)
- `js/backup.js`: File System Access API ile seçilen JSON dosyasına otomatik
  yazma (değişiklikten birkaç saniye sonra + 5 dakikada bir).
- İzin düşünce gösterilen "İzin ver" şeridi; toplu silme öncesi onay adımı.
- JSON'dan geri yükleme (`Geri yükle`).
- Her kelimeye `id` verildi → silme/geri alma ve çalışma ilerlemesi dizin
  yerine kimliğe dayanıyor.
- Kişisel yedek dosyası `.gitignore` ile repo dışına alındı.

### 2026-07-19 — Seslendirme, kopyalama, çeviri önbelleği (`c937044`)
- Kutu başlıklarında 🔊 (Web Speech API) ve 📋 (clipboard) araç butonları.
- Oturum içi çeviri önbelleği; kelime tahmini (Datamuse) için debounce.
- Son çeviriler geçmişi (en fazla 20 kayıt).

### 2026-07-18 — Modern koyu tema (`9970c65`, `3fe31ab`)
- Glassmorphism kartlar, gradyan vurgular, süzülen ışık küreleri ve yıldız tozu.
- Kök dizindeki kopyalar kaldırılıp `css/` + `js/` yapısına geçildi.

### 2026-07-18 — İlk sürüm (`2a0b0a3`)
- Otomatik çeviri (buton yok), anlamlar ve örnek cümleler, kelime defteri,
  3D çevrilen kartlarla çalışma modu.

---

## Dosya yapısı

```
cevirim/
├── index.html          # Sayfa iskeleti: 3 sekme (Çeviri / Kelimelerim / Çalış)
├── manifest.json       # PWA manifesti (standalone, ikonlar, tema rengi)
├── sw.js               # Service worker — kabuk önbelleği, çevrimdışı açılış
├── PROGRESS.md         # Bu dosya — proje hafızası
├── README.md           # Kullanıcıya dönük tanıtım
├── .gitignore          # cevirim-yedek*.json (kişisel veri) hariç tutulur
├── css/
│   └── style.css       # Koyu tema, cam kartlar, animasyonlar, safe-area
├── icons/
│   ├── icon-192.png / icon-512.png                # purpose: any
│   └── icon-192-maskable.png / icon-512-maskable.png
└── js/
    ├── api.js          # Dış servisler: Google Translate, MyMemory, Datamuse
    ├── storage.js      # localStorage kalıcılığı + kayıt normalizasyonu
    ├── backup.js       # File System Access API ile otomatik dosya yedeği
    └── app.js          # Tüm arayüz mantığı (sekmeler, çeviri, liste, çalışma)
```

---

## Teknik kararlar

| Karar | Neden | Tarih |
|---|---|---|
| Build aracı yok, saf HTML/CSS/JS | Kurulum ve bakım yükü olmasın; `index.html` çift tıkla açılabilsin | 2026-07-18 |
| Çeviri butonu yok, debounce ile otomatik | Kullanıcı akışı kesilmesin; tek elle kullanım | 2026-07-18 |
| Google Translate ücretsiz uç noktası, yedek MyMemory | API anahtarı gerektirmiyor; biri düşerse diğeri devreye giriyor | 2026-07-18 |
| Veri localStorage'da (IndexedDB değil) | Kelime sayısı küçük, yapı düz dizi; ek karmaşıklığa gerek yok | 2026-07-18 |
| Kelimelere `id` alanı | Liste sıralanıp filtrelenince dizin kayıyordu; silme/geri alma kimliğe bağlandı | 2026-07-22 |
| Çeviri API yanıtları service worker'da önbelleklenmiyor | Bayat çeviri göstermek yanıltıcı olur; sadece kabuk önbelleklenir | 2026-07-22 |
| File System Access API ile otomatik yedek | iOS/tarayıcı uzun süre kullanılmayan sitenin verisini silebiliyor | 2026-07-22 |
| Aralıklar 1/3/7/16/35/90 gün | Klasik Leitner benzeri artan aralık; ezber pekişsin | 2026-07-22 |
| Status bar `black-translucent` | Koyu tema ile ekranın tepesine kadar uzanan bütünlüklü görünüm | 2026-07-23 |

---

## Yapılacaklar (öncelik sırasıyla)

1. **iOS'ta gerçek cihaz testi** — kontrol listesi aşağıda; henüz iPhone'da
   doğrulanmadı.
2. **File System Access API Safari'de yok** — iOS'ta otomatik dosya yedeği
   çalışmıyor; oradaki kullanıcıya elle "Dışa aktar" (JSON indir) butonu
   sunulmalı.
3. Kelime listesinde sayfalama veya sanal liste (kayıt sayısı büyürse).
4. Çalışma modunda günlük hedef / seri (streak) göstergesi.
5. `sw.js` güncellendiğinde kullanıcıya "yeni sürüm hazır, yenile" bildirimi.

---

## Bilinen buglar

| Durum | Sorun | Repro |
|---|---|---|
| Açık | iOS Safari'de "Yedek dosyası seç" çalışmıyor | iPhone'da Kelimelerim → 💾 Yedek dosyası seç → API desteklenmediği için tepki yok |
| Açık | Yedek dosyası izni sayfa yenilenince düşüyor | Yedek seç → sayfayı yenile → izin şeridi çıkıyor, elle "İzin ver" gerekiyor (tarayıcı güvenlik kısıtı, tasarım gereği) |

---

## PWA test kontrol listesi

- [ ] Ana ekrana eklenince tam ekran (Safari çubuğu yok) açılıyor
- [ ] Uçak modunda açılıp çalışıyor
- [ ] Veri girildikten sonra uygulama kapatılıp açılınca veri duruyor
- [ ] Çentik/home bar içerikle çakışmıyor
- [ ] İkon ana ekranda doğru görünüyor
