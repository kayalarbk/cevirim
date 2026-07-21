/* ============================================================
   backup.js — kelime defterini bilgisayardaki bir JSON dosyasına
   belirli aralıklarla otomatik yedekler.

   File System Access API kullanılır: kullanıcı bir kez dosyayı
   seçer, dosya tutamacı (handle) IndexedDB'de saklanır ve sonraki
   yazmalar dosya seçici açılmadan aynı dosyanın üzerine yapılır.
   Desteklemeyen tarayıcılarda elle indirme yoluna düşülür.
   ============================================================ */

const Backup = {
  FORMAT: 1,
  DEBOUNCE_MS: 3000, // değişiklikten sonra bu kadar bekleyip yaz
  INTERVAL_MS: 5 * 60 * 1000, // ayrıca 5 dakikada bir güvenlik yazması
  FILE_NAME: "cevirim-yedek.json",

  // showSaveFilePicker yalnızca güvenli bağlamda (https / localhost) var;
  // dosya file:// ile açıldıysa tanımsızdır.
  supported: typeof window !== "undefined" && "showSaveFilePicker" in window,

  DROP_RATIO: 0.5, // bu orandan fazla kelime kaybı şüpheli sayılır
  DROP_MIN: 4, // bu sayının altındaki listelerde koruma çalışmaz

  handle: null,
  needsPermission: false, // tutamaç var ama sayfa yenilendiği için izin tazelenmeli
  lastSaved: null,
  lastCount: null, // yedek dosyasında en son kaç kelime olduğu
  guard: null, // {from, to} — kazara silme şüphesiyle yazma durduruldu
  onStatus: null, // arayüzün bağladığı geri çağırım

  _dirty: false,
  _debounceTimer: null,
  _intervalTimer: null,
  _getWords: () => [],

  /* ---------- IndexedDB (yalnızca dosya tutamacını tutar) ---------- */

  _idb(mode, run) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("cevirim_backup", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("handles", mode);
        let result;
        const r = run(tx.objectStore("handles"));
        if (r) r.onsuccess = () => (result = r.result);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  },

  _loadHandle() {
    return this._idb("readonly", (s) => s.get("file")).catch(() => null);
  },

  _storeHandle(handle) {
    return this._idb("readwrite", (s) => s.put(handle, "file")).catch(() => {});
  },

  _forgetHandle() {
    return this._idb("readwrite", (s) => s.delete("file")).catch(() => {});
  },

  /* ---------- Kurulum ---------- */

  async init(getWords) {
    this._getWords = getWords;
    if (!this.supported) {
      this._emit();
      return;
    }
    this.handle = await this._loadHandle();
    if (this.handle) {
      const perm = await this.handle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") {
        await this._readCount();
        this._startTimer();
      } else {
        // İzin yalnızca kullanıcı hareketiyle tazelenebilir; arayüz
        // "Yedeklemeyi sürdür" butonunu gösterecek.
        this.needsPermission = true;
      }
    }
    this._emit();
  },

  get active() {
    return Boolean(this.handle) && !this.needsPermission;
  },

  // Henüz dosyaya yazılmamış değişiklik var mı?
  get pending() {
    return this._dirty;
  },

  get fileName() {
    return this.handle ? this.handle.name : null;
  },

  // Mevcut yedekte kaç kelime olduğunu okur; kazara silme korumasının
  // karşılaştırma noktası budur.
  async _readCount() {
    try {
      const file = await this.handle.getFile();
      if (file.size === 0) return;
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data && data.words;
      if (Array.isArray(list)) this.lastCount = list.length;
    } catch {
      // Dosya yeni, boş veya bizim biçimimizde değil — koruma devre dışı
    }
  },

  /* ---------- Dosya seçme / izin tazeleme ---------- */

  async choose() {
    if (!this.supported) throw new Error("unsupported");
    const handle = await window.showSaveFilePicker({
      suggestedName: this.FILE_NAME,
      types: [{ description: "Çevirim yedeği", accept: { "application/json": [".json"] } }],
    });
    this.handle = handle;
    this.needsPermission = false;
    this.lastCount = null;
    await this._storeHandle(handle);
    // Kullanıcı dolu bir yedeğin üzerine yazmayı seçtiyse koruma devreye
    // girsin diye önce içindeki kelime sayısını okuyoruz.
    await this._readCount();
    await this.writeNow();
    this._startTimer();
    this._emit();
  },

  async resume() {
    if (!this.handle) return false;
    const perm = await this.handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      this._emit();
      return false;
    }
    this.needsPermission = false;
    await this._readCount();
    await this.writeNow();
    this._startTimer();
    this._emit();
    return true;
  },

  // Kullanıcı "evet, bu silme kasıtlıydı" dedi.
  async confirmGuard() {
    this.guard = null;
    return this.writeNow(true);
  },

  async stop() {
    this._stopTimer();
    this.handle = null;
    this.needsPermission = false;
    this.lastSaved = null;
    this.lastCount = null;
    this.guard = null;
    await this._forgetHandle();
    this._emit();
  },

  /* ---------- Yazma ---------- */

  payload(words) {
    return JSON.stringify(
      {
        format: this.FORMAT,
        app: "cevirim",
        exportedAt: new Date().toISOString(),
        count: words.length,
        words,
      },
      null,
      2
    );
  },

  // Değişiklik oldu: kısa bir gecikmeden sonra yaz. Arka arkaya kayıt
  // yapılırsa tek yazmaya indirgenir.
  markDirty() {
    this._dirty = true;
    if (!this.active) return;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.writeNow(), this.DEBOUNCE_MS);
  },

  // Kelime sayısı bir anda çok düştüyse ("Tümünü Sil"e yanlışlıkla
  // basmak gibi) yedeğin üzerine yazmak veriyi kalıcı olarak yok eder.
  // Bu durumda yazmayı durdurup kullanıcıdan onay bekliyoruz.
  _suspicious(count) {
    return (
      this.lastCount !== null &&
      this.lastCount >= this.DROP_MIN &&
      count < this.lastCount * this.DROP_RATIO
    );
  },

  async writeNow(force = false) {
    if (!this.handle) return false;
    clearTimeout(this._debounceTimer);
    const words = this._getWords();
    if (!force && this._suspicious(words.length)) {
      this.guard = { from: this.lastCount, to: words.length };
      this._emit();
      return false;
    }
    this.guard = null;
    try {
      const w = await this.handle.createWritable();
      await w.write(this.payload(words));
      await w.close();
      this._dirty = false;
      this.lastSaved = new Date();
      this.lastCount = words.length;
      this.needsPermission = false;
      this._emit();
      return true;
    } catch (err) {
      console.error("Yedek yazılamadı:", err);
      // Kullanıcı dosyayı sildiyse/taşıdıysa ya da izin düştüyse
      if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        this.needsPermission = true;
      }
      this._emit(err);
      return false;
    }
  },

  _startTimer() {
    this._stopTimer();
    this._intervalTimer = setInterval(() => {
      if (this._dirty) this.writeNow();
    }, this.INTERVAL_MS);
  },

  _stopTimer() {
    clearInterval(this._intervalTimer);
    clearTimeout(this._debounceTimer);
    this._intervalTimer = null;
  },

  _emit(err) {
    if (this.onStatus) this.onStatus(err || null);
  },

  /* ---------- Elle indirme / geri yükleme (her tarayıcıda) ---------- */

  download(words) {
    const blob = new Blob([this.payload(words)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = this.FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Dosyadaki kelimeleri okur ve doğrular. Geçersizse istisna atar.
  async read(file) {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data && data.words;
    if (!Array.isArray(list)) throw new Error("Dosya bir Çevirim yedeği değil.");
    // Eski/elle düzenlenmiş yedeklerde id veya sayaç alanları eksik olabilir.
    return list.map((w) => Store.normalize(w)).filter(Boolean);
  },
};
