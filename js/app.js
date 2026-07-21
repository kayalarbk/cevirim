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
    Store.normalize({ ...lastTranslation, date: new Date().toISOString() })
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

// Sekme gizlenirken bekleyen yazmayı kaçırmamak için hemen yaz.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && Backup.active && Backup.pending) {
    Backup.writeNow();
  }
});

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
      const d = new Date(w.date);
      const score =
        w.right || w.wrong
          ? ` · <span class="score">✔${w.right} ✘${w.wrong}</span>`
          : "";
      return `<div class="word-item" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
        <div class="pair">
          <div class="src">${esc(w.src)} <span class="arrow">→</span> <span class="dst">${esc(w.dst)}</span></div>
          <div class="meta">${w.from === "en" ? "EN → TR" : "TR → EN"} · ${d.toLocaleDateString("tr-TR")}${score}</div>
        </div>
        <button title="Sil" aria-label="${esc(w.src)} kelimesini sil" data-id="${esc(w.id)}">🗑</button>
      </div>`;
    })
    .join("");
}

// Silme işlemleri liste kapsayıcısında dinlenir; böylece satır HTML'ine
// inline onclick gömmek gerekmez. Dizin yerine id kullanmak, arama
// filtresi açıkken yanlış satırın silinmesini engeller.
$("wordList").addEventListener("click", (e) => {
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

// Zorlanılan kelimeler öne gelsin: yanlış sayısı ağırlık, doğru sayısı
// ceza. Sıralamayı tamamen belirlemesin diye rastgelelik ekliyoruz.
function studyWeight(w) {
  return w.wrong * 2 - w.right + Math.random() * 1.5;
}

function setStudyButtons(on) {
  $("knowBtn").hidden = !on;
  $("dontKnowBtn").hidden = !on;
}

$("startStudyBtn").addEventListener("click", () => {
  if (words.length === 0) {
    showToast("Önce kelime kaydetmelisin!");
    return;
  }
  deck = [...words].sort((a, b) => studyWeight(b) - studyWeight(a));
  cardIndex = 0;
  session = { right: 0, wrong: 0 };
  setStudyButtons(true);
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

// Kartı değerlendirir, sonucu kelimeye işler ve sonrakine geçer.
function grade(correct) {
  if (deck.length === 0) return;
  const card = deck[cardIndex];
  // Deste kopya bir dizi; asıl kaydı id ile bulup güncelliyoruz.
  const w = words.find((x) => x.id === card.id);
  if (w) {
    if (correct) w.right++;
    else w.wrong++;
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

// ---------- İlk yükleme ----------
spawnParticles(26);
Store.save(words);
$("wordCount").textContent = words.length;
updateToolButtons();
renderBackupStatus();
Backup.init(() => words);
