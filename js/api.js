/* ============================================================
   api.js — internet üzerinden veri çeken katman
   Çeviri: Google Translate (birincil), MyMemory (yedek)
   Kelime tahmini: Datamuse
   ============================================================ */

const API = {
  // Google'ın ücretsiz uç noktası; dt=t çeviri, dt=bd farklı anlamlar (sözlük),
  // dt=ex örnek cümleler döndürür.
  async googleTranslate(text, from, to) {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx` +
      `&sl=${from}&tl=${to}&dt=t&dt=bd&dt=ex&dj=1&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
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
    if (data.responseStatus !== 200)
      throw new Error(data.responseDetails || "Servis hatası");
    return {
      translated: data.responseData.translatedText,
      meanings: [],
      examples: [],
    };
  },

  async translate(text, from, to) {
    try {
      return await this.googleTranslate(text, from, to);
    } catch {
      return await this.myMemory(text, from, to);
    }
  },

  // Yazılmakta olan kelime için tamamlama tahmini (yalnızca İngilizce destekler)
  async suggest(prefix) {
    const res = await fetch(
      `https://api.datamuse.com/sug?s=${encodeURIComponent(prefix)}&max=1`
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
