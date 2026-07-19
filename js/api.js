/* ============================================================
   api.js — internet üzerinden veri çeken katman
   Çeviri: Google Translate (birincil), MyMemory (yedek)
   Kelime tahmini: Datamuse
   ============================================================ */

const API = {
  // Aynı metin tekrar yazıldığında ağa çıkmamak için bellek içi önbellek.
  // Sınır aşılınca en eski kayıt düşer (basit LRU).
  _cache: new Map(),
  _CACHE_MAX: 200,

  _cacheGet(key) {
    if (!this._cache.has(key)) return null;
    const val = this._cache.get(key);
    this._cache.delete(key); // en sona taşı (yeni kullanılmış say)
    this._cache.set(key, val);
    return val;
  },

  _cacheSet(key, val) {
    this._cache.set(key, val);
    if (this._cache.size > this._CACHE_MAX) {
      this._cache.delete(this._cache.keys().next().value);
    }
  },

  // Google'ın ücretsiz uç noktası; dt=t çeviri, dt=bd farklı anlamlar (sözlük),
  // dt=ex örnek cümleler döndürür.
  async googleTranslate(text, from, to) {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx` +
      `&sl=${from}&tl=${to}&dt=t&dt=bd&dt=ex&dj=1&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.status === 429) throw new Error("Çeviri servisi çok fazla istek aldı");
    if (!res.ok) throw new Error("Google servisi yanıt vermedi");
    const data = await res.json();
    const translated = (data.sentences || [])
      .map((s) => s.trans || "")
      .join("");
    if (!translated) throw new Error("Boş çeviri döndü");
    const meanings = (data.dict || []).map((d) => ({
      pos: d.pos || "",
      terms: d.terms || [],
    }));
    const examples = ((data.examples && data.examples.example) || []).map(
      (e) => e.text || ""
    );
    return { translated, meanings, examples };
  },

  async myMemory(text, from, to) {
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
      `&langpair=${from}|${to}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus !== 200) {
      const detail = String(data.responseDetails || "");
      if (/limit|quota/i.test(detail))
        throw new Error("Yedek servisin günlük kotası doldu, yarın tekrar deneyin");
      throw new Error(detail || "Servis hatası");
    }
    return {
      translated: data.responseData.translatedText,
      meanings: [],
      examples: [],
    };
  },

  async translate(text, from, to) {
    const key = `${from}|${to}|${text}`;
    const cached = this._cacheGet(key);
    if (cached) return cached;

    let result;
    try {
      result = await this.googleTranslate(text, from, to);
    } catch (err) {
      // Google'ın kotası/erişimi kapandıysa yedeğe düş; o da patlarsa
      // kullanıcıya daha anlamlı olan yedek servisin hatasını göster.
      result = await this.myMemory(text, from, to);
    }
    this._cacheSet(key, result);
    return result;
  },

  // Yazılmakta olan kelime için tamamlama tahmini (yalnızca İngilizce destekler).
  // signal ile önceki istek, kullanıcı yazmaya devam ederse iptal edilir.
  async suggest(prefix, signal) {
    const res = await fetch(
      `https://api.datamuse.com/sug?s=${encodeURIComponent(prefix)}&max=1`,
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const word = data[0] && data[0].word;
    if (!word) return null;
    return word.toLowerCase().startsWith(prefix.toLowerCase()) &&
      word.length > prefix.length
      ? word
      : null;
  },
};
