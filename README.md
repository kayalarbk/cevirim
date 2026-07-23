# Çevirim 🌐

İngilizce ⇄ Türkçe ⇄ İtalyanca çeviri, cümle kontrolü ve kişisel kelime defteri uygulaması.

## Özellikler

- **Üç dil, altı yön** — 🇬🇧 İngilizce, 🇹🇷 Türkçe ve 🇮🇹 İtalyanca arasında her yönde çeviri.
- **Otomatik çeviri** — yazmayı bıraktığınızda çeviri kendiliğinden yapılır, buton yok.
- **Cümle doğruluk kontrolü** — yazım ve dilbilgisi denetlenir; hatalar renkli altı çizgiyle işaretlenir, dokununca öneri çıkar, düzeltilmiş hali tek tıkla uygulanır. İsterseniz her çeviriyle birlikte otomatik çalışır.
- **Akıllı yön takası** — ⇄ ile yön değişince metinler de yer değiştirir; yeniden çeviri istenmez.
- **Tek tıkla temizleme** — giriş kutusundaki ✕ metni ve sonuçlarını siler, "Geri al" ile aynen döner.
- **Saydam kelime tahmini** — İngilizce yazarken kelimenin devamı hayalet yazı olarak görünür, **Tab** ile tamamlanır (Datamuse API).
- **Farklı anlamlar ve örnek cümleler** — çevrilen kelimenin sözlük anlamları ve kullanım örnekleri gösterilir.
- **Kelime defteri** — istediğiniz çeviriyi kaydedin; kelimeler tarayıcıda kalıcı saklanır (localStorage).
- **Çalışma modu** — kaydedilen kelimeler karıştırılıp 3D dönen kartlarla çalışılır.
- **Modern arayüz** — koyu tema, cam (glassmorphism) kartlar, arka planda süzülen ışık küreleri ve yıldız tozu parçacıkları.

## Veri kaynakları

| Kaynak | Görev |
|---|---|
| Google Translate (ücretsiz uç nokta) | Çeviri, anlamlar, örnek cümleler |
| MyMemory / LibreTranslate | Yedek çeviri servisleri |
| LanguageTool | Dilbilgisi denetimi (İngilizce, İtalyanca) |
| Yerel kural motoru (`js/check.js`) | Yazım/noktalama denetimi — Türkçe dahil, çevrimdışı da çalışır |
| Datamuse | Kelime tamamlama tahmini (yalnızca İngilizce) |

## Proje yapısı

```
cevirim/
├── index.html        # Sayfa iskeleti
├── css/
│   └── style.css     # Modern koyu tema, cam efekti, hareketli arka plan
├── js/
│   ├── langs.js      # Desteklenen diller tablosu (tek kaynak)
│   ├── api.js        # İnternetten veri çeken katman
│   ├── check.js      # Cümle doğruluk motoru — checkSentence(text, lang)
│   ├── storage.js    # localStorage kalıcılık katmanı
│   ├── backup.js     # Dosyaya otomatik yedekleme
│   └── app.js        # Arayüz mantığı
├── manifest.json     # PWA manifesti
├── sw.js             # Service worker — çevrimdışı destek
├── PROGRESS.md       # Proje hafızası
└── README.md
```

## Çalıştırma

Kurulum gerektirmez — `index.html` dosyasını tarayıcıda açmanız yeterli.
