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
let srcLang = "en";
let dstLang = "tr";
let lastTranslation = null;
let words = Store.load();

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
  });
});

// ---------- Dil değiştirme ----------
$("swapBtn").addEventListener("click", () => {
  [srcLang, dstLang] = [dstLang, srcLang];
  $("srcLang").textContent = srcLang === "en" ? "İngilizce" : "Türkçe";
  $("dstLang").textContent = dstLang === "en" ? "İngilizce" : "Türkçe";
  clearGhost();
  if ($("sourceText").value.trim()) translate();
});

// ---------- Çeviri (tamamen otomatik) ----------
let requestSeq = 0;

async function translate() {
  const text = $("sourceText").value.trim();
  if (!text) return;
  const box = $("resultBox");
  const myReq = ++requestSeq;
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
    renderDetails(meanings, examples);
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

// ---------- Kutu araçları: seslendir & kopyala ----------
const canSpeak = "speechSynthesis" in window;

function langTag(code) {
  return code === "en" ? "en-US" : "tr-TR";
}

function speak(text, code, btn) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  document.querySelectorAll(".tool-btn.speaking").forEach((b) => b.classList.remove("speaking"));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langTag(code);
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

let autoTimer;
$("sourceText").addEventListener("input", () => {
  clearTimeout(autoTimer);
  const text = $("sourceText").value.trim();
  if (!text) {
    resetResult();
    clearGhost();
    return;
  }
  autoTimer = setTimeout(translate, 500);
  updateToolButtons();
  scheduleGhost();
});

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
      "<h3>Örnek Cümleler</h3>" +
      examples
        .slice(0, 4)
        .map((ex) => {
          const safe = esc(ex)
            .replace(/&lt;b&gt;/g, "<b>")
            .replace(/&lt;\/b&gt;/g, "</b>");
          return `<div class="example-item">${safe}</div>`;
        })
        .join("");
  }

  panel.classList.add("show");
}

// ---------- Kaydetme ----------
$("saveBtn").addEventListener("click", () => {
  if (!lastTranslation) return;
  const exists = words.some(
    (w) =>
      w.src.toLowerCase() === lastTranslation.src.toLowerCase() &&
      w.from === lastTranslation.from
  );
  if (exists) {
    showToast("Bu kelime zaten kayıtlı 📝");
    return;
  }
  words.unshift({ ...lastTranslation, date: new Date().toISOString() });
  persist();
  showToast("Kelime kaydedildi ✔");
  $("saveBtn").disabled = true;
  const badge = $("wordCount");
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");
});

function persist() {
  Store.save(words);
  $("wordCount").textContent = words.length;
}

// ---------- Kelimelerim ----------
function renderWords() {
  const q = $("searchInput").value.trim().toLowerCase();
  const list = $("wordList");
  const filtered = words.filter(
    (w) => w.src.toLowerCase().includes(q) || w.dst.toLowerCase().includes(q)
  );
  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-msg">${
      words.length === 0
        ? "Henüz kayıtlı kelime yok. Çeviri yapıp ➕ Kaydet'e bas!"
        : "Aramayla eşleşen kelime yok."
    }</p>`;
    return;
  }
  list.innerHTML = filtered
    .map((w, i) => {
      const idx = words.indexOf(w);
      const d = new Date(w.date);
      return `<div class="word-item" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
        <div class="pair">
          <div class="src">${esc(w.src)} <span class="arrow">→</span> <span class="dst">${esc(w.dst)}</span></div>
          <div class="meta">${w.from === "en" ? "EN → TR" : "TR → EN"} · ${d.toLocaleDateString("tr-TR")}</div>
        </div>
        <button title="Sil" aria-label="${esc(w.src)} kelimesini sil" data-idx="${idx}">🗑</button>
      </div>`;
    })
    .join("");
}

// Silme işlemleri liste kapsayıcısında dinlenir; böylece satır HTML'ine
// inline onclick gömmek gerekmez.
$("wordList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-idx]");
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= words.length) return;
  words.splice(idx, 1);
  persist();
  renderWords();
});

$("searchInput").addEventListener("input", renderWords);
$("clearAllBtn").addEventListener("click", () => {
  if (words.length && confirm("Tüm kayıtlı kelimeler silinsin mi?")) {
    words = [];
    persist();
    renderWords();
  }
});

// ---------- Çalışma modu (3D kart çevirme) ----------
let deck = [];
let cardIndex = 0;

$("startStudyBtn").addEventListener("click", () => {
  if (words.length === 0) {
    showToast("Önce kelime kaydetmelisin!");
    return;
  }
  deck = [...words].sort(() => Math.random() - 0.5);
  cardIndex = 0;
  $("nextCardBtn").disabled = false;
  showCard();
});

function showCard() {
  const w = deck[cardIndex];
  $("studyProgress").textContent = `Kart ${cardIndex + 1} / ${deck.length}`;
  const fc = $("flashcard");
  fc.classList.remove("flipped");
  $("fcFront").innerHTML = `<span class="label">${
    w.from === "en" ? "İngilizce" : "Türkçe"
  } — cevap için karta tıkla</span><span>${esc(w.src)}</span>`;
  $("fcBack").innerHTML = `<span class="label">Cevap</span><span class="answer">${esc(w.dst)}</span>`;
}

$("flashcard").addEventListener("click", () => {
  if (deck.length === 0) return;
  $("flashcard").classList.toggle("flipped");
});

$("nextCardBtn").addEventListener("click", () => {
  cardIndex++;
  if (cardIndex >= deck.length) {
    $("fcFront").innerHTML = `<span>🎉 Tebrikler, desteyi bitirdin!</span><span class="label">Tekrar için "Karıştır ve Başla"</span>`;
    $("fcBack").innerHTML = "";
    $("flashcard").classList.remove("flipped");
    $("studyProgress").textContent = "";
    $("nextCardBtn").disabled = true;
    deck = [];
    return;
  }
  showCard();
});

// ---------- Bildirim ----------
let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

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

// ---------- İlk yükleme ----------
spawnParticles(26);
persist();
updateToolButtons();
