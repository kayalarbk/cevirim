/* ============================================================
   langs.js — desteklenen dillerin TEK kaynağı.

   Yeni bir dil eklemek için buraya bir satır yazmak yeterli:
   arayüz etiketleri, bayraklar, seslendirme kodu, kelime defteri
   filtreleri ve kayıt doğrulaması hep bu tablodan beslenir.
   ============================================================ */

const LANGS = {
  en: { name: "İngilizce", flag: "🇬🇧", short: "EN", speech: "en-US", srcLabel: "İngilizce'den" },
  tr: { name: "Türkçe", flag: "🇹🇷", short: "TR", speech: "tr-TR", srcLabel: "Türkçe'den" },
  it: { name: "İtalyanca", flag: "🇮🇹", short: "IT", speech: "it-IT", srcLabel: "İtalyanca'dan" },
};

const LANG_CODES = Object.keys(LANGS);

function isLang(code) {
  return Object.prototype.hasOwnProperty.call(LANGS, code);
}

function langName(code) {
  return isLang(code) ? LANGS[code].name : String(code);
}

function langFlag(code) {
  return isLang(code) ? LANGS[code].flag : "🏳";
}

// Kelime defteri satırlarındaki "EN → TR" rozeti için
function langShort(code) {
  return isLang(code) ? LANGS[code].short : String(code).toUpperCase();
}

// Web Speech API'nin beklediği BCP-47 etiketi
function speechTag(code) {
  return isLang(code) ? LANGS[code].speech : "en-US";
}

function langOptions(selected) {
  return LANG_CODES.map(
    (c) =>
      `<option value="${c}"${c === selected ? " selected" : ""}>${LANGS[c].flag} ${LANGS[c].name}</option>`
  ).join("");
}
