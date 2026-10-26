'use strict';
/* engine_hyper_aktif.js — "Mode Hyper" MotionLyn.
   Muat SETELAH 04-model.js dan SEBELUM 05-fx-engine.js (supaya konteks canvas pertama sudah ikut diatur).

   Yang benar-benar dikerjakan (semua di sisi web, tanpa izin khusus):
   1. GPU performa tinggi   : setiap getContext('webgl'/'webgl2') diberi powerPreference:'high-performance'.
   2. Layar & proses tetap hidup: Screen Wake Lock + audio senyap (AudioContext) + Media Session aktif,
      sehingga Android memperlakukan app sebagai app media/aplikasi berat yang sedang dipakai (tidak ditidurkan,
      timer & rAF tidak di-throttle di latar).
   3. Render agresif        : kualitas pratinjau naik (ML.previewMax ≥ 1080), media (video/audio/gambar) dimuat penuh
      di depan (preload=auto, decoding sync, fetchPriority high), tugas berat dijadwalkan prioritas tinggi
      (ML.hyper.task).
   4. Memori lebih besar    : storage persisten (tidak digusur sistem), cache ImageBitmap/obyek yang ditahan
      (ML.hyper.keep / ML.hyper.cache) agar tidak dibuang-ulang.
   5. Baterai               : tidak bisa mematikan "penghemat baterai" Android dari JS. Mode ini menahan layar/CPU aktif,
      memantau baterai, dan otomatis mati bila baterai < ML.hyper.minBattery% dan tidak diisi daya
      (bisa dimatikan: ML.hyper.minBattery = 0).
   Yang TIDAK bisa dari JS: menaikkan clock CPU secara langsung. Clock naik sendiri oleh sistem saat beban + wake lock
   aktif. Bila APK memasang jembatan native (AndroidBridge.hyperOn / hyperOff) fungsi itu ikut dipanggil
   (untuk SustainedPerformanceMode, WakeLock CPU, dsb.).
   API: ML.hyper.on() / off() / toggle() / enabled() / status() / task(fn,prio) / keep(k,v) / cache. Tersimpan di ml.hyper. */
(function () {
if (!window.ML || ML.hyper) return;
const KEY = 'ml.hyper';
const S = { on: false, wl: null, ac: null, osc: null, mo: null, bat: null, timer: 0, ctx: 0, prevPv: null, why: [] };
const log = m => { try { S.why.push(m); if (S.why.length > 20) S.why.shift(); } catch (e) { /* abaikan */ } };
const toast = (m, ms) => { try { ML.toast && ML.toast(m, ms || 2200); } catch (e) { /* abaikan */ } };

/* ---- 1. GPU performa tinggi: bungkus getContext (aktif terus; hanya mengisi opsi yang belum ditentukan) ---- */
const gc = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, opt) {
  if (S.on && /^(experimental-)?webgl2?$/.test(type)) {
    opt = Object.assign({ powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }, opt || {});
    S.ctx++;
  } else if (S.on && type === '2d') {
    opt = Object.assign({ colorSpace: 'srgb' }, opt || {});
  }
  return gc.call(this, type, opt);
};
if (window.OffscreenCanvas) {
  const ogc = OffscreenCanvas.prototype.getContext;
  OffscreenCanvas.prototype.getContext = function (type, opt) {
    if (S.on && /^webgl2?$/.test(type)) opt = Object.assign({ powerPreference: 'high-performance' }, opt || {});
    return ogc.call(this, type, opt);
  };
}

/* ---- 2. Layar/proses tetap hidup ---- */
async function wake() {
  try { if (navigator.wakeLock && !S.wl) { S.wl = await navigator.wakeLock.request('screen'); S.wl.addEventListener('release', () => { S.wl = null; }); } }
  catch (e) { log('wakeLock: ' + e.message); }
}
function silentAudio() {
  try {
    if (S.ac) { if (S.ac.state === 'suspended') S.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    S.ac = new AC({ latencyHint: 'playback' });
    const g = S.ac.createGain(); g.gain.value = 0.00001; // praktis senyap, tetap dihitung "sedang memutar audio"
    S.osc = S.ac.createOscillator(); S.osc.frequency.value = 20; S.osc.connect(g); g.connect(S.ac.destination); S.osc.start();
    if (S.ac.state === 'suspended') S.ac.resume();
  } catch (e) { log('audio: ' + e.message); }
}
function session() {
  try {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'MotionLyn — Mode Hyper aktif', artist: 'Editor video & motion' });
    navigator.mediaSession.playbackState = 'playing';
  } catch (e) { /* abaikan */ }
}
const resume = () => { if (!S.on) return; if (document.visibilityState === 'visible') wake(); if (S.ac && S.ac.state === 'suspended') S.ac.resume(); };
document.addEventListener('visibilitychange', resume);
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (S.on) { silentAudio(); wake(); } }, { passive: true, capture: true })); // butuh gestur pengguna untuk audio

/* ---- 3. Render agresif: kualitas pratinjau + media dimuat penuh ---- */
const pvOrig = ML.previewMax;
ML.previewMax = () => { const v = pvOrig(); return S.on ? Math.max(v, 1080) : v; };
function tune(el) {
  try {
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') { el.preload = 'auto'; if (el.tagName === 'VIDEO') { el.disablePictureInPicture = true; el.playsInline = true; } }
    else if (el.tagName === 'IMG') { el.decoding = 'sync'; el.loading = 'eager'; el.fetchPriority = 'high'; }
  } catch (e) { /* abaikan */ }
}
function watchMedia(on) {
  if (S.mo) { S.mo.disconnect(); S.mo = null; }
  if (!on) return;
  document.querySelectorAll('video,audio,img').forEach(tune);
  S.mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { tune(n); n.querySelectorAll && n.querySelectorAll('video,audio,img').forEach(tune); } })));
  S.mo.observe(document.documentElement, { childList: true, subtree: true });
}
/* tugas berat dengan prioritas tinggi (Prioritized Task Scheduling bila ada; jika tidak, langsung) */
function task(fn, prio) {
  if (S.on && window.scheduler && scheduler.postTask) return scheduler.postTask(fn, { priority: prio || 'user-blocking' });
  return Promise.resolve().then(fn);
}

/* ---- 4. Memori: storage persisten + cache yang ditahan ---- */
const pinned = new Map();
const cache = {
  get: k => pinned.get(k),
  set: (k, v) => { pinned.set(k, v); return v; },
  has: k => pinned.has(k),
  delete: k => pinned.delete(k),
  clear: () => { pinned.forEach(v => { try { v && v.close && v.close(); } catch (e) { /* abaikan */ } }); pinned.clear(); },
  get size() { return pinned.size; }
};
async function keepMem() { try { if (navigator.storage && navigator.storage.persist) log('persist: ' + (await navigator.storage.persist())); } catch (e) { /* abaikan */ } }
/* tahan ImageBitmap hasil decode dari sumber (blob/img/canvas) agar tidak decode ulang */
async function keep(key, src) {
  if (pinned.has(key)) return pinned.get(key);
  let bm = src; try { if (window.createImageBitmap && !(src instanceof ImageBitmap)) bm = await createImageBitmap(src); } catch (e) { bm = src; }
  pinned.set(key, bm); return bm;
}

/* ---- 5. Baterai ---- */
async function watchBattery() {
  try {
    if (!navigator.getBattery) return; S.bat = S.bat || await navigator.getBattery();
    clearInterval(S.timer);
    S.timer = setInterval(() => {
      if (!S.on || !S.bat) return;
      if (hyper.minBattery > 0 && !S.bat.charging && S.bat.level * 100 < hyper.minBattery) { off(true); toast('Mode Hyper dimatikan: baterai < ' + hyper.minBattery + '%', 4000); }
    }, 15000);
  } catch (e) { log('battery: ' + e.message); }
}

/* ---- jembatan native (opsional) ---- */
const nat = (fn, a) => { try { const B = window.AndroidBridge; if (B && typeof B[fn] === 'function') B[fn](a); } catch (e) { /* abaikan */ } };

/* ---- kontrol ---- */
async function on(quiet) {
  if (S.on) return true;
  S.on = true; try { ML.lsSet(KEY, '1'); } catch (e) { /* abaikan */ }
  silentAudio(); session(); await wake(); keepMem(); watchMedia(true); watchBattery(); nat('hyperOn', true);
  document.documentElement.setAttribute('data-hyper', '1');
  if (!quiet) toast('Mode Hyper AKTIF: GPU tinggi, layar tetap hidup, pratinjau 1080p');
  return true;
}
function off(quiet) {
  S.on = false; try { ML.lsSet(KEY, '0'); } catch (e) { /* abaikan */ }
  try { if (S.wl) S.wl.release(); } catch (e) { /* abaikan */ } S.wl = null;
  try { if (S.osc) S.osc.stop(); if (S.ac) S.ac.close(); } catch (e) { /* abaikan */ } S.osc = S.ac = null;
  try { if ('mediaSession' in navigator) { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } } catch (e) { /* abaikan */ }
  watchMedia(false); clearInterval(S.timer); nat('hyperOff', false);
  document.documentElement.removeAttribute('data-hyper');
  if (!quiet) toast('Mode Hyper mati');
}
const hyper = ML.hyper = {
  on, off, enabled: () => S.on, toggle: () => S.on ? (off(), false) : (on(), true),
  task, keep, cache, minBattery: 12,
  batteryExempt: () => nat('hyperBattery'), // minta pengecualian optimasi baterai (dialog sistem, hanya di APK)
  status: () => ({ aktif: S.on, wakeLock: !!S.wl, audioSenyap: !!(S.ac && S.ac.state === 'running'), konteksGPU: S.ctx, previewMax: ML.previewMax(),
    baterai: S.bat ? Math.round(S.bat.level * 100) + '%' + (S.bat.charging ? ' (mengisi)' : '') : 'n/a', ditahan: pinned.size, catatan: S.why.slice() })
};

/* pulihkan pilihan terakhir (audio baru jalan setelah sentuhan pertama, aturan browser) */
try { if (ML.lsGet(KEY) === '1') on(true); } catch (e) { /* abaikan */ }
})();
