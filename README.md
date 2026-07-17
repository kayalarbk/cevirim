# Çevirim 🌐

İngilizce ⇄ Türkçe çeviri ve kişisel kelime defteri uygulaması.

## Özellikler

- **Otomatik çeviri** — yazmayı bıraktığınızda çeviri kendiliğinden yapılır, buton yok.
- **Saydam kelime tahmini** — İngilizce yazarken kelimenin devamı hayalet yazı olarak görünür, **Tab** ile tamamlanır (Datamuse API).
- **Farklı anlamlar ve örnek cümleler** — çevrilen kelimenin sözlük anlamları ve kullanım örnekleri gösterilir.
- **Kelime defteri** — istediğiniz çeviriyi kaydedin; kelimeler tarayıcıda kalıcı saklanır (localStorage).
- **Çalışma modu** — kaydedilen kelimeler karıştırılıp 3D dönen kartlarla çalışılır.
- **Modern arayüz** — koyu tema, cam (glassmorphism) kartlar, arka planda süzülen ışık küreleri ve yıldız tozu parçacıkları.

## Veri kaynakları

| Kaynak | Görev |
|---|---|
| Google Translate (ücretsiz uç nokta) | Çeviri, anlamlar, örnek cümleler |
| MyMemory | Yedek çeviri servisi |
| Datamuse | Kelime tamamlama tahmini |

## Proje yapısı

```
cevirim/
├── index.html        # Sayfa iskeleti
├── css/
│   └── style.css     # Modern koyu tema, cam efekti, hareketli arka plan
├── js/
│   ├── api.js        # İnternetten veri çeken katman
│   ├── storage.js    # localStorage kalıcılık katmanı
│   └── app.js        # Arayüz mantığı
└── README.md
```

## Çalıştırma

Kurulum gerektirmez — `index.html` dosyasını tarayıcıda açmanız yeterli.
