> **Bu dosya projenin hafızasıdır. Her güncelleme, yeni özellik,
> bug fix veya teknik karar sonrasında bu dosya GÜNCELLENMELİDİR.
> Güncelleme yapılmadan iş 'bitti' sayılmaz.**

# Çevirim — Proje Hafızası

## Özet

Çevirim, İngilizce ⇄ Türkçe ⇄ İtalyanca çeviri yapan, yazdığın cümlenin
yazım/dilbilgisini denetleyen ve çevirdiğin kelimeleri kişisel bir kelime
defterine kaydeden bir web uygulamasıdır. Amaç, çeviri sırasında karşılaşılan
yeni kelimeleri kaybetmeden biriktirip aralıklı tekrar (spaced repetition) ile
ezberlemektir. Kurulum gerektirmez; saf HTML/CSS/JS ile çalışır, PWA olarak
telefona veya masaüstüne yüklenebilir ve çevrimdışı açılır.

---

## Tamamlanan işler (en yeni üstte)

### 2026-07-23 — Round-trip doğrulama ve takasta yeniden çeviri

**A. Arka planda round-trip doğrulama ("Akıllı düzeltme", varsayılan AÇIK)**
- Çeviri bittikten 600 ms sonra, sessizce ters yönde ikinci bir çeviri koşar
  ("I have a big hause" → "Büyük bir evim var" → "I have a big house").
- Geri gelen metin kullanıcının yazdığından anlamlı ölçüde farklıysa kutuların
  altında engellemeyen bir şerit çıkar: *"💡 Bunu mu demek istediniz: …"* +
  **Uygula**. Uygulamak **ek istek yapmaz** — hedef kutudaki metin zaten
  düzeltilmiş kaynağın çevirisidir; düzeltilmiş metin ayrıca çeviri
  önbelleğine tohumlanır (`API.seed`).
- Ana çeviri asla gecikmez: doğrulama sonuç ekranda göründükten sonra başlar.
- Ayar `localStorage`'da (`cevirim_smartfix`). Kapalıyken **tek bir round-trip
  isteği bile atılmaz** (ağ sayacıyla doğrulandı).
- Hata durumunda (çevrimdışı / 429 / servis) sessizce vazgeçilir.
- Doğrulandı: EN→TR, TR→EN, EN→IT, TR→IT yönlerinde şerit çıkıyor; doğru
  yazılmış cümlede çıkmıyor; TR→IT'de ASCII yazılmış Türkçeyi de düzeltiyor
  ("bugun hava cok guzel" → "Bugün hava çok güzel").

**B. Manuel swap'ta yeniden çeviri**
- ⇄ artık: yönü çevirir, önceki çeviriyi kaynak kutuya taşır ve yeni kaynağı
  yeniden çevirir — hedef kutuda özgün metnin **düzeltilmiş hali** belirir.
- Round-trip önbelleği doluysa istek atılmaz (ölçüldü: **0 fetch**), boşsa
  tek istek atılır (**1 fetch**) ve "Çevriliyor..." göstergesi görünür.
- Özgün giriş "↩ Geri getir" şeridiyle erişilebilir kalır (geri dönüş de
  ek istek yapmaz).
- Ağ yoksa eski davranışa düşer (salt takas) ve küçük bir not gösterir.
- Boş kutuda yalnızca yön değişir; art arda takaslar kararlı çalışır.

**Tek uyarı kuralı:** round-trip şeridi ile cümle kontrol paneli aynı anda
durmaz. Otomatik kontrol paneli açıkken şerit çıkarsa panel kapanır; kullanıcı
elle **✓ Kontrol Et**'e basarsa ayrıntılı panel açılır ve şerit kapanır.

### 2026-07-23 — Geliştirme turu: İtalyanca, doğruluk motoru, swap, temizle

**1. İtalyanca dil desteği**
- `js/langs.js` eklendi: desteklenen diller artık tek bir tablodan yönetiliyor
  (ad, bayrak, kısa kod, seslendirme etiketi). Yeni dil eklemek tek satır.
- Dil satırındaki sabit etiketler yerine iki `<select>` geldi; üç dil de her
  iki yönde seçilebiliyor. Aynı dil iki tarafta seçilemez (çakışınca diğer
  taraf boşalan dili alır).
- Kelime defteri yön filtresi, satır rozetleri (`TR → IT`), çalışma kartı
  etiketleri ve seslendirme dili hep bu tablodan besleniyor.
- Son kullanılan dil çifti `localStorage`'a yazılıyor.
- Doğrulandı: EN→TR, TR→EN, EN→IT, TR→IT, IT→TR yönlerinde çeviri çalışıyor.

**2. Cümle doğruluk kontrol motoru**
- `js/check.js` eklendi. Sözleşme: `checkSentence(text, lang)` →
  `{ correct, errors: [{ index, wrong, suggestion, type }], correctedText }`.
- İki katman: (a) yerel kural motoru — dile özel yazım yanlışı sözlükleri,
  çok kelimeli kalıplar, noktalama/biçim kuralları, cümle başı büyük harf,
  cümle sonu noktalama; (b) LanguageTool genel API'si (EN ve IT için,
  çevrimiçiyken). Türkçe LanguageTool'da desteklenmediği için yalnızca yerel
  katman çalışır ve panelde bu belirtilir.
- Arayüz: ayrı **✓ Kontrol Et** butonu, hatalı bölümlerde türe göre renkli
  dalgalı altı çizgi, üzerine gelince/dokununca açılan öneri baloncuğu,
  baloncuktan tek hatayı **Uygula**, üstten **✨ Düzeltilmiş hali uygula**.
- **Çeviriyle birlikte otomatik kontrol** anahtarı (tercih kaydediliyor);
  açıkken çeviriyle eşzamanlı çalışır, çeviriyi geciktirmez.
- Metin değişince panel soluklaşır; bayat sonuç üzerinden düzeltme uygulanmaz.

**3. Yön değişince mesajların yer değiştirmesi**
- ⇄ butonu artık yalnızca dilleri değil içeriği de takas ediyor: giriş metni
  ile çeviri yer değiştiriyor, geçmiş listesinde o dil çiftine ait satırların
  kaynak-hedef tarafları çevriliyor, kutular kısa bir kayma animasyonuyla
  geçiyor.
- Doğrulandı: TR→EN "merhaba → Hello" durumunda swap sonrası EN→TR
  "Hello → merhaba" ve **sıfır** ağ isteği.

**4. Tüm cümleyi tek seferde silme**
- Giriş kutusunda, yalnızca metin varken görünen ✕ butonu. Metni, çeviriyi ve
  kontrol sonucunu birlikte siliyor, odağı giriş kutusuna döndürüyor.
- Tek seviyeli geri alma: "↩ Geri al" bildirimi metni, çeviriyi ve kontrol
  panelini aynen geri getiriyor — yeniden çeviri isteği yapılmadan.

**Yan düzeltmeler:** service worker önbelleği `v3`, otomatik kontrol
anahtarına `autocomplete="off"` (tarayıcının form geri yüklemesi kayıtlı
tercihi eziyordu), öneri baloncuğu kart dışına taşmayacak şekilde sola hizalı
ve metnin altında.

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
    ├── langs.js        # Desteklenen diller tablosu (tek kaynak) — ilk yüklenir
    ├── api.js          # Dış servisler: Google Translate, MyMemory, Datamuse
    ├── check.js        # Cümle doğruluk motoru: yerel kurallar + LanguageTool
    ├── storage.js      # localStorage kalıcılığı + kayıt normalizasyonu
    ├── backup.js       # File System Access API ile otomatik dosya yedeği
    └── app.js          # Tüm arayüz mantığı (sekmeler, çeviri, liste, çalışma)
```

Betik yükleme sırası önemlidir: `langs.js` → `api.js` → `check.js` →
`storage.js` → `backup.js` → `app.js` (storage ve app, diller tablosunu kullanır).

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
| Diller ayrı bir tabloda (`langs.js`) | Dil kodları koda serpiştirilmişti; yeni dil eklemek her dosyaya dokunmayı gerektiriyordu | 2026-07-23 |
| Kontrol motoru iki katmanlı | LanguageTool Türkçe desteklemiyor ve çevrimdışıyken erişilemiyor; yerel kural katmanı her koşulda bir sonuç üretiyor | 2026-07-23 |
| Otomatik kontrol çeviriyle eşzamanlı (öncesinde değil) | Sıralı çalıştırmak çeviri gecikmesini iki katına çıkarıyordu; kullanıcı ikisini de aynı anda görüyor | 2026-07-23 |
| Swap'ta yeniden çeviri yok | Her iki metin de elde; yeni istek hem gereksiz hem de kota tüketiyor | 2026-07-23 |
| Bayat kontrol sonucu silinmez, soluklaştırılır | Kullanıcı yazmaya devam ederken önerileri okumayı sürdürebilsin; ama bayat konumlarla düzeltme uygulanmaz | 2026-07-23 |
| Round-trip önerisinde eşik: kelime oranı değil **karakter benzerliği** (≥ 0,70) | Kelime oranı kısa cümlelerde gerçek düzeltmeleri eliyordu ("benim adim baris"da 2/3 = 0,67). Benzerlik, yazım hatasını (0,8–0,97) serbest çeviriden (< 0,5) net ayırıyor | 2026-07-23 |
| Round-trip elenirse yazım denetimi yedeğe alınmaz | Denendi ve geri alındı: "my nme is baris" için "My me is basis" gibi özel isimleri bozan öneriler üretiyordu — sessiz kalmak daha iyi | 2026-07-23 |
| Round-trip önbelleği ayrı tutuluyor (`rtCache`) | Takasın ihtiyaç duyduğu çeviri tam olarak geri-çeviridir; ayrı önbellek sayesinde takas anında senkron okunup "Çevriliyor..." titremesi yaşanmıyor | 2026-07-23 |
| Swap artık yeniden çeviriyor (önceki turdaki "0 istek" kuralı değişti) | Kullanıcının yeni isteği: hedef kutuda özgün metnin düzeltilmiş hali görünsün. Önbellek sıcaksa yine 0 istek | 2026-07-23 |

---

## Yapılacaklar (öncelik sırasıyla)

1. **iOS'ta gerçek cihaz testi** — kontrol listesi aşağıda; henüz iPhone'da
   doğrulanmadı.
2. **File System Access API Safari'de yok** — iOS'ta otomatik dosya yedeği
   çalışmıyor; oradaki kullanıcıya elle "Dışa aktar" (JSON indir) butonu
   sunulmalı.
3. Türkçe dilbilgisi denetimi yok (yalnızca yazım/noktalama). "de/da" ve
   "ki" ayrı yazımı gibi kurallar eklenebilir — yanlış pozitif riski yüksek
   olduğu için şimdilik bilinçli olarak dışarıda bırakıldı.
4. Kelime tamamlama tahmini (hayalet yazı) yalnızca İngilizce çalışıyor;
   Datamuse başka dil desteklemiyor, İtalyanca/Türkçe için başka kaynak gerek.
5. LanguageTool ücretsiz API'sinin dakikalık istek sınırı var; otomatik
   kontrol çok sık tetiklenirse 429 dönebilir (şu an 500 ms debounce + sonuç
   önbelleği ile hafifletiliyor).
6. Kelime listesinde sayfalama veya sanal liste (kayıt sayısı büyürse).
7. Çalışma modunda günlük hedef / seri (streak) göstergesi.
8. `sw.js` güncellendiğinde kullanıcıya "yeni sürüm hazır, yenile" bildirimi.

---

## Bilinen buglar

| Durum | Sorun | Repro |
|---|---|---|
| Açık | iOS Safari'de "Yedek dosyası seç" çalışmıyor | iPhone'da Kelimelerim → 💾 Yedek dosyası seç → API desteklenmediği için tepki yok |
| Açık | Yedek dosyası izni sayfa yenilenince düşüyor | Yedek seç → sayfayı yenile → izin şeridi çıkıyor, elle "İzin ver" gerekiyor (tarayıcı güvenlik kısıtı, tasarım gereği) |
| Açık (kısıt) | Ağır bozuk girişte round-trip öneri veremiyor | EN→TR'de "my nme is baris" yaz → ileri çevirinin kendisi bozuluyor ("adım baris"), geri-çeviri "step peace" oluyor ve benzerlik eşiğine takılıp bilinçli olarak elenir. Aynı cümlenin TR→EN hali ("benim adim baris") sorunsuz öneri veriyor. Round-trip yönteminin doğasında olan sınır |

---

## PWA test kontrol listesi

- [ ] Ana ekrana eklenince tam ekran (Safari çubuğu yok) açılıyor
- [ ] Uçak modunda açılıp çalışıyor
- [ ] Veri girildikten sonra uygulama kapatılıp açılınca veri duruyor
- [ ] Çentik/home bar içerikle çakışmıyor
- [ ] İkon ana ekranda doğru görünüyor
