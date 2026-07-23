/* ============================================================
   check.js — cümle doğruluk kontrol motoru

   İki katman birlikte çalışır:
   1) Yerel kural katmanı — sık yapılan yazım yanlışları, noktalama
      ve biçim kuralları. İnternet gerektirmez, her dilde çalışır.
   2) LanguageTool genel API'si — dilbilgisi denetimi. Yalnızca
      desteklediği diller (İngilizce, İtalyanca) için ve çevrimiçiyken.
      Türkçe LanguageTool'da desteklenmiyor; orada yalnızca yerel
      katman devrededir.

   Dışa açılan tek giriş noktası:
       checkSentence(text, lang)
       -> { correct, errors: [{ index, wrong, suggestion, type }],
            correctedText }
   ============================================================ */

const Check = {
  // Son çalıştırmada hangi kaynakların kullanıldığı (arayüzde not olarak
  // gösterilir). Dönüş nesnesini sözleşmede yazılı üç alanla sınırlı
  // tutmak için burada saklanıyor.
  lastSource: "yerel",

  LT_URL: "https://api.languagetool.org/v2/check",
  LT_LANG: { en: "en-US", it: "it" },

  _cache: new Map(),
  _CACHE_MAX: 60,

  // ---------- Sık yapılan yazım yanlışları (tek kelimelik) ----------
  DICT: {
    tr: {
      yanlız: "yalnız",
      yanlızca: "yalnızca",
      yanlızlık: "yalnızlık",
      yalnış: "yanlış",
      herkez: "herkes",
      şöför: "şoför",
      klavuz: "kılavuz",
      orjinal: "orijinal",
      insiyatif: "inisiyatif",
      makina: "makine",
      süpriz: "sürpriz",
      sarmısak: "sarımsak",
      traş: "tıraş",
      ünvan: "unvan",
      mahçup: "mahcup",
      muhattap: "muhatap",
      mütevazi: "mütevazı",
      birşey: "bir şey",
      hiçbirşey: "hiçbir şey",
      heryer: "her yer",
      herzaman: "her zaman",
      hiçkimse: "hiç kimse",
      tabiki: "tabii ki",
      yada: "ya da",
      döküman: "doküman",
      pantalon: "pantolon",
      kiprik: "kirpik",
      antreman: "antrenman",
      laboratuar: "laboratuvar",
      meyva: "meyve",
      zerafet: "zarafet",
      kupür: "kupür",
    },
    en: {
      teh: "the",
      recieve: "receive",
      recieved: "received",
      seperate: "separate",
      definately: "definitely",
      occured: "occurred",
      occurence: "occurrence",
      wich: "which",
      alot: "a lot",
      adress: "address",
      begining: "beginning",
      beleive: "believe",
      goverment: "government",
      neccessary: "necessary",
      untill: "until",
      wierd: "weird",
      tomorow: "tomorrow",
      accomodate: "accommodate",
      enviroment: "environment",
      existance: "existence",
      publically: "publicly",
      succesful: "successful",
      thier: "their",
      truely: "truly",
      wanna: "want to",
      gonna: "going to",
      dont: "don't",
      doesnt: "doesn't",
      cant: "can't",
      wont: "won't",
      didnt: "didn't",
      isnt: "isn't",
      couldnt: "couldn't",
      shouldnt: "shouldn't",
      arent: "aren't",
      havent: "haven't",
      wasnt: "wasn't",
      youre: "you're",
      theyre: "they're",
    },
    it: {
      perchè: "perché",
      poichè: "poiché",
      benchè: "benché",
      affinchè: "affinché",
      sè: "sé",
      nè: "né",
      pò: "po'",
      squola: "scuola",
      accellerare: "accelerare",
      familgia: "famiglia",
      propio: "proprio",
      ovunqe: "ovunque",
    },
  },

  // ---------- Birden çok kelimeye yayılan kalıplar ----------
  PHRASES: {
    tr: [
      [/\bbir kaç\b/giu, "birkaç", "yazım"],
      [/\bhiç bir\b/giu, "hiçbir", "yazım"],
      [/\bher hangi\b/giu, "herhangi", "yazım"],
      [/\bher kes\b/giu, "herkes", "yazım"],
      [/\bbir çok\b/giu, "birçok", "yazım"],
    ],
    en: [
      [/\bcould of\b/giu, "could have", "dilbilgisi"],
      [/\bwould of\b/giu, "would have", "dilbilgisi"],
      [/\bshould of\b/giu, "should have", "dilbilgisi"],
      // "a apple" → "an apple". "u" bilerek dışarıda: "a university" doğru.
      [/\b([Aa]) ([aeio]\p{L})/gu, "$1n $2", "dilbilgisi"],
      [/\b([Aa])n ([bcdfgjklmnpqrstvwxyz]\p{L})/gu, "$1 $2", "dilbilgisi"],
    ],
    it: [
      [/\bqual'è\b/giu, "qual è", "yazım"],
      [/\bun'altro\b/giu, "un altro", "yazım"],
      [/\bda vero\b/giu, "davvero", "yazım"],
    ],
  },

  // ---------- Her dilde geçerli biçim / noktalama kuralları ----------
  GENERIC: [
    // Aynı kelimenin arka arkaya yazılması ("the the", "ve ve")
    [/\b(\p{L}+)(\s+)\1\b/giu, "$1", "dilbilgisi"],
    // Çift boşluk
    [/ {2,}/gu, " ", "biçim"],
    // Noktalama işaretinden önce boşluk
    [/\s+([,.;:!?])/gu, "$1", "noktalama"],
    // Virgül/noktalı virgülden sonra boşluk yok
    [/([,;:])(\p{L})/gu, "$1 $2", "noktalama"],
    // Cümle sonu işaretinden sonra boşluk yok. En az iki harfli bir
    // kelimenin ardını arıyoruz ki "U.S.A." gibi kısaltmalar bozulmasın.
    [/(\p{L}{2}[.!?])(\p{Lu})/gu, "$1 $2", "noktalama"],
  ],

  // ---------- Yardımcılar ----------

  // Öneriyi özgün kelimenin büyük/küçük harf düzenine uydurur.
  matchCase(word, fix, lang) {
    const up = (s) => (lang === "tr" ? s.toLocaleUpperCase("tr") : s.toUpperCase());
    if (word === up(word) && word.length > 1) return up(fix);
    if (word[0] === up(word[0])) return up(fix[0]) + fix.slice(1);
    return fix;
  },

  ruleErrors(text, rules) {
    const errs = [];
    for (const [re, replacement, type] of rules) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        // Kalıp hiçbir şeyi değiştirmiyorsa hata sayma (yer tutucu kurallar).
        const suggestion = m[0].replace(new RegExp(re.source, re.flags.replace(/g/, "")), replacement);
        if (suggestion !== m[0]) {
          errs.push({ index: m.index, wrong: m[0], suggestion, type });
        }
        if (m[0] === "") re.lastIndex++; // sonsuz döngü koruması
      }
    }
    return errs;
  },

  spellErrors(text, lang) {
    const dict = this.DICT[lang] || {};
    const errs = [];
    const re = /[\p{L}\p{M}']+/gu;
    let m;
    while ((m = re.exec(text))) {
      const word = m[0];
      const fix = dict[word.toLocaleLowerCase(lang === "tr" ? "tr" : "en")];
      if (!fix || fix.toLowerCase() === word.toLowerCase()) continue;
      errs.push({
        index: m.index,
        wrong: word,
        suggestion: this.matchCase(word, fix, lang),
        type: "yazım",
      });
    }
    return errs;
  },

  // Cümle başı büyük harf ve cümle sonu noktalama — metnin uçlarına
  // bakan, düzenli ifadeyle anlatması zor iki kural.
  shapeErrors(text, lang) {
    const errs = [];
    const start = text.search(/\S/);
    if (start !== -1) {
      const ch = text[start];
      const upper = lang === "tr" ? ch.toLocaleUpperCase("tr") : ch.toUpperCase();
      if (/\p{Ll}/u.test(ch) && upper !== ch) {
        errs.push({ index: start, wrong: ch, suggestion: upper, type: "biçim" });
      }
    }
    const trimmed = text.replace(/\s+$/, "");
    if (trimmed.length >= 12 && /[\p{L}\p{N}]$/u.test(trimmed)) {
      errs.push({
        index: trimmed.length - 1,
        wrong: trimmed.slice(-1),
        suggestion: trimmed.slice(-1) + ".",
        type: "noktalama",
      });
    }
    return errs;
  },

  localErrors(text, lang) {
    return [
      ...this.spellErrors(text, lang),
      ...this.ruleErrors(text, this.PHRASES[lang] || []),
      ...this.ruleErrors(text, this.GENERIC),
      ...this.shapeErrors(text, lang),
    ];
  },

  // ---------- LanguageTool ----------
  LT_TYPE: {
    misspelling: "yazım",
    typographical: "noktalama",
    whitespace: "biçim",
    style: "biçim",
    grammar: "dilbilgisi",
    duplication: "dilbilgisi",
    inconsistency: "biçim",
  },

  async remote(text, lang) {
    const code = this.LT_LANG[lang];
    if (!code || !navigator.onLine) return null;
    const res = await fetch(this.LT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: code, enabledOnly: "false" }),
    });
    if (!res.ok) throw new Error("Dilbilgisi servisi yanıt vermedi");
    const data = await res.json();
    return (data.matches || [])
      .map((m) => ({
        index: m.offset,
        wrong: text.substr(m.offset, m.length),
        suggestion: (m.replacements && m.replacements[0] && m.replacements[0].value) || "",
        type: this.LT_TYPE[m.rule && m.rule.issueType] || "dilbilgisi",
      }))
      // Uzunluğu sıfır olan eşleşmeler vurgulanamaz; atlanır.
      .filter((e) => e.wrong);
  },

  // Yerel ve uzak sonuçlar çakışabilir (ikisi de aynı kelimeyi işaretler).
  // Konuma göre sıralayıp üst üste binenleri eliyoruz; yerel bulgular
  // önce eklendiği için önceliklidir.
  merge(local, remote) {
    const all = [...local, ...remote].sort((a, b) => a.index - b.index);
    const out = [];
    let end = -1;
    for (const e of all) {
      if (e.index < end) continue;
      out.push(e);
      end = e.index + e.wrong.length;
    }
    return out;
  },

  applyAll(text, errors) {
    let out = text;
    [...errors]
      .sort((a, b) => b.index - a.index)
      .forEach((e) => {
        if (!e.suggestion) return;
        out = out.slice(0, e.index) + e.suggestion + out.slice(e.index + e.wrong.length);
      });
    return out;
  },

  async run(text, lang) {
    const clean = String(text == null ? "" : text);
    if (!clean.trim()) {
      this.lastSource = "yerel";
      return { correct: true, errors: [], correctedText: clean };
    }

    const key = `${lang}|${clean}`;
    if (this._cache.has(key)) {
      const hit = this._cache.get(key);
      this.lastSource = hit.source;
      return hit.result;
    }

    const local = this.localErrors(clean, lang);
    let remote = [];
    let source = this.LT_LANG[lang] ? "yerel" : "yalnız-yerel";
    try {
      const r = await this.remote(clean, lang);
      if (r) {
        remote = r;
        source = "tam";
      }
    } catch {
      source = "yerel-hata"; // servis düştü; yerel kurallarla devam
    }

    const errors = this.merge(local, remote);
    const result = {
      correct: errors.length === 0,
      errors,
      correctedText: this.applyAll(clean, errors),
    };

    this._cache.set(key, { result, source });
    if (this._cache.size > this._CACHE_MAX) {
      this._cache.delete(this._cache.keys().next().value);
    }
    this.lastSource = source;
    return result;
  },
};

// Sözleşmeli giriş noktası.
async function checkSentence(text, lang) {
  return Check.run(text, lang);
}
