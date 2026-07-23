/* ============================================================
   app.js — arayüz mantığı: sekmeler, otomatik çeviri, hayalet
   tahmin, anlamlar/örnekler, kelime defteri, çalışma kartları
   ============================================================ */

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Durum ----------
const LANG_PREF_KEY = "cevirim_langs";

// Son kullanılan dil çifti hatırlanır; geçersizse İngilizce → Türkçe.
function loadLangPref() {
  try {
    const p = JSON.parse(localStorage.getItem(LANG_PREF_KEY) || "null");
    if (p && isLang(p.src) && isLang(p.dst) && p.src !== p.dst) return p;
  } catch {
    /* bozuk kayıt: varsayılana dön */
  }
  return { src: "en", dst: "tr" };
}

const pref = loadLangPref();
let srcLang = pref.src;
let dstLang = pref.dst;
let lastTranslation = null;
let words = Store.load();

function saveLangPref() {
  try {
    localStorage.setItem(LANG_PREF_KEY, JSON.stringify({ src: srcLang, dst: dstLang }));
  } catch {
    /* kota/gizli sekme: dil tercihi kaydedilemezse uygulama yine çalışır */
  }
}

const POS_TR = {
  noun: "isim",
  verb: "fiil",
  adjective: "sıfat",
  adverb: "zarf",
  pronoun: "zamir",
  preposition: "edat",
  conjunction: "bağlaç",
  interjection: "ünlem",
  abbreviation: "kısaltma",
  phrase: "ifade",
};

// ---------- Sekmeler ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll("main section").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "words") renderWords();
    if (btn.dataset.tab === "study") renderStudySummary();
  });
});

// ---------- Dil seçimi ----------
function renderLangSelects() {
  $("srcLang").innerHTML = langOptions(srcLang);
  $("dstLang").innerHTML = langOptions(dstLang);
}

// Yalnızca dil kodlarını çevirir; kutulardaki metinlere dokunmaz.
function swapLangs() {
  [srcLang, dstLang] = [dstLang, srcLang];
  renderLangSelects();
  saveLangPref();
  clearGhost();
}

function setLangs(src, dst) {
  srcLang = src;
  dstLang = dst;
  renderLangSelects();
  saveLangPref();
  clearGhost();
}

// Aynı dil iki tarafta seçilemez: çakışınca diğer taraf boşalan dili alır.
$("srcLang").addEventListener("change", (e) => {
  const chosen = e.target.value;
  setLangs(chosen, chosen === dstLang ? srcLang : dstLang);
  onDirectionChanged();
});

$("dstLang").addEventListener("change", (e) => {
  const chosen = e.target.value;
  setLangs(chosen === srcLang ? dstLang : srcLang, chosen);
  onDirectionChanged();
});

// Dil çifti gerçekten değiştiyse eldeki çeviri artık geçersizdir.
function onDirectionChanged() {
  clearCheck();
  hideSuggestBar();
  hideRevertBar();
  if ($("sourceText").value.trim()) translate();
  else resetResult();
}

// ---------- Yön takası: metinler de yer değiştirir ----------
$("swapBtn").addEventListener("click", swapSides);

function swapSides() {
  const oldSrc = srcLang;
  const oldDst = dstLang;
  const pair = lastTranslation;
  const text = $("sourceText").value;

  swapLangs();
  flipHistory(oldSrc, oldDst);
  // Ekrandaki kontrol sonucu eski kaynağa aitti; bayat bırakılmaz.
  clearCheck();
  hideSuggestBar();

  if (pair && pair.dst) {
    animateSwap();
    $("sourceText").value = pair.dst;
    // Anlamlar ve örnekler eski yöne aitti; yanıltmasın diye kaldırılır.
    currentExamples = [];
    pickedExample = "";
    renderDetails([], []);
    updateToolButtons();
    updateInputState();
    showRevertBar(pair, oldSrc, oldDst);

    // Yeni yöndeki çeviri, eski hedefin geri-çevirisidir — Akıllı
    // düzeltme bunu zaten hesaplamış olabilir. Önbellek doluysa
    // ekstra istek atmadan gösterilir.
    const cached = rtCache.get(rtKey(pair.dst, oldDst, oldSrc));
    if (cached !== undefined) {
      setResult(pair.dst, cached);
      return;
    }

    // Ağ yoksa eski davranışa dön: salt takas.
    if (!navigator.onLine) {
      setResult(pair.dst, pair.src);
      showToast("Çevrimdışı — metinler yalnızca yer değiştirdi");
      return;
    }

    translate(); // 1 istek, "Çevriliyor..." göstergesiyle
    return;
  }

  // Çevrilmemiş bir metin varsa yeni yönde çevirmek gerekir.
  if (text.trim()) translate();
}

// Hazır bir çeviriyi ağ isteği olmadan ekrana yazar.
function setResult(src, dst) {
  const box = $("resultBox");
  box.classList.remove("empty");
  box.textContent = dst;
  box.classList.remove("pop");
  void box.offsetWidth;
  box.classList.add("pop");
  lastTranslation = { src, dst, from: srcLang, to: dstLang };
  API.seed(src, srcLang, dstLang, dst);
  $("saveBtn").disabled = false;
  updateToolButtons();
  pushHistory(lastTranslation);
}

// Takastan sonra özgün giriş tek tıkla geri gelebilsin.
let revertState = null;

function showRevertBar(pair, oldSrc, oldDst) {
  revertState = { src: pair.src, dst: pair.dst, from: oldSrc, to: oldDst };
  $("revertText").textContent = pair.src;
  $("revertBar").hidden = false;
}

function hideRevertBar() {
  revertState = null;
  $("revertBar").hidden = true;
}

$("revertBtn").addEventListener("click", () => {
  if (!revertState) return;
  const r = revertState;
  hideRevertBar();
  hideSuggestBar();
  clearCheck();
  clearTimeout(autoTimer);
  requestSeq++; // uçuştaki takas çevirisi geri dönerse kutuyu ezmesin
  setLangs(r.from, r.to);
  $("sourceText").value = r.src;
  setResult(r.src, r.dst);
  updateInputState();
  clearGhost();
});

$("revertCloseBtn").addEventListener("click", hideRevertBar);

// Takas anını görünür kılan kısa kayma animasyonu.
function animateSwap() {
  const boxes = $("boxes");
  boxes.classList.remove("swapping");
  void boxes.offsetWidth;
  boxes.classList.add("swapping");
  setTimeout(() => boxes.classList.remove("swapping"), 480);
}

// ---------- Çeviri (tamamen otomatik) ----------
let requestSeq = 0;

async function translate() {
  const text = $("sourceText").value.trim();
  if (!text) return;
  const box = $("resultBox");
  const myReq = ++requestSeq;
  // Otomatik kontrol açıksa çeviriyle aynı anda başlatılır: kullanıcı
  // çeviriyi beklerken denetim sonucunu da görür, çeviri gecikmez.
  if (autoCheck) runCheck(true);
  box.classList.remove("empty");
  box.textContent = "Çevriliyor...";
  $("saveBtn").disabled = true;
  lastTranslation = null;
  updateToolButtons();
  try {
    const { translated, meanings, examples } = await API.translate(text, srcLang, dstLang);
    if (myReq !== requestSeq) return; // daha yeni bir istek var
    box.textContent = translated;
    box.classList.remove("pop");
    void box.offsetWidth; // animasyonu yeniden tetikle
    box.classList.add("pop");
    lastTranslation = { src: text, dst: translated, from: srcLang, to: dstLang };
    $("saveBtn").disabled = false;
    updateToolButtons();
    currentExamples = examples || [];
    pickedExample = "";
    renderDetails(meanings, examples);
    pushHistory(lastTranslation);
    // Doğrulama arkadan gelir; çeviri sonucu zaten ekranda.
    scheduleRoundTrip(lastTranslation);
  } catch (err) {
    if (myReq !== requestSeq) return;
    box.textContent = "⚠ Çeviri alınamadı: " + err.message + "\nİnternet bağlantınızı kontrol edin.";
    lastTranslation = null;
    updateToolButtons();
    renderDetails([], []);
  }
}

function resetResult() {
  const box = $("resultBox");
  box.classList.add("empty");
  box.textContent = "Çeviri burada görünecek...";
  $("saveBtn").disabled = true;
  lastTranslation = null;
  updateToolButtons();
  renderDetails([], []);
}

/* ============================================================
   ARKA PLAN ROUND-TRIP DOĞRULAMA ("Akıllı düzeltme")

   Çeviri bittikten sonra, sessizce ters yönde ikinci bir çeviri
   koşar: "my nme is baris" → "benim adım barış" → "my name is barış".
   Geri gelen metin kullanıcının yazdığından kelime düzeyinde
   farklıysa, engellemeyen bir öneri şeridi çıkar.

   Geri-çeviri sonuçları ayrıca önbelleğe yazılır; yön takası (⇄)
   tam olarak bu çeviriye ihtiyaç duyduğu için oradan bedavaya
   okunabiliyor.
   ============================================================ */
const SMART_FIX_KEY = "cevirim_smartfix";

// Varsayılan AÇIK: yalnızca kullanıcı kapattıysa "0" yazılı olur.
let smartFix = localStorage.getItem(SMART_FIX_KEY) !== "0";
$("smartFixToggle").checked = smartFix;

$("smartFixToggle").addEventListener("change", (e) => {
  smartFix = e.target.checked;
  try {
    localStorage.setItem(SMART_FIX_KEY, smartFix ? "1" : "0");
  } catch {
    /* tercih kaydedilemezse oturum boyunca geçerli kalır */
  }
  if (!smartFix) {
    clearTimeout(rtTimer);
    rtSeq++; // uçuştaki doğrulama geri dönerse şerit açmasın
    hideSuggestBar();
  } else if (lastTranslation) {
    scheduleRoundTrip(lastTranslation);
  }
});

// Geri-çeviri önbelleği: "hedefDil|kaynakDil|hedefMetin" → geri-çeviri
const rtCache = new Map();
const RT_CACHE_MAX = 60;
let rtTimer;
let rtSeq = 0;

function rtKey(text, from, to) {
  return `${from}|${to}|${text}`;
}

function rtCacheSet(key, value) {
  rtCache.set(key, value);
  if (rtCache.size > RT_CACHE_MAX) rtCache.delete(rtCache.keys().next().value);
}

// Karşılaştırma için metni sadeleştirir: küçük harf, noktalama yok,
// tek boşluk. Böylece yalnızca noktalama/büyük harf farkı öneri üretmez.
function normWords(text, lang) {
  return text
    .toLocaleLowerCase(lang === "tr" ? "tr" : lang === "it" ? "it" : "en")
    .replace(/[.,!?;:()[\]{}"'«»…\-–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// İki metin arasındaki düzenleme (Levenshtein) uzaklığı. Yalnızca iki
// satır tutulur; uzun metinlerde bellek şişmesin.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur.slice();
  }
  return prev[b.length];
}

// 1 = birebir aynı, 0 = tamamen farklı.
function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}

/* Öneri eşiği.

   Kelime sayısı oranıyla karar vermek yanıltıcıydı: "benim adim baris"
   gibi kısa bir cümlede iki kelime hatalıysa oran 0,67 çıkıp gerçek bir
   yazım düzeltmesi eleniyordu. Karakter benzerliği ayrımı doğru yapıyor:
   yazım hataları yüksek benzerlik (aynı kelimenin bozuk hali), ileri
   çevirinin çöktüğü durumlar ise düşük benzerlik üretir.

     "the wether is very nice today" ↔ "...weather..."  → 0,97  öner
     "benim adim baris"  ↔ "benim adım barış"           → 0,88  öner
     "my nme is baris"   ↔ "step peace"                 → 0,13  eleme
     kelime sırası değişmiş ama anlam aynı              → ~0,40 eleme */
const RT_MIN_SIMILARITY = 0.7;
const RT_MAX_LEN = 600; // daha uzun metinlerde uzaklık hesabı pahalılaşır

// Yalnızca noktalama/büyük harf farkı öneri sayılmaz.
function wordsDiffer(a, b, lang) {
  return normWords(a, lang).join(" ") !== normWords(b, lang).join(" ");
}

function worthSuggesting(original, back, lang) {
  const a = normWords(original, lang).join(" ");
  const b = normWords(back, lang).join(" ");
  if (!a || !b || a === b) return false;
  if (a.length > RT_MAX_LEN || b.length > RT_MAX_LEN) return false;
  return similarity(a, b) >= RT_MIN_SIMILARITY;
}

function scheduleRoundTrip(pair) {
  clearTimeout(rtTimer);
  if (!smartFix || !pair || !pair.dst) return;
  // Ana çeviriyi asla geciktirmez: sonuç gösterildikten sonra tetiklenir.
  rtTimer = setTimeout(() => runRoundTrip(pair), 600);
}

async function runRoundTrip(pair) {
  const key = rtKey(pair.dst, pair.to, pair.from);
  const mySeq = ++rtSeq;

  let back = rtCache.get(key);
  if (back === undefined) {
    if (!navigator.onLine) return; // sessizce vazgeç
    try {
      const res = await API.translate(pair.dst, pair.to, pair.from);
      back = res.translated;
      rtCacheSet(key, back);
    } catch {
      return; // 429/offline/servis hatası: kullanıcıyı rahatsız etme
    }
  }
  if (mySeq !== rtSeq) return; // daha yeni bir doğrulama var
  // Kullanıcı bu arada metni değiştirdiyse öneri artık geçersiz.
  if ($("sourceText").value.trim() !== pair.src) return;

  // Geri-çeviri anlamlı bir fark gösteriyorsa öner. Hedef kutudaki
  // metin zaten bu düzeltilmiş kaynağın çevirisidir; uygulamak ek
  // istek gerektirmez.
  //
  // Fark elenirse sessiz geçilir. Yazım denetimini burada yedek olarak
  // çalıştırmayı denedim; "my nme is baris" için "My me is basis" gibi
  // özel isimleri bozan öneriler ürettiği için vazgeçildi. Denetim
  // yalnızca kullanıcı istediğinde (✓ Kontrol Et) veya otomatik kontrol
  // açıkken çalışır.
  if (worthSuggesting(pair.src, back, pair.from)) showSuggestBar(back);
}

let suggestion = null; // şeritte gösterilen düzeltme metni

function showSuggestBar(text) {
  // Aynı anda iki uyarı gösterme: otomatik kontrol paneli açıksa
  // kapatılır, öneri tek şeritte toplanır. Kullanıcının elle açtığı
  // kontrol paneli ise dokunulmadan bırakılır (bilerek istenmiş).
  if (!$("checkPanel").hidden && checkAuto) clearCheck();
  if (!$("checkPanel").hidden) return;

  suggestion = text;
  $("suggestText").textContent = text;
  $("suggestBar").hidden = false;
}

function hideSuggestBar() {
  suggestion = null;
  $("suggestBar").hidden = true;
}

// Öneriyi uygulamak ek çeviri istemez: hedef kutudaki metin zaten bu
// düzeltilmiş kaynağın çevirisidir.
$("suggestApplyBtn").addEventListener("click", () => {
  if (!suggestion || !lastTranslation) return;
  const text = suggestion;
  const { dst, from, to } = lastTranslation;

  clearTimeout(autoTimer); // input olayı elle tetiklenmeyecek
  $("sourceText").value = text;
  hideSuggestBar();
  clearCheck();
  clearGhost();
  updateInputState();

  // Hedef kutudaki metin zaten bu düzeltilmiş kaynağın çevirisi;
  // yeniden çeviri istemeye gerek yok.
  lastTranslation = { src: text, dst, from, to };
  API.seed(text, from, to, dst);
  pushHistory(lastTranslation);
  updateToolButtons();
  showToast("Metin düzeltildi ✔");
});

$("suggestCloseBtn").addEventListener("click", hideSuggestBar);

// ---------- Kutu araçları: seslendir & kopyala ----------
const canSpeak = "speechSynthesis" in window;

function speak(text, code, btn) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  document.querySelectorAll(".tool-btn.speaking").forEach((b) => b.classList.remove("speaking"));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechTag(code);
  u.rate = 0.95;
  btn.classList.add("speaking");
  u.onend = u.onerror = () => btn.classList.remove("speaking");
  speechSynthesis.speak(u);
}

async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API yoksa veya izin verilmediyse eski yöntem
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      showToast("Kopyalanamadı 😕");
      ta.remove();
      return;
    }
    ta.remove();
  }
  btn.textContent = "✔";
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = "📋";
    btn.classList.remove("done");
  }, 1200);
  showToast("Panoya kopyalandı ✔");
}

function updateToolButtons() {
  const src = $("sourceText").value.trim();
  const dst = lastTranslation ? lastTranslation.dst : "";
  $("copySrcBtn").disabled = !src;
  $("speakSrcBtn").disabled = !src || !canSpeak;
  $("copyDstBtn").disabled = !dst;
  $("speakDstBtn").disabled = !dst || !canSpeak;
}

$("copySrcBtn").addEventListener("click", (e) =>
  copyText($("sourceText").value.trim(), e.currentTarget)
);
$("copyDstBtn").addEventListener("click", (e) =>
  copyText(lastTranslation ? lastTranslation.dst : "", e.currentTarget)
);
$("speakSrcBtn").addEventListener("click", (e) =>
  speak($("sourceText").value.trim(), srcLang, e.currentTarget)
);
$("speakDstBtn").addEventListener("click", (e) =>
  speak(lastTranslation ? lastTranslation.dst : "", dstLang, e.currentTarget)
);

// Giriş kutusuna bağlı butonların (temizle, kontrol et) görünürlüğü.
function updateInputState() {
  const has = $("sourceText").value.length > 0;
  $("clearInputBtn").hidden = !has;
  $("checkBtn").disabled = !$("sourceText").value.trim();
}

let autoTimer;
$("sourceText").addEventListener("input", () => {
  clearTimeout(autoTimer);
  clearTimeout(rtTimer);
  rtSeq++; // uçuştaki doğrulama eski metne aitti
  hideSuggestBar();
  hideRevertBar();
  updateInputState();
  const text = $("sourceText").value.trim();
  if (!text) {
    resetResult();
    clearGhost();
    clearCheck();
    return;
  }
  // Metin değişti: ekrandaki kontrol sonucu artık bu metne ait değil.
  markCheckStale();
  autoTimer = setTimeout(translate, 500);
  updateToolButtons();
  scheduleGhost();
});

// ---------- Tüm metni tek seferde silme (tek seviyeli geri al) ----------
let clearedSnapshot = null;

$("clearInputBtn").addEventListener("click", () => {
  const text = $("sourceText").value;
  if (!text) return;

  const box = $("resultBox");
  clearedSnapshot = {
    text,
    translation: lastTranslation,
    result: box.textContent,
    resultEmpty: box.classList.contains("empty"),
    check: checkResult,
    checkedText: checkedText,
  };

  clearTimeout(autoTimer);
  clearTimeout(rtTimer);
  rtSeq++;
  requestSeq++; // uçuştaki çeviri geri dönerse boş kutuyu doldurmasın
  $("sourceText").value = "";
  resetResult();
  clearGhost();
  clearCheck();
  hideSuggestBar();
  hideRevertBar();
  updateToolButtons();
  updateInputState();
  $("sourceText").focus();
  showToast("Metin temizlendi", "↩ Geri al", restoreCleared);
});

// Geri alma yalnızca ekrandaki durumu tazeler — yeniden çeviri istenmez.
function restoreCleared() {
  if (!clearedSnapshot) return;
  const s = clearedSnapshot;
  clearedSnapshot = null;

  $("sourceText").value = s.text;
  lastTranslation = s.translation;
  const box = $("resultBox");
  box.textContent = s.result;
  box.classList.toggle("empty", s.resultEmpty);
  $("saveBtn").disabled = !s.translation;
  updateToolButtons();
  updateInputState();
  if (s.check) {
    checkResult = s.check;
    checkedText = s.checkedText;
    renderCheck(s.checkedText, s.check);
  }
  $("sourceText").focus();
}

// ---------- Hayalet kelime tahmini ----------
let ghostSuggestion = null; // tamamlanmış kelimenin tamamı
let ghostSeq = 0;
let ghostTimer;
let ghostAbort = null;

function clearGhost() {
  clearTimeout(ghostTimer);
  if (ghostAbort) ghostAbort.abort();
  ghostSuggestion = null;
  $("ghostLayer").innerHTML = "";
  $("ghostHint").classList.remove("show");
}

// Her tuş vuruşunda ağa çıkmamak için tahmini geciktir ve
// bekleyen isteği iptal et.
function scheduleGhost() {
  clearTimeout(ghostTimer);
  if (ghostAbort) ghostAbort.abort();
  ghostTimer = setTimeout(updateGhost, 250);
}

async function updateGhost() {
  const ta = $("sourceText");
  const value = ta.value;
  // Yalnızca imleç sondayken ve İngilizce yazarken tahmin göster
  if (srcLang !== "en" || ta.selectionStart !== value.length) {
    clearGhost();
    return;
  }
  const match = value.match(/([A-Za-z']+)$/); // yazılmakta olan son kelime
  if (!match || match[1].length < 2) {
    clearGhost();
    return;
  }
  const prefix = match[1];
  const mySeq = ++ghostSeq;
  ghostAbort = new AbortController();
  const word = await API.suggest(prefix, ghostAbort.signal).catch(() => null);
  if (mySeq !== ghostSeq || ta.value !== value) return; // metin değişti
  if (!word) {
    clearGhost();
    return;
  }
  ghostSuggestion = word;
  const rest = word.slice(prefix.length);
  $("ghostLayer").innerHTML =
    `<span>${esc(value)}</span><span class="ghost">${esc(rest)}</span>`;
  $("ghostHint").classList.add("show");
}

$("sourceText").addEventListener("keydown", (e) => {
  if (e.key === "Tab" && ghostSuggestion) {
    e.preventDefault();
    const ta = $("sourceText");
    // replace() yerine dilimleme: öneride "$" geçerse replace onu
    // özel karakter sayardı.
    const m = ta.value.match(/([A-Za-z']+)$/);
    if (m) ta.value = ta.value.slice(0, ta.value.length - m[1].length) + ghostSuggestion;
    clearGhost();
    ta.dispatchEvent(new Event("input"));
  }
});
$("sourceText").addEventListener("blur", clearGhost);
$("sourceText").addEventListener("scroll", () => {
  $("ghostLayer").scrollTop = $("sourceText").scrollTop;
});

// ---------- Cümle doğruluk kontrolü ----------
const AUTO_CHECK_KEY = "cevirim_autocheck";

let checkResult = null; // son kontrol sonucu
let checkedText = ""; // sonucun ait olduğu metin
let checkSeq = 0; // yarışan istekleri ayıklamak için
let checkAuto = false; // panel otomatik mi açıldı, kullanıcı mı istedi

let autoCheck = localStorage.getItem(AUTO_CHECK_KEY) === "1";
$("autoCheckToggle").checked = autoCheck;

$("autoCheckToggle").addEventListener("change", (e) => {
  autoCheck = e.target.checked;
  try {
    localStorage.setItem(AUTO_CHECK_KEY, autoCheck ? "1" : "0");
  } catch {
    /* tercih kaydedilemezse oturum boyunca geçerli kalır */
  }
  if (autoCheck && $("sourceText").value.trim()) runCheck(true);
});

const ERR_CLASS = {
  yazım: "e-spell",
  dilbilgisi: "e-gram",
  noktalama: "e-punc",
  biçim: "e-style",
};

function clearCheck() {
  checkSeq++; // uçuştaki kontrol geri dönerse paneli açmasın
  checkResult = null;
  checkedText = "";
  const panel = $("checkPanel");
  panel.hidden = true;
  panel.classList.remove("stale");
  $("applyFixBtn").hidden = true;
  $("checkText").innerHTML = "";
  $("checkNote").textContent = "";
}

// Panel açıkken metin değişirse sonucu silmiyoruz; soluklaştırıp
// "güncel değil" diyoruz — kullanıcı önerileri hâlâ okuyabilsin.
function markCheckStale() {
  if ($("checkPanel").hidden || !checkResult) return;
  if ($("sourceText").value === checkedText) {
    $("checkPanel").classList.remove("stale");
    return;
  }
  $("checkPanel").classList.add("stale");
}

async function runCheck(auto) {
  const text = $("sourceText").value.trim();
  if (!text) return;
  // Otomatik tetiklemede aynı metni tekrar tekrar denetlemeyelim.
  if (auto && text === checkedText && checkResult) return;

  // Elle istenen kontrol ayrıntılı görünümdür; aynı anda öneri şeridi
  // durmasın diye şerit kapatılır (tek uyarı kuralı).
  checkAuto = !!auto;
  if (!auto) hideSuggestBar();

  const mySeq = ++checkSeq;
  const panel = $("checkPanel");
  panel.hidden = false;
  panel.classList.remove("stale");
  $("checkStatus").textContent = "Kontrol ediliyor...";
  $("checkStatus").className = "check-status";
  $("applyFixBtn").hidden = true;

  let res;
  try {
    res = await checkSentence(text, srcLang);
  } catch (err) {
    if (mySeq !== checkSeq) return;
    $("checkStatus").textContent = "⚠ Kontrol yapılamadı: " + err.message;
    $("checkStatus").className = "check-status warn";
    return;
  }
  if (mySeq !== checkSeq) return;

  checkResult = res;
  checkedText = text;
  renderCheck(text, res);
}

function checkNote(lang) {
  if (lang === "tr") {
    return "Türkçe için yerel yazım ve noktalama kuralları kullanıldı (dilbilgisi servisi Türkçe desteklemiyor).";
  }
  if (Check.lastSource === "tam") {
    return "LanguageTool dilbilgisi denetimi + yerel yazım kuralları.";
  }
  return "Dilbilgisi servisine ulaşılamadı; yalnızca yerel yazım ve noktalama kuralları uygulandı.";
}

function renderCheck(text, res) {
  const panel = $("checkPanel");
  panel.hidden = false;
  panel.classList.remove("stale");

  const status = $("checkStatus");
  if (res.correct) {
    status.textContent = "✓ Cümle doğru görünüyor";
    status.className = "check-status ok";
  } else {
    status.textContent = `⚠ ${res.errors.length} olası hata bulundu — işaretli yere dokunun`;
    status.className = "check-status warn";
  }

  $("applyFixBtn").hidden = res.correct || res.correctedText === text;
  $("checkText").innerHTML = highlightErrors(text, res.errors);
  $("checkNote").textContent = checkNote(srcLang);
}

// Metni, hatalı aralıkları <mark> ile sararak yeniden kurar. Hatalar
// check.js'te konuma göre sıralanmış ve çakışmaları ayıklanmış gelir.
function highlightErrors(text, errors) {
  let out = "";
  let pos = 0;
  errors.forEach((e, i) => {
    if (e.index < pos) return;
    out += esc(text.slice(pos, e.index));
    const tip = e.suggestion
      ? `<b>${esc(e.type)}</b> → <i>${esc(e.suggestion)}</i>
         <button class="tip-apply" type="button" data-fix="${i}">Uygula</button>`
      : `<b>${esc(e.type)}</b> — öneri yok`;
    out +=
      `<mark class="err ${ERR_CLASS[e.type] || "e-gram"}" data-i="${i}" tabindex="0">` +
      `${esc(e.wrong)}<span class="err-tip">${tip}</span></mark>`;
    pos = e.index + e.wrong.length;
  });
  return out + esc(text.slice(pos));
}

// Dokunmatik ekranda :hover yok; işarete dokunmak ipucunu açar.
$("checkText").addEventListener("click", (e) => {
  const fix = e.target.closest("button[data-fix]");
  if (fix) {
    applySingleFix(Number(fix.dataset.fix));
    return;
  }
  const mark = e.target.closest("mark.err");
  if (!mark) return;
  const wasOpen = mark.classList.contains("open");
  $("checkText").querySelectorAll("mark.err.open").forEach((m) => m.classList.remove("open"));
  if (!wasOpen) mark.classList.add("open");
});

$("checkText").addEventListener("keydown", (e) => {
  const mark = e.target.closest("mark.err");
  if (!mark || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  mark.classList.toggle("open");
});

// Sonuçtaki konumlar denetlenen metne göredir. Kullanıcı o metni
// değiştirdiyse düzeltmeyi uygulamak yazdıklarını geri alırdı; bunun
// yerine kontrolü tazeliyoruz.
function checkIsStale() {
  if ($("sourceText").value.trim() === checkedText) return false;
  showToast("Metin değişti — kontrol yenileniyor");
  runCheck(false);
  return true;
}

// Tek bir öneriyi uygular; kalan hatalar için metin yeniden denetlenir.
function applySingleFix(i) {
  if (!checkResult || checkIsStale()) return;
  const e = checkResult.errors[i];
  if (!e || !e.suggestion) return;
  const text = checkedText;
  applyText(text.slice(0, e.index) + e.suggestion + text.slice(e.index + e.wrong.length));
}

$("applyFixBtn").addEventListener("click", () => {
  if (!checkResult || checkIsStale()) return;
  applyText(checkResult.correctedText);
  showToast("Düzeltilmiş hali uygulandı ✔");
});

// Düzeltilmiş metni giriş kutusuna yazar, çeviriyi tazeler ve
// kontrolü yeni metinle tekrarlar.
function applyText(text) {
  const ta = $("sourceText");
  ta.value = text;
  clearGhost();
  updateToolButtons();
  updateInputState();
  clearTimeout(autoTimer);
  autoTimer = setTimeout(translate, 300);
  checkedText = "";
  runCheck(false);
  ta.focus();
}

$("checkBtn").addEventListener("click", () => runCheck(false));
$("checkCloseBtn").addEventListener("click", clearCheck);

// ---------- Anlamlar ve örnek cümleler ----------
function renderDetails(meanings, examples) {
  const panel = $("details");
  const mBox = $("meanings");
  const eBox = $("examples");
  mBox.innerHTML = "";
  eBox.innerHTML = "";

  if ((!meanings || meanings.length === 0) && (!examples || examples.length === 0)) {
    panel.classList.remove("show");
    return;
  }

  if (meanings && meanings.length) {
    mBox.innerHTML =
      "<h3>Farklı Anlamları</h3>" +
      meanings
        .map(
          (m) => `<div class="meaning-group">
            <span class="meaning-pos">${esc(POS_TR[m.pos] || m.pos || "diğer")}</span>
            <div class="meaning-terms">${m.terms
              .slice(0, 8)
              .map((t) => `<span class="term-chip">${esc(t)}</span>`)
              .join("")}</div>
          </div>`
        )
        .join("");
  }

  if (examples && examples.length) {
    eBox.innerHTML =
      "<h3>Örnek Cümleler <span class=\"h-note\">— tıklayarak kelimeye iliştir</span></h3>" +
      examples
        .slice(0, 4)
        .map((ex, i) => {
          const safe = esc(ex)
            .replace(/&lt;b&gt;/g, "<b>")
            .replace(/&lt;\/b&gt;/g, "</b>");
          return `<button class="example-item" type="button" data-ex="${i}">${safe}</button>`;
        })
        .join("");
  }

  panel.classList.add("show");
}

// ---------- Örnek cümleyi kelimeye iliştirme ----------
let currentExamples = [];
let pickedExample = "";

$("examples").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-ex]");
  if (!btn) return;
  const text = currentExamples[Number(btn.dataset.ex)] || "";
  // Aynı cümleye ikinci kez tıklamak seçimi kaldırır.
  const already = btn.classList.contains("picked");
  $("examples").querySelectorAll(".example-item").forEach((b) => b.classList.remove("picked"));
  if (already) {
    pickedExample = "";
    return;
  }
  btn.classList.add("picked");
  pickedExample = text.replace(/<\/?b>/g, "");
  showToast("Cümle kayda iliştirilecek 📎");
});

// ---------- Oturum çeviri geçmişi ----------
// Yalnızca bellekte tutulur: kaydetmediğim çevirileri geri bulmak için.
let history = [];
const HISTORY_MAX = 20;

function pushHistory(entry) {
  history = history.filter((h) => !(h.src === entry.src && h.from === entry.from));
  history.unshift(entry);
  if (history.length > HISTORY_MAX) history.pop();
  renderHistory();
}

// Yön takasında geçmiş satırları da yeni yöne dönmeli. Yalnızca takas
// edilen dil çiftine ait satırlar çevrilir; başka çiftlerdeki kayıtlar
// (örneğin EN → IT) olduğu gibi kalır.
function flipHistory(oldSrc, oldDst) {
  let touched = false;
  history = history.map((h) => {
    if (h.from !== oldSrc || h.to !== oldDst) return h;
    touched = true;
    return { src: h.dst, dst: h.src, from: oldDst, to: oldSrc };
  });
  if (touched) renderHistory();
}

function renderHistory() {
  const panel = $("history");
  if (history.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("historyList").innerHTML = history
    .map(
      (h, i) =>
        `<button class="history-item" type="button" data-h="${i}">
           <span class="h-src">${esc(h.src)}</span>
           <span class="arrow">→</span>
           <span class="h-dst">${esc(h.dst)}</span>
         </button>`
    )
    .join("");
}

$("historyList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-h]");
  if (!btn) return;
  const h = history[Number(btn.dataset.h)];
  if (!h) return;
  // Satır hangi yönde çevrildiyse diller ona ayarlanır (üç dil olduğu
  // için basit bir takas yetmez).
  if (h.from !== srcLang || h.to !== dstLang) setLangs(h.from, h.to);
  $("sourceText").value = h.src;
  clearCheck();
  updateToolButtons();
  updateInputState();
  translate();
});

$("clearHistoryBtn").addEventListener("click", () => {
  history = [];
  renderHistory();
});

// ---------- Kaydetme ----------
$("saveBtn").addEventListener("click", () => {
  if (!lastTranslation) return;
  // Aynı kelimenin farklı çevirisi ayrı bir kayıttır ("run → koşmak" ve
  // "run → çalıştırmak" gibi); bu yüzden kaynak+çeviri çiftine bakıyoruz.
  const exists = words.some(
    (w) =>
      w.src.toLowerCase() === lastTranslation.src.toLowerCase() &&
      w.dst.toLowerCase() === lastTranslation.dst.toLowerCase() &&
      w.from === lastTranslation.from
  );
  if (exists) {
    showToast("Bu çeviri zaten kayıtlı 📝");
    return;
  }
  words.unshift(
    Store.normalize({
      ...lastTranslation,
      note: pickedExample,
      date: new Date().toISOString(),
    })
  );
  if (!persist()) {
    words.shift(); // yazılamadıysa listeyi eski haline döndür
    $("wordCount").textContent = words.length;
    return;
  }
  showToast("Kelime kaydedildi ✔");
  $("saveBtn").disabled = true;
  const badge = $("wordCount");
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");
});

function persist() {
  const ok = Store.save(words);
  $("wordCount").textContent = words.length;
  if (!ok) {
    showToast("⚠ Tarayıcı hafızasına yazılamadı! Yedeği kontrol edin.");
    return false;
  }
  Backup.markDirty();
  return true;
}

// ---------- Otomatik yedekleme ----------
function fmtTime(d) {
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function renderBackupStatus(err) {
  const dot = $("backupDot");
  const text = $("backupStatus");
  const show = (id, on) => ($(id).hidden = !on);
  const only = (...visible) => {
    ["backupChooseBtn", "backupResumeBtn", "backupConfirmBtn", "backupNowBtn", "backupStopBtn"]
      .forEach((id) => show(id, visible.includes(id)));
  };
  const file = Backup.fileName ? ` · ${Backup.fileName}` : "";

  if (!Backup.supported) {
    dot.className = "backup-dot off";
    text.textContent = "Bu tarayıcı otomatik yedeklemeyi desteklemiyor — elle indirin";
    $("backupChooseBtn").textContent = "⤓ Yedeği indir";
    only("backupChooseBtn");
    $("permBanner").hidden = true;
    return;
  }

  if (Backup.needsPermission) {
    dot.className = "backup-dot warn";
    text.textContent = "Yedek dosyasına erişim izni gerekiyor" + file;
    only("backupResumeBtn", "backupStopBtn");
    if (!bannerDismissed) $("permBanner").hidden = false;
    return;
  }

  $("permBanner").hidden = true;

  // Kazara silme koruması devrede: yedek dosyası olduğu gibi duruyor.
  if (Backup.guard) {
    dot.className = "backup-dot warn";
    text.textContent = `⚠ Yedek korumaya alındı — liste ${Backup.guard.from} kelimeden ${Backup.guard.to}'e düştü, dosyaya yazılmadı`;
    only("backupConfirmBtn", "backupStopBtn");
    return;
  }

  if (Backup.active) {
    dot.className = err ? "backup-dot warn" : "backup-dot on";
    text.textContent = err
      ? "Son yedekleme başarısız — tekrar deneyin" + file
      : Backup.lastSaved
      ? `Yedekleme açık${file} · ${Backup.lastCount} kelime · son kayıt ${fmtTime(Backup.lastSaved)}`
      : `Yedekleme açık${file}`;
    only("backupNowBtn", "backupStopBtn");
    return;
  }

  dot.className = "backup-dot off";
  text.textContent = "Otomatik yedekleme kapalı";
  $("backupChooseBtn").textContent = "💾 Yedek dosyası seç";
  only("backupChooseBtn");
}

let bannerDismissed = false;

$("bannerCloseBtn").addEventListener("click", () => {
  bannerDismissed = true;
  $("permBanner").hidden = true;
});

$("bannerResumeBtn").addEventListener("click", async () => {
  const ok = await Backup.resume();
  showToast(ok ? "Yedekleme sürüyor ✔" : "İzin verilmedi");
});

$("backupConfirmBtn").addEventListener("click", async () => {
  const ok = await Backup.confirmGuard();
  showToast(ok ? "Yedek güncellendi ✔" : "Yedeklenemedi 😕");
});

Backup.onStatus = renderBackupStatus;

$("backupChooseBtn").addEventListener("click", async () => {
  if (!Backup.supported) {
    Backup.download(words);
    showToast("Yedek indirildi ⤓");
    return;
  }
  try {
    await Backup.choose();
    showToast("Otomatik yedekleme açıldı ✔");
  } catch (err) {
    if (err.name !== "AbortError") showToast("Dosya seçilemedi 😕");
  }
});

$("backupResumeBtn").addEventListener("click", async () => {
  const ok = await Backup.resume();
  showToast(ok ? "Yedekleme sürüyor ✔" : "İzin verilmedi");
});

$("backupNowBtn").addEventListener("click", async () => {
  const ok = await Backup.writeNow();
  showToast(ok ? "Yedeklendi ✔" : "Yedeklenemedi 😕");
});

$("backupStopBtn").addEventListener("click", async () => {
  await Backup.stop();
  showToast("Otomatik yedekleme kapatıldı");
});

$("restoreBtn").addEventListener("click", () => $("restoreInput").click());

$("restoreInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // aynı dosya tekrar seçilebilsin
  if (!file) return;
  let incoming;
  try {
    incoming = await Backup.read(file);
  } catch (err) {
    showToast("⚠ Geçersiz yedek dosyası");
    return;
  }
  const key = (w) => w.from + "|" + w.src.toLowerCase() + "|" + w.dst.toLowerCase();
  const have = new Set(words.map(key));
  const fresh = incoming.filter((w) => !have.has(key(w)));

  // İki seçenek: mevcut listeye ekleme (güvenli) veya listeyi tamamen
  // yedektekiyle değiştirme. Değiştirme veri sildiği için ayrıca onaylanır.
  const msg =
    `Yedekte ${incoming.length} kelime var, bunların ${fresh.length} tanesi listenizde yok.\n\n` +
    `TAMAM: eksik ${fresh.length} kelimeyi ekle (mevcutlar korunur)\n` +
    `İPTAL: hiçbir şey yapma`;

  if (fresh.length === 0 && incoming.length) {
    if (
      confirm(
        `Yedekteki tüm kelimeler zaten listenizde.\n\n` +
          `Listeyi tamamen yedektekiyle DEĞİŞTİRMEK ister misiniz? ` +
          `Mevcut ${words.length} kaydınızın yerini yedekteki ${incoming.length} kayıt alır.`
      )
    ) {
      applyRestore(incoming, true);
    }
    return;
  }
  if (!confirm(msg)) return;

  // Ekleme yapıldıktan sonra, yedeği "tek doğru kaynak" saymak isteyenlere
  // tam değiştirme seçeneğini de sun.
  if (
    words.length > 0 &&
    confirm(
      `Bunun yerine listeyi tamamen yedektekiyle DEĞİŞTİRMEK ister misiniz?\n\n` +
        `TAMAM: mevcut ${words.length} kayıt silinip yedekteki ${incoming.length} kayıt yazılır\n` +
        `İPTAL: sadece eksik ${fresh.length} kelime eklenir`
    )
  ) {
    applyRestore(incoming, true);
    return;
  }
  applyRestore(fresh, false);
});

function applyRestore(list, replace) {
  const before = words;
  words = replace ? list.slice() : list.concat(words);
  persist();
  renderWords();
  showToast(
    replace ? `Liste yedekle değiştirildi (${words.length}) ✔` : `${list.length} kelime eklendi ✔`,
    "↩ Geri al",
    () => {
      words = before;
      persist();
      renderWords();
    }
  );
}

// ---------- Klavye kısayolları ----------
function openTab(name) {
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (btn) btn.click();
}

function typingInField(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;

  // Ctrl+K: arama kutusuna atla (kelimeler sekmesini açar)
  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openTab("words");
    $("searchInput").focus();
    $("searchInput").select();
    return;
  }

  // Ctrl+Enter: görünen çeviriyi kaydet
  if (mod && e.key === "Enter") {
    e.preventDefault();
    if (!$("saveBtn").disabled) $("saveBtn").click();
    return;
  }

  // Esc: arama kutusunu temizle
  if (e.key === "Escape" && document.activeElement === $("searchInput")) {
    $("searchInput").value = "";
    renderWords();
    return;
  }

  // Çalışma kısayolları yalnızca deste açıkken ve bir alana yazmıyorken
  if (deck.length === 0 || typingInField(document.activeElement)) return;
  if (e.key === " ") {
    e.preventDefault();
    flipCard();
  } else if (e.key === "1") {
    grade(true);
  } else if (e.key === "2") {
    grade(false);
  }
});

// Sekme gizlenirken bekleyen yazmayı kaçırmamak için hemen yaz.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && Backup.active && Backup.pending) {
    Backup.writeNow();
  }
});

// ---------- Kelimelerim ----------
let editingId = null; // satır içi düzenlemedeki kaydın id'si
let activeTag = null; // seçili etiket filtresi

const SORTERS = {
  new: (a, b) => new Date(b.date) - new Date(a.date),
  old: (a, b) => new Date(a.date) - new Date(b.date),
  az: (a, b) => a.src.localeCompare(b.src, "tr"),
  za: (a, b) => b.src.localeCompare(a.src, "tr"),
  // Yanlış oranı yüksek olan üstte; hiç çalışılmamışlar en sonda
  hard: (a, b) => b.wrong - b.right - (a.wrong - a.right),
  due: (a, b) => new Date(a.due) - new Date(b.due),
};

// Yön filtresi seçenekleri diller tablosundan üretilir; yeni dil
// eklendiğinde burası kendiliğinden güncellenir.
function renderDirOptions() {
  const sel = $("dirSelect");
  const current = sel.value || "all";
  sel.innerHTML =
    `<option value="all">Hepsi</option>` +
    LANG_CODES.map((c) => `<option value="${c}">${LANGS[c].flag} ${LANGS[c].srcLabel}</option>`).join("");
  sel.value = current;
}

function allTags() {
  const set = new Set();
  words.forEach((w) => w.tags.forEach((t) => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b, "tr"));
}

function renderTagFilters() {
  const tags = allTags();
  $("tagFilters").innerHTML = tags
    .map(
      (t) =>
        `<button class="tag-chip${t === activeTag ? " active" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`
    )
    .join("");
}

function matchesSearch(w, q) {
  if (!q) return true;
  return (
    w.src.toLowerCase().includes(q) ||
    w.dst.toLowerCase().includes(q) ||
    w.note.toLowerCase().includes(q) ||
    w.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function renderWords() {
  const q = $("searchInput").value.trim().toLowerCase();
  const dir = $("dirSelect").value;
  const list = $("wordList");

  const filtered = words
    .filter((w) => matchesSearch(w, q))
    .filter((w) => dir === "all" || w.from === dir)
    .filter((w) => !activeTag || w.tags.includes(activeTag))
    .sort(SORTERS[$("sortSelect").value] || SORTERS.new);

  renderTagFilters();

  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-msg">${
      words.length === 0
        ? "Henüz kayıtlı kelime yok. Çeviri yapıp ➕ Kaydet'e bas!"
        : "Bu filtreyle eşleşen kelime yok."
    }</p>`;
    return;
  }
  list.innerHTML = filtered
    .map((w, i) => (w.id === editingId ? editRow(w) : viewRow(w, i)))
    .join("");
}

function viewRow(w, i) {
  const score = w.right || w.wrong ? ` · <span class="score">✔${w.right} ✘${w.wrong}</span>` : "";
  const note = w.note ? `<div class="word-note">“${esc(w.note)}”</div>` : "";
  const tags = w.tags.length
    ? `<div class="word-tags">${w.tags.map((t) => `<span class="tag-chip small">${esc(t)}</span>`).join("")}</div>`
    : "";
  return `<div class="word-item" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
      <div class="pair">
        <div class="src">${esc(w.src)} <span class="arrow">→</span> <span class="dst">${esc(w.dst)}</span></div>
        <div class="meta">${langShort(w.from)} → ${langShort(w.to)} · ${new Date(w.date).toLocaleDateString("tr-TR")}${score} · ${dueLabel(w)}</div>
        ${note}${tags}
      </div>
      <div class="row-actions">
        <button class="row-btn" title="Düzenle" aria-label="${esc(w.src)} kaydını düzenle" data-edit="${esc(w.id)}">✏️</button>
        <button class="row-btn" title="Sil" aria-label="${esc(w.src)} kelimesini sil" data-id="${esc(w.id)}">🗑</button>
      </div>
    </div>`;
}

function editRow(w) {
  return `<div class="word-item editing">
      <div class="edit-form">
        <div class="edit-pair">
          <input type="text" class="edit-input" id="editSrc" value="${esc(w.src)}" placeholder="Kelime" aria-label="Kelime">
          <span class="arrow">→</span>
          <input type="text" class="edit-input" id="editDst" value="${esc(w.dst)}" placeholder="Çeviri" aria-label="Çeviri">
        </div>
        <input type="text" class="edit-input" id="editNote" value="${esc(w.note)}" placeholder="Not / örnek cümle" aria-label="Not">
        <input type="text" class="edit-input" id="editTags" value="${esc(w.tags.join(", "))}" placeholder="Etiketler (virgülle: iş, seyahat)" aria-label="Etiketler">
        <div class="edit-actions">
          <button class="btn btn-soft" data-save="${esc(w.id)}">✔ Kaydet</button>
          <button class="btn btn-soft" data-cancel="1">Vazgeç</button>
        </div>
      </div>
    </div>`;
}

// Silme işlemleri liste kapsayıcısında dinlenir; böylece satır HTML'ine
// inline onclick gömmek gerekmez. Dizin yerine id kullanmak, arama
// filtresi açıkken yanlış satırın silinmesini engeller.
$("wordList").addEventListener("click", (e) => {
  const edit = e.target.closest("button[data-edit]");
  if (edit) {
    editingId = edit.dataset.edit;
    renderWords();
    const first = $("editSrc");
    if (first) {
      first.focus();
      first.select();
    }
    return;
  }

  if (e.target.closest("button[data-cancel]")) {
    editingId = null;
    renderWords();
    return;
  }

  const save = e.target.closest("button[data-save]");
  if (save) {
    const w = words.find((x) => x.id === save.dataset.save);
    if (!w) return;
    const src = $("editSrc").value.trim();
    const dst = $("editDst").value.trim();
    if (!src || !dst) {
      showToast("Kelime ve çeviri boş olamaz");
      return;
    }
    const before = { ...w };
    w.src = src;
    w.dst = dst;
    w.note = $("editNote").value.trim();
    w.tags = $("editTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    editingId = null;
    persist();
    renderWords();
    showToast("Kayıt güncellendi ✔", "↩ Geri al", () => {
      Object.assign(w, before);
      persist();
      renderWords();
    });
    return;
  }

  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const idx = words.findIndex((w) => w.id === btn.dataset.id);
  if (idx === -1) return;
  const [removed] = words.splice(idx, 1);
  persist();
  renderWords();
  showToast(`"${removed.src}" silindi`, "↩ Geri al", () => {
    words.splice(Math.min(idx, words.length), 0, removed);
    persist();
    renderWords();
  });
});

$("searchInput").addEventListener("input", renderWords);
$("sortSelect").addEventListener("change", renderWords);
$("dirSelect").addEventListener("change", renderWords);

$("tagFilters").addEventListener("click", (e) => {
  const chip = e.target.closest("button[data-tag]");
  if (!chip) return;
  activeTag = activeTag === chip.dataset.tag ? null : chip.dataset.tag;
  renderWords();
});

// Düzenleme alanlarında Enter kaydeder, Esc vazgeçer.
$("wordList").addEventListener("keydown", (e) => {
  if (!editingId || !e.target.classList.contains("edit-input")) return;
  if (e.key === "Enter") {
    e.preventDefault();
    const btn = $("wordList").querySelector("button[data-save]");
    if (btn) btn.click();
  } else if (e.key === "Escape") {
    editingId = null;
    renderWords();
  }
});
$("clearAllBtn").addEventListener("click", () => {
  if (!words.length || !confirm("Tüm kayıtlı kelimeler silinsin mi?")) return;
  const backup = words;
  words = [];
  persist();
  renderWords();
  showToast(`${backup.length} kelime silindi`, "↩ Geri al", () => {
    words = backup;
    persist();
    renderWords();
  });
});

// ---------- Çalışma modu (3D kart çevirme) ----------
let deck = [];
let cardIndex = 0;
let session = { right: 0, wrong: 0 };

// Aralıklı tekrar basamakları (gün). Bildikçe aralık uzar; bilinmeyen
// kelime 0. basamağa döner ve yarın tekrar sorulur.
const INTERVALS = [1, 3, 7, 16, 35, 90];

function daysFromNow(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function isDue(w) {
  return new Date(w.due) <= new Date();
}

// Liste satırında "bugün" / "3 gün sonra" gibi okunur bir etiket.
function dueLabel(w) {
  // Etiket isDue ile aynı şeyi söylemeli; yuvarlama kullanınca gece geç
  // saatlerde "tekrar zamanı" yazıp deste boş çıkabiliyordu.
  if (isDue(w)) return `<span class="due now">tekrar zamanı</span>`;
  const diff = Math.ceil((new Date(w.due) - new Date()) / 86400000);
  if (diff <= 1) return `<span class="due">yarın</span>`;
  return `<span class="due">${diff} gün sonra</span>`;
}

// Zorlanılan kelimeler öne gelsin: yanlış sayısı ağırlık, doğru sayısı
// ceza. Sıralamayı tamamen belirlemesin diye rastgelelik ekliyoruz.
function studyWeight(w) {
  return w.wrong * 2 - w.right + Math.random() * 1.5;
}

function setStudyButtons(on) {
  $("knowBtn").hidden = !on;
  $("dontKnowBtn").hidden = !on;
}

// Sekmeye girince "bugün kaç kelime bekliyor" özeti.
function renderStudySummary() {
  const due = words.filter(isDue).length;
  const el = $("studySummary");
  if (words.length === 0) {
    el.textContent = "";
    $("dueStudyBtn").disabled = true;
    return;
  }
  $("dueStudyBtn").disabled = due === 0;
  el.innerHTML =
    due > 0
      ? `📅 Bugün tekrar edilecek <b>${due}</b> kelime var (toplam ${words.length}).`
      : `✨ Bugünlük tekrar bitti — toplam ${words.length} kelime kayıtlı.`;
}

function startDeck(list) {
  if (list.length === 0) {
    showToast("Çalışılacak kelime yok!");
    return;
  }
  deck = [...list].sort((a, b) => studyWeight(b) - studyWeight(a));
  cardIndex = 0;
  session = { right: 0, wrong: 0 };
  setStudyButtons(true);
  showCard();
}

$("startStudyBtn").addEventListener("click", () => startDeck(words));
$("dueStudyBtn").addEventListener("click", () => startDeck(words.filter(isDue)));

function showCard() {
  const w = deck[cardIndex];
  $("studyProgress").textContent = `Kart ${cardIndex + 1} / ${deck.length}`;
  const fc = $("flashcard");
  fc.classList.remove("flipped");
  $("fcFront").innerHTML = `<span class="label">${langFlag(w.from)} ${langName(
    w.from
  )} — cevap için karta tıkla</span><span>${esc(w.src)}</span>`;
  $("fcBack").innerHTML = `<span class="label">Cevap</span><span class="answer">${esc(w.dst)}</span>`;
}

function flipCard() {
  if (deck.length === 0) return;
  $("flashcard").classList.toggle("flipped");
}

$("flashcard").addEventListener("click", flipCard);

// Kart bir <div> olduğu için klavye desteğini elle veriyoruz.
$("flashcard").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    flipCard();
  }
});

// Kartı değerlendirir, sonucu kelimeye işler ve sonrakine geçer.
function grade(correct) {
  if (deck.length === 0) return;
  const card = deck[cardIndex];
  // Deste kopya bir dizi; asıl kaydı id ile bulup güncelliyoruz.
  const w = words.find((x) => x.id === card.id);
  if (w) {
    if (correct) {
      w.right++;
      w.level = Math.min(w.level + 1, INTERVALS.length - 1);
    } else {
      w.wrong++;
      w.level = 0; // bilemediysen en başa dön
    }
    w.due = daysFromNow(INTERVALS[w.level]);
    persist();
  }
  session[correct ? "right" : "wrong"]++;

  cardIndex++;
  if (cardIndex >= deck.length) {
    $("fcFront").innerHTML = `<span>🎉 Deste bitti — ${session.right} doğru / ${session.wrong} yanlış</span><span class="label">Tekrar için "Karıştır ve Başla"</span>`;
    $("fcBack").innerHTML = "";
    $("flashcard").classList.remove("flipped");
    $("studyProgress").textContent = "";
    setStudyButtons(false);
    deck = [];
    session = { right: 0, wrong: 0 };
    renderStudySummary();
    return;
  }
  showCard();
}

$("knowBtn").addEventListener("click", () => grade(true));
$("dontKnowBtn").addEventListener("click", () => grade(false));

// ---------- Bildirim ----------
let toastTimer;
let toastHandler = null;

// action verilirse toast'ta tıklanabilir bir buton çıkar (örn. "Geri al").
function showToast(msg, action, onAction) {
  const t = $("toast");
  const btn = $("toastAction");
  $("toastMsg").textContent = msg;
  toastHandler = onAction || null;
  btn.hidden = !action;
  if (action) btn.textContent = action;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2200);
}

function hideToast() {
  clearTimeout(toastTimer);
  $("toast").classList.remove("show");
  $("toastAction").hidden = true;
  toastHandler = null;
}

$("toastAction").addEventListener("click", () => {
  const fn = toastHandler;
  hideToast();
  if (fn) fn();
});

// ---------- Arka plan parçacıkları (yıldız tozu) ----------
function spawnParticles(count) {
  const scene = $("bgScene");
  if (!scene) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const size = 2 + Math.random() * 4;
    p.style.width = size + "px";
    p.style.height = size + "px";
    p.style.left = Math.random() * 100 + "vw";
    p.style.animationDuration = 9 + Math.random() * 14 + "s";
    p.style.animationDelay = -Math.random() * 20 + "s";
    scene.appendChild(p);
  }
}

// ---------- Çevrimdışı durumu ----------
// Çeviri internet ister; defter ve çalışma modu istemez. Kullanıcı bunu
// bilsin diye bağlantı kesilince şerit gösteriyoruz.
function renderOnlineState() {
  const off = !navigator.onLine;
  $("offlineBanner").hidden = !off;
  $("sourceText").placeholder = off
    ? "Çevrimdışısınız — kelime defteri ve çalışma modu çalışır"
    : "Yazmaya başlayın, çeviri otomatik gelir...";
}

window.addEventListener("online", renderOnlineState);
window.addEventListener("offline", renderOnlineState);

// ---------- Uygulamayı yükleme (PWA) ----------
let installPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("installBtn").hidden = false;
});

$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").hidden = true;
  if (outcome === "accepted") showToast("Uygulama yüklendi ✔");
});

window.addEventListener("appinstalled", () => {
  $("installBtn").hidden = true;
});

// ---------- İlk yükleme ----------
spawnParticles(26);
renderLangSelects();
renderDirOptions();
Store.save(words);
$("wordCount").textContent = words.length;
updateToolButtons();
updateInputState();
renderBackupStatus();
renderOnlineState();
renderStudySummary();
Backup.init(() => words);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .catch((err) => console.error("Service worker kaydedilemedi:", err));
  });
}
