/* ============================================================
   storage.js — kayıtlı kelimelerin kalıcı saklanması (localStorage)
   ============================================================ */

const Store = {
  KEY: "cevirim_words",

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || "[]");
    } catch {
      return [];
    }
  },

  save(words) {
    localStorage.setItem(this.KEY, JSON.stringify(words));
  },
};
