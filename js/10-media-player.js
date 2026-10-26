'use strict';
/* Pool media, grafik audio (Web Audio) dan pemutar (play/pause/seek) */
(function () {
const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gagal membuka gambar')); i.src = url; });

/** Muat metadata media. Ditolak bila format tidak bisa di-decode atau tidak merespons (timeout). */
const loadMeta = (tag, url, ms = 10000) => new Promise((res, rej) => {
  const e = document.createElement(tag); e.preload = 'metadata'; e.muted = true;
  const to = setTimeout(() => fail(new Error('timeout')), ms);
  const fail = x => { clearTimeout(to); try { e.removeAttribute('src'); e.load(); } catch (z) { /* abaikan */ } rej(x); };
  e.onloadedmetadata = () => { clearTimeout(to); res(e); };
  e.onerror = () => fail(new Error('decode'));
  e.src = url;
});
const release = e => { try { e.pause(); e.removeAttribute('src'); e.load(); } catch (x) { /* abaikan */ } };

/** Durasi andal: metadata -> trik seek-ke-akhir (stream tanpa durasi) -> decode penuh sebagai cadangan. */
async function mediaDuration(e, blob) {
  let d = e.duration;
  if (!isFinite(d) || d <= 0) {
    d = await new Promise(res => {
      const ch = () => { if (isFinite(e.duration) && e.duration > 0) done(); };
      const done = () => { clearTimeout(t); e.removeEventListener('durationchange', ch); e.removeEventListener('timeupdate', ch); res(e.duration); };
      const t = setTimeout(done, 3000);
      e.addEventListener('durationchange', ch); e.addEventListener('timeupdate', ch);
      try { e.currentTime = 1e101; } catch (x) { done(); }
    });
  }
  if ((!isFinite(d) || d <= 0) && blob.size < 80e6) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext, c = new AC();
      const buf = await c.decodeAudioData(await blob.arrayBuffer()); c.close(); d = buf.duration;
    } catch (x) { /* abaikan */ }
  }
  release(e);
  if (!isFinite(d) || d <= 0) throw new Error('Durasi file tidak bisa dibaca');
  return d;
}

/* ---------- format ---------- */
const AUDIO_MIME = {
  mp3: 'audio/mpeg', mp2: 'audio/mpeg', mpga: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', spx: 'audio/ogg',
  aac: 'audio/aac', adts: 'audio/aac', m4a: 'audio/mp4', m4b: 'audio/mp4', m4r: 'audio/mp4', mp4a: 'audio/mp4',
  wav: 'audio/wav', wave: 'audio/wav', flac: 'audio/flac', weba: 'audio/webm', mka: 'audio/x-matroska',
  amr: 'audio/amr', awb: 'audio/amr-wb', '3ga': 'audio/3gpp', wma: 'audio/x-ms-wma', aif: 'audio/aiff', aiff: 'audio/aiff', aifc: 'audio/aiff',
  ac3: 'audio/ac3', eac3: 'audio/eac3', caf: 'audio/x-caf', mid: 'audio/midi', midi: 'audio/midi', au: 'audio/basic', snd: 'audio/basic',
  ape: 'audio/x-ape', wv: 'audio/x-wavpack', tta: 'audio/x-tta', mpc: 'audio/x-musepack', dts: 'audio/vnd.dts', ra: 'audio/x-realaudio', gsm: 'audio/x-gsm'
};
const VIDEO_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', '3gp': 'video/3gpp', '3g2': 'video/3gpp2', avi: 'video/x-msvideo', ogv: 'video/ogg', mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t', wmv: 'video/x-ms-wmv', flv: 'video/x-flv' };
const IMG = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'jfif', 'svg'];
const MIME_GUESS = ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/flac', 'audio/webm'];
ML.kindOf = f => {
  const t = (f.type || '').toLowerCase(), e = ML.ext(f.name);
  if (t.startsWith('audio/') || t === 'application/ogg' || AUDIO_MIME[e]) return 'audio';
  if (t.startsWith('video/') || VIDEO_MIME[e]) return 'video';
  if (t.startsWith('image/') || IMG.includes(e)) return 'image';
  return null; // tidak dikenal: akan diperiksa dari isinya
};
const wrap = (file, mime) => (mime && mime !== file.type) ? new Blob([file], { type: mime }) : file;
const unsupported = (file, kind) => new Error('Format “' + file.name + '” tidak didukung perangkat ini. Konversi dulu ke ' + (kind === 'video' ? 'MP4 atau WebM.' : kind === 'image' ? 'JPG atau PNG.' : 'MP3, M4A/AAC, OGG/Opus, FLAC, atau WAV.'));

/* v3.91: gelombang audio bertahap. Tahap 1 cepat (8 kHz) -> tahap 2 (22,05 kHz) -> tahap 3 (44,1 kHz); timeline digambar ulang tiap tahap selesai */
const peakQ = (() => { let tail = Promise.resolve(); return fn => { const p = tail.then(fn, fn); tail = p.catch(() => {}); return p; }; })();
const PK_LV = [{ sr: 8000, per: 10, min: 400, max: 2000 }, { sr: 22050, per: 25, min: 800, max: 6000 }, { sr: 44100, per: 60, min: 1600, max: 16000 }];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function decodeAt(blob, sr) {
  const raw = await blob.arrayBuffer(), OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OAC) for (const r of sr < 22050 ? [sr, 22050] : [sr]) {
    try { return await new OAC(1, 1, r).decodeAudioData(raw.slice(0)); } catch (e) { /* coba berikutnya */ }
  }
  const AC = window.AudioContext || window.webkitAudioContext, c = new AC();
  try { return await c.decodeAudioData(raw); } finally { try { c.close(); } catch (e) { /* abaikan */ } }
}
/** tahap tertinggi yang aman untuk file ini (file sangat besar berhenti lebih awal agar memori aman) */
const peakMax = it => (it.size || 0) > 200e6 ? 1 : ((it.size || 0) > 80e6 || (it.dur || 0) > 1200) ? 2 : 3;
async function peakStage(it, lv) {
  while (ML.exporting || (ML.media.hold || 0) > 0) await sleep(400); // ekspor selalu didahulukan
  const cf = PK_LV[lv - 1], buf = await decodeAt(it.blob, cf.sr), d = buf.getChannelData(0), len = d.length;
  const N = Math.max(cf.min, Math.min(cf.max, Math.round(buf.duration * cf.per))), out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.floor(i * len / N), b = Math.min(len, Math.max(a + 1, Math.floor((i + 1) * len / N))), st = Math.max(1, Math.floor((b - a) / 48));
    let m = 0; for (let j = a; j < b; j += st) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; }
    out[i] = m;
  }
  it.peaks = out; it.peaksLv = lv;
  try { if (it.pid && ML.db.setPeaks) ML.db.setPeaks(it.pid, it.id, out, lv).catch(() => {}); } catch (e) { /* abaikan */ }
  if (ML.media.onPeaks) { try { ML.media.onPeaks(it); } catch (e) { /* abaikan */ } }
  return out;
}

/* ---------- audio ---------- */
ML.audio = {
  ctx: null,
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.dest = this.ctx.createMediaStreamDestination(); this.master.connect(this.dest);
    return this.ctx;
  },
  attach(el) {
    const c = this.ensure(); if (!c) return;
    try { const s = c.createMediaElementSource(el), g = c.createGain(); s.connect(g); g.connect(this.master); el._gain = g; } catch (e) { /* tanpa gain */ }
  },
  setVolume(el, L) {
    const v = (L.muted || L.hidden) ? 0 : L.volume / 100;
    if (el._gain) el._gain.gain.value = v; else el.volume = Math.min(1, v);
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  close() { if (this.ctx) { try { this.ctx.close(); } catch (e) { /* abaikan */ } this.ctx = null; } }
};

/* ---------- pool media ---------- */
const items = new Map(), els = new Map();
ML.media = {
  items, els,
  async load(proj) {
    items.clear(); els.clear();
    const recs = await ML.db.mediaOf(proj.id);
    await Promise.all(recs.map(async r => {
      const it = Object.assign({}, r, { url: URL.createObjectURL(r.blob) });
      items.set(r.id, it);
      if (r.kind === 'image') it.img = await loadImg(it.url).catch(() => null);
    }));
    setTimeout(() => ML.media.prefetchPeaks(), 0);
  },
  dispose() {
    els.forEach(e => { try { e.pause(); e.removeAttribute('src'); e.load(); } catch (x) { /* abaikan */ } });
    items.forEach(i => URL.revokeObjectURL(i.url));
    items.clear(); els.clear(); ML.audio.close();
  },
  /** want: 'audio' | 'video' | 'image' (menu yang dipilih). Format dikenali dari MIME, ekstensi, atau isi file. */
  async importFile(proj, file, want) {
    let kind = ML.kindOf(file);
    if (want === 'audio' && kind !== 'image') kind = 'audio'; // video dipilih lewat menu Audio => ambil suaranya
    const ext = ML.ext(file.name), known = !!(AUDIO_MIME[ext] || VIDEO_MIME[ext] || IMG.includes(ext));
    const primary = kind === 'audio' ? (AUDIO_MIME[ext] || (file.type && file.type.startsWith('audio/') ? file.type : (VIDEO_MIME[ext] || file.type || '')))
      : kind === 'video' ? (VIDEO_MIME[ext] || file.type || '') : (file.type || '');
    const mimes = known || kind === 'image' ? [primary] : [primary].concat(MIME_GUESS);
    const rec = { id: ML.uid(), pid: proj.id, kind, name: file.name, size: file.size, w: 0, h: 0, dur: 0 };
    let url = null, img = null, el = null, tag = null, blob = file;
    for (const m of mimes) {
      const b = wrap(file, m), u = URL.createObjectURL(b);
      try {
        if (kind === 'image') { img = await loadImg(u); }
        else {
          const tags = kind === 'audio' ? ['audio'] : kind === 'video' ? ['video'] : ['audio', 'video'];
          for (const t of tags) { try { el = await loadMeta(t, u, known ? 10000 : 6000); tag = t; break; } catch (x) { /* coba berikutnya */ } }
          if (!el && !kind) { try { img = await loadImg(u); kind = 'image'; } catch (x) { /* bukan gambar */ } }
        }
      } catch (x) { /* coba MIME berikutnya */ }
      if (el || img) { blob = b; url = u; break; }
      URL.revokeObjectURL(u);
    }
    if (!el && !img) throw unsupported(file, kind);
    try {
      if (img) { rec.w = img.naturalWidth; rec.h = img.naturalHeight; kind = 'image'; }
      else {
        if (!kind) kind = (tag === 'video' && el.videoWidth) ? 'video' : 'audio';
        if (kind === 'video' && !el.videoWidth) kind = 'audio'; // MP4 tanpa gambar
        if (kind === 'audio') { rec.w = rec.h = 0; } else { rec.w = el.videoWidth; rec.h = el.videoHeight; }
        rec.dur = await mediaDuration(el, blob);
      }
      rec.kind = kind; rec.mime = blob.type || ''; rec.blob = blob;
      await ML.db.putMedia(rec);
      const it = Object.assign({}, rec, { url }); if (img) it.img = img;
      items.set(rec.id, it); if (kind === 'audio') ML.media.peaks(it); return it;
    } catch (e) { URL.revokeObjectURL(url); throw e; }
  },
  image(L) { const it = items.get(L.mediaId); return it && it.img; },
  el(L) {
    let e = els.get(L.id);
    if (e) return e;
    const it = items.get(L.mediaId); if (!it) return null;
    e = document.createElement(L.type === 'video' ? 'video' : 'audio');
    e.preload = 'auto'; e.playsInline = true; e.src = it.url;
    e.addEventListener('seeked', () => ML.player.redraw());
    e.addEventListener('loadeddata', () => ML.player.redraw());
    els.set(L.id, e); ML.audio.attach(e); ML.audio.setVolume(e, L);
    return e;
  },
  dropEl(id) { const e = els.get(id); if (e) { try { e.pause(); } catch (x) { /* abaikan */ } els.delete(id); } },
  total() { let n = 0; items.forEach(i => n += i.size || 0); return n; },
  /** thumbnail video (dataURL kecil) */
  thumb(it) {
    if (it.thumbP) return it.thumbP;
    return (it.thumbP = new Promise(res => {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = it.url;
      const done = () => { try { const c = document.createElement('canvas'); c.width = 96; c.height = Math.max(2, Math.round(96 * v.videoHeight / v.videoWidth)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); it.thumb = c.toDataURL('image/jpeg', .6); } catch (e) { /* abaikan */ } v.removeAttribute('src'); v.load(); res(it.thumb || null); };
      v.onseeked = done; v.onerror = () => res(null);
      v.onloadeddata = () => { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); };
    }));
  },
  /** puncak gelombang audio: mengembalikan hasil tercepat yang ada, lalu menyempurnakannya di latar belakang (lihat onPeaks) */
  peaks(it) {
    if (it.peaks) { ML.media.refine(it); return Promise.resolve(it.peaks); }
    if (it.peaksP) return it.peaksP;
    return (it.peaksP = peakQ(() => peakStage(it, 1)).then(pk => { ML.media.refine(it); return pk; }, () => { it.peaksP = null; return null; }));
  },
  /** naikkan kualitas gelombang tahap demi tahap; tahap berikutnya masuk antrean paling belakang supaya file lain tidak menunggu */
  async refine(it) {
    if (it.refining) return; it.refining = true;
    try {
      const top = peakMax(it);
      for (let lv = (it.peaksLv || 1) + 1; lv <= top; lv++) { await peakQ(() => peakStage(it, lv)); await sleep(60); }
    } catch (e) { /* tahap atas gagal: gelombang yang ada tetap dipakai */ }
    it.refining = false;
  },
  hold: 0, // >0 = tahan penghitungan gelombang (dipakai saat ekspor audio)
  onPeaks: null,
  /** hitung gelombang semua audio di latar belakang (tidak menunggu timeline digambar) */
  prefetchPeaks() { items.forEach(it => { if (it.kind === 'audio') ML.media.peaks(it); }); }
};

/* ---------- pemutar ---------- */
ML.player = {
  proj: null, t: 0, playing: false, loop: false, raf: 0, onframe: null, onend: null, onstate: null, // loop: putar ulang terus (tombol play ditahan)
  init(proj) { this.proj = proj; this.t = 0; this.playing = false; },
  dur() { return ML.duration(this.proj); },
  seek(t) { this.t = ML.clamp(t, 0, this.dur()); if (!this.playing) { this.syncMedia(false); this.redraw(); } else { this.t0 = this.t; this.ts = performance.now(); } },
  play() {
    if (this.playing) return;
    const d = this.dur(); if (!d) return;
    if (this.t >= d - 1e-3) this.t = 0;
    ML.audio.ensure(); ML.audio.resume();
    this.playing = true; this.t0 = this.t; this.ts = performance.now();
    this.syncMedia(true); if (this.onstate) this.onstate(true);
    this.raf = requestAnimationFrame(() => this.tick());
  },
  pause() {
    if (!this.playing) return;
    this.playing = false; cancelAnimationFrame(this.raf); this.pauseAll();
    if (this.onstate) this.onstate(false); this.redraw();
  },
  tick() {
    if (!this.playing) return;
    this.t = this.t0 + (performance.now() - this.ts) / 1000;
    const d = this.dur();
    if (this.t >= d) {
      if (this.loop && !ML.exporting) { this.t = 0; this.t0 = 0; this.ts = performance.now(); this.syncMedia(true); this.draw(); this.raf = requestAnimationFrame(() => this.tick()); return; }
      this.t = d; this.playing = false; this.pauseAll(); this.draw();
      if (this.onstate) this.onstate(false); if (this.onend) this.onend(); return;
    }
    this.syncMedia(true); this.draw();
    this.raf = requestAnimationFrame(() => this.tick());
  },
  draw() { if (this.onframe) this.onframe(this.t); },
  redraw() { if (this._rq) return; this._rq = requestAnimationFrame(() => { this._rq = 0; if (!this.playing) this.draw(); }); },
  pauseAll() { ML.media.els.forEach(e => { if (!e.paused) e.pause(); }); },
  syncMedia(playing) {
    const t = this.t;
    for (const L of this.proj.layers) {
      if (L.type !== 'video' && L.type !== 'audio') continue;
      const el = ML.media.el(L); if (!el) continue;
      ML.audio.setVolume(el, L);
      const inRange = t >= L.start && t < L.start + L.dur && !L.hidden;
      const target = L.trimIn + (t - L.start);
      if (!inRange) { if (!el.paused) el.pause(); continue; }
      if (playing) {
        if (el.paused) { if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target; el.play().catch(() => { }); }
        else if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (L.type === 'video' && Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
      }
    }
  }
};
document.addEventListener('visibilitychange', () => { if (document.hidden && ML.player.playing && !ML.exporting) ML.player.pause(); });
})();

