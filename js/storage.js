/* ============================================================
   storage.js — kayıtlı kelimelerin kalıcı saklanması (localStorage)
   ============================================================ */

const Store = {
  KEY: "cevirim_words",

  newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  // Eski kayıtlarda id ve çalışma istatistiği yok; yüklerken tamamlanır.
  // Böylece silme/geri alma ve çalışma ilerlemesi dizin yerine id'ye
  // dayanabilir.
  normalize(w) {
    if (!w || typeof w.src !== "string" || typeof w.dst !== "string") return null;
    return {
      id: typeof w.id === "string" && w.id ? w.id : this.newId(),
      src: w.src,
      dst: w.dst,
      from: w.from === "tr" ? "tr" : "en",
      to: w.to === "en" ? "en" : "tr",
      date: w.date || new Date().toISOString(),
      right: Number.isFinite(w.right) ? w.right : 0,
      wrong: Number.isFinite(w.wrong) ? w.wrong : 0,
      note: typeof w.note === "string" ? w.note : "",
      tags: Array.isArray(w.tags) ? w.tags.filter((t) => typeof t === "string") : [],
      // Aralıklı tekrar: kelimenin kaçıncı basamakta olduğu ve bir sonraki
      // tekrar tarihi. Yeni kayıtlar hemen tekrar edilebilir.
      level: Number.isFinite(w.level) ? w.level : 0,
      due: w.due || new Date().toISOString(),
    };
  },

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map((w) => this.normalize(w)).filter(Boolean);
    } catch {
      return [];
    }
  },

  // Kota dolduğunda veya localStorage kapalı olduğunda (gizli sekme,
  // engellenmiş çerezler) yazma istisna atar. Sessizce yutmak yerine
  // false döndürüyoruz ki arayüz "kaydedildi" demesin.
  save(words) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(words));
      return true;
    } catch (err) {
      console.error("Kelimeler kaydedilemedi:", err);
      return false;
    }
  },
};
